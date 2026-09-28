//! Request and response bodies of the Scribalis Cloud API (formats in the spec, "Rotas que o servidor precisa ter").
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IdOnly {
    pub id: String,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NewKey {
    pub id: String,
    pub label: String,
    pub secret: String,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VaultCreated {
    pub vault: IdOnly,
    pub key: NewKey,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NewKeyResponse {
    pub key: NewKey,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub bytes: u64,
    pub quota: u64,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VaultInfo {
    pub id: String,
    pub key_id: String,
    pub created_at: u64,
    pub books: u64,
    pub usage: Usage,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KeyInfo {
    pub id: String,
    pub label: String,
    pub created_at: u64,
    #[serde(default)]
    pub last_used_at: Option<u64>,
    pub current: bool,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KeyList {
    pub keys: Vec<KeyInfo>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Missing {
    pub missing: Vec<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub id: String,
    pub created_at: u64,
    #[serde(default)]
    pub note: Option<String>,
    pub file_count: u64,
    pub total_size: u64,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteBook {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub updated_at: u64,
    pub snapshots: u64,
    #[serde(default)]
    pub open_comments: u64,
    pub latest: Option<Snapshot>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BookList {
    pub books: Vec<RemoteBook>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BookDetail {
    pub id: String,
    pub title: String,
    /// Newest first.
    pub snapshots: Vec<Snapshot>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotCreated {
    pub snapshot: Snapshot,
    pub unchanged: bool,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFile {
    pub path: String,
    pub hash: String,
    pub size: u64,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotFiles {
    pub snapshot: Snapshot,
    pub files: Vec<RemoteFile>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Share {
    pub id: String,
    pub url: String,
    pub book_id: String,
    pub kind: String,
    pub target: Option<String>,
    pub snapshot_id: Option<String>,
    pub follow: bool,
    pub include_notes: bool,
    pub allow_comments: bool,
    pub created_at: u64,
    pub expires_at: Option<u64>,
    pub views: u64,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ShareResponse {
    pub share: Share,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ShareList {
    pub shares: Vec<Share>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Anchor {
    pub exact: String,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Author {
    pub name: String,
    pub kind: String,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub id: String,
    pub parent_id: Option<String>,
    /// Chapter id or workspace node id.
    pub node_id: String,
    pub anchor: Option<Anchor>,
    pub body: String,
    pub author: Author,
    pub created_at: u64,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CommentList {
    pub comments: Vec<Comment>,
}

#[derive(Serialize)]
pub struct LabelBody<'a> {
    pub label: &'a str,
}

#[derive(Serialize)]
pub struct HashesBody<'a> {
    pub hashes: &'a [String],
}

#[derive(Serialize)]
pub struct FileRef<'a> {
    pub path: &'a str,
    pub hash: &'a str,
}

#[derive(Serialize)]
pub struct SnapshotBody<'a> {
    pub files: Vec<FileRef<'a>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareBody {
    pub book_id: String,
    pub kind: String,
    pub target: Option<String>,
    /// "latest" follows new backups; a snapshot id freezes the version.
    pub snapshot_id: String,
    pub include_notes: bool,
    pub allow_comments: bool,
    pub expires_in_days: Option<u32>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SharePatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snapshot_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_notes: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allow_comments: Option<bool>,
    /// Some(None) sends null, which removes the expiry.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_in_days: Option<Option<u32>>,
}

#[derive(Serialize)]
pub struct ResolveBody {
    pub resolved: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_vault_created() {
        let v: VaultCreated = serde_json::from_str(
            r#"{"vault":{"id":"vlt_1"},"key":{"id":"key_1","label":"Casa","secret":"scb_x"}}"#,
        ).unwrap();
        assert_eq!((v.vault.id.as_str(), v.key.secret.as_str()), ("vlt_1", "scb_x"));
    }

    #[test]
    fn reads_book_list_with_and_without_latest() {
        let l: BookList = serde_json::from_str(r#"{"books":[
            {"id":"b1","title":"A","author":"","updatedAt":1,"snapshots":1,"openComments":2,
             "latest":{"id":"snp_1","createdAt":10,"note":null,"fileCount":3,"totalSize":99}},
            {"id":"b2","title":"B","author":"","updatedAt":1,"snapshots":0,"openComments":0,"latest":null}]}"#).unwrap();
        assert_eq!(l.books[0].latest.as_ref().unwrap().created_at, 10);
        assert!(l.books[1].latest.is_none());
    }

    #[test]
    fn reads_share_and_comment() {
        let s: ShareResponse = serde_json::from_str(r#"{"share":{"id":"shr_1","url":"https://h/scribalis/s/t","bookId":"b1",
            "kind":"chapter","target":"c1","snapshotId":null,"follow":true,"includeNotes":false,"allowComments":true,
            "createdAt":1,"expiresAt":null,"views":0}}"#).unwrap();
        assert!(s.share.follow && s.share.snapshot_id.is_none());
        let c: CommentList = serde_json::from_str(r#"{"comments":[{"id":"cmt_1","parentId":null,"nodeId":"c1",
            "anchor":{"exact":"cheiro","prefix":"O ","suffix":" de","start":2,"end":8},"body":"Oi",
            "author":{"name":"Mira","kind":"guest"},"createdAt":5,"updatedAt":5,"resolved":false,"shareId":"shr_1"}]}"#).unwrap();
        assert_eq!(c.comments[0].anchor.as_ref().unwrap().exact, "cheiro");
        assert_eq!(c.comments[0].author.name, "Mira");
    }

    #[test]
    fn share_patch_sends_null_to_clear_expiry_and_skips_unset_fields() {
        let p = SharePatch { expires_in_days: Some(None), ..Default::default() };
        assert_eq!(serde_json::to_string(&p).unwrap(), r#"{"expiresInDays":null}"#);
    }
}
