use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::{Arc, Mutex, mpsc};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri::WindowEvent;

use crate::app_error::{self, AppError, codes};
use crate::auth::{SecretStore, SidecarAuthConfig, SsoAuthConfig};
use crate::contracts::{AuthMethod, AuthStatus, SsoSessionInfo, SsoSessionStatus};
use crate::sidecar::client::SidecarClient;
use crate::state::AppState;

pub const SSO_WINDOW_LABEL: &str = "confluence-sso";

const LOGIN_TIMEOUT: Duration = Duration::from_secs(600);
const RETURN_COOLDOWN: Duration = Duration::from_secs(3);
const SESSION_PROBE_INTERVAL: Duration = Duration::from_secs(3);
const POST_OAUTH_SETTLE: Duration = Duration::from_secs(5);
const MAX_RETURN_ATTEMPTS: u8 = 5;

const RETURN_URL_PARAMS: &[&str] = &[
    "service",
    "RelayState",
    "redirect_uri",
    "redirectUrl",
    "returnUrl",
    "return_to",
    "next",
    "continue",
    "target",
];

/// Diagnostic logging for SSO flow investigation. Logs URLs and cookie names only — never values.
macro_rules! sso_diag {
    ($($arg:tt)*) => {
        if cfg!(debug_assertions) {
            eprintln!("[sso-diag] {}", format!($($arg)*));
        }
    };
}

struct SsoFlowState {
    auth_flow_started: AtomicBool,
    left_confluence: AtomicBool,
    seen_auth_provider: AtomicBool,
    oauth_in_progress: AtomicBool,
    pending_return_url: Mutex<String>,
    idp_gateway_url: Mutex<Option<String>>,
    idp_origin: Mutex<Option<String>>,
    idp_post_oauth_landed_at: Mutex<Option<Instant>>,
    return_attempts: AtomicU8,
    last_return_attempt: Mutex<Option<Instant>>,
}

pub struct SsoSession {
    entry_url: String,
    confluence_host: String,
    stored_base: String,
    cancel_tx: Option<mpsc::SyncSender<()>>,
}

struct SsoSessionSnapshot {
    entry_url: String,
    confluence_host: String,
    stored_base: String,
}

#[derive(Default)]
struct SessionProbeState {
    last_probe_at: Mutex<Option<Instant>>,
    cached_valid: Mutex<Option<bool>>,
    auto_complete_triggered: AtomicBool,
}

#[derive(Clone, Default)]
pub struct SsoSessionManager {
    session: Arc<Mutex<Option<SsoSession>>>,
    probe_state: Arc<SessionProbeState>,
}

impl SsoSessionManager {
    pub fn clear(&self) {
        if let Ok(mut guard) = self.session.lock() {
            *guard = None;
        }
        self.reset_probe_state();
    }

    fn reset_probe_state(&self) {
        if let Ok(mut last) = self.probe_state.last_probe_at.lock() {
            *last = None;
        }
        if let Ok(mut cached) = self.probe_state.cached_valid.lock() {
            *cached = None;
        }
        self.probe_state
            .auto_complete_triggered
            .store(false, Ordering::SeqCst);
    }

    fn cached_probe_valid(&self) -> Option<bool> {
        self.probe_state.cached_valid.lock().ok().and_then(|guard| *guard)
    }

    fn set_probe_cache(&self, valid: bool) {
        if let Ok(mut last) = self.probe_state.last_probe_at.lock() {
            *last = Some(Instant::now());
        }
        if let Ok(mut cached) = self.probe_state.cached_valid.lock() {
            *cached = Some(valid);
        }
    }

    fn should_probe(&self) -> bool {
        let Ok(guard) = self.probe_state.last_probe_at.lock() else {
            return true;
        };
        guard
            .map(|last| last.elapsed() >= SESSION_PROBE_INTERVAL)
            .unwrap_or(true)
    }

    fn try_mark_auto_complete(&self) -> bool {
        !self
            .probe_state
            .auto_complete_triggered
            .swap(true, Ordering::SeqCst)
    }

    fn reset_auto_complete_flag(&self) {
        self.probe_state
            .auto_complete_triggered
            .store(false, Ordering::SeqCst);
    }

    fn with_session<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&SsoSession) -> Result<T, String>,
    {
        let guard = self
            .session
            .lock()
            .map_err(|_| "SSO session lock poisoned".to_string())?;
        let session = guard
            .as_ref()
            .ok_or_else(|| "No active SSO session".to_string())?;
        f(session)
    }
}

impl SsoFlowState {
    fn new(entry_url: String) -> Self {
        Self {
            auth_flow_started: AtomicBool::new(false),
            left_confluence: AtomicBool::new(false),
            seen_auth_provider: AtomicBool::new(false),
            oauth_in_progress: AtomicBool::new(false),
            pending_return_url: Mutex::new(entry_url),
            idp_gateway_url: Mutex::new(None),
            idp_origin: Mutex::new(None),
            idp_post_oauth_landed_at: Mutex::new(None),
            return_attempts: AtomicU8::new(0),
            last_return_attempt: Mutex::new(None),
        }
    }
}

fn host_str(url: &Url) -> Option<&str> {
    url.host_str()
}

fn is_auth_provider_host(host: &str) -> bool {
    let host = host.to_ascii_lowercase();

    const EXACT: &[&str] = &[
        "id.atlassian.com",
        "auth.atlassian.com",
        "login.dingtalk.com",
        "login.dingtalk.com.cn",
        "oapi.dingtalk.com",
        "passport.dingtalk.com",
        "h5.dingtalk.com",
        "open.feishu.cn",
        "accounts.feishu.cn",
        "login.feishu.cn",
        "passport.feishu.cn",
    ];

    if EXACT.contains(&host.as_str()) {
        return true;
    }

    host.ends_with(".dingtalk.com")
        || host.ends_with(".dingtalk.com.cn")
        || host.ends_with(".feishu.cn")
        || host.ends_with(".larksuite.com")
        || host.ends_with(".atlassian.com") && !host.ends_with(".atlassian.net")
}

fn is_captcha_host(host: &str) -> bool {
    let host = host.to_ascii_lowercase();
    host.contains("captcha") || host.ends_with(".gtimg.com")
}

/// IdP login-method selection page (before OAuth redirect), not a post-login landing page.
fn is_pre_auth_idp_path(path: &str) -> bool {
    let path = path.to_ascii_lowercase();
    path == "/login" || (path.starts_with("/login/") && !path.contains("/sso/"))
}

/// Organization IdP page where login finished but the SPA did not redirect back to Confluence.
fn is_idp_post_login_stuck_path(path: &str) -> bool {
    let path = path.to_ascii_lowercase();
    path.contains("/sso/login")
        || path.contains("/sso/callback")
        || path.contains("/auth/callback")
        || path.contains("/auth/complete")
        || path.contains("/login/success")
}

fn is_idp_gateway_capture_path(path: &str) -> bool {
    let path = path.to_ascii_lowercase();
    path.contains("/login") || path.contains("/sso")
}

fn idp_origin_from_url(url: &Url) -> Option<String> {
    let host = url.host_str()?;
    Some(format!("{}://{host}", url.scheme()))
}

fn build_idp_gateway_url(origin: &str, return_url: &str, sso_path: &str) -> Result<String, String> {
    let mut gateway = Url::parse(&format!("{origin}{sso_path}"))
        .map_err(|error| format!("invalid IdP gateway path: {error}"))?;
    gateway
        .query_pairs_mut()
        .append_pair("service", return_url);
    Ok(gateway.to_string())
}

fn should_prefer_idp_gateway(existing: Option<&str>, candidate: &str) -> bool {
    match existing {
        None => true,
        Some(existing) => candidate.contains("/sso/") && !existing.contains("/sso/"),
    }
}

fn post_oauth_settle_elapsed(state: &SsoFlowState) -> Option<Duration> {
    state
        .idp_post_oauth_landed_at
        .lock()
        .ok()
        .and_then(|landed| *landed)
        .map(|landed| landed.elapsed())
}

fn mark_oauth_in_progress(state: &SsoFlowState) {
    state.oauth_in_progress.store(true, Ordering::SeqCst);
    if let Ok(mut landed) = state.idp_post_oauth_landed_at.lock() {
        *landed = None;
    }
}

fn mark_idp_post_oauth_landing(state: &SsoFlowState) {
    state.oauth_in_progress.store(false, Ordering::SeqCst);
    if let Ok(mut landed) = state.idp_post_oauth_landed_at.lock() {
        if landed.is_none() {
            *landed = Some(Instant::now());
        }
    }
}

enum ReturnNavigationSource {
    CasGateway,
    ConstructedGateway,
    DirectWiki,
}

impl ReturnNavigationSource {
    fn as_str(&self) -> &'static str {
        match self {
            Self::CasGateway => "cas_gateway",
            Self::ConstructedGateway => "constructed_gateway",
            Self::DirectWiki => "direct_wiki",
        }
    }
}

fn resolve_return_navigation_url(state: &SsoFlowState) -> Result<(String, ReturnNavigationSource), String> {
    if let Ok(guard) = state.idp_gateway_url.lock() {
        if let Some(url) = guard.as_ref() {
            return Ok((url.clone(), ReturnNavigationSource::CasGateway));
        }
    }

    let pending_return_url = state
        .pending_return_url
        .lock()
        .map_err(|_| "SSO return URL lock poisoned".to_string())?
        .clone();

    if let Ok(origin_guard) = state.idp_origin.lock() {
        if let Some(origin) = origin_guard.as_ref() {
            let gateway = build_idp_gateway_url(origin, &pending_return_url, "/sso/login")
                .or_else(|_| build_idp_gateway_url(origin, &pending_return_url, "/login"))?;
            return Ok((gateway, ReturnNavigationSource::ConstructedGateway));
        }
    }

    Ok((pending_return_url, ReturnNavigationSource::DirectWiki))
}

fn host_matches_confluence(url_host: &str, confluence_host: &str) -> bool {
    url_host.eq_ignore_ascii_case(confluence_host)
}

fn is_external_host(host: &str, confluence_host: &str) -> bool {
    !host_matches_confluence(host, confluence_host)
}

fn is_login_in_progress_path(path: &str) -> bool {
    let path = path.to_ascii_lowercase();

    path.contains("/login")
        || path.ends_with("login.action")
        || path.contains("/oauth")
        || path.contains("/saml")
        || path.contains("/plugins/servlet/saml")
        || path.contains("/plugins/servlet/oauth")
        || path.contains("/plugins/servlet/external-login")
        || path.starts_with("/servicedesk/customer")
}

fn is_confluence_authenticated_path(path: &str) -> bool {
    let path = path.to_ascii_lowercase();

    path == "/wiki"
        || path.starts_with("/wiki/")
        || path == "/dashboard.action"
        || path.ends_with("/dashboard.action")
        || path.starts_with("/pages/")
        || path.ends_with("/viewpage.action")
        || path.starts_with("/display/")
        || path.starts_with("/spaces/")
        || path.starts_with("/col/")
        || path.starts_with("/labels/")
        || path.starts_with("/users/")
        || path.starts_with("/admin/")
}

/// Returns true when the URL appears to be an authenticated Confluence page on the target host.
pub fn is_login_success_url(url: &str, confluence_host: &str) -> bool {
    let parsed = match Url::parse(url) {
        Ok(value) => value,
        Err(_) => return false,
    };

    if parsed.scheme() != "https" {
        return false;
    }

    let Some(host) = host_str(&parsed) else {
        return false;
    };

    if is_auth_provider_host(host) {
        return false;
    }

    if !host_matches_confluence(host, confluence_host) {
        return false;
    }

    let path = parsed.path();
    if is_login_in_progress_path(path) {
        return false;
    }

    is_confluence_authenticated_path(path)
}

/// Resolve the WebView entry URL and the Confluence host used for login-success detection.
pub fn resolve_sso_entry_url(base_url: &str) -> Result<(Url, String), String> {
    let (stored_base, host) = crate::auth::base_url::normalize_confluence_base_url_parts(base_url)?;
    let parsed = Url::parse(base_url.trim()).map_err(|_| app_error::invalid_https_url())?;

    let path = parsed.path();
    let has_content_path = path.len() > 1;

    let entry = if has_content_path {
        parsed
    } else if host.ends_with(".atlassian.net") {
        Url::parse(&format!("{stored_base}/wiki"))
            .map_err(|error| format!("invalid Confluence URL: {error}"))?
    } else {
        Url::parse(&stored_base).map_err(|error| format!("invalid Confluence URL: {error}"))?
    };

    Ok((entry, host))
}

fn urls_equivalent(a: &str, b: &str) -> bool {
    match (Url::parse(a), Url::parse(b)) {
        (Ok(left), Ok(right)) => {
            left.scheme() == right.scheme()
                && left.host_str() == right.host_str()
                && left.path() == right.path()
                && left.query() == right.query()
        }
        _ => a.trim() == b.trim(),
    }
}

pub fn has_confluence_session_cookie(header: &str) -> bool {
    let header = header.to_ascii_lowercase();
    [
        "jsessionid",
        "seraph.confluence",
        "cloud.session.token",
        "tenant.session.token",
        "atl.session.id",
    ]
    .iter()
    .any(|name| header.contains(name))
}

/// True when cookies indicate a logged-in Confluence session, not an anonymous JSESSIONID.
pub fn has_authenticated_session_cookie(header: &str) -> bool {
    let header = header.to_ascii_lowercase();
    [
        "seraph.confluence",
        "cloud.session.token",
        "tenant.session.token",
        "atl.session.id",
        // Confluence Server / Data Center UI preference cookies set after login
        "confluence.list.pages.cookie",
        "confluence.browse.space.cookie",
    ]
    .iter()
    .any(|name| header.contains(name))
}

fn is_valid_confluence_return_url(candidate: &str, confluence_host: &str) -> bool {
    let parsed = match Url::parse(candidate) {
        Ok(value) => value,
        Err(_) => return false,
    };

    if parsed.scheme() != "https" {
        return false;
    }

    let Some(host) = parsed.host_str() else {
        return false;
    };

    if !host_matches_confluence(host, confluence_host) {
        return false;
    }

    !is_login_in_progress_path(parsed.path())
}

/// Extract a Confluence return URL from common SSO redirect query parameters.
pub fn extract_return_url(url: &Url, confluence_host: &str) -> Option<String> {
    for param in RETURN_URL_PARAMS {
        let Some(value) = url
            .query_pairs()
            .find(|(key, _)| key == *param)
            .map(|(_, value)| value.into_owned())
        else {
            continue;
        };

        if is_valid_confluence_return_url(&value, confluence_host) {
            return Some(value);
        }
    }

    None
}

fn wiki_base_url(confluence_host: &str) -> Result<Url, String> {
    Url::parse(&format!("https://{confluence_host}/"))
        .map_err(|error| format!("invalid Confluence host URL: {error}"))
}

fn cookie_domain_matches_confluence(cookie: &tauri::webview::Cookie<'_>, confluence_host: &str) -> bool {
    match cookie.domain() {
        Some(domain) => {
            let domain = domain.trim_start_matches('.');
            domain.eq_ignore_ascii_case(confluence_host)
                || confluence_host
                    .to_ascii_lowercase()
                    .ends_with(&format!(".{}", domain.to_ascii_lowercase()))
        }
        None => true,
    }
}

fn merge_cookies(cookies: Vec<tauri::webview::Cookie<'static>>) -> Vec<tauri::webview::Cookie<'static>> {
    let mut by_name: HashMap<String, tauri::webview::Cookie<'static>> = HashMap::new();
    for cookie in cookies {
        by_name.insert(cookie.name().to_string(), cookie);
    }
    by_name.into_values().collect()
}

fn collect_wiki_cookies(
    window: &WebviewWindow,
    confluence_host: &str,
    current_url: Option<&str>,
) -> Result<Vec<tauri::webview::Cookie<'static>>, String> {
    let mut collected = Vec::new();

    let wiki_url = wiki_base_url(confluence_host)?;
    collected.extend(
        window
            .cookies_for_url(wiki_url)
            .map_err(|error| format!("reading webview cookies: {error}"))?,
    );

    if let Some(url_str) = current_url {
        if let Ok(parsed) = Url::parse(url_str) {
            if parsed
                .host_str()
                .is_some_and(|host| host_matches_confluence(host, confluence_host))
            {
                if let Ok(current_cookies) = window.cookies_for_url(parsed) {
                    collected.extend(current_cookies);
                }
            }
        }
    }

    if let Ok(all_cookies) = window.cookies() {
        collected.extend(
            all_cookies
                .into_iter()
                .filter(|cookie| cookie_domain_matches_confluence(cookie, confluence_host)),
        );
    }

    Ok(merge_cookies(collected))
}

fn wiki_session_cookie_header(
    window: &WebviewWindow,
    confluence_host: &str,
    current_url: Option<&str>,
) -> Result<String, String> {
    Ok(cookies_to_header(&collect_wiki_cookies(
        window,
        confluence_host,
        current_url,
    )?))
}

/// Returns true when named authenticated Confluence cookies are present.
pub fn has_wiki_session(
    window: &WebviewWindow,
    confluence_host: &str,
    current_url: Option<&str>,
) -> Result<bool, String> {
    let header = wiki_session_cookie_header(window, confluence_host, current_url)?;
    Ok(has_authenticated_session_cookie(&header))
}

fn wiki_session_ready_for_probe(
    window: &WebviewWindow,
    confluence_host: &str,
    current_url: Option<&str>,
) -> Result<bool, String> {
    let Some(url) = current_url else {
        return Ok(false);
    };

    if !is_login_success_url(url, confluence_host) {
        return Ok(false);
    }

    let header = wiki_session_cookie_header(window, confluence_host, Some(url))?;
    Ok(!header.is_empty() && has_confluence_session_cookie(&header))
}

async fn probe_wiki_session_via_api(
    window: &WebviewWindow,
    confluence_host: &str,
    stored_base: &str,
    current_url: Option<&str>,
) -> Result<bool, String> {
    if !wiki_session_ready_for_probe(window, confluence_host, current_url)? {
        return Ok(false);
    }

    let cookies = collect_wiki_cookies(window, confluence_host, current_url)?;
    let header = cookies_to_header(&cookies);
    if header.is_empty() {
        return Ok(false);
    }

    let auth = SidecarAuthConfig {
        base_url: stored_base.to_string(),
        method: AuthMethod::Sso,
        username: None,
        api_token: None,
        cookie: Some(header),
    };

    let client = SidecarClient::resolve_default()?;
    match client.get_current_user(&auth).await {
        Ok(_) => Ok(true),
        Err(error) => {
            sso_diag!("wiki session API probe failed: {error}");
            Ok(false)
        }
    }
}

async fn confirm_wiki_session(
    window: &WebviewWindow,
    confluence_host: &str,
    stored_base: &str,
    session_manager: &SsoSessionManager,
    current_url: Option<&str>,
    for_completion: bool,
) -> Result<bool, String> {
    if for_completion {
        if !wiki_session_ready_for_probe(window, confluence_host, current_url)? {
            return Ok(false);
        }
        if has_wiki_session(window, confluence_host, current_url)? {
            return Ok(true);
        }
        let valid =
            probe_wiki_session_via_api(window, confluence_host, stored_base, current_url).await?;
        session_manager.set_probe_cache(valid);
        return Ok(valid);
    }

    if !is_on_wiki_success_page(current_url, confluence_host) {
        return Ok(false);
    }

    if has_wiki_session(window, confluence_host, current_url)? {
        session_manager.set_probe_cache(true);
        return Ok(true);
    }

    if let Some(true) = session_manager.cached_probe_valid() {
        return Ok(true);
    }
    if session_manager.cached_probe_valid() == Some(false) && !session_manager.should_probe() {
        return Ok(false);
    }

    if !wiki_session_ready_for_probe(window, confluence_host, current_url)? {
        return Ok(false);
    }

    if !session_manager.should_probe() {
        return Ok(session_manager.cached_probe_valid().unwrap_or(false));
    }

    let valid = probe_wiki_session_via_api(window, confluence_host, stored_base, current_url).await?;
    session_manager.set_probe_cache(valid);
    Ok(valid)
}

fn is_on_wiki_success_page(current_url: Option<&str>, confluence_host: &str) -> bool {
    current_url
        .map(|url| is_login_success_url(url, confluence_host))
        .unwrap_or(false)
}

fn wiki_session_detected_on_page(
    window: &WebviewWindow,
    confluence_host: &str,
    current_url: Option<&str>,
    session_manager: &SsoSessionManager,
) -> bool {
    if !is_on_wiki_success_page(current_url, confluence_host) {
        return false;
    }

    has_wiki_session(window, confluence_host, current_url).unwrap_or(false)
        || session_manager.cached_probe_valid() == Some(true)
}

fn spawn_wiki_session_probe(
    app: AppHandle,
    window: WebviewWindow,
    confluence_host: String,
    stored_base: String,
    session_manager: SsoSessionManager,
    current_url: Option<String>,
) {
    tauri::async_runtime::spawn(async move {
        let current_url_ref = current_url.as_deref();
        let confirmed = confirm_wiki_session(
            &window,
            &confluence_host,
            &stored_base,
            &session_manager,
            current_url_ref,
            false,
        )
        .await
        .unwrap_or(false);

        if confirmed && is_on_wiki_success_page(current_url_ref, &confluence_host) {
            trigger_auto_complete_sso(app, session_manager);
        }
    });
}

fn trigger_auto_complete_sso(app: AppHandle, session_manager: SsoSessionManager) {
    if !session_manager.try_mark_auto_complete() {
        return;
    }

    sso_diag!("triggering auto-complete SSO login");
    tauri::async_runtime::spawn(async move {
        let result = {
            let state = app.state::<AppState>();
            complete_sso_login(app.clone(), &state.secret_store, &session_manager).await
        };

        match result {
            Ok(status) => {
                let _ = app.emit("sso-auto-completed", status);
            }
            Err(error) => {
                session_manager.reset_auto_complete_flag();
                sso_diag!("auto-complete SSO login failed: {error}");
                let _ = app.emit("sso-auto-complete-failed", error);
            }
        }
    });
}

fn should_return_to_wiki(
    state: &SsoFlowState,
    current_url: &str,
    confluence_host: &str,
    has_wiki_session: bool,
) -> bool {
    if !state.auth_flow_started.load(Ordering::SeqCst) || has_wiki_session {
        return false;
    }

    if state.return_attempts.load(Ordering::SeqCst) >= MAX_RETURN_ATTEMPTS {
        return false;
    }

    if let Ok(guard) = state.last_return_attempt.lock() {
        if let Some(last) = *guard {
            if last.elapsed() < RETURN_COOLDOWN {
                return false;
            }
        }
    }

    let parsed = match Url::parse(current_url) {
        Ok(value) => value,
        Err(_) => return false,
    };

    let Some(host) = parsed.host_str() else {
        return false;
    };

    let path = parsed.path();

    // Never interrupt third-party OAuth or captcha flows.
    if is_auth_provider_host(host) || is_captcha_host(host) {
        return false;
    }

    if state.oauth_in_progress.load(Ordering::SeqCst) {
        return false;
    }

    if state.left_confluence.load(Ordering::SeqCst) && is_external_host(host, confluence_host) {
        if !is_idp_post_login_stuck_path(path) || is_pre_auth_idp_path(path) {
            return false;
        }

        if !state.seen_auth_provider.load(Ordering::SeqCst) {
            return false;
        }

        // Wait for OAuth iframe/subframe flow to finish and IdP landing page to settle.
        return post_oauth_settle_elapsed(state)
            .is_some_and(|elapsed| elapsed >= POST_OAUTH_SETTLE);
    }

    host_matches_confluence(host, confluence_host) && is_login_in_progress_path(path)
}

fn describe_login_check(
    window: &WebviewWindow,
    url: &str,
    confluence_host: &str,
    entry_url: &str,
    auth_flow_started: bool,
    state: &SsoFlowState,
) -> String {
    let parsed = match Url::parse(url) {
        Ok(value) => value,
        Err(error) => return format!("invalid url: {error}"),
    };

    let host = parsed.host_str().unwrap_or("<none>");
    let path = parsed.path();
    let url_ok = is_login_success_url(url, confluence_host);
    let wiki_session = has_wiki_session(window, confluence_host, Some(url)).unwrap_or(false);
    let cookie_names = collect_wiki_cookies(window, confluence_host, Some(url))
        .map(|cookies| {
            cookies
                .iter()
                .map(|cookie| cookie.name().to_string())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let has_auth_cookie = cookie_names.iter().any(|name| {
        has_authenticated_session_cookie(&format!("{}=x", name.to_ascii_lowercase()))
    });
    let same_as_entry = urls_equivalent(url, entry_url);

    format!(
        "host={host} path={path} url_ok={url_ok} auth_started={auth_flow_started} \
         oauth_in_progress={} same_as_entry={same_as_entry} wiki_session={wiki_session} auth_cookie={has_auth_cookie} cookie_names=[{}]",
        state.oauth_in_progress.load(Ordering::SeqCst),
        cookie_names.join(", ")
    )
}

fn record_navigation(url: &Url, confluence_host: &str, state: &SsoFlowState) {
    let Some(host) = url.host_str() else {
        return;
    };

    if is_auth_provider_host(host) || is_captcha_host(host) {
        state.seen_auth_provider.store(true, Ordering::SeqCst);
        mark_oauth_in_progress(state);
        state.auth_flow_started.store(true, Ordering::SeqCst);
        state.left_confluence.store(true, Ordering::SeqCst);
    } else if is_external_host(host, confluence_host) {
        state.auth_flow_started.store(true, Ordering::SeqCst);
        state.left_confluence.store(true, Ordering::SeqCst);

        if is_idp_post_login_stuck_path(url.path()) && state.seen_auth_provider.load(Ordering::SeqCst) {
            mark_idp_post_oauth_landing(state);
        }

        if !is_captcha_host(host) {
            if let Ok(mut origin) = state.idp_origin.lock() {
                if origin.is_none() {
                    *origin = idp_origin_from_url(url);
                }
            }
        }
    } else if host_matches_confluence(host, confluence_host) {
        if is_login_success_url(&url.to_string(), confluence_host) {
            mark_idp_post_oauth_landing(state);
        } else if is_login_in_progress_path(url.path()) {
            state.auth_flow_started.store(true, Ordering::SeqCst);
        }
    }

    if extract_return_url(url, confluence_host).is_some() && is_idp_gateway_capture_path(url.path()) {
        if let Ok(mut gateway) = state.idp_gateway_url.lock() {
            let candidate = url.to_string();
            if should_prefer_idp_gateway(gateway.as_deref(), &candidate) {
                *gateway = Some(candidate);
            }
        }
    }

    if let Some(return_url) = extract_return_url(url, confluence_host) {
        if let Ok(mut pending) = state.pending_return_url.lock() {
            *pending = return_url;
        }
    }
}

fn try_navigate_to_return_url(window: &WebviewWindow, state: &SsoFlowState) -> Result<(), String> {
    let (return_url, source) = resolve_return_navigation_url(state)?;

    let parsed = Url::parse(&return_url)
        .map_err(|error| format!("invalid return navigation URL: {error}"))?;

    let attempt = state.return_attempts.fetch_add(1, Ordering::SeqCst) + 1;
    if let Ok(mut last) = state.last_return_attempt.lock() {
        *last = Some(Instant::now());
    }
    mark_oauth_in_progress(state);

    sso_diag!(
        "return_to_wiki attempt={attempt} via={} url={return_url}",
        source.as_str()
    );
    window
        .navigate(parsed)
        .map_err(|error| format!("navigating back to Confluence: {error}"))?;

    Ok(())
}

fn cookies_to_header(cookies: &[tauri::webview::Cookie<'_>]) -> String {
    cookies
        .iter()
        .map(|cookie| format!("{}={}", cookie.name(), cookie.value()))
        .collect::<Vec<_>>()
        .join("; ")
}

fn read_document_cookie(window: &WebviewWindow) -> Result<String, String> {
    let (tx, rx) = mpsc::sync_channel::<String>(1);
    window
        .eval_with_callback("document.cookie", move |result| {
            let _ = tx.send(result);
        })
        .map_err(|error| format!("eval document.cookie: {error}"))?;

    let raw = rx
        .recv_timeout(Duration::from_secs(5))
        .map_err(|_| "timed out reading document.cookie".to_string())?;

    let parsed: String = serde_json::from_str(&raw).unwrap_or(raw);
    Ok(parsed.trim().to_string())
}

fn extract_reusable_cookies(
    window: &WebviewWindow,
    confluence_host: &str,
    current_url: Option<&str>,
) -> Result<String, String> {
    let mut header = cookies_to_header(&collect_wiki_cookies(
        window,
        confluence_host,
        current_url,
    )?);

    if header.is_empty() {
        header = read_document_cookie(window)?;
    }

    if header.is_empty() {
        return Err(AppError::new(codes::SSO_COOKIE_FALLBACK).into_invoke_error());
    }

    Ok(header)
}

fn validate_wiki_session_for_completion(has_wiki_session: bool) -> Result<(), String> {
    if !has_wiki_session {
        return Err(AppError::new(codes::WIKI_SESSION_REQUIRED).into_invoke_error());
    }
    Ok(())
}

fn sso_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(SSO_WINDOW_LABEL)
}

fn close_sso_window(app: &AppHandle) {
    if let Some(window) = sso_window(app) {
        let _ = window.close();
    }
}

fn cancel_active_session(session_manager: &SsoSessionManager) {
    if let Ok(mut guard) = session_manager.session.lock() {
        if let Some(session) = guard.take() {
            if let Some(sender) = session.cancel_tx {
                let _ = sender.send(());
            }
        }
    }
}

fn background_monitor_sso_session(
    cancel_rx: mpsc::Receiver<()>,
    app: AppHandle,
    window: WebviewWindow,
    confluence_host: String,
    stored_base: String,
    entry_url: String,
    flow_state: Arc<SsoFlowState>,
    session_manager: SsoSessionManager,
) {
    std::thread::spawn(move || {
        let started_at = Instant::now();
        let mut last_logged_url = String::new();

        loop {
            if cancel_rx.try_recv().is_ok() {
                sso_diag!("background monitor cancelled");
                return;
            }

            if started_at.elapsed() >= LOGIN_TIMEOUT {
                sso_diag!("background monitor timed out");
                return;
            }

            if window.url().is_err() {
                sso_diag!("background monitor: window closed");
                return;
            }

            if let Ok(current) = window.url() {
                let current_url = current.to_string();
                let current_url_ref = current_url.as_str();
                let started = flow_state.auth_flow_started.load(Ordering::SeqCst);
                let wiki_session = wiki_session_detected_on_page(
                    &window,
                    &confluence_host,
                    Some(current_url_ref),
                    &session_manager,
                );

                if current_url != last_logged_url {
                    sso_diag!(
                        "poll {}",
                        describe_login_check(
                            &window,
                            &current_url,
                            &confluence_host,
                            &entry_url,
                            started,
                            &flow_state,
                        )
                    );
                    last_logged_url = current_url.clone();
                }

                if wiki_session {
                    sso_diag!("wiki session detected in background monitor");
                    trigger_auto_complete_sso(app.clone(), session_manager.clone());
                    return;
                }

                if wiki_session_ready_for_probe(&window, &confluence_host, Some(current_url_ref))
                    .unwrap_or(false)
                    && session_manager.should_probe()
                {
                    spawn_wiki_session_probe(
                        app.clone(),
                        window.clone(),
                        confluence_host.clone(),
                        stored_base.clone(),
                        session_manager.clone(),
                        Some(current_url.clone()),
                    );
                }

                if should_return_to_wiki(
                    &flow_state,
                    &current_url,
                    &confluence_host,
                    wiki_session,
                ) {
                    if let Err(error) = try_navigate_to_return_url(&window, &flow_state) {
                        sso_diag!("return_to_wiki failed: {error}");
                    }
                }
            }

            std::thread::sleep(Duration::from_millis(500));
        }
    });
}

pub fn open_sso_window(
    app: AppHandle,
    base_url: String,
    session_manager: &SsoSessionManager,
) -> Result<SsoSessionInfo, String> {
    let (entry_url, confluence_host) = resolve_sso_entry_url(&base_url)?;
    let stored_base = format!("https://{confluence_host}");
    let entry_url_string = entry_url.to_string();

    sso_diag!(
        "open entry_url={} confluence_host={}",
        entry_url_string,
        confluence_host
    );

    cancel_active_session(session_manager);
    close_sso_window(&app);
    session_manager.reset_probe_state();

    let (cancel_tx, cancel_rx) = mpsc::sync_channel::<()>(1);
    let flow_state = Arc::new(SsoFlowState::new(entry_url_string.clone()));
    let flow_state_for_navigation = Arc::clone(&flow_state);
    let confluence_host_for_navigation = confluence_host.clone();
    let cancel_sender = Arc::new(Mutex::new(Some(cancel_tx.clone())));
    let cancel_sender_for_window = Arc::clone(&cancel_sender);
    let session_clear_handle = session_manager.clone();

    let window = WebviewWindowBuilder::new(
        &app,
        SSO_WINDOW_LABEL,
        WebviewUrl::External(entry_url),
    )
    .title("Sign in to Confluence — complete login in the main app")
    .inner_size(960.0, 720.0)
    .center()
    .on_navigation(move |url| {
        record_navigation(&url, &confluence_host_for_navigation, &flow_state_for_navigation);
        let host = url.host_str().unwrap_or("<none>");
        let started = flow_state_for_navigation.auth_flow_started.load(Ordering::SeqCst);
        let left = flow_state_for_navigation.left_confluence.load(Ordering::SeqCst);
        if let Some(return_url) = extract_return_url(&url, &confluence_host_for_navigation) {
            sso_diag!(
                "nav host={host} path={} return_url={return_url} auth_started={started} left_confluence={left}",
                url.path()
            );
        } else {
            sso_diag!(
                "nav host={host} path={} auth_started={started} left_confluence={left}",
                url.path()
            );
        }
        true
    })
    .build()
    .map_err(|error| format!("opening SSO window: {error}"))?;

    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed) {
            if let Some(sender) = cancel_sender_for_window
                .lock()
                .ok()
                .and_then(|mut guard| guard.take())
            {
                let _ = sender.send(());
            }
            session_clear_handle.clear();
        }
    });

    background_monitor_sso_session(
        cancel_rx,
        app.clone(),
        window.clone(),
        confluence_host.clone(),
        stored_base.clone(),
        entry_url_string.clone(),
        Arc::clone(&flow_state),
        session_manager.clone(),
    );

    {
        let mut guard = session_manager
            .session
            .lock()
            .map_err(|_| "SSO session lock poisoned".to_string())?;
        *guard = Some(SsoSession {
            entry_url: entry_url_string.clone(),
            confluence_host,
            stored_base: stored_base.clone(),
            cancel_tx: Some(cancel_tx),
        });
    }

    Ok(SsoSessionInfo {
        active: true,
        entry_url: entry_url_string,
        base_url: stored_base,
    })
}

pub fn get_sso_session_status(
    app: &AppHandle,
    session_manager: &SsoSessionManager,
) -> Result<SsoSessionStatus, String> {
    let guard = session_manager
        .session
        .lock()
        .map_err(|_| "SSO session lock poisoned".to_string())?;

    let Some(session) = guard.as_ref() else {
        return Ok(SsoSessionStatus {
            active: false,
            entry_url: None,
            current_url: None,
            wiki_session_detected: false,
        });
    };

    let session_snapshot = SsoSessionSnapshot {
        entry_url: session.entry_url.clone(),
        confluence_host: session.confluence_host.clone(),
        stored_base: session.stored_base.clone(),
    };
    drop(guard);

    let window = match sso_window(app) {
        Some(window) => window,
        None => {
            return Ok(SsoSessionStatus {
                active: false,
                entry_url: Some(session_snapshot.entry_url.clone()),
                current_url: None,
                wiki_session_detected: false,
            });
        }
    };

    let current_url = window.url().ok().map(|url| url.to_string());
    let current_url_ref = current_url.as_deref();
    let wiki_session_detected = wiki_session_detected_on_page(
        &window,
        &session_snapshot.confluence_host,
        current_url_ref,
        session_manager,
    );

    if !wiki_session_detected
        && wiki_session_ready_for_probe(
            &window,
            &session_snapshot.confluence_host,
            current_url_ref,
        )
        .unwrap_or(false)
        && session_manager.should_probe()
    {
        spawn_wiki_session_probe(
            app.clone(),
            window,
            session_snapshot.confluence_host.clone(),
            session_snapshot.stored_base.clone(),
            session_manager.clone(),
            current_url.clone(),
        );
    }

    Ok(SsoSessionStatus {
        active: true,
        entry_url: Some(session_snapshot.entry_url),
        current_url,
        wiki_session_detected,
    })
}

pub fn navigate_sso_window(
    app: &AppHandle,
    url: String,
    session_manager: &SsoSessionManager,
) -> Result<(), String> {
    session_manager.with_session(|_| {
        let window = sso_window(app).ok_or_else(|| "SSO window is not open".to_string())?;
        let parsed = Url::parse(url.trim())
            .map_err(|error| format!("invalid navigation URL: {error}"))?;
        if parsed.scheme() != "https" {
            return Err(AppError::new(codes::NAVIGATION_HTTPS_REQUIRED).into_invoke_error());
        }
        sso_diag!("navigate_sso_window url={parsed}");
        window
            .navigate(parsed)
            .map_err(|error| format!("navigating SSO window: {error}"))
    })
}

pub async fn complete_sso_login<S: SecretStore + Send + Sync>(
    app: AppHandle,
    secret_store: &S,
    session_manager: &SsoSessionManager,
) -> Result<AuthStatus, String> {
    let (confluence_host, stored_base) = {
        let guard = session_manager
            .session
            .lock()
            .map_err(|_| "SSO session lock poisoned".to_string())?;
        let session = guard
            .as_ref()
            .ok_or_else(|| "No active SSO session".to_string())?;
        (session.confluence_host.clone(), session.stored_base.clone())
    };

    let window = sso_window(&app).ok_or_else(|| "SSO window is not open".to_string())?;
    let current_url = window.url().ok().map(|url| url.to_string());
    let current_url_ref = current_url.as_deref();

    let has_session = confirm_wiki_session(
        &window,
        &confluence_host,
        &stored_base,
        session_manager,
        current_url_ref,
        true,
    )
    .await?;
    validate_wiki_session_for_completion(has_session)?;

    let current_url_for_extract = current_url.clone();
    let cookie = tokio::task::spawn_blocking({
        let window = window.clone();
        let confluence_host = confluence_host.clone();
        move || {
            extract_reusable_cookies(
                &window,
                &confluence_host,
                current_url_for_extract.as_deref(),
            )
        }
    })
    .await
    .map_err(|error| format!("extracting SSO cookies: {error}"))??;

    secret_store.save_sso_auth(&SsoAuthConfig {
        base_url: stored_base.clone(),
        cookie,
        display_name: None,
    })?;

    let sidecar_auth = secret_store
        .load_sidecar_auth()?
        .ok_or_else(|| "Authentication required".to_string())?;
    let client = SidecarClient::resolve_default()?;
    client
        .get_current_user(&sidecar_auth)
        .await
        .map_err(|error| format!("SSO session validation failed: {error}"))?;

    cancel_active_session(session_manager);
    close_sso_window(&app);

    secret_store.load_status()
}

pub fn cancel_sso_login(app: &AppHandle, session_manager: &SsoSessionManager) -> Result<(), String> {
    cancel_active_session(session_manager);
    close_sso_window(app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const HOST: &str = "wiki.example.com";

    fn mark_post_oauth_ready(state: &SsoFlowState) {
        state.seen_auth_provider.store(true, Ordering::SeqCst);
        state.oauth_in_progress.store(false, Ordering::SeqCst);
        *state
            .idp_post_oauth_landed_at
            .lock()
            .expect("landed lock") = Some(Instant::now() - POST_OAUTH_SETTLE - Duration::from_secs(1));
    }

    #[test]
    fn detects_confluence_wiki_urls_as_login_success() {
        assert!(is_login_success_url(
            "https://example.atlassian.net/wiki/home",
            "example.atlassian.net"
        ));
        assert!(is_login_success_url(
            "https://example.atlassian.net/wiki/spaces/ENG",
            "example.atlassian.net"
        ));
        assert!(!is_login_success_url(
            "https://id.atlassian.com/login",
            "example.atlassian.net"
        ));
    }

    #[test]
    fn detects_server_dashboard_and_pages_as_login_success() {
        assert!(is_login_success_url(
            "https://wiki.example.com/dashboard.action",
            HOST
        ));
        assert!(is_login_success_url(
            "https://wiki.example.com/pages/viewpage.action?pageId=123",
            HOST
        ));
        assert!(is_login_success_url(
            "https://wiki.example.com/display/ENG",
            HOST
        ));
    }

    #[test]
    fn rejects_dingtalk_and_login_paths_on_confluence_host() {
        assert!(!is_login_success_url(
            "https://login.dingtalk.com/oauth2/auth",
            HOST
        ));
        assert!(!is_login_success_url(
            "https://wiki.example.com/login.action",
            HOST
        ));
        assert!(!is_login_success_url(
            "https://wiki.example.com/plugins/servlet/samlsso",
            HOST
        ));
    }

    #[test]
    fn rejects_non_https_and_auth_hosts() {
        assert!(!is_login_success_url(
            "http://example.atlassian.net/wiki/home",
            "example.atlassian.net"
        ));
        assert!(!is_login_success_url(
            "https://auth.atlassian.com/login",
            "example.atlassian.net"
        ));
        assert!(!is_login_success_url("not-a-url", HOST));
    }

    #[test]
    fn rejects_wrong_confluence_host() {
        assert!(!is_login_success_url(
            "https://other.example.com/wiki/home",
            HOST
        ));
    }

    #[test]
    fn resolve_entry_url_for_cloud_and_server() {
        let (cloud, host) =
            resolve_sso_entry_url("https://example.atlassian.net").expect("cloud base");
        assert_eq!(host, "example.atlassian.net");
        assert_eq!(cloud.path(), "/wiki");

        let (server, host) = resolve_sso_entry_url("https://wiki.example.com").expect("server base");
        assert_eq!(host, "wiki.example.com");
        assert_eq!(server.path(), "/");

        let (full, host) = resolve_sso_entry_url(
            "https://wiki.example.com/pages/viewpage.action?pageId=123",
        )
        .expect("full page url");
        assert_eq!(host, "wiki.example.com");
        assert!(full.path().ends_with("viewpage.action"));
    }

    #[test]
    fn detects_confluence_session_cookie_names() {
        assert!(has_confluence_session_cookie(
            "JSESSIONID=abc123; path=/; HttpOnly"
        ));
        assert!(has_confluence_session_cookie(
            "seraph.confluence=1234567890"
        ));
        assert!(!has_confluence_session_cookie("ajs_anonymous_id=abc"));
    }

    #[test]
    fn anonymous_jsessionid_is_not_authenticated_session() {
        assert!(!has_authenticated_session_cookie(
            "JSESSIONID=abc123; path=/; HttpOnly"
        ));
        assert!(has_authenticated_session_cookie(
            "JSESSIONID=abc123; seraph.confluence=1234567890"
        ));
        assert!(has_authenticated_session_cookie(
            "cloud.session.token=abc123"
        ));
        assert!(has_authenticated_session_cookie(
            "confluence.list.pages.cookie=list-content-tree; JSESSIONID=abc"
        ));
    }

    #[test]
    fn urls_equivalent_compares_path_and_query() {
        let a = "https://wiki.heytea.com/pages/viewpage.action?pageId=110888526";
        assert!(urls_equivalent(a, a));
        assert!(!urls_equivalent(
            a,
            "https://wiki.heytea.com/dashboard.action"
        ));
    }

    #[test]
    fn extract_return_url_from_cas_service() {
        let url = Url::parse(
            "https://account.example.com/login?service=https%3A%2F%2Fwiki.example.com%2Fpages%2Fviewpage.action%3FpageId%3D123",
        )
        .expect("cas url");

        assert_eq!(
            extract_return_url(&url, HOST),
            Some("https://wiki.example.com/pages/viewpage.action?pageId=123".to_string())
        );
    }

    #[test]
    fn extract_return_url_from_saml_relay_state() {
        let url = Url::parse(
            "https://sso.example.com/saml/login?RelayState=https%3A%2F%2Fwiki.example.com%2Fdashboard.action",
        )
        .expect("saml url");

        assert_eq!(
            extract_return_url(&url, HOST),
            Some("https://wiki.example.com/dashboard.action".to_string())
        );
    }

    #[test]
    fn extract_return_url_rejects_external_host() {
        let url = Url::parse(
            "https://account.example.com/login?service=https%3A%2F%2Fevil.example.com%2Fpages%2Fviewpage.action",
        )
        .expect("external service url");

        assert!(extract_return_url(&url, HOST).is_none());
    }

    #[test]
    fn extract_return_url_rejects_login_path_on_confluence_host() {
        let url = Url::parse(
            "https://account.example.com/login?service=https%3A%2F%2Fwiki.example.com%2Flogin.action",
        )
        .expect("login service url");

        assert!(extract_return_url(&url, HOST).is_none());
    }

    #[test]
    fn should_return_to_wiki_when_stuck_on_idp() {
        let state = SsoFlowState::new("https://wiki.example.com/pages/viewpage.action?pageId=1".to_string());
        state.auth_flow_started.store(true, Ordering::SeqCst);
        state.left_confluence.store(true, Ordering::SeqCst);
        mark_post_oauth_ready(&state);

        assert!(should_return_to_wiki(
            &state,
            "https://account.example.com/sso/login",
            HOST,
            false,
        ));
    }

    #[test]
    fn should_not_return_on_sso_login_before_oauth() {
        let state = SsoFlowState::new("https://wiki.example.com/pages/viewpage.action?pageId=1".to_string());
        state.auth_flow_started.store(true, Ordering::SeqCst);
        state.left_confluence.store(true, Ordering::SeqCst);

        assert!(!should_return_to_wiki(
            &state,
            "https://account.example.com/sso/login",
            HOST,
            false,
        ));
    }

    #[test]
    fn should_return_on_sso_login_after_oauth() {
        let state = SsoFlowState::new("https://wiki.example.com/pages/viewpage.action?pageId=1".to_string());
        state.auth_flow_started.store(true, Ordering::SeqCst);
        state.left_confluence.store(true, Ordering::SeqCst);
        mark_post_oauth_ready(&state);

        assert!(should_return_to_wiki(
            &state,
            "https://account.example.com/sso/login",
            HOST,
            false,
        ));
    }

    #[test]
    fn resolve_return_navigation_url_prefers_gateway() {
        let state = SsoFlowState::new("https://wiki.example.com/pages/viewpage.action?pageId=1".to_string());
        let gateway = "https://account.example.com/login?service=https%3A%2F%2Fwiki.example.com%2Fpages%2Fviewpage.action%3FpageId%3D1";
        *state.idp_gateway_url.lock().expect("gateway lock") = Some(gateway.to_string());

        let (url, source) = resolve_return_navigation_url(&state).expect("resolve return url");
        assert_eq!(url, gateway);
        assert_eq!(source.as_str(), "cas_gateway");
    }

    #[test]
    fn resolve_return_navigation_url_builds_from_origin() {
        let wiki_url = "https://wiki.example.com/pages/viewpage.action?pageId=1";
        let state = SsoFlowState::new(wiki_url.to_string());
        *state.idp_origin.lock().expect("origin lock") =
            Some("https://account.example.com".to_string());

        let (url, source) = resolve_return_navigation_url(&state).expect("resolve return url");
        assert_eq!(
            url,
            "https://account.example.com/sso/login?service=https%3A%2F%2Fwiki.example.com%2Fpages%2Fviewpage.action%3FpageId%3D1"
        );
        assert_eq!(source.as_str(), "constructed_gateway");
    }

    #[test]
    fn should_not_return_while_oauth_in_progress() {
        let state = SsoFlowState::new("https://wiki.example.com/pages/viewpage.action?pageId=1".to_string());
        state.auth_flow_started.store(true, Ordering::SeqCst);
        state.left_confluence.store(true, Ordering::SeqCst);
        state.seen_auth_provider.store(true, Ordering::SeqCst);
        state.oauth_in_progress.store(true, Ordering::SeqCst);

        assert!(!should_return_to_wiki(
            &state,
            "https://account.example.com/sso/login",
            HOST,
            false,
        ));
    }

    #[test]
    fn should_not_return_before_post_oauth_settle() {
        let state = SsoFlowState::new("https://wiki.example.com/pages/viewpage.action?pageId=1".to_string());
        state.auth_flow_started.store(true, Ordering::SeqCst);
        state.left_confluence.store(true, Ordering::SeqCst);
        state.seen_auth_provider.store(true, Ordering::SeqCst);
        *state
            .idp_post_oauth_landed_at
            .lock()
            .expect("landed lock") = Some(Instant::now());

        assert!(!should_return_to_wiki(
            &state,
            "https://account.example.com/sso/login",
            HOST,
            false,
        ));
    }

    #[test]
    fn should_prefer_sso_gateway_over_login_gateway() {
        assert!(should_prefer_idp_gateway(
            Some("https://account.example.com/login?service=https%3A%2F%2Fwiki.example.com%2F"),
            "https://account.example.com/sso/login?service=https%3A%2F%2Fwiki.example.com%2F",
        ));
        assert!(!should_prefer_idp_gateway(
            Some("https://account.example.com/sso/login?service=https%3A%2F%2Fwiki.example.com%2F"),
            "https://account.example.com/login?service=https%3A%2F%2Fwiki.example.com%2F",
        ));
    }

    #[test]
    fn should_not_return_before_auth_started() {
        let state = SsoFlowState::new("https://wiki.example.com/".to_string());

        assert!(!should_return_to_wiki(
            &state,
            "https://account.example.com/sso/login",
            HOST,
            false,
        ));
    }

    #[test]
    fn should_not_return_when_wiki_session_exists() {
        let state = SsoFlowState::new("https://wiki.example.com/".to_string());
        state.auth_flow_started.store(true, Ordering::SeqCst);
        state.left_confluence.store(true, Ordering::SeqCst);

        assert!(!should_return_to_wiki(
            &state,
            "https://account.example.com/sso/login",
            HOST,
            true,
        ));
    }

    #[test]
    fn should_not_return_during_dingtalk_oauth() {
        let state = SsoFlowState::new("https://wiki.example.com/pages/viewpage.action?pageId=1".to_string());
        state.auth_flow_started.store(true, Ordering::SeqCst);
        state.left_confluence.store(true, Ordering::SeqCst);

        assert!(!should_return_to_wiki(
            &state,
            "https://login.dingtalk.com/oauth2/challenge.htm",
            HOST,
            false,
        ));
        assert!(!should_return_to_wiki(
            &state,
            "https://login.dingtalk.com/oauth2/auth",
            HOST,
            false,
        ));
    }

    #[test]
    fn should_not_return_on_idp_login_choice_page() {
        let state = SsoFlowState::new("https://wiki.example.com/pages/viewpage.action?pageId=1".to_string());
        state.auth_flow_started.store(true, Ordering::SeqCst);
        state.left_confluence.store(true, Ordering::SeqCst);

        assert!(!should_return_to_wiki(
            &state,
            "https://account.example.com/login",
            HOST,
            false,
        ));
    }

    #[test]
    fn should_not_return_on_captcha_host() {
        let state = SsoFlowState::new("https://wiki.example.com/".to_string());
        state.auth_flow_started.store(true, Ordering::SeqCst);
        state.left_confluence.store(true, Ordering::SeqCst);

        assert!(!should_return_to_wiki(
            &state,
            "https://turing.captcha.gtimg.com/1/template/drag_ele.html",
            HOST,
            false,
        ));
    }

    #[test]
    fn merge_cookies_deduplicates_by_name() {
        let first = tauri::webview::Cookie::new("JSESSIONID", "old");
        let second = tauri::webview::Cookie::new("JSESSIONID", "new");
        let third = tauri::webview::Cookie::new("seraph.confluence", "123");

        let merged = merge_cookies(vec![first, second, third]);
        let mut names: Vec<_> = merged.iter().map(|cookie| cookie.name()).collect();
        names.sort_unstable();

        assert_eq!(names, vec!["JSESSIONID", "seraph.confluence"]);
        assert_eq!(
            merged
                .iter()
                .find(|cookie| cookie.name() == "JSESSIONID")
                .expect("jsessionid")
                .value(),
            "new"
        );
    }

    #[test]
    fn record_navigation_clears_oauth_on_wiki_success_url() {
        let state = SsoFlowState::new(
            "https://wiki.example.com/pages/viewpage.action?pageId=1".to_string(),
        );
        state.oauth_in_progress.store(true, Ordering::SeqCst);

        let url = Url::parse("https://wiki.example.com/pages/viewpage.action?pageId=1")
            .expect("wiki url");
        record_navigation(&url, HOST, &state);

        assert!(!state.oauth_in_progress.load(Ordering::SeqCst));
    }

    #[test]
    fn wiki_session_ready_for_probe_requires_success_url_and_session_cookie() {
        let cookie_header = "JSESSIONID=abc123";
        assert!(has_confluence_session_cookie(cookie_header));
        assert!(!has_authenticated_session_cookie(cookie_header));
        assert!(is_login_success_url(
            "https://wiki.example.com/pages/viewpage.action?pageId=123",
            HOST,
        ));
        assert!(!is_login_success_url(
            "https://wiki.example.com/login.action",
            HOST,
        ));
    }

    #[test]
    fn complete_sso_requires_wiki_session() {
        assert!(validate_wiki_session_for_completion(false).is_err());
        assert!(validate_wiki_session_for_completion(true).is_ok());
        assert_eq!(
            validate_wiki_session_for_completion(false).expect_err("missing session"),
            AppError::new(codes::WIKI_SESSION_REQUIRED).into_invoke_error()
        );
    }
}
