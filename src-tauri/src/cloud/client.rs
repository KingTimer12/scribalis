//! Thin reqwest wrapper: base URL, Bearer key, timeouts, JSON and streamed files.
use std::{path::Path, time::Duration};

use futures_util::StreamExt;
use reqwest::{header, Method, RequestBuilder, Response};
use serde::{de::DeserializeOwned, Serialize};
use tokio::io::AsyncWriteExt;

use super::error::{CloudError, CloudResult};

const CONNECT: Duration = Duration::from_secs(10);
/// Files have no total limit, only this much silence.
const IDLE: Duration = Duration::from_secs(60);
const JSON_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Clone)]
pub struct Client {
    http: reqwest::Client,
    base: String,
    key: Option<String>,
}

impl Client {
    pub fn new(base: &str, key: Option<String>) -> CloudResult<Self> {
        let http = reqwest::Client::builder()
            .connect_timeout(CONNECT)
            .read_timeout(IDLE)
            .user_agent(concat!("Scribalis/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|_| CloudError::network())?;
        Ok(Self { http, base: base.to_string(), key })
    }

    pub fn has_key(&self) -> bool {
        self.key.is_some()
    }

    fn request(&self, method: Method, path: &str) -> RequestBuilder {
        let rb = self.http.request(method, format!("{}{}", self.base, path));
        match &self.key {
            Some(k) => rb.bearer_auth(k),
            None => rb,
        }
    }

    async fn send(rb: RequestBuilder) -> CloudResult<Response> {
        let res = rb.send().await.map_err(|_| CloudError::network())?;
        if res.status().is_success() {
            return Ok(res);
        }
        let status = res.status().as_u16();
        let body = res.bytes().await.unwrap_or_default();
        Err(CloudError::from_response(status, &body))
    }

    async fn json<T: DeserializeOwned>(rb: RequestBuilder) -> CloudResult<T> {
        let res = Self::send(rb.timeout(JSON_TIMEOUT)).await?;
        let status = res.status().as_u16();
        let body = res.bytes().await.map_err(|_| CloudError::network())?;
        serde_json::from_slice(&body).map_err(|_| CloudError::from_response(status, b""))
    }

    pub async fn get<T: DeserializeOwned>(&self, path: &str) -> CloudResult<T> {
        Self::json(self.request(Method::GET, path)).await
    }

    pub async fn post<B: Serialize + ?Sized, T: DeserializeOwned>(&self, path: &str, body: &B) -> CloudResult<T> {
        Self::json(self.request(Method::POST, path).json(body)).await
    }

    pub async fn patch<B: Serialize + ?Sized, T: DeserializeOwned>(&self, path: &str, body: &B) -> CloudResult<T> {
        Self::json(self.request(Method::PATCH, path).json(body)).await
    }

    pub async fn delete(&self, path: &str) -> CloudResult<()> {
        Self::send(self.request(Method::DELETE, path).timeout(JSON_TIMEOUT)).await.map(|_| ())
    }

    /// Streams a file as the raw request body.
    pub async fn put_file(&self, path: &str, file: &Path) -> CloudResult<()> {
        let f = tokio::fs::File::open(file).await?;
        let len = f.metadata().await?.len();
        let body = reqwest::Body::wrap_stream(tokio_util::io::ReaderStream::new(f));
        let rb = self
            .request(Method::PUT, path)
            .header(header::CONTENT_TYPE, "application/octet-stream")
            .header(header::CONTENT_LENGTH, len)
            .body(body);
        Self::send(rb).await.map(|_| ())
    }

    /// Sends an in-memory blob (a sealed file) as the raw request body.
    pub async fn put_bytes(&self, path: &str, bytes: Vec<u8>) -> CloudResult<()> {
        let rb = self
            .request(Method::PUT, path)
            .header(header::CONTENT_TYPE, "application/octet-stream")
            .header(header::CONTENT_LENGTH, bytes.len())
            .body(bytes);
        Self::send(rb).await.map(|_| ())
    }

    /// Streams a response body into `to`.
    pub async fn download(&self, path: &str, to: &Path) -> CloudResult<()> {
        let res = Self::send(self.request(Method::GET, path)).await?;
        let mut out = tokio::fs::File::create(to).await?;
        let mut stream = res.bytes_stream();
        while let Some(chunk) = stream.next().await {
            out.write_all(&chunk.map_err(|_| CloudError::network())?).await?;
        }
        out.flush().await?;
        Ok(())
    }
}
