use std::fmt;

/// User-facing error. The message is already in Portuguese, ready for a toast.
#[derive(Debug, Clone, PartialEq)]
pub struct AppError(pub String);

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn msg(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        Self(format!("Erro de disco: {e}"))
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        Self(format!("Arquivo inválido: {e}"))
    }
}

// Tauri sends command errors to the webview as plain strings.
impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_as_plain_string() {
        let json = serde_json::to_string(&AppError::msg("Falhou")).unwrap();
        assert_eq!(json, "\"Falhou\"");
    }

    #[test]
    fn io_error_gets_portuguese_prefix() {
        let e: AppError = std::io::Error::new(std::io::ErrorKind::Other, "x").into();
        assert!(e.0.starts_with("Erro de disco"));
    }
}
