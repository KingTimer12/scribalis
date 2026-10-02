//! The vault key lives in the system keychain, one entry per server. Never in a file.
use keyring::Entry;

use super::error::{CloudError, CloudResult, KEYCHAIN};

const SERVICE: &str = "Scribalis";

fn unavailable() -> CloudError {
    CloudError::new(KEYCHAIN, "O chaveiro do sistema não está disponível. Sem ele, o Scribalis não guarda a chave do cofre.")
}

fn entry(api_url: &str) -> CloudResult<Entry> {
    Entry::new(SERVICE, api_url).map_err(|_| unavailable())
}

pub fn read(api_url: &str) -> CloudResult<Option<String>> {
    match entry(api_url)?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err(unavailable()),
    }
}

pub fn write(api_url: &str, secret: &str) -> CloudResult<()> {
    entry(api_url)?.set_password(secret).map_err(|_| unavailable())
}

pub fn delete(api_url: &str) -> CloudResult<()> {
    match entry(api_url)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err(unavailable()),
    }
}

/// The encryption key sits next to the device key, under its own account name.
fn crypt_account(api_url: &str) -> String {
    format!("{api_url}#cripto")
}

pub fn read_crypt(api_url: &str) -> CloudResult<Option<String>> {
    read(&crypt_account(api_url))
}

pub fn write_crypt(api_url: &str, key_hex: &str) -> CloudResult<()> {
    write(&crypt_account(api_url), key_hex)
}

pub fn delete_crypt(api_url: &str) -> CloudResult<()> {
    delete(&crypt_account(api_url))
}
