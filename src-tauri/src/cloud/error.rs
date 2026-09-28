//! Errors from the cloud server, kept with their stable code so callers can react to them.
use serde::Deserialize;

use crate::error::AppError;

pub const NETWORK: &str = "network";
pub const UNEXPECTED: &str = "unexpected";
pub const LOCAL: &str = "local";
pub const KEYCHAIN: &str = "keychain";
pub const NO_VAULT: &str = "no_vault";

#[derive(Debug, Clone, PartialEq)]
pub struct CloudError {
    /// HTTP status, or 0 when the error did not come from a response.
    pub status: u16,
    pub code: String,
    /// Portuguese, ready for a toast.
    pub message: String,
    /// Seconds to wait, from `rate_limited`.
    pub retry_after: Option<u64>,
    /// Hashes the server still needs, from `missing_blobs`.
    pub missing: Vec<String>,
}

pub type CloudResult<T> = Result<T, CloudError>;

#[derive(Deserialize)]
struct Envelope {
    error: Body,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Body {
    code: String,
    message: String,
    #[serde(default)]
    retry_after: Option<u64>,
    #[serde(default)]
    missing: Vec<String>,
}

impl CloudError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self { status: 0, code: code.to_string(), message: message.into(), retry_after: None, missing: Vec::new() }
    }

    pub fn network() -> Self {
        Self::new(NETWORK, "Sem conexão com o servidor da nuvem.")
    }

    pub fn no_vault() -> Self {
        Self::new(NO_VAULT, "A nuvem ainda não foi ativada neste computador.")
    }

    /// Error from a non-success response: the server's `{ error: { code, message, … } }`, or a generic one.
    pub fn from_response(status: u16, body: &[u8]) -> Self {
        match serde_json::from_slice::<Envelope>(body) {
            Ok(Envelope { error: b }) => {
                Self { status, code: b.code, message: b.message, retry_after: b.retry_after, missing: b.missing }
            }
            Err(_) => Self {
                status,
                ..Self::new(UNEXPECTED, format!("O servidor da nuvem respondeu algo inesperado (HTTP {status})."))
            },
        }
    }

    pub fn is(&self, code: &str) -> bool {
        self.code == code
    }
}

impl From<CloudError> for AppError {
    fn from(e: CloudError) -> Self {
        AppError::msg(e.message)
    }
}

impl From<AppError> for CloudError {
    fn from(e: AppError) -> Self {
        CloudError::new(LOCAL, e.0)
    }
}

impl From<std::io::Error> for CloudError {
    fn from(e: std::io::Error) -> Self {
        AppError::from(e).into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_code_message_and_extras_inside_error() {
        let body = br#"{"error":{"code":"missing_blobs","message":"Envie estes arquivos antes de fechar o backup","missing":["ab","cd"]}}"#;
        let e = CloudError::from_response(409, body);
        assert_eq!((e.status, e.code.as_str()), (409, "missing_blobs"));
        assert_eq!(e.message, "Envie estes arquivos antes de fechar o backup");
        assert_eq!(e.missing, vec!["ab", "cd"]);
    }

    #[test]
    fn reads_retry_after_from_rate_limited() {
        let body = r#"{"error":{"code":"rate_limited","message":"Muitas requisições","retryAfter":42}}"#;
        assert_eq!(CloudError::from_response(429, body.as_bytes()).retry_after, Some(42));
    }

    #[test]
    fn non_json_body_becomes_generic_message_with_status() {
        let e = CloudError::from_response(502, b"<html>Bad Gateway</html>");
        assert_eq!(e.code, UNEXPECTED);
        assert_eq!(e.message, "O servidor da nuvem respondeu algo inesperado (HTTP 502).");
    }

    #[test]
    fn converts_to_app_error_as_its_message() {
        let e: AppError = CloudError::network().into();
        assert_eq!(e.0, "Sem conexão com o servidor da nuvem.");
    }
}
