//! Backup encryption: every file of an encrypted book is compressed (when it helps) and sealed with the
//! vault's encryption key before it leaves the computer, so the server only stores ciphertext.
//!
//! Sealing is deterministic (the nonce is an HMAC of the content), so an unchanged file gives the same
//! blob and the server's dedup and "unchanged" answers keep working. The cost is that the server can
//! tell two identical files apart from two different ones, never what they hold.
//!
//! Blob layout: `SCBE` | version (1) | flags | key fingerprint (8) | nonce (24) | ciphertext + tag.
//! The header is authenticated as associated data.
use std::io::{Read, Write};

use chacha20poly1305::{aead::{Aead, KeyInit, Payload}, XChaCha20Poly1305, XNonce};
use flate2::{read::DeflateDecoder, write::DeflateEncoder, Compression};
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

use super::error::{CloudError, CloudResult};

const MAGIC: &[u8; 4] = b"SCBE";
const VERSION: u8 = 1;
const FLAG_DEFLATE: u8 = 1;
const HEADER: usize = 4 + 1 + 1 + 8;
const NONCE: usize = 24;

/// Files that are already compressed: deflate would only spend time.
const PACKED: &[&str] = &["png", "jpg", "jpeg", "webp", "gif", "zip", "gz", "pdf", "mp3", "mp4"];

/// The vault's encryption key: 32 random bytes, kept in the keychain and carried to other computers
/// inside the connection code. Never written to a file.
#[derive(Clone, PartialEq, Eq)]
pub struct VaultKey([u8; 32]);

impl std::fmt::Debug for VaultKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "VaultKey({})", hex(&self.fingerprint()))
    }
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn unhex(s: &str) -> Option<Vec<u8>> {
    if !s.len().is_multiple_of(2) || !s.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok()).collect()
}

impl VaultKey {
    pub fn generate() -> CloudResult<Self> {
        let mut k = [0u8; 32];
        getrandom::getrandom(&mut k).map_err(|_| CloudError::new("crypto", "Não foi possível gerar a chave de criptografia."))?;
        Ok(Self(k))
    }

    /// 64 hex characters, as stored in the keychain and appended to connection codes.
    pub fn to_hex(&self) -> String {
        hex(&self.0)
    }

    pub fn from_hex(s: &str) -> Option<Self> {
        let bytes = unhex(s.trim())?;
        Some(Self(bytes.try_into().ok()?))
    }

    /// Identifies the key inside each blob, so a wrong key gets a clear message instead of a failed tag.
    pub fn fingerprint(&self) -> [u8; 8] {
        let d = Sha256::digest([b"scribalis/fingerprint/v1".as_slice(), &self.0].concat());
        d[..8].try_into().expect("8 bytes")
    }

    fn derive(&self, label: &[u8]) -> [u8; 32] {
        let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(&self.0).expect("any key length");
        mac.update(label);
        mac.finalize().into_bytes().into()
    }
}

/// Joins a device secret and the encryption key into the code another computer pastes.
pub fn join_code(secret: &str, key: Option<&VaultKey>) -> String {
    match key {
        Some(k) => format!("{secret}.{}", k.to_hex()),
        None => secret.to_string(),
    }
}

/// Splits a pasted code into the device secret and, when present, the encryption key.
/// Codes from older versions carry only the secret.
pub fn split_code(code: &str) -> (String, Option<VaultKey>) {
    let code = code.trim();
    if let Some((secret, tail)) = code.rsplit_once('.') {
        if let Some(key) = VaultKey::from_hex(tail) {
            return (secret.to_string(), Some(key));
        }
    }
    (code.to_string(), None)
}

fn compressible(path: &str) -> bool {
    let ext = path.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()).unwrap_or_default();
    !PACKED.contains(&ext.as_str())
}

fn deflate(data: &[u8]) -> Vec<u8> {
    let mut enc = DeflateEncoder::new(Vec::with_capacity(data.len() / 2), Compression::default());
    // Writing into a Vec cannot fail.
    enc.write_all(data).expect("in-memory write");
    enc.finish().expect("in-memory write")
}

/// Compresses (when the file type allows and it actually gets smaller) and encrypts `plain`.
pub fn seal(key: &VaultKey, path: &str, plain: &[u8]) -> Vec<u8> {
    let packed = compressible(path).then(|| deflate(plain)).filter(|d| d.len() < plain.len());
    let (flags, body) = match &packed {
        Some(d) => (FLAG_DEFLATE, d.as_slice()),
        None => (0, plain),
    };
    let mut header = Vec::with_capacity(HEADER + NONCE);
    header.extend_from_slice(MAGIC);
    header.push(VERSION);
    header.push(flags);
    header.extend_from_slice(&key.fingerprint());

    let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(&key.derive(b"scribalis/nonce/v1")).expect("any key length");
    mac.update(&header);
    mac.update(body);
    let nonce: [u8; NONCE] = mac.finalize().into_bytes()[..NONCE].try_into().expect("24 bytes");

    let cipher = XChaCha20Poly1305::new(&key.derive(b"scribalis/enc/v1").into());
    let sealed = cipher
        .encrypt(XNonce::from_slice(&nonce), Payload { msg: body, aad: &header })
        .expect("encryption of an in-memory buffer");
    let mut out = header;
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&sealed);
    out
}

/// True for blobs written by `seal`; anything else is a plain file from an open book or an older backup.
pub fn is_sealed(blob: &[u8]) -> bool {
    blob.len() > HEADER + NONCE && &blob[..4] == MAGIC && blob[4] == VERSION
}

fn other_key() -> CloudError {
    CloudError::new(
        "wrong_key",
        "Este backup foi criptografado com a chave de outro computador. Gere um código em \"Adicionar computador\" \
         no computador que fez o backup e cole aqui em \"Trazer chave\".",
    )
}

/// Decrypts and decompresses a sealed blob.
pub fn open(key: Option<&VaultKey>, blob: &[u8]) -> CloudResult<Vec<u8>> {
    let key = key.ok_or_else(other_key)?;
    if !is_sealed(blob) {
        return Err(CloudError::new("crypto", "Arquivo criptografado inválido."));
    }
    let (header, rest) = blob.split_at(HEADER);
    if header[6..HEADER] != key.fingerprint() {
        return Err(other_key());
    }
    let (nonce, sealed) = rest.split_at(NONCE);
    let cipher = XChaCha20Poly1305::new(&key.derive(b"scribalis/enc/v1").into());
    let body = cipher
        .decrypt(XNonce::from_slice(nonce), Payload { msg: sealed, aad: header })
        .map_err(|_| CloudError::new("hash_mismatch", "Um arquivo do backup chegou corrompido. Nada foi alterado."))?;
    if header[5] & FLAG_DEFLATE == 0 {
        return Ok(body);
    }
    let mut out = Vec::with_capacity(body.len() * 3);
    DeflateDecoder::new(body.as_slice())
        .read_to_end(&mut out)
        .map_err(|_| CloudError::new("hash_mismatch", "Um arquivo do backup chegou corrompido. Nada foi alterado."))?;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key() -> VaultKey {
        VaultKey([7u8; 32])
    }

    #[test]
    fn seal_and_open_round_trip_and_text_shrinks() {
        let text = "Era uma vez uma flor no abismo. ".repeat(200);
        let blob = seal(&key(), "capitulos/c1.md", text.as_bytes());
        assert!(is_sealed(&blob));
        assert!(blob.len() < text.len() / 4, "compressed {} of {}", blob.len(), text.len());
        assert!(!blob.windows(4).any(|w| w == b"flor"), "plain text leaked");
        assert_eq!(open(Some(&key()), &blob).unwrap(), text.as_bytes());
    }

    #[test]
    fn sealing_is_deterministic_so_unchanged_files_dedup() {
        assert_eq!(seal(&key(), "a.md", b"abc"), seal(&key(), "b.md", b"abc"));
        assert_ne!(seal(&key(), "a.md", b"abc"), seal(&key(), "a.md", b"abd"));
    }

    #[test]
    fn images_are_not_deflated_but_still_sealed() {
        let bytes = vec![0u8; 4096];
        let blob = seal(&key(), "arquivos/x.PNG", &bytes);
        assert_eq!(blob[5] & FLAG_DEFLATE, 0);
        assert_eq!(open(Some(&key()), &blob).unwrap(), bytes);
    }

    #[test]
    fn another_key_or_a_flipped_byte_is_refused() {
        let blob = seal(&key(), "a.md", b"segredo");
        assert_eq!(open(Some(&VaultKey([8u8; 32])), &blob).unwrap_err().code, "wrong_key");
        assert_eq!(open(None, &blob).unwrap_err().code, "wrong_key");
        let mut bad = blob.clone();
        let last = bad.len() - 1;
        bad[last] ^= 1;
        assert_eq!(open(Some(&key()), &bad).unwrap_err().code, "hash_mismatch");
    }

    #[test]
    fn plain_files_are_not_mistaken_for_sealed_ones() {
        assert!(!is_sealed(b"# Capitulo\n\nTexto"));
        assert!(!is_sealed(b"{\"id\":\"b1\"}"));
    }

    #[test]
    fn codes_carry_the_key_and_old_codes_still_split() {
        let k = key();
        let code = join_code("scb_abc", Some(&k));
        assert_eq!(split_code(&code), ("scb_abc".to_string(), Some(k.clone())));
        assert_eq!(split_code(" scb_abc "), ("scb_abc".to_string(), None));
        assert_eq!(split_code("scb_a.b"), ("scb_a.b".to_string(), None));
        assert_eq!(VaultKey::from_hex(&k.to_hex()), Some(k));
    }
}
