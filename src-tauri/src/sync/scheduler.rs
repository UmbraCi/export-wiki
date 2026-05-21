use chrono::{DateTime, Duration, Utc};

use crate::contracts::SyncSettings;

pub fn next_run_after(settings: &SyncSettings, now: DateTime<Utc>) -> Option<DateTime<Utc>> {
    if !settings.enabled {
        return None;
    }

    Some(now + Duration::minutes(settings.interval_minutes as i64))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disabled_sync_has_no_next_run() {
        let settings = SyncSettings {
            enabled: false,
            interval_minutes: 60,
            output_dir: "/tmp/export-wiki".into(),
            page_ids: vec!["123".into()],
        };

        assert!(next_run_after(&settings, Utc::now()).is_none());
    }
}
