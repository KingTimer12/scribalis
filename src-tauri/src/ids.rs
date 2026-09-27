use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static COUNTER: AtomicU32 = AtomicU32::new(0);

/// Milliseconds since the Unix epoch.
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Short unique id: timestamp plus a process-wide counter.
pub fn new_id() -> String {
    let n = COUNTER.fetch_add(1, Ordering::Relaxed) & 0xffff;
    format!("x{:x}{:04x}", now_ms(), n)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_are_unique_in_a_burst() {
        let ids: std::collections::HashSet<String> = (0..1000).map(|_| new_id()).collect();
        assert_eq!(ids.len(), 1000);
    }
}
