//! Where the cloud API lives. A custom server can replace the default.
use reqwest::Url;

use crate::error::{AppError, AppResult};

pub const DEFAULT_API_URL: &str = "https://kingtimer12.dev/api/scribalis/v1";

/// Trims, drops the trailing `/` and checks the URL. The key travels in every request, so plain
/// `http://` is allowed only for a server on this machine.
pub fn normalize_api_url(raw: &str) -> AppResult<String> {
    let invalid = || AppError::msg("Endereço inválido. Use https://…");
    let trimmed = raw.trim().trim_end_matches('/');
    let url = Url::parse(trimmed).map_err(|_| invalid())?;
    let host = url.host_str().unwrap_or("");
    let secure = match url.scheme() {
        "https" => !host.is_empty(),
        "http" => host == "localhost" || host == "127.0.0.1",
        _ => false,
    };
    if !secure || url.query().is_some() || url.fragment().is_some() || !url.username().is_empty() {
        return Err(invalid());
    }
    Ok(trimmed.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_https_and_drops_trailing_slash() {
        assert_eq!(normalize_api_url(" https://meu.servidor/api/scribalis/v1/ ").unwrap(), "https://meu.servidor/api/scribalis/v1");
    }

    #[test]
    fn accepts_plain_http_only_on_this_machine() {
        assert_eq!(normalize_api_url("http://localhost:3000/api/scribalis/v1").unwrap(), "http://localhost:3000/api/scribalis/v1");
        assert!(normalize_api_url("http://127.0.0.1:3000/api").is_ok());
        assert!(normalize_api_url("http://meu.servidor/api").is_err());
    }

    #[test]
    fn rejects_garbage_query_and_credentials() {
        assert!(normalize_api_url("servidor").is_err());
        assert!(normalize_api_url("ftp://x.dev").is_err());
        assert!(normalize_api_url("https://x.dev/api?a=1").is_err());
        assert!(normalize_api_url("https://eu:senha@x.dev/api").is_err());
    }
}
