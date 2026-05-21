# Confluence Tauri MVP — Manual Tests

## SSO interactive completion

1. Enter `https://wiki.heytea.com/pages/viewpage.action?pageId=110888526` as Confluence URL.
2. Click **Sign in with SSO** — SSO window opens and main app shows **SSO login in progress**.
3. Complete IdP login (e.g. DingTalk) in the SSO window. Staying on the IdP home page (e.g. `account.heytea.com/sso/login`) is expected.
4. In the main app, click **Open target page** — SSO window loads the wiki page.
5. Main app shows **Wiki session: Detected**.
6. Click **Complete login** — main app shows **Connected** and Spaces can load.
7. Click **Cancel** during an in-progress SSO session — SSO window closes and main app returns to the sign-in form.

## Notes

- If IdP login finishes without redirecting back to wiki, use **Open target page** then **Complete login** (no automatic redirect required).
- **Complete login** stays disabled until wiki session cookies are detected.
