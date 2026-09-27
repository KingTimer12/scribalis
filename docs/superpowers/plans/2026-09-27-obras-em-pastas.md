# Obras em pastas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o `localStorage` por pastas de obra em `~/Documentos/Scribalis`, com todo acesso e processamento de dados no Rust, e trocar o textarea por um editor TipTap que mostra separador, cabeçalho, rodapé e imagens.

**Architecture:** O Rust expõe comandos Tauri finos (`commands/`) sobre funções testáveis (`ops/`, `storage/`, `markdown/`, `text/`), com a obra aberta em cache num `Mutex<Library>` gerenciado pelo Tauri. O front fala só com `src/api/` (com um mock em memória quando roda fora do Tauri), guarda estado de tela no store Solid e o capítulo aberto dentro do TipTap.

**Tech Stack:** Tauri 2.12, Rust (serde, image 0.25, unicode-normalization, tauri-plugin-dialog, tauri-plugin-store), SolidJS 1.9, Tailwind v4, TipTap 3.31, vitest 5, bun.

**Spec:** `docs/superpowers/specs/2026-09-27-obras-em-pastas-design.md`

## Global Constraints

- Comentários de código **sempre em inglês**; textos de interface em português (`CLAUDE.md`).
- **Nenhum arquivo Deus:** um arquivo por responsabilidade, inclusive `mod`s Rust.
- Dados e processamento de dados no Rust; webview guarda só estado de tela, resumos pequenos e o capítulo aberto.
- Raiz fixa: `document_dir()/Scribalis`. Subpastas da obra: `imagens/`, `capitulos/`. Arquivo: `metadata.json`.
- Capa: 400×600 JPEG qualidade 85 em `imagens/capa.jpg`. Cabeçalho/rodapé/separador: arquivo original copiado como `imagens/cabecalho.<ext>`, `imagens/rodape.<ext>`, `imagens/separador.<ext>`.
- Extensões de imagem aceitas: `png`, `jpg`, `jpeg`, `webp`.
- Separador padrão: `{ "type": "text", "text": "* * *" }`. No `.md`: linha `***`. Imagem no `.md`: linha `![](../imagens/<arquivo>)`. Hard break: `\` no fim da linha.
- Debounces: texto do capítulo 800 ms; título/notas do capítulo e nome/autor da obra 300 ms.
- Atalho do separador: **Ctrl Enter**.
- Commits: um por tarefa, mensagem **sem** `Co-Authored-By`.
- Typecheck do front: `./node_modules/.bin/tsc.exe --noEmit -p .`. Testes Rust: `cargo test --manifest-path src-tauri/Cargo.toml`.

## Refinamentos sobre a spec

Decisões tomadas ao detalhar o plano (não contradizem a spec, só a completam):

1. **Exemplos só na primeira execução:** são criados quando a pasta raiz **não existia**. Se o usuário apagar todas as obras, a biblioteca fica vazia (não recria exemplos a cada abertura).
2. **`ops/`** (novo módulo Rust): regras de biblioteca, obra e capítulo como funções puras sobre `(&Path, &mut Metadata)`, testáveis em diretório temporário. `commands/` só trava o estado e chama `ops/`.
3. **Erro Rust** é um tipo `AppError` serializado como string (mesmo efeito do `Result<T, String>` da spec).
4. **Imagens com cache-buster:** o front acrescenta `?v=<updatedAt>` às URLs de imagem da obra, porque trocar a capa regrava o mesmo `capa.jpg`.
5. **Caminhos vindos do `metadata.json`** passam por `safe_join`, que recusa caminhos absolutos ou com `..` (um metadata editado à mão não consegue apontar para fora da pasta da obra).
6. **Mock do navegador** guarda tudo em memória; recarregar a página volta aos exemplos.

## Review Focus

1. **Obra criada com título só de símbolos/acentos** (`"???"`, `"Ção"`) — a pasta precisa ser válida (`obra`, `cao`) e não colidir com uma existente. Coberto no Task 2 (`slugify` + `unique_dir`).
2. **Enter ×3 no meio de um parágrafo com texto depois** — o texto após o cursor vai inteiro para o capítulo novo e nada se perde no disco. Coberto no Task 12 (`splitAtCursor`) e no Task 7 (`split`).
3. **Trocar de capítulo/voltar à biblioteca antes do debounce de 800 ms** — o texto digitado precisa ser gravado antes de carregar outro capítulo. Coberto no Task 13 (`flushAll` antes de `goChapter`/`goLibrary`) e no teste e2e do Task 16.
4. **`metadata.json` corrompido ou pasta estranha na raiz** — a biblioteca abre com as outras obras e mostra aviso. Coberto no Task 6 (`scan` com pasta inválida).
5. **Texto do usuário com `*`, `\` e linhas começando com espaço** — ida e volta pelo `.md` sem alteração. Coberto no Task 3 (testes de roundtrip).

---

## File Structure

### Rust (`src-tauri/src/`)

| Arquivo | Responsabilidade |
|---|---|
| `lib.rs` | Monta o Builder: plugins, estado, comandos |
| `error.rs` | `AppError`/`AppResult`, conversões e serialização |
| `ids.rs` | `new_id()`, `now_ms()` |
| `state.rs` | `Library` (raiz, índice id→pasta, obra aberta, totais, base da sessão) |
| `text/mod.rs`, `text/words.rs`, `text/normalize.rs` | Contagem de palavras; dobra acento/caixa |
| `model/mod.rs`, `model/doc.rs` | Documento do editor (JSON ProseMirror) |
| `model/metadata.rs` | `Metadata`, `ChapterEntry`, `Status`, `Separator` |
| `model/views.rs` | `BookSummary`, `BookMeta`, `ChapterMeta`, `SearchHit`, `LibraryListing` |
| `model/patches.rs` | `BookPatch`, `ChapterPatch`, `ImageSlot` |
| `model/prefs.rs` | `Prefs`, `PrefsPatch` |
| `markdown/mod.rs`, `markdown/parse.rs`, `markdown/serialize.rs` | `.md` ↔ `Doc` |
| `storage/mod.rs`, `storage/paths.rs` | Nomes de pastas, `slugify`, `unique_dir`, `safe_join` |
| `storage/atomic.rs` | Escrita atômica |
| `storage/metadata_io.rs` | Ler/gravar `metadata.json` |
| `storage/chapter_io.rs` | Ler/gravar/apagar `.md` |
| `storage/images.rs` | Capa recortada, cópia de imagem, remoção |
| `samples.rs` | Dados das obras de exemplo |
| `ops/mod.rs`, `ops/library.rs` | Varredura, criar, excluir, exemplos, resumo |
| `ops/book.rs` | Atualizar obra, imagens da obra |
| `ops/chapter.rs` | Carregar, salvar, inserir, dividir, mover, excluir, buscar, markdown |
| `commands/mod.rs`, `commands/{library,book,chapter,prefs,stats}.rs` | Adaptadores IPC |

### Front (`src/`)

| Arquivo | Responsabilidade |
|---|---|
| `api/types.ts` | Tipos espelhando o Rust |
| `api/invoke.ts` | `call()` → Tauri ou mock |
| `api/{library,book,chapter,prefs}.ts` | Wrappers tipados |
| `api/mock/{db,library,book,chapter,prefs,index}.ts` | Backend em memória |
| `lib/doc.ts` | Texto e palavras de um `Doc` |
| `lib/assets.ts` | URL de imagem da obra (`convertFileSrc` + cache-buster) |
| `editor/separator.ts`, `editor/image.ts` | Nós TipTap |
| `editor/split.ts` | Fatiar documento no Enter ×3 |
| `editor/writerKeys.ts` | Enter ×3, Ctrl Enter, ↑ no início, aviso |
| `editor/createEditor.ts` | Monta o `Editor` com as extensões |
| `editor/bridge.ts` | Instância atual do editor para as ações |
| `store/state.ts` | Store e `session` |
| `store/selectors/{library,book}.ts` | Derivações |
| `store/actions/{ui,prefs,library,images,book,chapters}.ts` | Ações |
| `store/saving.ts` | Debounce e flush |
| `store/keys/{global,library,index,palette,fields}.ts` | Handlers de teclado |
| `store/commands/{palette,prompt}.ts` | Itens da paleta; modo campo |
| `components/editor/RichEditor.tsx`, `BookImage.tsx` | Editor e imagens de cabeçalho/rodapé |

Arquivos que saem: `src/lib/storage.ts`, `src/data/samples.ts`, `src/store/{persistence,library,chapters,commands,keyboard,ui}.ts`, `src/components/library/CoverFileInput.tsx`, `src/components/editor/ChapterBody.tsx`.

---

# Parte A — Backend Rust

### Task 1: Dependências, erro, ids e esqueleto de módulos

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `package.json` (remove `@tauri-apps/plugin-fs`)
- Create: `src-tauri/src/error.rs`, `src-tauri/src/ids.rs`

**Interfaces:**
- Produces: `crate::error::{AppError, AppResult}`; `AppError::msg(impl Into<String>)`; `From<std::io::Error>`, `From<serde_json::Error>`; `crate::ids::{new_id() -> String, now_ms() -> u64}`.

- [ ] **Step 1: Ajustar dependências**

Em `src-tauri/Cargo.toml`, substituir o bloco `[dependencies]` por:

```toml
[dependencies]
tauri = { version = "2", features = ["protocol-asset"] }
tauri-plugin-opener = "2"
tauri-plugin-dialog = "2"
tauri-plugin-store = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
image = { version = "0.25", default-features = false, features = ["jpeg", "png", "webp"] }
unicode-normalization = "0.1"

[dev-dependencies]
tempfile = "3"
```

Remover do front: `bun remove @tauri-apps/plugin-fs`.

- [ ] **Step 2: Configuração do Tauri**

`src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": ["core:default", "opener:default"]
}
```

Em `src-tauri/tauri.conf.json`, dentro de `app.security`, deixar:

```json
"security": {
  "csp": null,
  "assetProtocol": { "enable": true, "scope": ["$DOCUMENT/Scribalis/**"] }
}
```

- [ ] **Step 3: Escrever os testes de `error` e `ids`**

`src-tauri/src/error.rs`:

```rust
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
```

`src-tauri/src/ids.rs`:

```rust
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
```

- [ ] **Step 4: Esqueleto do `lib.rs`**

```rust
mod error;
mod ids;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5: Rodar testes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 3 testes PASS (avisos de código não usado são esperados até o Task 8).

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/capabilities/default.json src-tauri/tauri.conf.json src-tauri/src
git commit -m "chore(tauri): swap fs plugin for dialog/store, add error and id modules"
```

---

### Task 2: Texto e caminhos (palavras, dobra de acento, slug, safe_join)

**Files:**
- Create: `src-tauri/src/text/mod.rs`, `src-tauri/src/text/words.rs`, `src-tauri/src/text/normalize.rs`
- Create: `src-tauri/src/storage/mod.rs`, `src-tauri/src/storage/paths.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod text; mod storage;`)

**Interfaces:**
- Produces: `text::words::count_words(&str) -> usize`; `text::normalize::fold(&str) -> String`; `storage::paths::{ROOT_NAME, IMAGES_DIR, CHAPTERS_DIR, META_FILE, slugify(&str) -> String, unique_dir(&Path, &str) -> PathBuf, safe_join(&Path, &str) -> AppResult<PathBuf>}`.

- [ ] **Step 1: Escrever os testes**

`src-tauri/src/text/words.rs`:

```rust
/// Counts whitespace-separated words.
pub fn count_words(s: &str) -> usize {
    s.split_whitespace().count()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_words_across_whitespace_kinds() {
        assert_eq!(count_words("  um\tdois\n\ntrês  "), 3);
        assert_eq!(count_words(""), 0);
        assert_eq!(count_words("— Então é hoje — murmurou"), 6);
    }
}
```

`src-tauri/src/text/normalize.rs`:

```rust
use unicode_normalization::UnicodeNormalization;

/// Lowercases and strips diacritics, for accent-insensitive search.
pub fn fold(s: &str) -> String {
    s.nfd()
        .filter(|c| !('\u{300}'..='\u{36f}').contains(c))
        .flat_map(char::to_lowercase)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_accents_and_case() {
        assert_eq!(fold("Coração ÁGUA"), "coracao agua");
    }
}
```

`src-tauri/src/text/mod.rs`:

```rust
pub mod normalize;
pub mod words;
```

`src-tauri/src/storage/paths.rs`:

```rust
use std::path::{Component, Path, PathBuf};

use crate::error::{AppError, AppResult};
use crate::text::normalize::fold;

pub const ROOT_NAME: &str = "Scribalis";
pub const IMAGES_DIR: &str = "imagens";
pub const CHAPTERS_DIR: &str = "capitulos";
pub const META_FILE: &str = "metadata.json";

/// Folder name for a book title: ascii letters/digits joined by dashes.
pub fn slugify(title: &str) -> String {
    let mut out = String::new();
    for c in fold(title).chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else if !out.is_empty() && !out.ends_with('-') {
            out.push('-');
        }
    }
    let trimmed = out.trim_end_matches('-');
    if trimmed.is_empty() { "obra".to_string() } else { trimmed.to_string() }
}

/// `root/slug`, or `root/slug-2`, `-3`… when taken.
pub fn unique_dir(root: &Path, slug: &str) -> PathBuf {
    let first = root.join(slug);
    if !first.exists() {
        return first;
    }
    (2..)
        .map(|n| root.join(format!("{slug}-{n}")))
        .find(|p| !p.exists())
        .expect("an unused suffix always exists")
}

/// Joins a relative path from metadata, refusing absolute paths and `..`.
pub fn safe_join(base: &Path, rel: &str) -> AppResult<PathBuf> {
    let rel_path = Path::new(rel);
    let ok = !rel.is_empty()
        && rel_path.components().all(|c| matches!(c, Component::Normal(_)));
    if !ok {
        return Err(AppError::msg(format!("Caminho inválido na obra: {rel}")));
    }
    Ok(base.join(rel_path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slug_from_accented_title() {
        assert_eq!(slugify("A Torre das Mil Luas!"), "a-torre-das-mil-luas");
        assert_eq!(slugify("Ção"), "cao");
    }

    #[test]
    fn slug_falls_back_when_no_letters() {
        assert_eq!(slugify("???"), "obra");
        assert_eq!(slugify(""), "obra");
    }

    #[test]
    fn unique_dir_adds_suffix() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir(tmp.path().join("obra")).unwrap();
        std::fs::create_dir(tmp.path().join("obra-2")).unwrap();
        assert_eq!(unique_dir(tmp.path(), "obra"), tmp.path().join("obra-3"));
    }

    #[test]
    fn safe_join_rejects_escape() {
        let base = Path::new("/x");
        assert!(safe_join(base, "capitulos/a.md").is_ok());
        assert!(safe_join(base, "../etc/passwd").is_err());
        assert!(safe_join(base, "/abs").is_err());
        assert!(safe_join(base, "").is_err());
    }
}
```

`src-tauri/src/storage/mod.rs`:

```rust
pub mod paths;
```

Em `lib.rs`, adicionar `mod storage;` e `mod text;`.

- [ ] **Step 2: Rodar**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: todos PASS.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src
git commit -m "feat(rust): word count, accent folding and safe book paths"
```

---

### Task 3: Documento do editor e markdown

**Files:**
- Create: `src-tauri/src/model/mod.rs`, `src-tauri/src/model/doc.rs`
- Create: `src-tauri/src/markdown/mod.rs`, `src-tauri/src/markdown/parse.rs`, `src-tauri/src/markdown/serialize.rs`
- Modify: `src-tauri/src/text/words.rs` (add `doc_words`)
- Modify: `src-tauri/src/lib.rs` (add `mod model; mod markdown;`)

**Interfaces:**
- Produces: `model::doc::{Doc, Block, Inline, ImageAttrs}` with `Doc::new(Vec<Block>)`, `Doc::default()`; `markdown::parse::parse(&str) -> Doc`; `markdown::serialize::serialize(&Doc) -> String`; `text::words::doc_words(&Doc) -> usize`; `text::words::doc_text(&Doc) -> String`.
- JSON shape (consumed by the front in Task 9): `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"…"},{"type":"hardBreak"}]},{"type":"separator"},{"type":"image","attrs":{"src":"imagens/x.png"}}]}`.

- [ ] **Step 1: Modelo do documento**

`src-tauri/src/model/doc.rs`:

```rust
use serde::{Deserialize, Serialize};

/// ProseMirror/TipTap document, restricted to the editor schema.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Doc {
    #[serde(rename = "type", default = "doc_type")]
    pub kind: String,
    #[serde(default)]
    pub content: Vec<Block>,
}

fn doc_type() -> String {
    "doc".to_string()
}

impl Doc {
    pub fn new(content: Vec<Block>) -> Self {
        Self { kind: doc_type(), content }
    }
}

impl Default for Doc {
    fn default() -> Self {
        Self::new(Vec::new())
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Block {
    Paragraph {
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        content: Vec<Inline>,
    },
    Separator,
    Image {
        attrs: ImageAttrs,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct ImageAttrs {
    /// Path relative to the book folder, e.g. `imagens/abc.png`.
    pub src: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Inline {
    Text { text: String },
    HardBreak,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_tiptap_json_and_ignores_unknown_fields() {
        let json = r#"{"type":"doc","content":[
            {"type":"paragraph","attrs":{"x":1},"content":[{"type":"text","text":"Oi","marks":[]},{"type":"hardBreak"}]},
            {"type":"paragraph"},
            {"type":"separator"},
            {"type":"image","attrs":{"src":"imagens/a.png"}}
        ]}"#;
        let doc: Doc = serde_json::from_str(json).unwrap();
        assert_eq!(doc.content.len(), 4);
        assert_eq!(doc.content[1], Block::Paragraph { content: vec![] });
        assert_eq!(doc.content[2], Block::Separator);
    }

    #[test]
    fn writes_the_shape_the_front_expects() {
        let doc = Doc::new(vec![Block::Separator]);
        assert_eq!(serde_json::to_string(&doc).unwrap(), r#"{"type":"doc","content":[{"type":"separator"}]}"#);
    }
}
```

`src-tauri/src/model/mod.rs`:

```rust
pub mod doc;
```

- [ ] **Step 2: Parser e serializador com testes**

`src-tauri/src/markdown/parse.rs`:

```rust
use crate::model::doc::{Block, Doc, ImageAttrs, Inline};

pub const SEPARATOR_LINE: &str = "***";
pub const IMAGE_PREFIX: &str = "![](../";

/// Parses the app's chapter markdown: paragraphs split by blank lines,
/// `***` separator lines, `![](../path)` image lines, `\` hard breaks.
pub fn parse(md: &str) -> Doc {
    let mut blocks = Vec::new();
    let mut lines: Vec<&str> = Vec::new();
    for line in md.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            flush(&mut lines, &mut blocks);
        } else if trimmed == SEPARATOR_LINE {
            flush(&mut lines, &mut blocks);
            blocks.push(Block::Separator);
        } else if let Some(src) = image_src(trimmed) {
            flush(&mut lines, &mut blocks);
            blocks.push(Block::Image { attrs: ImageAttrs { src } });
        } else {
            lines.push(line);
        }
    }
    flush(&mut lines, &mut blocks);
    Doc::new(blocks)
}

fn image_src(line: &str) -> Option<String> {
    let src = line.strip_prefix(IMAGE_PREFIX)?.strip_suffix(')')?;
    if src.is_empty() || src.contains(')') { None } else { Some(src.to_string()) }
}

fn flush(lines: &mut Vec<&str>, blocks: &mut Vec<Block>) {
    if lines.is_empty() {
        return;
    }
    let mut content = Vec::new();
    for (i, line) in lines.iter().enumerate() {
        if i > 0 {
            content.push(Inline::HardBreak);
        }
        let text = line.strip_suffix('\\').unwrap_or(line);
        if !text.is_empty() {
            content.push(Inline::Text { text: text.to_string() });
        }
    }
    blocks.push(Block::Paragraph { content });
    lines.clear();
}
```

`src-tauri/src/markdown/serialize.rs`:

```rust
use super::parse::{IMAGE_PREFIX, SEPARATOR_LINE};
use crate::model::doc::{Block, Doc, Inline};

/// Writes a document back to chapter markdown. Empty paragraphs are dropped.
pub fn serialize(doc: &Doc) -> String {
    let parts: Vec<String> = doc.content.iter().filter_map(block_md).collect();
    if parts.is_empty() { String::new() } else { parts.join("\n\n") + "\n" }
}

fn block_md(block: &Block) -> Option<String> {
    match block {
        Block::Paragraph { content } => {
            let mut s = String::new();
            for inline in content {
                match inline {
                    Inline::Text { text } => s.push_str(text),
                    Inline::HardBreak => s.push_str("\\\n"),
                }
            }
            let s = s.trim_end_matches("\\\n").to_string();
            if s.trim().is_empty() { None } else { Some(s) }
        }
        Block::Separator => Some(SEPARATOR_LINE.to_string()),
        Block::Image { attrs } => Some(format!("{IMAGE_PREFIX}{})", attrs.src)),
    }
}
```

`src-tauri/src/markdown/mod.rs`:

```rust
pub mod parse;
pub mod serialize;

#[cfg(test)]
mod tests {
    use super::{parse::parse, serialize::serialize};
    use crate::model::doc::{Block, Doc, ImageAttrs, Inline};

    fn p(parts: Vec<Inline>) -> Block {
        Block::Paragraph { content: parts }
    }
    fn t(s: &str) -> Inline {
        Inline::Text { text: s.to_string() }
    }

    #[test]
    fn parses_all_block_kinds() {
        let md = "Primeiro\\\nsegunda linha\n\n***\n\n![](../imagens/a.png)\n\nFim\n";
        let doc = parse(md);
        assert_eq!(doc.content, vec![
            p(vec![t("Primeiro"), Inline::HardBreak, t("segunda linha")]),
            Block::Separator,
            Block::Image { attrs: ImageAttrs { src: "imagens/a.png".into() } },
            p(vec![t("Fim")]),
        ]);
    }

    #[test]
    fn roundtrip_keeps_user_text_literal() {
        let doc = Doc::new(vec![
            p(vec![t("*não é itálico* e \\ barra")]),
            p(vec![t("  começa com espaço")]),
            Block::Separator,
            p(vec![t("a"), Inline::HardBreak, t("b")]),
        ]);
        assert_eq!(parse(&serialize(&doc)), doc);
    }

    #[test]
    fn empty_paragraphs_are_dropped() {
        let doc = Doc::new(vec![p(vec![]), p(vec![t("x")]), p(vec![t("  ")])]);
        assert_eq!(serialize(&doc), "x\n");
    }

    #[test]
    fn empty_doc_is_empty_file() {
        assert_eq!(serialize(&Doc::default()), "");
        assert_eq!(parse(""), Doc::default());
    }

    #[test]
    fn single_newline_becomes_hard_break() {
        assert_eq!(parse("a\nb").content, vec![p(vec![t("a"), Inline::HardBreak, t("b")])]);
    }
}
```

- [ ] **Step 3: Palavras e texto do documento**

Adicionar em `src-tauri/src/text/words.rs` (acima do `#[cfg(test)]`):

```rust
use crate::model::doc::{Block, Doc, Inline};

/// Plain text of a document: paragraphs joined by blank lines.
pub fn doc_text(doc: &Doc) -> String {
    let mut out = Vec::new();
    for block in &doc.content {
        if let Block::Paragraph { content } = block {
            let line: Vec<&str> = content
                .iter()
                .map(|i| match i {
                    Inline::Text { text } => text.as_str(),
                    Inline::HardBreak => "\n",
                })
                .collect();
            out.push(line.concat());
        }
    }
    out.join("\n\n")
}

pub fn doc_words(doc: &Doc) -> usize {
    count_words(&doc_text(doc))
}
```

E o teste dentro de `mod tests`:

```rust
    #[test]
    fn doc_words_ignore_separators_and_images() {
        let doc = crate::markdown::parse::parse("um dois\n\n***\n\n![](../imagens/a.png)\n\ntrês");
        assert_eq!(doc_words(&doc), 3);
    }
```

Em `lib.rs`: `mod markdown;` e `mod model;`.

- [ ] **Step 4: Rodar**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src
git commit -m "feat(rust): editor document model and chapter markdown codec"
```

---

### Task 4: Metadata e I/O de arquivos

**Files:**
- Create: `src-tauri/src/model/metadata.rs`
- Create: `src-tauri/src/storage/atomic.rs`, `src-tauri/src/storage/metadata_io.rs`, `src-tauri/src/storage/chapter_io.rs`
- Modify: `src-tauri/src/model/mod.rs`, `src-tauri/src/storage/mod.rs`

**Interfaces:**
- Consumes: `paths::{safe_join, META_FILE, CHAPTERS_DIR}`, `markdown::{parse, serialize}`, `Doc`.
- Produces:
  - `model::metadata::{Metadata, ChapterEntry, Status, Separator}`; `Metadata::new(id: String, title: &str, chapters: Vec<ChapterEntry>) -> Metadata`; `Metadata::total_words(&self) -> usize`; `ChapterEntry::new(id: String) -> ChapterEntry` (file `capitulos/<id>.md`, status rascunho).
  - `storage::atomic::write_atomic(&Path, &[u8]) -> io::Result<()>`.
  - `storage::metadata_io::{read_metadata(&Path) -> AppResult<Metadata>, write_metadata(&Path, &Metadata) -> AppResult<()>}`.
  - `storage::chapter_io::{read_chapter(&Path, &ChapterEntry) -> AppResult<Doc>, read_chapter_raw(&Path, &ChapterEntry) -> AppResult<String>, write_chapter(&Path, &ChapterEntry, &Doc) -> AppResult<()>, delete_chapter_file(&Path, &ChapterEntry) -> AppResult<()>}`.

- [ ] **Step 1: Modelo do metadata com testes**

`src-tauri/src/model/metadata.rs`:

```rust
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::storage::paths::CHAPTERS_DIR;

pub const METADATA_VERSION: u32 = 1;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Metadata {
    pub version: u32,
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub cover: Option<String>,
    #[serde(default)]
    pub updated_at: u64,
    #[serde(default)]
    pub cur: usize,
    #[serde(default)]
    pub separator: Separator,
    #[serde(default)]
    pub header: Option<String>,
    #[serde(default)]
    pub footer: Option<String>,
    #[serde(default)]
    pub chapters: Vec<ChapterEntry>,
    /// Unknown keys survive a read/write cycle.
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChapterEntry {
    pub id: String,
    pub file: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub status: Status,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub words: usize,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    #[default]
    Rascunho,
    Revisao,
    Pronto,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Separator {
    Text { text: String },
    Image { image: String },
}

impl Default for Separator {
    fn default() -> Self {
        Separator::Text { text: "* * *".to_string() }
    }
}

impl Metadata {
    pub fn new(id: String, title: &str, chapters: Vec<ChapterEntry>) -> Self {
        Self {
            version: METADATA_VERSION,
            id,
            title: title.to_string(),
            author: String::new(),
            cover: None,
            updated_at: crate::ids::now_ms(),
            cur: 0,
            separator: Separator::default(),
            header: None,
            footer: None,
            chapters,
            extra: Map::new(),
        }
    }

    pub fn total_words(&self) -> usize {
        self.chapters.iter().map(|c| c.words).sum()
    }
}

impl ChapterEntry {
    pub fn new(id: String) -> Self {
        Self {
            file: format!("{CHAPTERS_DIR}/{id}.md"),
            id,
            title: String::new(),
            status: Status::Rascunho,
            notes: String::new(),
            words: 0,
            extra: Map::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_fields_survive_roundtrip() {
        let json = r#"{"version":1,"id":"a","title":"T","futuro":{"x":1},
            "chapters":[{"id":"c","file":"capitulos/c.md","outro":true}]}"#;
        let meta: Metadata = serde_json::from_str(json).unwrap();
        let back = serde_json::to_value(&meta).unwrap();
        assert_eq!(back["futuro"]["x"], 1);
        assert_eq!(back["chapters"][0]["outro"], true);
        assert_eq!(back["separator"]["type"], "text");
        assert_eq!(back["chapters"][0]["status"], "rascunho");
    }

    #[test]
    fn separator_image_shape() {
        let s: Separator = serde_json::from_str(r#"{"type":"image","image":"imagens/separador.png"}"#).unwrap();
        assert_eq!(s, Separator::Image { image: "imagens/separador.png".into() });
    }
}
```

Em `model/mod.rs`: `pub mod metadata;`.

- [ ] **Step 2: I/O com testes**

`src-tauri/src/storage/atomic.rs`:

```rust
use std::{fs, io, path::Path};

/// Writes `path.tmp` then renames it over `path`, so a crash never leaves half a file.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".tmp");
    let tmp = path.with_file_name(name);
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_existing_file_and_leaves_no_tmp() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("a.json");
        write_atomic(&f, b"1").unwrap();
        write_atomic(&f, b"2").unwrap();
        assert_eq!(fs::read_to_string(&f).unwrap(), "2");
        assert!(!dir.path().join("a.json.tmp").exists());
    }
}
```

`src-tauri/src/storage/metadata_io.rs`:

```rust
use std::{fs, path::Path};

use super::{atomic::write_atomic, paths::META_FILE};
use crate::error::AppResult;
use crate::model::metadata::Metadata;

pub fn read_metadata(dir: &Path) -> AppResult<Metadata> {
    let raw = fs::read_to_string(dir.join(META_FILE))?;
    Ok(serde_json::from_str(&raw)?)
}

pub fn write_metadata(dir: &Path, meta: &Metadata) -> AppResult<()> {
    let json = serde_json::to_vec_pretty(meta)?;
    write_atomic(&dir.join(META_FILE), &json)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_then_read() {
        let dir = tempfile::tempdir().unwrap();
        let meta = Metadata::new("id1".into(), "Obra", vec![]);
        write_metadata(dir.path(), &meta).unwrap();
        assert_eq!(read_metadata(dir.path()).unwrap(), meta);
    }
}
```

`src-tauri/src/storage/chapter_io.rs`:

```rust
use std::{fs, io::ErrorKind, path::Path};

use super::{atomic::write_atomic, paths::safe_join};
use crate::error::AppResult;
use crate::markdown::{parse::parse, serialize::serialize};
use crate::model::{doc::Doc, metadata::ChapterEntry};

/// Raw markdown; a missing file reads as empty.
pub fn read_chapter_raw(dir: &Path, entry: &ChapterEntry) -> AppResult<String> {
    match fs::read_to_string(safe_join(dir, &entry.file)?) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.into()),
    }
}

pub fn read_chapter(dir: &Path, entry: &ChapterEntry) -> AppResult<Doc> {
    Ok(parse(&read_chapter_raw(dir, entry)?))
}

pub fn write_chapter(dir: &Path, entry: &ChapterEntry, doc: &Doc) -> AppResult<()> {
    let path = safe_join(dir, &entry.file)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    write_atomic(&path, serialize(doc).as_bytes())?;
    Ok(())
}

pub fn delete_chapter_file(dir: &Path, entry: &ChapterEntry) -> AppResult<()> {
    match fs::remove_file(safe_join(dir, &entry.file)?) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::doc::{Block, Inline};

    #[test]
    fn missing_file_reads_empty() {
        let dir = tempfile::tempdir().unwrap();
        let entry = ChapterEntry::new("c1".into());
        assert_eq!(read_chapter(dir.path(), &entry).unwrap(), Doc::default());
    }

    #[test]
    fn write_read_delete() {
        let dir = tempfile::tempdir().unwrap();
        let entry = ChapterEntry::new("c1".into());
        let doc = Doc::new(vec![Block::Paragraph { content: vec![Inline::Text { text: "Oi".into() }] }]);
        write_chapter(dir.path(), &entry, &doc).unwrap();
        assert_eq!(read_chapter(dir.path(), &entry).unwrap(), doc);
        delete_chapter_file(dir.path(), &entry).unwrap();
        delete_chapter_file(dir.path(), &entry).unwrap();
        assert!(!dir.path().join("capitulos/c1.md").exists());
    }

    #[test]
    fn refuses_escaping_file_path() {
        let dir = tempfile::tempdir().unwrap();
        let mut entry = ChapterEntry::new("c1".into());
        entry.file = "../fora.md".into();
        assert!(read_chapter(dir.path(), &entry).is_err());
    }
}
```

`src-tauri/src/storage/mod.rs`:

```rust
pub mod atomic;
pub mod chapter_io;
pub mod metadata_io;
pub mod paths;
```

- [ ] **Step 3: Rodar**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: todos PASS.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src
git commit -m "feat(rust): book metadata model with atomic metadata/chapter io"
```

---

### Task 5: Imagens

**Files:**
- Create: `src-tauri/src/storage/images.rs`
- Modify: `src-tauri/src/storage/mod.rs`

**Interfaces:**
- Consumes: `paths::{IMAGES_DIR, safe_join}`, `atomic::write_atomic`.
- Produces: `storage::images::{ALLOWED_EXTENSIONS: [&str; 4], import_cover(src: &Path, book_dir: &Path) -> AppResult<String>, import_as(src: &Path, book_dir: &Path, stem: &str) -> AppResult<String>, remove_image(book_dir: &Path, rel: &str) -> AppResult<()>}`. Retornam caminhos relativos (`imagens/capa.jpg`).

- [ ] **Step 1: Implementação com testes**

`src-tauri/src/storage/images.rs`:

```rust
use std::{fs, io::ErrorKind, path::Path};

use image::{codecs::jpeg::JpegEncoder, imageops::FilterType, ImageReader};

use super::{atomic::write_atomic, paths::{safe_join, IMAGES_DIR}};
use crate::error::{AppError, AppResult};

pub const ALLOWED_EXTENSIONS: [&str; 4] = ["png", "jpg", "jpeg", "webp"];
const COVER_W: u32 = 400;
const COVER_H: u32 = 600;
const COVER_QUALITY: u8 = 85;

fn unreadable() -> AppError {
    AppError::msg("Não foi possível ler a imagem")
}

/// Crops `src` to 400×600 (cover fit) and saves it as `imagens/capa.jpg`.
pub fn import_cover(src: &Path, book_dir: &Path) -> AppResult<String> {
    let img = ImageReader::open(src)?.with_guessed_format()?.decode().map_err(|_| unreadable())?;
    let fitted = img.resize_to_fill(COVER_W, COVER_H, FilterType::Lanczos3).to_rgb8();
    let mut buf = Vec::new();
    JpegEncoder::new_with_quality(&mut buf, COVER_QUALITY)
        .encode_image(&fitted)
        .map_err(|_| AppError::msg("Não foi possível salvar a capa"))?;
    let rel = format!("{IMAGES_DIR}/capa.jpg");
    fs::create_dir_all(book_dir.join(IMAGES_DIR))?;
    write_atomic(&book_dir.join(&rel), &buf)?;
    Ok(rel)
}

/// Copies `src` unchanged to `imagens/<stem>.<ext>` after checking it decodes.
pub fn import_as(src: &Path, book_dir: &Path, stem: &str) -> AppResult<String> {
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .filter(|e| ALLOWED_EXTENSIONS.contains(&e.as_str()))
        .ok_or_else(|| AppError::msg("Escolha um arquivo de imagem"))?;
    ImageReader::open(src)?.with_guessed_format()?.into_dimensions().map_err(|_| unreadable())?;
    let rel = format!("{IMAGES_DIR}/{stem}.{ext}");
    fs::create_dir_all(book_dir.join(IMAGES_DIR))?;
    fs::copy(src, book_dir.join(&rel))?;
    Ok(rel)
}

/// Deletes an image referenced by metadata; a missing file is fine.
pub fn remove_image(book_dir: &Path, rel: &str) -> AppResult<()> {
    match fs::remove_file(safe_join(book_dir, rel)?) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png(dir: &Path, w: u32, h: u32) -> std::path::PathBuf {
        let path = dir.join("in.png");
        image::RgbImage::from_pixel(w, h, image::Rgb([200, 10, 10])).save(&path).unwrap();
        path
    }

    #[test]
    fn cover_is_400x600_jpeg() {
        let tmp = tempfile::tempdir().unwrap();
        let src = png(tmp.path(), 1000, 300);
        let rel = import_cover(&src, tmp.path()).unwrap();
        assert_eq!(rel, "imagens/capa.jpg");
        let out = image::open(tmp.path().join(&rel)).unwrap();
        assert_eq!((out.width(), out.height()), (400, 600));
    }

    #[test]
    fn import_as_keeps_extension() {
        let tmp = tempfile::tempdir().unwrap();
        let src = png(tmp.path(), 10, 10);
        assert_eq!(import_as(&src, tmp.path(), "cabecalho").unwrap(), "imagens/cabecalho.png");
    }

    #[test]
    fn rejects_non_image() {
        let tmp = tempfile::tempdir().unwrap();
        let txt = tmp.path().join("a.txt");
        fs::write(&txt, "x").unwrap();
        assert!(import_as(&txt, tmp.path(), "x").is_err());
        let fake = tmp.path().join("b.png");
        fs::write(&fake, "not an image").unwrap();
        assert!(import_cover(&fake, tmp.path()).is_err());
    }

    #[test]
    fn remove_missing_is_ok() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(remove_image(tmp.path(), "imagens/nada.png").is_ok());
    }
}
```

Em `storage/mod.rs`: `pub mod images;`. Dev-dependency: os testes usam `image` com `png` (já habilitado).

- [ ] **Step 2: Rodar**

Run: `cargo test --manifest-path src-tauri/Cargo.toml images`
Expected: 4 PASS.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src
git commit -m "feat(rust): cover cropping and book image import"
```

---

### Task 6: Views, exemplos e operações de biblioteca

**Files:**
- Create: `src-tauri/src/model/views.rs`, `src-tauri/src/samples.rs`
- Create: `src-tauri/src/ops/mod.rs`, `src-tauri/src/ops/library.rs`
- Modify: `src-tauri/src/model/mod.rs`, `src-tauri/src/lib.rs` (add `mod ops; mod samples;`)

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces:
  - `model::views::{BookSummary, BookMeta, ChapterMeta, SearchHit, LibraryListing}`, all `#[serde(rename_all = "camelCase")]`:
    - `BookSummary { id, title, author, cover: Option<String> /* absolute */, chapters: usize, words: usize, ready: usize, updated_at: u64 }`, `BookSummary::from_meta(&Path, &Metadata)`.
    - `ChapterMeta { id, title, status: Status, notes, words }`, `From<&ChapterEntry>`.
    - `BookMeta { id, title, author, cur, updated_at, dir: String, cover, header, footer: Option<String>, separator: Separator, chapters: Vec<ChapterMeta> }`, `BookMeta::from_meta(&Path, &Metadata)`.
    - `SearchHit { index: usize, chapter_id: String }`.
    - `LibraryListing { books: Vec<BookSummary>, warnings: Vec<String> }`.
  - `ops::library::{Scan { books: Vec<(PathBuf, Metadata)>, warnings: Vec<String> }, scan(&Path) -> AppResult<Scan>, create_book(&Path, &str) -> AppResult<(PathBuf, Metadata)>, delete_book(&Path) -> AppResult<()>, write_samples(&Path) -> AppResult<()>}`.

- [ ] **Step 1: Views**

`src-tauri/src/model/views.rs`:

```rust
use std::path::Path;

use serde::Serialize;

use super::metadata::{ChapterEntry, Metadata, Separator, Status};

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BookSummary {
    pub id: String,
    pub title: String,
    pub author: String,
    /// Absolute path, ready for `convertFileSrc`.
    pub cover: Option<String>,
    pub chapters: usize,
    pub words: usize,
    pub ready: usize,
    pub updated_at: u64,
}

impl BookSummary {
    pub fn from_meta(dir: &Path, meta: &Metadata) -> Self {
        Self {
            id: meta.id.clone(),
            title: meta.title.clone(),
            author: meta.author.clone(),
            cover: meta.cover.as_ref().map(|c| dir.join(c).to_string_lossy().into_owned()),
            chapters: meta.chapters.len(),
            words: meta.total_words(),
            ready: meta.chapters.iter().filter(|c| c.status == Status::Pronto).count(),
            updated_at: meta.updated_at,
        }
    }
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChapterMeta {
    pub id: String,
    pub title: String,
    pub status: Status,
    pub notes: String,
    pub words: usize,
}

impl From<&ChapterEntry> for ChapterMeta {
    fn from(c: &ChapterEntry) -> Self {
        Self { id: c.id.clone(), title: c.title.clone(), status: c.status, notes: c.notes.clone(), words: c.words }
    }
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BookMeta {
    pub id: String,
    pub title: String,
    pub author: String,
    pub cur: usize,
    pub updated_at: u64,
    /// Absolute book folder; image fields below are relative to it.
    pub dir: String,
    pub cover: Option<String>,
    pub header: Option<String>,
    pub footer: Option<String>,
    pub separator: Separator,
    pub chapters: Vec<ChapterMeta>,
}

impl BookMeta {
    pub fn from_meta(dir: &Path, meta: &Metadata) -> Self {
        Self {
            id: meta.id.clone(),
            title: meta.title.clone(),
            author: meta.author.clone(),
            cur: meta.cur,
            updated_at: meta.updated_at,
            dir: dir.to_string_lossy().into_owned(),
            cover: meta.cover.clone(),
            header: meta.header.clone(),
            footer: meta.footer.clone(),
            separator: meta.separator.clone(),
            chapters: meta.chapters.iter().map(ChapterMeta::from).collect(),
        }
    }
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub index: usize,
    pub chapter_id: String,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct LibraryListing {
    pub books: Vec<BookSummary>,
    pub warnings: Vec<String>,
}
```

Em `model/mod.rs`: `pub mod views;`.

- [ ] **Step 2: Dados de exemplo**

`src-tauri/src/samples.rs`:

```rust
use crate::model::metadata::Status;

pub struct SampleChapter {
    pub title: &'static str,
    pub status: Status,
    /// Chapter markdown.
    pub body: &'static str,
    pub notes: &'static str,
}

pub struct SampleBook {
    pub title: &'static str,
    pub cur: usize,
    /// How long ago it was edited, in hours.
    pub age_hours: u64,
    pub chapters: Vec<SampleChapter>,
}

pub fn sample_books() -> Vec<SampleBook> {
    vec![
        SampleBook {
            title: "A Torre das Mil Luas",
            cur: 2,
            age_hours: 2,
            chapters: vec![
                SampleChapter {
                    title: "O sino que não tocava",
                    status: Status::Pronto,
                    body: "Na cidade de Vael, todo mundo sabia que o sino da torre norte não tocava havia cem anos.\n\nPor isso, quando ele soou à meia-noite — uma única vez, grave e longa —, Ilen Marr foi a única pessoa da rua que não saiu de casa para olhar. Ela já estava de pé, com a lanterna acesa e a bolsa de ferramentas no ombro, como se tivesse esperado por aquele som a vida inteira.\n\n— Então é hoje — murmurou, e apagou a vela da mesa.\n",
                    notes: "Revelar quem tocou o sino só no capítulo 5.\n\nIlen já sabia do sino — plantar a pista da bolsa de ferramentas.",
                },
                SampleChapter {
                    title: "A aprendiz de cartógrafo",
                    status: Status::Revisao,
                    body: "O mapa de Ilen tinha um erro, e o erro estava se mexendo.\n\nDurante três semanas ela tinha marcado com tinta vermelha a mesma viela atrás do mercado de sal. Toda manhã, a viela estava dois passos mais perto da torre.\n\n***\n\nMestre Odran dizia que mapas não mentem. Ilen começava a desconfiar que mapas apenas escolhem a quem contar a verdade.\n",
                    notes: "",
                },
                SampleChapter {
                    title: "Mapas que mentem",
                    status: Status::Rascunho,
                    body: "A torre norte não tinha porta. Tinha, no lugar dela, uma parede lisa onde alguém havia desenhado a giz o contorno de uma.\n",
                    notes: "Odran aparece no fim? Decidir.",
                },
            ],
        },
        SampleBook {
            title: "Herdeira das Cinzas",
            cur: 1,
            age_hours: 27,
            chapters: vec![
                SampleChapter {
                    title: "A coroação que não houve",
                    status: Status::Revisao,
                    body: "A coroa chegou ao salão numa caixa de madeira comum, carregada por um menino de recados que não sabia o que levava.\n\nQuando Saera abriu a tampa, encontrou apenas cinza — fina, morna, ainda cheirando a fumaça.\n",
                    notes: "",
                },
                SampleChapter {
                    title: "Sal e ferro",
                    status: Status::Rascunho,
                    body: "O conselho levou três dias para decidir que a culpa era dela.\n",
                    notes: "",
                },
            ],
        },
        SampleBook {
            title: "Crônicas do Quinto Andar",
            cur: 0,
            age_hours: 144,
            chapters: vec![SampleChapter {
                title: "O vizinho do 502",
                status: Status::Rascunho,
                body: "O vizinho do 502 recebia cartas endereçadas a pessoas que ainda não tinham nascido.\n",
                notes: "",
            }],
        },
    ]
}
```

- [ ] **Step 3: Operações de biblioteca com testes**

`src-tauri/src/ops/library.rs`:

```rust
use std::{fs, path::{Path, PathBuf}};

use crate::error::AppResult;
use crate::ids::{new_id, now_ms};
use crate::markdown::parse::parse;
use crate::model::{doc::Doc, metadata::{ChapterEntry, Metadata}};
use crate::samples::sample_books;
use crate::storage::{
    chapter_io::write_chapter,
    metadata_io::{read_metadata, write_metadata},
    paths::{slugify, unique_dir, CHAPTERS_DIR, IMAGES_DIR},
};
use crate::text::words::doc_words;

pub struct Scan {
    pub books: Vec<(PathBuf, Metadata)>,
    pub warnings: Vec<String>,
}

/// Reads every `<root>/<folder>/metadata.json`. Unreadable folders become warnings.
pub fn scan(root: &Path) -> AppResult<Scan> {
    let mut books = Vec::new();
    let mut skipped = 0;
    for entry in fs::read_dir(root)? {
        let path = entry?.path();
        if !path.is_dir() {
            continue;
        }
        match read_metadata(&path) {
            Ok(meta) => books.push((path, meta)),
            Err(_) => skipped += 1,
        }
    }
    let warnings = match skipped {
        0 => vec![],
        1 => vec!["1 pasta ignorada: metadata ausente ou inválido".to_string()],
        n => vec![format!("{n} pastas ignoradas: metadata ausente ou inválido")],
    };
    Ok(Scan { books, warnings })
}

/// Creates the folder tree, an empty first chapter and the metadata.
pub fn create_book(root: &Path, title: &str) -> AppResult<(PathBuf, Metadata)> {
    let dir = unique_dir(root, &slugify(title));
    fs::create_dir_all(dir.join(IMAGES_DIR))?;
    fs::create_dir_all(dir.join(CHAPTERS_DIR))?;
    let chapter = ChapterEntry::new(new_id());
    write_chapter(&dir, &chapter, &Doc::default())?;
    let meta = Metadata::new(new_id(), title, vec![chapter]);
    write_metadata(&dir, &meta)?;
    Ok((dir, meta))
}

/// Removes the whole book folder. Permanent.
pub fn delete_book(dir: &Path) -> AppResult<()> {
    fs::remove_dir_all(dir)?;
    Ok(())
}

/// Writes the sample books into `root`.
pub fn write_samples(root: &Path) -> AppResult<()> {
    for sample in sample_books() {
        let dir = unique_dir(root, &slugify(sample.title));
        fs::create_dir_all(dir.join(IMAGES_DIR))?;
        fs::create_dir_all(dir.join(CHAPTERS_DIR))?;
        let mut chapters = Vec::new();
        for c in &sample.chapters {
            let mut entry = ChapterEntry::new(new_id());
            let doc = parse(c.body);
            entry.title = c.title.to_string();
            entry.status = c.status;
            entry.notes = c.notes.to_string();
            entry.words = doc_words(&doc);
            write_chapter(&dir, &entry, &doc)?;
            chapters.push(entry);
        }
        let mut meta = Metadata::new(new_id(), sample.title, chapters);
        meta.cur = sample.cur;
        meta.updated_at = now_ms().saturating_sub(sample.age_hours * 3_600_000);
        write_metadata(&dir, &meta)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_then_scan() {
        let root = tempfile::tempdir().unwrap();
        let (dir, meta) = create_book(root.path(), "Meu Livro").unwrap();
        assert!(dir.ends_with("meu-livro"));
        assert!(dir.join("imagens").is_dir());
        assert!(dir.join(&meta.chapters[0].file).is_file());
        let scan = scan(root.path()).unwrap();
        assert_eq!(scan.books.len(), 1);
        assert!(scan.warnings.is_empty());
    }

    #[test]
    fn same_title_twice_gets_two_folders() {
        let root = tempfile::tempdir().unwrap();
        let (a, _) = create_book(root.path(), "X").unwrap();
        let (b, _) = create_book(root.path(), "X").unwrap();
        assert_ne!(a, b);
    }

    #[test]
    fn broken_folders_become_warnings() {
        let root = tempfile::tempdir().unwrap();
        create_book(root.path(), "Boa").unwrap();
        fs::create_dir(root.path().join("sem-meta")).unwrap();
        let bad = root.path().join("quebrada");
        fs::create_dir(&bad).unwrap();
        fs::write(bad.join("metadata.json"), "{ nope").unwrap();
        fs::write(root.path().join("solto.txt"), "x").unwrap();
        let scan = scan(root.path()).unwrap();
        assert_eq!(scan.books.len(), 1);
        assert_eq!(scan.warnings, vec!["2 pastas ignoradas: metadata ausente ou inválido"]);
    }

    #[test]
    fn samples_have_word_counts_and_delete_works() {
        let root = tempfile::tempdir().unwrap();
        write_samples(root.path()).unwrap();
        let scan = scan(root.path()).unwrap();
        assert_eq!(scan.books.len(), 3);
        assert!(scan.books.iter().all(|(_, m)| m.total_words() > 0));
        delete_book(&scan.books[0].0).unwrap();
        assert_eq!(super::scan(root.path()).unwrap().books.len(), 2);
    }
}
```

`src-tauri/src/ops/mod.rs`:

```rust
pub mod library;
```

Em `lib.rs`: `mod ops;` e `mod samples;`.

- [ ] **Step 4: Rodar**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src
git commit -m "feat(rust): library scan, book creation/deletion and samples"
```

---

### Task 7: Operações de obra e capítulo

**Files:**
- Create: `src-tauri/src/model/patches.rs`
- Create: `src-tauri/src/ops/book.rs`, `src-tauri/src/ops/chapter.rs`
- Modify: `src-tauri/src/model/mod.rs`, `src-tauri/src/ops/mod.rs`

**Interfaces:**
- Consumes: Tasks 2–6.
- Produces:
  - `model::patches::{BookPatch { title, author: Option<String>, cur: Option<usize>, separator_text: Option<String> }, ChapterPatch { title, notes: Option<String>, status: Option<Status> }, ImageSlot { Cover, Header, Footer, Separator }}` (Deserialize, camelCase / lowercase).
  - `ops::book::{update(&Path, &mut Metadata, BookPatch) -> AppResult<()>, set_image(&Path, &mut Metadata, ImageSlot, &Path) -> AppResult<()>, clear_image(&Path, &mut Metadata, ImageSlot) -> AppResult<()>, insert_image(&Path, &Path) -> AppResult<String>}`.
  - `ops::chapter::{load, save, update, insert, split, move_to, delete, search, markdown}` with signatures shown below. Every mutating function writes `metadata.json` and bumps `updated_at` (except `cur`-only changes).

- [ ] **Step 1: Patches**

`src-tauri/src/model/patches.rs`:

```rust
use serde::Deserialize;

use super::metadata::Status;

#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct BookPatch {
    pub title: Option<String>,
    pub author: Option<String>,
    pub cur: Option<usize>,
    pub separator_text: Option<String>,
}

#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChapterPatch {
    pub title: Option<String>,
    pub notes: Option<String>,
    pub status: Option<Status>,
}

#[derive(Deserialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ImageSlot {
    Cover,
    Header,
    Footer,
    Separator,
}
```

Em `model/mod.rs`: `pub mod patches;`.

- [ ] **Step 2: `ops/book.rs` com testes**

```rust
use std::path::Path;

use crate::error::AppResult;
use crate::ids::{new_id, now_ms};
use crate::model::{metadata::{Metadata, Separator}, patches::{BookPatch, ImageSlot}};
use crate::storage::{images::{import_as, import_cover, remove_image}, metadata_io::write_metadata};

/// Applies a patch. Only a `cur` change leaves `updated_at` alone.
pub fn update(dir: &Path, meta: &mut Metadata, patch: BookPatch) -> AppResult<()> {
    let mut touched = false;
    if let Some(title) = patch.title {
        meta.title = title;
        touched = true;
    }
    if let Some(author) = patch.author {
        meta.author = author;
        touched = true;
    }
    if let Some(text) = patch.separator_text {
        if let Separator::Image { image } = &meta.separator {
            remove_image(dir, image)?;
        }
        meta.separator = Separator::Text { text };
        touched = true;
    }
    if let Some(cur) = patch.cur {
        meta.cur = cur.min(meta.chapters.len().saturating_sub(1));
    }
    if touched {
        meta.updated_at = now_ms();
    }
    write_metadata(dir, meta)
}

fn current(meta: &Metadata, slot: ImageSlot) -> Option<String> {
    match slot {
        ImageSlot::Cover => meta.cover.clone(),
        ImageSlot::Header => meta.header.clone(),
        ImageSlot::Footer => meta.footer.clone(),
        ImageSlot::Separator => match &meta.separator {
            Separator::Image { image } => Some(image.clone()),
            Separator::Text { .. } => None,
        },
    }
}

fn assign(meta: &mut Metadata, slot: ImageSlot, rel: Option<String>) {
    match slot {
        ImageSlot::Cover => meta.cover = rel,
        ImageSlot::Header => meta.header = rel,
        ImageSlot::Footer => meta.footer = rel,
        ImageSlot::Separator => {
            meta.separator = match rel {
                Some(image) => Separator::Image { image },
                None => Separator::default(),
            }
        }
    }
}

/// Imports `src` into the slot, replacing (and deleting) the previous file.
pub fn set_image(dir: &Path, meta: &mut Metadata, slot: ImageSlot, src: &Path) -> AppResult<()> {
    let old = current(meta, slot);
    let rel = match slot {
        ImageSlot::Cover => import_cover(src, dir)?,
        ImageSlot::Header => import_as(src, dir, "cabecalho")?,
        ImageSlot::Footer => import_as(src, dir, "rodape")?,
        ImageSlot::Separator => import_as(src, dir, "separador")?,
    };
    if let Some(old) = old.filter(|o| *o != rel) {
        remove_image(dir, &old)?;
    }
    assign(meta, slot, Some(rel));
    meta.updated_at = now_ms();
    write_metadata(dir, meta)
}

pub fn clear_image(dir: &Path, meta: &mut Metadata, slot: ImageSlot) -> AppResult<()> {
    if let Some(old) = current(meta, slot) {
        remove_image(dir, &old)?;
    }
    assign(meta, slot, None);
    meta.updated_at = now_ms();
    write_metadata(dir, meta)
}

/// Copies an image to be referenced from a chapter; returns its relative path.
pub fn insert_image(dir: &Path, src: &Path) -> AppResult<String> {
    import_as(src, dir, &new_id())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ops::library::create_book;

    fn png(dir: &Path) -> std::path::PathBuf {
        let p = dir.join("src.png");
        image::RgbImage::from_pixel(20, 20, image::Rgb([1, 2, 3])).save(&p).unwrap();
        p
    }

    #[test]
    fn separator_switches_between_image_and_text() {
        let root = tempfile::tempdir().unwrap();
        let (dir, mut meta) = create_book(root.path(), "Obra").unwrap();
        let src = png(root.path());
        set_image(&dir, &mut meta, ImageSlot::Separator, &src).unwrap();
        assert_eq!(meta.separator, Separator::Image { image: "imagens/separador.png".into() });
        update(&dir, &mut meta, BookPatch { separator_text: Some("~".into()), ..Default::default() }).unwrap();
        assert_eq!(meta.separator, Separator::Text { text: "~".into() });
        assert!(!dir.join("imagens/separador.png").exists());
    }

    #[test]
    fn clear_header_deletes_file() {
        let root = tempfile::tempdir().unwrap();
        let (dir, mut meta) = create_book(root.path(), "Obra").unwrap();
        set_image(&dir, &mut meta, ImageSlot::Header, &png(root.path())).unwrap();
        assert!(dir.join("imagens/cabecalho.png").exists());
        clear_image(&dir, &mut meta, ImageSlot::Header).unwrap();
        assert_eq!(meta.header, None);
        assert!(!dir.join("imagens/cabecalho.png").exists());
    }

    #[test]
    fn cur_is_clamped_and_not_a_touch() {
        let root = tempfile::tempdir().unwrap();
        let (dir, mut meta) = create_book(root.path(), "Obra").unwrap();
        meta.updated_at = 5;
        update(&dir, &mut meta, BookPatch { cur: Some(9), ..Default::default() }).unwrap();
        assert_eq!((meta.cur, meta.updated_at), (0, 5));
    }
}
```

- [ ] **Step 3: `ops/chapter.rs` com testes**

```rust
use std::path::Path;

use crate::error::{AppError, AppResult};
use crate::ids::{new_id, now_ms};
use crate::model::{
    doc::Doc,
    metadata::{ChapterEntry, Metadata},
    patches::ChapterPatch,
    views::SearchHit,
};
use crate::storage::{
    chapter_io::{delete_chapter_file, read_chapter, read_chapter_raw, write_chapter},
    metadata_io::write_metadata,
};
use crate::text::{normalize::fold, words::{doc_text, doc_words}};

fn index_of(meta: &Metadata, chapter_id: &str) -> AppResult<usize> {
    meta.chapters
        .iter()
        .position(|c| c.id == chapter_id)
        .ok_or_else(|| AppError::msg("Capítulo não encontrado"))
}

fn touch_and_write(dir: &Path, meta: &mut Metadata) -> AppResult<()> {
    meta.updated_at = now_ms();
    write_metadata(dir, meta)
}

pub fn load(dir: &Path, meta: &Metadata, chapter_id: &str) -> AppResult<Doc> {
    read_chapter(dir, &meta.chapters[index_of(meta, chapter_id)?])
}

/// Writes the chapter file and refreshes its word count.
pub fn save(dir: &Path, meta: &mut Metadata, chapter_id: &str, doc: &Doc) -> AppResult<ChapterEntry> {
    let i = index_of(meta, chapter_id)?;
    write_chapter(dir, &meta.chapters[i], doc)?;
    meta.chapters[i].words = doc_words(doc);
    touch_and_write(dir, meta)?;
    Ok(meta.chapters[i].clone())
}

pub fn update(dir: &Path, meta: &mut Metadata, chapter_id: &str, patch: ChapterPatch) -> AppResult<ChapterEntry> {
    let i = index_of(meta, chapter_id)?;
    let c = &mut meta.chapters[i];
    if let Some(t) = patch.title { c.title = t; }
    if let Some(n) = patch.notes { c.notes = n; }
    if let Some(s) = patch.status { c.status = s; }
    touch_and_write(dir, meta)?;
    Ok(meta.chapters[i].clone())
}

fn insert_entry(dir: &Path, meta: &mut Metadata, at: usize, doc: &Doc) -> AppResult<()> {
    let mut entry = ChapterEntry::new(new_id());
    entry.words = doc_words(doc);
    write_chapter(dir, &entry, doc)?;
    let at = at.min(meta.chapters.len());
    meta.chapters.insert(at, entry);
    meta.cur = at;
    Ok(())
}

/// Empty chapter at `at`; it becomes the current one.
pub fn insert(dir: &Path, meta: &mut Metadata, at: usize) -> AppResult<()> {
    insert_entry(dir, meta, at, &Doc::default())?;
    touch_and_write(dir, meta)
}

/// Enter ×3: `before` stays in the chapter, `after` opens a new one right below.
pub fn split(dir: &Path, meta: &mut Metadata, chapter_id: &str, before: &Doc, after: &Doc) -> AppResult<()> {
    let i = index_of(meta, chapter_id)?;
    write_chapter(dir, &meta.chapters[i], before)?;
    meta.chapters[i].words = doc_words(before);
    insert_entry(dir, meta, i + 1, after)?;
    touch_and_write(dir, meta)
}

/// Moves chapter `from` to `to`, keeping `cur` on the same chapter.
pub fn move_to(dir: &Path, meta: &mut Metadata, from: usize, to: usize) -> AppResult<()> {
    let n = meta.chapters.len();
    if from >= n || to >= n {
        return Err(AppError::msg("Posição inválida"));
    }
    let current_id = meta.chapters.get(meta.cur).map(|c| c.id.clone());
    let entry = meta.chapters.remove(from);
    meta.chapters.insert(to, entry);
    if let Some(id) = current_id {
        meta.cur = index_of(meta, &id)?;
    }
    touch_and_write(dir, meta)
}

pub fn delete(dir: &Path, meta: &mut Metadata, chapter_id: &str) -> AppResult<()> {
    if meta.chapters.len() == 1 {
        return Err(AppError::msg("A obra precisa de pelo menos um capítulo"));
    }
    let i = index_of(meta, chapter_id)?;
    let entry = meta.chapters.remove(i);
    delete_chapter_file(dir, &entry)?;
    meta.cur = meta.cur.min(meta.chapters.len() - 1);
    touch_and_write(dir, meta)
}

/// Accent/case-insensitive search in titles, then bodies, one file at a time.
pub fn search(dir: &Path, meta: &Metadata, query: &str) -> AppResult<Vec<SearchHit>> {
    let q = fold(query.trim());
    if q.is_empty() {
        return Ok(vec![]);
    }
    let mut hits = Vec::new();
    for (index, c) in meta.chapters.iter().enumerate() {
        let number = format!("{:02}", index + 1);
        let found = fold(&c.title).contains(&q)
            || number.starts_with(&q)
            || fold(&doc_text(&read_chapter(dir, c)?)).contains(&q);
        if found {
            hits.push(SearchHit { index, chapter_id: c.id.clone() });
        }
    }
    Ok(hits)
}

/// "Capítulo N — título" plus the raw markdown, for the clipboard.
pub fn markdown(dir: &Path, meta: &Metadata, chapter_id: &str) -> AppResult<String> {
    let i = index_of(meta, chapter_id)?;
    let c = &meta.chapters[i];
    let head = if c.title.is_empty() { format!("Capítulo {}", i + 1) } else { format!("Capítulo {} — {}", i + 1, c.title) };
    Ok(format!("{head}\n\n{}", read_chapter_raw(dir, c)?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::markdown::parse::parse;
    use crate::ops::library::create_book;
    use crate::storage::metadata_io::read_metadata;

    fn setup() -> (tempfile::TempDir, std::path::PathBuf, Metadata) {
        let root = tempfile::tempdir().unwrap();
        let (dir, meta) = create_book(root.path(), "Obra").unwrap();
        (root, dir, meta)
    }

    #[test]
    fn save_updates_words_and_persists() {
        let (_r, dir, mut meta) = setup();
        let id = meta.chapters[0].id.clone();
        save(&dir, &mut meta, &id, &parse("um dois três")).unwrap();
        assert_eq!(read_metadata(&dir).unwrap().chapters[0].words, 3);
        assert_eq!(load(&dir, &meta, &id).unwrap(), parse("um dois três"));
    }

    #[test]
    fn split_moves_after_text_to_new_chapter() {
        let (_r, dir, mut meta) = setup();
        let id = meta.chapters[0].id.clone();
        split(&dir, &mut meta, &id, &parse("antes"), &parse("depois do cursor")).unwrap();
        assert_eq!(meta.chapters.len(), 2);
        assert_eq!(meta.cur, 1);
        assert_eq!(load(&dir, &meta, &id).unwrap(), parse("antes"));
        let new_id = meta.chapters[1].id.clone();
        assert_eq!(load(&dir, &meta, &new_id).unwrap(), parse("depois do cursor"));
        assert_eq!(meta.chapters[1].words, 3);
    }

    #[test]
    fn move_keeps_cur_on_same_chapter() {
        let (_r, dir, mut meta) = setup();
        insert(&dir, &mut meta, 1).unwrap();
        insert(&dir, &mut meta, 2).unwrap();
        let current = meta.chapters[2].id.clone();
        move_to(&dir, &mut meta, 2, 0).unwrap();
        assert_eq!(meta.chapters[meta.cur].id, current);
        assert_eq!(meta.cur, 0);
    }

    #[test]
    fn delete_refuses_last_and_removes_file() {
        let (_r, dir, mut meta) = setup();
        let only = meta.chapters[0].id.clone();
        assert!(delete(&dir, &mut meta, &only).is_err());
        insert(&dir, &mut meta, 1).unwrap();
        let second = meta.chapters[1].clone();
        delete(&dir, &mut meta, &second.id).unwrap();
        assert!(!dir.join(&second.file).exists());
        assert_eq!(meta.cur, 0);
    }

    #[test]
    fn search_ignores_accents_and_matches_numbers() {
        let (_r, dir, mut meta) = setup();
        let id = meta.chapters[0].id.clone();
        save(&dir, &mut meta, &id, &parse("O coração bate")).unwrap();
        insert(&dir, &mut meta, 1).unwrap();
        assert_eq!(search(&dir, &meta, "CORACAO").unwrap().len(), 1);
        assert_eq!(search(&dir, &meta, "02").unwrap()[0].index, 1);
        assert!(search(&dir, &meta, "   ").unwrap().is_empty());
    }

    #[test]
    fn markdown_has_heading() {
        let (_r, dir, mut meta) = setup();
        let id = meta.chapters[0].id.clone();
        update(&dir, &mut meta, &id, ChapterPatch { title: Some("Início".into()), ..Default::default() }).unwrap();
        save(&dir, &mut meta, &id, &parse("Texto")).unwrap();
        assert_eq!(markdown(&dir, &meta, &id).unwrap(), "Capítulo 1 — Início\n\nTexto\n");
    }
}
```

`src-tauri/src/ops/mod.rs`:

```rust
pub mod book;
pub mod chapter;
pub mod library;
```

- [ ] **Step 4: Rodar**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src
git commit -m "feat(rust): book settings, image slots and chapter operations"
```

---

### Task 8: Estado gerenciado, preferências e comandos Tauri

**Files:**
- Create: `src-tauri/src/state.rs`, `src-tauri/src/model/prefs.rs`
- Create: `src-tauri/src/commands/mod.rs`, `commands/library.rs`, `commands/book.rs`, `commands/chapter.rs`, `commands/prefs.rs`, `commands/stats.rs`, `commands/dialog.rs`
- Modify: `src-tauri/src/lib.rs`, `src-tauri/src/model/mod.rs`

**Interfaces:**
- Consumes: Tasks 1–7.
- Produces (IPC; nomes de argumentos em camelCase no JS):
  - `library_list() -> LibraryListing`, `library_create(title) -> BookSummary`, `library_rename(id, title) -> BookSummary`, `library_delete(id) -> ()`, `library_restore_samples() -> LibraryListing`
  - `book_open(id) -> BookMeta`, `book_update(id, patch: BookPatch) -> BookMeta`, `book_pick_image(id, slot) -> Option<BookMeta>`, `book_clear_image(id, slot) -> BookMeta`, `book_insert_image(id) -> Option<String>`
  - `chapter_load(bookId, chapterId) -> Doc`, `chapter_save(bookId, chapterId, doc) -> ChapterMeta`, `chapter_update(bookId, chapterId, patch) -> ChapterMeta`, `chapter_insert(bookId, at) -> BookMeta`, `chapter_split(bookId, chapterId, before, after) -> BookMeta`, `chapter_move(bookId, from, to) -> BookMeta`, `chapter_delete(bookId, chapterId) -> BookMeta`, `chapter_search(bookId, q) -> Vec<SearchHit>`, `chapter_markdown(bookId, chapterId) -> String`
  - `prefs_get() -> Prefs`, `prefs_set(patch: PrefsPatch) -> Prefs`, `stats_today() -> { today: usize }`

- [ ] **Step 1: Preferências**

`src-tauri/src/model/prefs.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Prefs {
    pub theme: String,
    pub goal: u32,
    pub width: u8,
    pub font: u8,
}

impl Default for Prefs {
    fn default() -> Self {
        Self { theme: "light".into(), goal: 2000, width: 1, font: 1 }
    }
}

#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PrefsPatch {
    pub theme: Option<String>,
    pub goal: Option<u32>,
    pub width: Option<u8>,
    pub font: Option<u8>,
}

impl Prefs {
    pub fn apply(mut self, p: PrefsPatch) -> Self {
        if let Some(v) = p.theme { self.theme = v; }
        if let Some(v) = p.goal { self.goal = v; }
        if let Some(v) = p.width { self.width = v.min(2); }
        if let Some(v) = p.font { self.font = v.min(2); }
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patch_merges_and_clamps() {
        let p = Prefs::default().apply(PrefsPatch { width: Some(9), goal: Some(5000), ..Default::default() });
        assert_eq!((p.width, p.goal, p.theme.as_str()), (2, 5000, "light"));
    }
}
```

Em `model/mod.rs`: `pub mod prefs;`.

- [ ] **Step 2: Estado com testes**

`src-tauri/src/state.rs`:

```rust
use std::{collections::HashMap, path::{Path, PathBuf}, sync::{Mutex, MutexGuard}};

use crate::error::{AppError, AppResult};
use crate::model::metadata::Metadata;
use crate::storage::metadata_io::read_metadata;

/// Runtime state managed by Tauri. Keeps only one book's metadata in memory.
pub struct Library {
    pub root: PathBuf,
    dirs: HashMap<String, PathBuf>,
    open: Option<(PathBuf, Metadata)>,
    totals: HashMap<String, usize>,
    session_base: Option<usize>,
}

pub type SharedLibrary = Mutex<Library>;

pub fn lock(state: &SharedLibrary) -> AppResult<MutexGuard<'_, Library>> {
    state.lock().map_err(|_| AppError::msg("Estado interno indisponível"))
}

impl Library {
    pub fn new(root: PathBuf) -> Self {
        Self { root, dirs: HashMap::new(), open: None, totals: HashMap::new(), session_base: None }
    }

    /// Records a book seen on disk; the first full scan fixes the daily-goal baseline.
    pub fn register(&mut self, dir: &Path, meta: &Metadata) {
        self.dirs.insert(meta.id.clone(), dir.to_path_buf());
        self.totals.insert(meta.id.clone(), meta.total_words());
    }

    pub fn start_session_if_needed(&mut self) {
        if self.session_base.is_none() {
            self.session_base = Some(self.totals.values().sum());
        }
    }

    pub fn forget(&mut self, id: &str) -> Option<PathBuf> {
        self.totals.remove(id);
        if self.open.as_ref().is_some_and(|(_, m)| m.id == id) {
            self.open = None;
        }
        self.dirs.remove(id)
    }

    pub fn dir_of(&self, id: &str) -> AppResult<PathBuf> {
        self.dirs.get(id).cloned().ok_or_else(|| AppError::msg("Obra não encontrada"))
    }

    /// Runs `f` on the book's cached metadata (loading it if needed).
    /// On error the cache is dropped so the next call rereads the disk.
    pub fn with_book<T>(&mut self, id: &str, f: impl FnOnce(&Path, &mut Metadata) -> AppResult<T>) -> AppResult<T> {
        if !self.open.as_ref().is_some_and(|(_, m)| m.id == id) {
            let dir = self.dir_of(id)?;
            let meta = read_metadata(&dir)?;
            self.open = Some((dir, meta));
        }
        let (dir, meta) = self.open.as_mut().expect("just loaded");
        match f(dir, meta) {
            Ok(out) => {
                let total = meta.total_words();
                self.totals.insert(id.to_string(), total);
                Ok(out)
            }
            Err(e) => {
                self.open = None;
                Err(e)
            }
        }
    }

    pub fn today(&self) -> usize {
        let now: usize = self.totals.values().sum();
        now.saturating_sub(self.session_base.unwrap_or(now))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ops::{chapter, library::create_book};

    #[test]
    fn today_counts_words_written_after_session_start() {
        let root = tempfile::tempdir().unwrap();
        let (dir, meta) = create_book(root.path(), "A").unwrap();
        let mut lib = Library::new(root.path().to_path_buf());
        lib.register(&dir, &meta);
        lib.start_session_if_needed();
        let chapter_id = meta.chapters[0].id.clone();
        lib.with_book(&meta.id, |d, m| {
            chapter::save(d, m, &chapter_id, &crate::markdown::parse::parse("um dois")).map(|_| ())
        })
        .unwrap();
        assert_eq!(lib.today(), 2);
    }

    #[test]
    fn unknown_book_is_an_error() {
        let mut lib = Library::new(PathBuf::from("."));
        assert!(lib.with_book("nope", |_, _| Ok(())).is_err());
    }
}
```

- [ ] **Step 3: Comandos**

`src-tauri/src/commands/dialog.rs`:

```rust
use std::path::PathBuf;

use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::storage::images::ALLOWED_EXTENSIONS;

/// Native "open image" dialog. Blocking: call only from async commands.
pub fn pick_image(app: &AppHandle) -> Option<PathBuf> {
    app.dialog()
        .file()
        .add_filter("Imagens", &ALLOWED_EXTENSIONS)
        .blocking_pick_file()
        .and_then(|f| f.into_path().ok())
}
```

`src-tauri/src/commands/library.rs`:

```rust
use tauri::State;

use crate::error::AppResult;
use crate::model::{patches::BookPatch, views::{BookSummary, LibraryListing}};
use crate::ops::{book, library as ops};
use crate::state::{lock, Library, SharedLibrary};

fn listing(lib: &mut Library) -> AppResult<LibraryListing> {
    let first_run = !lib.root.exists();
    std::fs::create_dir_all(&lib.root)?;
    if first_run {
        ops::write_samples(&lib.root)?;
    }
    let root = lib.root.clone();
    let scan = ops::scan(&root)?;
    let books = scan
        .books
        .iter()
        .map(|(dir, meta)| {
            lib.register(dir, meta);
            BookSummary::from_meta(dir, meta)
        })
        .collect();
    lib.start_session_if_needed();
    Ok(LibraryListing { books, warnings: scan.warnings })
}

#[tauri::command]
pub async fn library_list(state: State<'_, SharedLibrary>) -> AppResult<LibraryListing> {
    listing(&mut lock(&state)?)
}

#[tauri::command]
pub async fn library_create(state: State<'_, SharedLibrary>, title: String) -> AppResult<BookSummary> {
    let mut lib = lock(&state)?;
    std::fs::create_dir_all(&lib.root)?;
    let (dir, meta) = ops::create_book(&lib.root, &title)?;
    lib.register(&dir, &meta);
    Ok(BookSummary::from_meta(&dir, &meta))
}

#[tauri::command]
pub async fn library_rename(state: State<'_, SharedLibrary>, id: String, title: String) -> AppResult<BookSummary> {
    let mut lib = lock(&state)?;
    lib.with_book(&id, |dir, meta| {
        book::update(dir, meta, BookPatch { title: Some(title), ..Default::default() })?;
        Ok(BookSummary::from_meta(dir, meta))
    })
}

#[tauri::command]
pub async fn library_delete(state: State<'_, SharedLibrary>, id: String) -> AppResult<()> {
    let mut lib = lock(&state)?;
    let dir = lib.dir_of(&id)?;
    ops::delete_book(&dir)?;
    lib.forget(&id);
    Ok(())
}

#[tauri::command]
pub async fn library_restore_samples(state: State<'_, SharedLibrary>) -> AppResult<LibraryListing> {
    let mut lib = lock(&state)?;
    std::fs::create_dir_all(&lib.root)?;
    ops::write_samples(&lib.root)?;
    listing(&mut lib)
}
```

`src-tauri/src/commands/book.rs`:

```rust
use tauri::{AppHandle, State};

use super::dialog::pick_image;
use crate::error::AppResult;
use crate::model::{patches::{BookPatch, ImageSlot}, views::BookMeta};
use crate::ops::book;
use crate::state::{lock, SharedLibrary};

#[tauri::command]
pub async fn book_open(state: State<'_, SharedLibrary>, id: String) -> AppResult<BookMeta> {
    lock(&state)?.with_book(&id, |dir, meta| Ok(BookMeta::from_meta(dir, meta)))
}

#[tauri::command]
pub async fn book_update(state: State<'_, SharedLibrary>, id: String, patch: BookPatch) -> AppResult<BookMeta> {
    lock(&state)?.with_book(&id, |dir, meta| {
        book::update(dir, meta, patch)?;
        Ok(BookMeta::from_meta(dir, meta))
    })
}

#[tauri::command]
pub async fn book_pick_image(
    app: AppHandle,
    state: State<'_, SharedLibrary>,
    id: String,
    slot: ImageSlot,
) -> AppResult<Option<BookMeta>> {
    // The dialog runs before locking so the state is never held while the user browses.
    let Some(src) = pick_image(&app) else { return Ok(None) };
    lock(&state)?.with_book(&id, |dir, meta| {
        book::set_image(dir, meta, slot, &src)?;
        Ok(Some(BookMeta::from_meta(dir, meta)))
    })
}

#[tauri::command]
pub async fn book_clear_image(state: State<'_, SharedLibrary>, id: String, slot: ImageSlot) -> AppResult<BookMeta> {
    lock(&state)?.with_book(&id, |dir, meta| {
        book::clear_image(dir, meta, slot)?;
        Ok(BookMeta::from_meta(dir, meta))
    })
}

#[tauri::command]
pub async fn book_insert_image(app: AppHandle, state: State<'_, SharedLibrary>, id: String) -> AppResult<Option<String>> {
    let Some(src) = pick_image(&app) else { return Ok(None) };
    let dir = lock(&state)?.dir_of(&id)?;
    book::insert_image(&dir, &src).map(Some)
}
```

`src-tauri/src/commands/chapter.rs`:

```rust
use tauri::State;

use crate::error::AppResult;
use crate::model::{doc::Doc, patches::ChapterPatch, views::{BookMeta, ChapterMeta, SearchHit}};
use crate::ops::chapter;
use crate::state::{lock, SharedLibrary};

#[tauri::command]
pub async fn chapter_load(state: State<'_, SharedLibrary>, book_id: String, chapter_id: String) -> AppResult<Doc> {
    lock(&state)?.with_book(&book_id, |dir, meta| chapter::load(dir, meta, &chapter_id))
}

#[tauri::command]
pub async fn chapter_save(state: State<'_, SharedLibrary>, book_id: String, chapter_id: String, doc: Doc) -> AppResult<ChapterMeta> {
    lock(&state)?.with_book(&book_id, |dir, meta| chapter::save(dir, meta, &chapter_id, &doc).map(|c| ChapterMeta::from(&c)))
}

#[tauri::command]
pub async fn chapter_update(
    state: State<'_, SharedLibrary>,
    book_id: String,
    chapter_id: String,
    patch: ChapterPatch,
) -> AppResult<ChapterMeta> {
    lock(&state)?.with_book(&book_id, |dir, meta| chapter::update(dir, meta, &chapter_id, patch).map(|c| ChapterMeta::from(&c)))
}

#[tauri::command]
pub async fn chapter_insert(state: State<'_, SharedLibrary>, book_id: String, at: usize) -> AppResult<BookMeta> {
    lock(&state)?.with_book(&book_id, |dir, meta| {
        chapter::insert(dir, meta, at)?;
        Ok(BookMeta::from_meta(dir, meta))
    })
}

#[tauri::command]
pub async fn chapter_split(
    state: State<'_, SharedLibrary>,
    book_id: String,
    chapter_id: String,
    before: Doc,
    after: Doc,
) -> AppResult<BookMeta> {
    lock(&state)?.with_book(&book_id, |dir, meta| {
        chapter::split(dir, meta, &chapter_id, &before, &after)?;
        Ok(BookMeta::from_meta(dir, meta))
    })
}

#[tauri::command]
pub async fn chapter_move(state: State<'_, SharedLibrary>, book_id: String, from: usize, to: usize) -> AppResult<BookMeta> {
    lock(&state)?.with_book(&book_id, |dir, meta| {
        chapter::move_to(dir, meta, from, to)?;
        Ok(BookMeta::from_meta(dir, meta))
    })
}

#[tauri::command]
pub async fn chapter_delete(state: State<'_, SharedLibrary>, book_id: String, chapter_id: String) -> AppResult<BookMeta> {
    lock(&state)?.with_book(&book_id, |dir, meta| {
        chapter::delete(dir, meta, &chapter_id)?;
        Ok(BookMeta::from_meta(dir, meta))
    })
}

#[tauri::command]
pub async fn chapter_search(state: State<'_, SharedLibrary>, book_id: String, q: String) -> AppResult<Vec<SearchHit>> {
    lock(&state)?.with_book(&book_id, |dir, meta| chapter::search(dir, meta, &q))
}

#[tauri::command]
pub async fn chapter_markdown(state: State<'_, SharedLibrary>, book_id: String, chapter_id: String) -> AppResult<String> {
    lock(&state)?.with_book(&book_id, |dir, meta| chapter::markdown(dir, meta, &chapter_id))
}
```

`src-tauri/src/commands/prefs.rs`:

```rust
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::error::{AppError, AppResult};
use crate::model::prefs::{Prefs, PrefsPatch};

const STORE_FILE: &str = "prefs.json";
const KEY: &str = "prefs";

fn read(app: &AppHandle) -> AppResult<Prefs> {
    let store = app.store(STORE_FILE).map_err(|e| AppError::msg(format!("Preferências indisponíveis: {e}")))?;
    Ok(store.get(KEY).and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default())
}

#[tauri::command]
pub async fn prefs_get(app: AppHandle) -> AppResult<Prefs> {
    read(&app)
}

#[tauri::command]
pub async fn prefs_set(app: AppHandle, patch: PrefsPatch) -> AppResult<Prefs> {
    let prefs = read(&app)?.apply(patch);
    let store = app.store(STORE_FILE).map_err(|e| AppError::msg(format!("Preferências indisponíveis: {e}")))?;
    store.set(KEY, serde_json::to_value(&prefs)?);
    store.save().map_err(|e| AppError::msg(format!("Não foi possível salvar as preferências: {e}")))?;
    Ok(prefs)
}
```

`src-tauri/src/commands/stats.rs`:

```rust
use serde::Serialize;
use tauri::State;

use crate::error::AppResult;
use crate::state::{lock, SharedLibrary};

#[derive(Serialize)]
pub struct Today {
    pub today: usize,
}

#[tauri::command]
pub async fn stats_today(state: State<'_, SharedLibrary>) -> AppResult<Today> {
    Ok(Today { today: lock(&state)?.today() })
}
```

`src-tauri/src/commands/mod.rs`:

```rust
pub mod book;
pub mod chapter;
mod dialog;
pub mod library;
pub mod prefs;
pub mod stats;
```

- [ ] **Step 4: `lib.rs` final**

```rust
mod commands;
mod error;
mod ids;
mod markdown;
mod model;
mod ops;
mod samples;
mod state;
mod storage;
mod text;

use std::sync::Mutex;

use tauri::Manager;

use commands::{book, chapter, library, prefs, stats};
use state::Library;
use storage::paths::ROOT_NAME;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let root = app.path().document_dir()?.join(ROOT_NAME);
            app.manage(Mutex::new(Library::new(root)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            library::library_list,
            library::library_create,
            library::library_rename,
            library::library_delete,
            library::library_restore_samples,
            book::book_open,
            book::book_update,
            book::book_pick_image,
            book::book_clear_image,
            book::book_insert_image,
            chapter::chapter_load,
            chapter::chapter_save,
            chapter::chapter_update,
            chapter::chapter_insert,
            chapter::chapter_split,
            chapter::chapter_move,
            chapter::chapter_delete,
            chapter::chapter_search,
            chapter::chapter_markdown,
            prefs::prefs_get,
            prefs::prefs_set,
            stats::stats_today,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5: Rodar testes e build**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: todos PASS, **sem avisos de código não usado**.
Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: compila.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src
git commit -m "feat(rust): managed library state, prefs store and tauri commands"
```

---

# Parte B — Front-end

### Task 9: Camada de API, tipos e mock

**Files:**
- Create: `src/api/types.ts`, `src/api/invoke.ts`, `src/api/library.ts`, `src/api/book.ts`, `src/api/chapter.ts`, `src/api/prefs.ts`
- Create: `src/api/mock/db.ts`, `src/api/mock/library.ts`, `src/api/mock/book.ts`, `src/api/mock/chapter.ts`, `src/api/mock/prefs.ts`, `src/api/mock/index.ts`
- Create: `src/lib/doc.ts`, `src/lib/assets.ts`
- Test: `src/api/mock/chapter.test.ts`, `src/lib/doc.test.ts`
- Modify: `package.json` (vitest + script `test`)

**Interfaces:**
- Consumes: IPC do Task 8.
- Produces (usados nos Tasks 10–15):
  - `api/types.ts`: `Status`, `Separator`, `DocJSON`, `BookSummary`, `BookMeta`, `ChapterMeta`, `SearchHit`, `LibraryListing`, `Prefs`, `ImageSlot`, `BookPatch`, `ChapterPatch`, `PrefsPatch`.
  - `api/library.ts`: `listLibrary()`, `createBook(title)`, `renameBook(id, title)`, `deleteBook(id)`, `restoreSamples()`.
  - `api/book.ts`: `openBook(id)`, `updateBook(id, patch)`, `pickBookImage(id, slot)`, `clearBookImage(id, slot)`, `insertChapterImage(id)`.
  - `api/chapter.ts`: `loadChapter(bookId, chapterId)`, `saveChapter(bookId, chapterId, doc)`, `updateChapter(bookId, chapterId, patch)`, `insertChapter(bookId, at)`, `splitChapter(bookId, chapterId, before, after)`, `moveChapter(bookId, from, to)`, `deleteChapter(bookId, chapterId)`, `searchChapters(bookId, q)`, `chapterMarkdown(bookId, chapterId)`.
  - `api/prefs.ts`: `getPrefs()`, `setPrefs(patch)`, `statsToday()`.
  - `lib/doc.ts`: `docText(doc: DocJSON): string`, `docWords(doc: DocJSON): number`, `EMPTY_DOC`.
  - `lib/assets.ts`: `bookAsset(dir: string, rel: string | null, version: number): string | null`, `fileAsset(abs: string | null, version: number): string | null`.

- [ ] **Step 1: Instalar vitest**

Run: `bun add -d vitest@5` e em `package.json` → `"scripts"`: `"test": "vitest run"`.

- [ ] **Step 2: Tipos e helpers**

`src/api/types.ts`:

```ts
export type Status = "rascunho" | "revisao" | "pronto";
export type ImageSlot = "cover" | "header" | "footer" | "separator";

export type Separator = { type: "text"; text: string } | { type: "image"; image: string };

export type InlineJSON = { type: "text"; text: string } | { type: "hardBreak" };
export type BlockJSON =
  | { type: "paragraph"; content?: InlineJSON[] }
  | { type: "separator" }
  | { type: "image"; attrs: { src: string } };
export interface DocJSON {
  type: "doc";
  content: BlockJSON[];
}

export interface BookSummary {
  id: string;
  title: string;
  author: string;
  /** Absolute path. */
  cover: string | null;
  chapters: number;
  words: number;
  ready: number;
  updatedAt: number;
}

export interface ChapterMeta {
  id: string;
  title: string;
  status: Status;
  notes: string;
  words: number;
}

export interface BookMeta {
  id: string;
  title: string;
  author: string;
  cur: number;
  updatedAt: number;
  /** Absolute folder; image fields are relative to it. */
  dir: string;
  cover: string | null;
  header: string | null;
  footer: string | null;
  separator: Separator;
  chapters: ChapterMeta[];
}

export interface SearchHit {
  index: number;
  chapterId: string;
}

export interface LibraryListing {
  books: BookSummary[];
  warnings: string[];
}

export interface Prefs {
  theme: "light" | "dark";
  goal: number;
  width: 0 | 1 | 2;
  font: 0 | 1 | 2;
}

export type BookPatch = Partial<{ title: string; author: string; cur: number; separatorText: string }>;
export type ChapterPatch = Partial<{ title: string; notes: string; status: Status }>;
export type PrefsPatch = Partial<Prefs>;
```

`src/lib/doc.ts`:

```ts
import type { DocJSON } from "../api/types";

export const EMPTY_DOC: DocJSON = { type: "doc", content: [] };

/** Plain text of a document: paragraphs joined by blank lines. */
export function docText(doc: DocJSON): string {
  return doc.content
    .map((b) =>
      b.type === "paragraph" ? (b.content ?? []).map((i) => (i.type === "text" ? i.text : "\n")).join("") : null,
    )
    .filter((s): s is string => s !== null)
    .join("\n\n");
}

export function docWords(doc: DocJSON): number {
  const m = docText(doc).match(/\S+/g);
  return m ? m.length : 0;
}
```

`src/lib/doc.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { docWords } from "./doc";

describe("docWords", () => {
  it("counts paragraph words and skips separators/images", () => {
    expect(
      docWords({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "um dois" }, { type: "hardBreak" }, { type: "text", text: "três" }] },
          { type: "separator" },
          { type: "image", attrs: { src: "imagens/a.png" } },
          { type: "paragraph" },
        ],
      }),
    ).toBe(3);
  });
});
```

`src/lib/assets.ts`:

```ts
import { convertFileSrc } from "@tauri-apps/api/core";
import { isTauri } from "../api/invoke";

/** URL for an absolute file path; `version` busts the cache when the file is replaced. */
export function fileAsset(abs: string | null, version: number): string | null {
  if (!abs || !isTauri) return null;
  return convertFileSrc(abs) + "?v=" + version;
}

/** URL for a path relative to the book folder. */
export function bookAsset(dir: string, rel: string | null, version: number): string | null {
  if (!rel) return null;
  const sep = dir.includes("\\") ? "\\" : "/";
  return fileAsset(dir + sep + rel.split("/").join(sep), version);
}
```

- [ ] **Step 3: invoke e wrappers**

`src/api/invoke.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";
import { mockInvoke } from "./mock";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Calls a Rust command, or the in-memory mock when running outside Tauri. */
export function call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  return isTauri ? invoke<T>(cmd, args) : mockInvoke<T>(cmd, args);
}
```

`src/api/library.ts`:

```ts
import { call } from "./invoke";
import type { BookSummary, LibraryListing } from "./types";

export const listLibrary = () => call<LibraryListing>("library_list");
export const createBook = (title: string) => call<BookSummary>("library_create", { title });
export const renameBook = (id: string, title: string) => call<BookSummary>("library_rename", { id, title });
export const deleteBook = (id: string) => call<void>("library_delete", { id });
export const restoreSamples = () => call<LibraryListing>("library_restore_samples");
```

`src/api/book.ts`:

```ts
import { call } from "./invoke";
import type { BookMeta, BookPatch, ImageSlot } from "./types";

export const openBook = (id: string) => call<BookMeta>("book_open", { id });
export const updateBook = (id: string, patch: BookPatch) => call<BookMeta>("book_update", { id, patch });
export const pickBookImage = (id: string, slot: ImageSlot) => call<BookMeta | null>("book_pick_image", { id, slot });
export const clearBookImage = (id: string, slot: ImageSlot) => call<BookMeta>("book_clear_image", { id, slot });
export const insertChapterImage = (id: string) => call<string | null>("book_insert_image", { id });
```

`src/api/chapter.ts`:

```ts
import { call } from "./invoke";
import type { BookMeta, ChapterMeta, ChapterPatch, DocJSON, SearchHit } from "./types";

export const loadChapter = (bookId: string, chapterId: string) => call<DocJSON>("chapter_load", { bookId, chapterId });
export const saveChapter = (bookId: string, chapterId: string, doc: DocJSON) =>
  call<ChapterMeta>("chapter_save", { bookId, chapterId, doc });
export const updateChapter = (bookId: string, chapterId: string, patch: ChapterPatch) =>
  call<ChapterMeta>("chapter_update", { bookId, chapterId, patch });
export const insertChapter = (bookId: string, at: number) => call<BookMeta>("chapter_insert", { bookId, at });
export const splitChapter = (bookId: string, chapterId: string, before: DocJSON, after: DocJSON) =>
  call<BookMeta>("chapter_split", { bookId, chapterId, before, after });
export const moveChapter = (bookId: string, from: number, to: number) => call<BookMeta>("chapter_move", { bookId, from, to });
export const deleteChapter = (bookId: string, chapterId: string) => call<BookMeta>("chapter_delete", { bookId, chapterId });
export const searchChapters = (bookId: string, q: string) => call<SearchHit[]>("chapter_search", { bookId, q });
export const chapterMarkdown = (bookId: string, chapterId: string) => call<string>("chapter_markdown", { bookId, chapterId });
```

`src/api/prefs.ts`:

```ts
import { call } from "./invoke";
import type { Prefs, PrefsPatch } from "./types";

export const getPrefs = () => call<Prefs>("prefs_get");
export const setPrefs = (patch: PrefsPatch) => call<Prefs>("prefs_set", { patch });
export const statsToday = () => call<{ today: number }>("stats_today");
```

- [ ] **Step 4: Mock em memória**

`src/api/mock/db.ts`:

```ts
import type { BookMeta, BookSummary, ChapterMeta, DocJSON, Prefs, Separator } from "../types";
import { docWords } from "../../lib/doc";

export interface MockChapter extends ChapterMeta {
  doc: DocJSON;
}
export interface MockBook {
  id: string;
  title: string;
  author: string;
  cur: number;
  updatedAt: number;
  separator: Separator;
  header: string | null;
  footer: string | null;
  chapters: MockChapter[];
}

let seq = 0;
export const mockId = () => "m" + Date.now().toString(36) + (seq++).toString(36);

export const para = (text: string): DocJSON => ({
  type: "doc",
  content: text.split("\n\n").map((t) => ({ type: "paragraph" as const, content: [{ type: "text" as const, text: t }] })),
});

export function chapter(title: string, status: ChapterMeta["status"], doc: DocJSON, notes = ""): MockChapter {
  return { id: mockId(), title, status, notes, doc, words: docWords(doc) };
}

function samples(): MockBook[] {
  const now = Date.now();
  const book = (title: string, hours: number, cur: number, chapters: MockChapter[]): MockBook => ({
    id: mockId(), title, author: "", cur, updatedAt: now - hours * 3600000,
    separator: { type: "text", text: "* * *" }, header: null, footer: null, chapters,
  });
  return [
    book("A Torre das Mil Luas", 2, 1, [
      chapter("O sino que não tocava", "pronto", para("Na cidade de Vael, todo mundo sabia que o sino da torre norte não tocava havia cem anos.")),
      chapter("A aprendiz de cartógrafo", "revisao", {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "O mapa de Ilen tinha um erro." }] },
          { type: "separator" },
          { type: "paragraph", content: [{ type: "text", text: "Mestre Odran dizia que mapas não mentem." }] },
        ],
      }),
    ]),
    book("Herdeira das Cinzas", 27, 0, [chapter("A coroação que não houve", "rascunho", para("A coroa chegou ao salão."))]),
  ];
}

export const db = { books: samples(), prefs: { theme: "light", goal: 2000, width: 1, font: 1 } as Prefs, base: 0 };
db.base = db.books.reduce((a, b) => a + b.chapters.reduce((x, c) => x + c.words, 0), 0);

export function findBook(id: string): MockBook {
  const b = db.books.find((x) => x.id === id);
  if (!b) throw "Obra não encontrada";
  return b;
}

export function findChapter(book: MockBook, id: string): number {
  const i = book.chapters.findIndex((c) => c.id === id);
  if (i < 0) throw "Capítulo não encontrado";
  return i;
}

export const touch = (b: MockBook) => (b.updatedAt = Date.now());

/** Chapter metadata without the document. */
export const chapterMeta = (c: MockChapter): ChapterMeta => ({
  id: c.id, title: c.title, status: c.status, notes: c.notes, words: c.words,
});

export const toMeta = (b: MockBook): BookMeta => ({
  id: b.id, title: b.title, author: b.author, cur: b.cur, updatedAt: b.updatedAt, dir: "/mock/" + b.id,
  cover: null, header: b.header, footer: b.footer, separator: b.separator,
  chapters: b.chapters.map(chapterMeta),
});

export const toSummary = (b: MockBook): BookSummary => ({
  id: b.id, title: b.title, author: b.author, cover: null, chapters: b.chapters.length,
  words: b.chapters.reduce((a, c) => a + c.words, 0),
  ready: b.chapters.filter((c) => c.status === "pronto").length, updatedAt: b.updatedAt,
});

export const resetSamples = () => db.books.push(...samples());
```

`src/api/mock/library.ts`:

```ts
import type { BookSummary, LibraryListing } from "../types";
import { chapter, db, findBook, mockId, resetSamples, toSummary, touch } from "./db";

export const library = {
  library_list: (): LibraryListing => ({ books: db.books.map(toSummary), warnings: [] }),
  library_create: ({ title }: { title: string }): BookSummary => {
    const b = {
      id: mockId(), title, author: "", cur: 0, updatedAt: Date.now(),
      separator: { type: "text" as const, text: "* * *" }, header: null, footer: null,
      chapters: [chapter("", "rascunho", { type: "doc", content: [] })],
    };
    db.books.unshift(b);
    return toSummary(b);
  },
  library_rename: ({ id, title }: { id: string; title: string }): BookSummary => {
    const b = findBook(id);
    b.title = title;
    touch(b);
    return toSummary(b);
  },
  library_delete: ({ id }: { id: string }) => {
    db.books = db.books.filter((b) => b.id !== id);
  },
  library_restore_samples: (): LibraryListing => {
    resetSamples();
    return library.library_list();
  },
};
```

`src/api/mock/book.ts`:

```ts
import type { BookMeta, BookPatch, ImageSlot } from "../types";
import { findBook, toMeta, touch } from "./db";

export const book = {
  book_open: ({ id }: { id: string }): BookMeta => toMeta(findBook(id)),
  book_update: ({ id, patch }: { id: string; patch: BookPatch }): BookMeta => {
    const b = findBook(id);
    if (patch.title !== undefined) b.title = patch.title;
    if (patch.author !== undefined) b.author = patch.author;
    if (patch.separatorText !== undefined) b.separator = { type: "text", text: patch.separatorText };
    if (patch.cur !== undefined) b.cur = Math.min(patch.cur, b.chapters.length - 1);
    if (patch.title !== undefined || patch.author !== undefined || patch.separatorText !== undefined) touch(b);
    return toMeta(b);
  },
  // No file system in the browser: pickers behave as if cancelled.
  book_pick_image: (_: { id: string; slot: ImageSlot }): BookMeta | null => null,
  book_insert_image: (_: { id: string }): string | null => null,
  book_clear_image: ({ id, slot }: { id: string; slot: ImageSlot }): BookMeta => {
    const b = findBook(id);
    if (slot === "header") b.header = null;
    if (slot === "footer") b.footer = null;
    if (slot === "separator") b.separator = { type: "text", text: "* * *" };
    touch(b);
    return toMeta(b);
  },
};
```

`src/api/mock/chapter.ts`:

```ts
import type { BookMeta, ChapterMeta, ChapterPatch, DocJSON, SearchHit } from "../types";
import { docText, docWords } from "../../lib/doc";
import { norm, pad } from "../../lib/format";
import { chapterMeta as meta, chapter as newChapter, findBook, findChapter, toMeta, touch } from "./db";

type Ids = { bookId: string; chapterId: string };

export const chapter = {
  chapter_load: ({ bookId, chapterId }: Ids): DocJSON => {
    const b = findBook(bookId);
    return structuredClone(b.chapters[findChapter(b, chapterId)].doc);
  },
  chapter_save: ({ bookId, chapterId, doc }: Ids & { doc: DocJSON }): ChapterMeta => {
    const b = findBook(bookId);
    const c = b.chapters[findChapter(b, chapterId)];
    c.doc = structuredClone(doc);
    c.words = docWords(doc);
    touch(b);
    return meta(c);
  },
  chapter_update: ({ bookId, chapterId, patch }: Ids & { patch: ChapterPatch }): ChapterMeta => {
    const b = findBook(bookId);
    const c = b.chapters[findChapter(b, chapterId)];
    Object.assign(c, patch);
    touch(b);
    return meta(c);
  },
  chapter_insert: ({ bookId, at }: { bookId: string; at: number }): BookMeta => {
    const b = findBook(bookId);
    const i = Math.min(at, b.chapters.length);
    b.chapters.splice(i, 0, newChapter("", "rascunho", { type: "doc", content: [] }));
    b.cur = i;
    touch(b);
    return toMeta(b);
  },
  chapter_split: ({ bookId, chapterId, before, after }: Ids & { before: DocJSON; after: DocJSON }): BookMeta => {
    const b = findBook(bookId);
    const i = findChapter(b, chapterId);
    b.chapters[i].doc = structuredClone(before);
    b.chapters[i].words = docWords(before);
    b.chapters.splice(i + 1, 0, newChapter("", "rascunho", structuredClone(after)));
    b.cur = i + 1;
    touch(b);
    return toMeta(b);
  },
  chapter_move: ({ bookId, from, to }: { bookId: string; from: number; to: number }): BookMeta => {
    const b = findBook(bookId);
    if (to < 0 || to >= b.chapters.length) throw "Posição inválida";
    const currentId = b.chapters[b.cur]?.id;
    const [c] = b.chapters.splice(from, 1);
    b.chapters.splice(to, 0, c);
    b.cur = Math.max(0, b.chapters.findIndex((x) => x.id === currentId));
    touch(b);
    return toMeta(b);
  },
  chapter_delete: ({ bookId, chapterId }: Ids): BookMeta => {
    const b = findBook(bookId);
    if (b.chapters.length === 1) throw "A obra precisa de pelo menos um capítulo";
    b.chapters.splice(findChapter(b, chapterId), 1);
    b.cur = Math.min(b.cur, b.chapters.length - 1);
    touch(b);
    return toMeta(b);
  },
  chapter_search: ({ bookId, q }: { bookId: string; q: string }): SearchHit[] => {
    const query = norm(q.trim());
    if (!query) return [];
    return findBook(bookId)
      .chapters.map((c, index) => ({ c, index }))
      .filter(({ c, index }) => norm(c.title).includes(query) || pad(index + 1).startsWith(query) || norm(docText(c.doc)).includes(query))
      .map(({ c, index }) => ({ index, chapterId: c.id }));
  },
  chapter_markdown: ({ bookId, chapterId }: Ids): string => {
    const b = findBook(bookId);
    const i = findChapter(b, chapterId);
    const c = b.chapters[i];
    return (c.title ? `Capítulo ${i + 1} — ${c.title}` : `Capítulo ${i + 1}`) + "\n\n" + docText(c.doc);
  },
};
```

`src/api/mock/prefs.ts`:

```ts
import type { Prefs, PrefsPatch } from "../types";
import { db } from "./db";

export const prefs = {
  prefs_get: (): Prefs => ({ ...db.prefs }),
  prefs_set: ({ patch }: { patch: PrefsPatch }): Prefs => Object.assign(db.prefs, patch),
  stats_today: () => ({
    today: Math.max(0, db.books.reduce((a, b) => a + b.chapters.reduce((x, c) => x + c.words, 0), 0) - db.base),
  }),
};
```

`src/api/mock/index.ts`:

```ts
import { book } from "./book";
import { chapter } from "./chapter";
import { library } from "./library";
import { prefs } from "./prefs";

type Handler = (args: never) => unknown;
const handlers: Record<string, Handler> = { ...library, ...book, ...chapter, ...prefs };

/** In-memory stand-in for the Rust commands, for `bun run dev` and tests. */
export async function mockInvoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const h = handlers[cmd];
  if (!h) throw `Comando desconhecido: ${cmd}`;
  return structuredClone(h(args as never)) as T;
}
```

- [ ] **Step 5: Teste do mock (espelha a semântica do Rust)**

`src/api/mock/chapter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mockInvoke } from ".";
import type { BookMeta, DocJSON, LibraryListing } from "../types";

const doc = (t: string): DocJSON => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });

describe("mock chapter commands", () => {
  it("split keeps before, opens after as the next current chapter", async () => {
    const { books } = await mockInvoke<LibraryListing>("library_list", {});
    const b = await mockInvoke<BookMeta>("book_open", { id: books[0].id });
    const first = b.chapters[0].id;
    const after = await mockInvoke<BookMeta>("chapter_split", { bookId: b.id, chapterId: first, before: doc("a"), after: doc("b c") });
    expect(after.cur).toBe(1);
    expect(after.chapters[1].words).toBe(2);
    expect(await mockInvoke<DocJSON>("chapter_load", { bookId: b.id, chapterId: first })).toEqual(doc("a"));
  });

  it("refuses to delete the only chapter", async () => {
    const created = await mockInvoke<{ id: string }>("library_create", { title: "Nova" });
    const b = await mockInvoke<BookMeta>("book_open", { id: created.id });
    await expect(mockInvoke("chapter_delete", { bookId: b.id, chapterId: b.chapters[0].id })).rejects.toBe(
      "A obra precisa de pelo menos um capítulo",
    );
  });
});
```

- [ ] **Step 6: Rodar**

Run: `bun run test`
Expected: 3 testes PASS.
Run: `./node_modules/.bin/tsc.exe --noEmit -p .`
Expected: sem erros (os módulos novos ainda não são importados pelo app).

- [ ] **Step 7: Commit**

```bash
git add package.json bun.lock src/api src/lib/doc.ts src/lib/doc.test.ts src/lib/assets.ts
git commit -m "feat(front): typed api layer with in-memory mock"
```

---

### Task 10: Módulo do editor TipTap (sem integração)

**Files:**
- Create: `src/editor/separator.ts`, `src/editor/image.ts`, `src/editor/split.ts`, `src/editor/writerKeys.ts`, `src/editor/createEditor.ts`, `src/editor/bridge.ts`
- Test: `src/editor/split.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `DocJSON`, `Separator` (Task 9).
- Produces:
  - `editor/split.ts`: `splitAtCursor(state: EditorState): { before: DocJSON; after: DocJSON } | null` — the cursor must be at the start of a paragraph and the two Enters must have produced two empty paragraphs: either (a) cursor in an empty paragraph whose previous sibling is empty, or (b) cursor at offset 0 of a non-empty paragraph preceded by two empty paragraphs (Enter pressed at the start of existing text). The two empty paragraphs are removed; trailing empties of `before` and leading empties of `after` are trimmed.
  - `editor/writerKeys.ts`: `WriterKeys` extension with options `{ onSplit(before, after): void; onHint(show: boolean): void; onExitTop(): void }`.
  - `editor/separator.ts`: `SeparatorNode` with option `view: () => SeparatorView`, where `SeparatorView = { kind: "text"; text: string } | { kind: "image"; src: string | null }`.
  - `editor/image.ts`: `BookImageNode` with option `resolve: (src: string) => string | null`.
  - `editor/createEditor.ts`: `createWriterEditor(opts: { element: HTMLElement; separator: () => SeparatorView; resolveImage: (src: string) => string | null; onChange(): void; onSplit; onHint; onExitTop }): Editor`.
  - `editor/bridge.ts`: `setEditor(e: Editor | null)`, `loadDoc(doc: DocJSON)`, `getDoc(): DocJSON | null`, `focusEditor(caret: number | "end" | null)`, `insertSeparator()`, `insertImage(src: string)`, `liveText(): string`.

- [ ] **Step 1: Instalar TipTap**

Run: `bun add @tiptap/core@3 @tiptap/pm@3 @tiptap/extension-document@3 @tiptap/extension-paragraph@3 @tiptap/extension-text@3 @tiptap/extension-hard-break@3 @tiptap/extensions@3`

- [ ] **Step 2: Teste do split (falha)**

`src/editor/split.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { splitAtCursor } from "./split";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    separator: { group: "block", atom: true },
    text: { group: "inline" },
  },
});

function stateWithCursorIn(blocks: string[], cursorBlock: number) {
  const doc = schema.node(
    "doc",
    null,
    blocks.map((t) => (t === "---" ? schema.node("separator") : schema.node("paragraph", null, t ? [schema.text(t)] : []))),
  );
  let pos = 0;
  for (let i = 0; i < cursorBlock; i++) pos += doc.child(i).nodeSize;
  const state = EditorState.create({ doc, schema });
  return state.apply(state.tr.setSelection(TextSelection.create(doc, pos + 1)));
}

describe("splitAtCursor", () => {
  it("splits on the second empty paragraph and moves the rest", () => {
    const state = stateWithCursorIn(["antes", "", "", "depois"], 2);
    const out = splitAtCursor(state);
    expect(out?.before.content).toEqual([{ type: "paragraph", content: [{ type: "text", text: "antes" }] }]);
    expect(out?.after.content).toEqual([{ type: "paragraph", content: [{ type: "text", text: "depois" }] }]);
  });

  it("trims empty paragraphs around the cut and keeps separators", () => {
    const state = stateWithCursorIn(["a", "", "", "", "", "---", "b"], 4);
    const out = splitAtCursor(state);
    expect(out?.before.content).toEqual([{ type: "paragraph", content: [{ type: "text", text: "a" }] }]);
    expect(out?.after.content.map((b) => b.type)).toEqual(["separator", "paragraph"]);
  });

  it("splits when Enter ×3 was pressed at the start of existing text", () => {
    // Two Enters at the start of "depois" leave two empty paragraphs before it.
    const state = stateWithCursorIn(["antes", "", "", "depois"], 3);
    const out = splitAtCursor(state);
    expect(out?.before.content).toEqual([{ type: "paragraph", content: [{ type: "text", text: "antes" }] }]);
    expect(out?.after.content).toEqual([{ type: "paragraph", content: [{ type: "text", text: "depois" }] }]);
  });

  it("does nothing when the previous paragraph has text", () => {
    expect(splitAtCursor(stateWithCursorIn(["a", ""], 1))).toBeNull();
    expect(splitAtCursor(stateWithCursorIn(["a", "", "b"], 2))).toBeNull();
  });
});
```

Run: `bun run test src/editor/split.test.ts`
Expected: FAIL (`./split` não existe). (O teste de posição usa `pos + 1`, que é o início do bloco `cursorBlock`.)

- [ ] **Step 3: Implementar `split.ts`**

```ts
import type { Node as PMNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import type { BlockJSON, DocJSON } from "../api/types";

const isEmptyParagraph = (n: PMNode | null | undefined) => !!n && n.type.name === "paragraph" && n.content.size === 0;

function toDoc(blocks: BlockJSON[]): DocJSON {
  let start = 0;
  let end = blocks.length;
  const empty = (b: BlockJSON) => b.type === "paragraph" && !(b.content && b.content.length);
  while (start < end && empty(blocks[start])) start++;
  while (end > start && empty(blocks[end - 1])) end--;
  return { type: "doc", content: blocks.slice(start, end) };
}

/**
 * Enter ×3: the first two Enters left two empty paragraphs right before the cursor
 * (or the cursor sits in the second one). Returns the content before and after them.
 */
export function splitAtCursor(state: EditorState): { before: DocJSON; after: DocJSON } | null {
  const { $from, empty } = state.selection;
  if (!empty || $from.depth !== 1 || $from.parent.type.name !== "paragraph" || $from.parentOffset !== 0) return null;
  const i = $from.index(0);
  const emptyAt = (k: number) => k >= 0 && isEmptyParagraph(state.doc.child(k));
  const blocks = (state.doc.toJSON() as DocJSON).content;
  if ($from.parent.content.size === 0) {
    if (!emptyAt(i - 1)) return null;
    return { before: toDoc(blocks.slice(0, i - 1)), after: toDoc(blocks.slice(i + 1)) };
  }
  if (!emptyAt(i - 1) || !emptyAt(i - 2)) return null;
  return { before: toDoc(blocks.slice(0, i - 2)), after: toDoc(blocks.slice(i)) };
}
```

Run: `bun run test src/editor/split.test.ts`
Expected: 4 PASS.

- [ ] **Step 4: Nós e atalhos**

`src/editor/separator.ts`:

```ts
import { Node } from "@tiptap/core";
import { createEffect, createRoot } from "solid-js";

export type SeparatorView = { kind: "text"; text: string } | { kind: "image"; src: string | null };

export interface SeparatorOptions {
  /** Reactive: the book's current separator setting. */
  view: () => SeparatorView;
}

/** Scene break. Rendered from the book settings, stored as `***`. */
export const SeparatorNode = Node.create<SeparatorOptions>({
  name: "separator",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { view: () => ({ kind: "text", text: "* * *" }) };
  },

  parseHTML() {
    return [{ tag: "div[data-separator]" }];
  },

  renderHTML() {
    return ["div", { "data-separator": "" }];
  },

  addNodeView() {
    const view = this.options.view;
    return () => {
      const dom = document.createElement("div");
      dom.className = "sep";
      dom.contentEditable = "false";
      const dispose = createRoot((d) => {
        createEffect(() => {
          const v = view();
          if (v.kind === "image" && v.src) {
            const img = document.createElement("img");
            img.src = v.src;
            img.alt = "";
            dom.replaceChildren(img);
          } else {
            dom.replaceChildren(document.createTextNode(v.kind === "text" ? v.text : "* * *"));
          }
        });
        return d;
      });
      return { dom, destroy: dispose, ignoreMutation: () => true };
    };
  },
});
```

`src/editor/image.ts`:

```ts
import { Node } from "@tiptap/core";

export interface BookImageOptions {
  /** Turns a book-relative `src` into a displayable URL. */
  resolve: (src: string) => string | null;
}

/** Image stored in the book's `imagens/` folder. */
export const BookImageNode = Node.create<BookImageOptions>({
  name: "image",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { resolve: () => null };
  },

  addAttributes() {
    return { src: { default: "" } };
  },

  parseHTML() {
    return [{ tag: "img[data-book-src]", getAttrs: (el) => ({ src: (el as HTMLElement).dataset.bookSrc }) }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", { "data-book-src": HTMLAttributes.src }];
  },

  addNodeView() {
    const resolve = this.options.resolve;
    return ({ node }) => {
      const dom = document.createElement("figure");
      dom.className = "ed-img";
      dom.contentEditable = "false";
      const img = document.createElement("img");
      img.alt = "";
      img.src = resolve(node.attrs.src) ?? "";
      dom.append(img);
      return { dom, ignoreMutation: () => true };
    };
  },
});
```

`src/editor/writerKeys.ts`:

```ts
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import type { DocJSON } from "../api/types";
import { splitAtCursor } from "./split";

export interface WriterKeysOptions {
  onSplit: (before: DocJSON, after: DocJSON) => void;
  onHint: (show: boolean) => void;
  onExitTop: () => void;
}

const MODIFIERS = ["Shift", "Control", "Alt", "Meta", "CapsLock"];

/** Enter ×3 splits the chapter, Ctrl Enter inserts a separator, ↑ at the top leaves to the title. */
export const WriterKeys = Extension.create<WriterKeysOptions>({
  name: "writerKeys",
  priority: 1000,

  addOptions() {
    return { onSplit: () => {}, onHint: () => {}, onExitTop: () => {} };
  },

  addProseMirrorPlugins() {
    const opts = this.options;
    const editor = this.editor;
    let streak = 0;
    const reset = () => {
      if (streak) opts.onHint(false);
      streak = 0;
    };

    return [
      new Plugin({
        props: {
          handleKeyDown(view, event) {
            const mod = event.ctrlKey || event.metaKey;
            if (event.key === "Enter" && mod && !event.altKey) {
              reset();
              // The trailing paragraph keeps a place to type after the separator.
              editor.chain().focus().insertContent([{ type: "separator" }, { type: "paragraph" }]).run();
              return true;
            }
            if (event.key === "Enter" && !mod && !event.altKey && !event.shiftKey) {
              const cut = streak >= 2 ? splitAtCursor(view.state) : null;
              if (cut) {
                reset();
                opts.onSplit(cut.before, cut.after);
                return true;
              }
              streak += 1;
              // The paragraph is created by the default keymap; the hint shows after the 2nd Enter.
              if (streak >= 2) queueMicrotask(() => opts.onHint(true));
              return false;
            }
            if (!MODIFIERS.includes(event.key)) reset();
            const { selection } = view.state;
            if (event.key === "ArrowUp" && !mod && !event.altKey && selection.empty && selection.from <= 1) {
              opts.onExitTop();
              return true;
            }
            return false;
          },
          handleClick() {
            reset();
            return false;
          },
        },
      }),
    ];
  },
});
```

- [ ] **Step 5: Fábrica e ponte**

`src/editor/createEditor.ts`:

```ts
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { Placeholder, UndoRedo } from "@tiptap/extensions";
import { BookImageNode } from "./image";
import { SeparatorNode, type SeparatorView } from "./separator";
import { WriterKeys, type WriterKeysOptions } from "./writerKeys";

export interface WriterEditorOptions extends WriterKeysOptions {
  element: HTMLElement;
  separator: () => SeparatorView;
  resolveImage: (src: string) => string | null;
  onChange: () => void;
}

/** The chapter editor with only the nodes our markdown can store. */
export function createWriterEditor(o: WriterEditorOptions): Editor {
  return new Editor({
    element: o.element,
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      UndoRedo,
      Placeholder.configure({ placeholder: "Comece a escrever…" }),
      SeparatorNode.configure({ view: o.separator }),
      BookImageNode.configure({ resolve: o.resolveImage }),
      WriterKeys.configure({ onSplit: o.onSplit, onHint: o.onHint, onExitTop: o.onExitTop }),
    ],
    editorProps: { attributes: { class: "ed-body", id: "ch-body", "aria-label": "Texto do capítulo" } },
    onUpdate: () => o.onChange(),
  });
}
```

`src/editor/bridge.ts`:

```ts
import type { Editor } from "@tiptap/core";
import type { DocJSON } from "../api/types";

/** Holds the mounted editor so store actions can talk to it. */
let editor: Editor | null = null;
let pendingDoc: DocJSON | null = null;

export function setEditor(e: Editor | null) {
  editor = e;
  if (e && pendingDoc) {
    const doc = pendingDoc;
    pendingDoc = null;
    loadDoc(doc);
  }
}

/** Replaces the document without triggering a save or an undo step. */
export function loadDoc(doc: DocJSON) {
  if (!editor) {
    pendingDoc = doc;
    return;
  }
  editor.chain().setMeta("addToHistory", false).setContent(doc, { emitUpdate: false }).run();
}

export function getDoc(): DocJSON | null {
  return editor ? (editor.getJSON() as DocJSON) : null;
}

export function liveText(): string {
  if (!editor) return "";
  const { doc } = editor.state;
  return doc.textBetween(0, doc.content.size, "\n\n", "\n");
}

export function focusEditor(caret: number | "end" | null) {
  if (!editor) return;
  editor.commands.focus(caret === 0 ? "start" : caret === "end" ? "end" : null, { scrollIntoView: caret !== null });
}

export function insertSeparator() {
  editor?.chain().focus().insertContent([{ type: "separator" }, { type: "paragraph" }]).run();
}

export function insertImage(src: string) {
  editor?.chain().focus().insertContent([{ type: "image", attrs: { src } }, { type: "paragraph" }]).run();
}
```

- [ ] **Step 6: Rodar**

Run: `bun run test` e `./node_modules/.bin/tsc.exe --noEmit -p .`
Expected: PASS e sem erros de tipo.

- [ ] **Step 7: Commit**

```bash
git add package.json bun.lock src/editor
git commit -m "feat(editor): tiptap nodes, writer keys and chapter split"
```

---

### Task 11: Store — estado, seletores, UI e preferências

**Files:**
- Rewrite: `src/store/state.ts`
- Create: `src/store/selectors/library.ts`, `src/store/selectors/book.ts`
- Create: `src/store/actions/ui.ts`, `src/store/actions/prefs.ts`
- Modify: `src/store/focus.ts` (handlers customizados)
- Modify: `src/lib/types.ts`, `src/lib/format.ts`, `src/lib/cover.ts`, `src/lib/constants.ts`
- Delete: `src/store/ui.ts`, `src/store/persistence.ts`, `src/lib/storage.ts`, `src/data/samples.ts`

**Interfaces:**
- Consumes: Task 9 (`api/*`, types), Task 10 (`bridge.liveText`).
- Produces:
  - `editBook(fn: (book: BookMeta) => void)` — the only way to change nested fields of `state.book` (Solid path setters don't type-check through `BookMeta | null`).
  - `state`, `setState`, `session` with `AppState` fields: `library: BookSummary[]`, `book: BookMeta | null`, `curId`, `view`, `prefs: Prefs`, `focus`, `panel`, `q`, `pIdx`, `confirmDel`, `indexSel`, `toast`, `toastKey`, `tripleHint`, `libSel`, `libQ`, `renaming`, `renameVal`, `libConfirm`, `liveWords: number`, `today: number`, `hits: SearchHit[]`, `prompt: PromptState | null`, `ready: boolean`.
  - `PromptState = { label: string; value: string; submit: (value: string) => void }`.
  - `selectors/library.ts`: `sortedLibrary()`, `libList()`, `libSelIndex(list?)`.
  - `selectors/book.ts`: `currentChapter(): ChapterMeta | undefined`, `bookWordsLive(): number`, `bookLabel(): string`, `todayLive(): number`.
  - `actions/ui.ts`: `flash`, `homeTarget`, `closePanel`, `openPanel`, `toggleFocusMode`.
  - `actions/prefs.ts`: `loadPrefs()`, `updatePrefs(patch)`, `toggleTheme()`, `cycleGoal()`, `cycleWidth()`, `cycleFont()`.
  - `focus.ts`: adds `focusHandler(t: FocusTarget, fn: (caret: Caret) => void)`.

- [ ] **Step 1: `lib/` enxuto**

`src/lib/types.ts`:

```ts
export type { Prefs, Status } from "../api/types";
export type View = "library" | "editor";
export type Panel = "palette" | "index" | "notes" | "help";
```

Em `src/lib/format.ts`, apagar `uid`, `bookWords` e `allWords` (e o import de `Book`). Manter `wc`, `fmt`, `pad`, `norm`, `plural`, `ago`.

Em `src/lib/cover.ts`, apagar `shrinkImage`, `COVER_W`, `COVER_H` (a capa agora é processada no Rust).

Em `src/lib/constants.ts`, trocar `import type { Prefs, Status } from "./types";` por `import type { Prefs, Status } from "../api/types";`.

Apagar: `src/lib/storage.ts`, `src/data/samples.ts`, `src/store/persistence.ts`, `src/store/ui.ts`.

- [ ] **Step 2: `store/state.ts`**

```ts
import { createStore, produce } from "solid-js/store";
import type { BookMeta, BookSummary, Prefs, SearchHit } from "../api/types";
import { DEFAULT_PREFS } from "../lib/constants";
import type { Panel, View } from "../lib/types";

export interface PromptState {
  label: string;
  value: string;
  submit: (value: string) => void;
}

export interface AppState {
  /** False until the first library listing arrives. */
  ready: boolean;
  library: BookSummary[];
  /** Metadata of the open book (no chapter texts). */
  book: BookMeta | null;
  /** Open book id, or the last opened one (highlighted in the library). */
  curId: string | null;
  view: View;
  prefs: Prefs;
  focus: boolean;
  panel: Panel | null;
  // palette
  q: string;
  pIdx: number;
  confirmDel: boolean;
  hits: SearchHit[];
  prompt: PromptState | null;
  // index
  indexSel: number;
  // bottom bar
  toast: string;
  toastKey: number;
  tripleHint: boolean;
  liveWords: number;
  today: number;
  // library
  libSel: number;
  libQ: string;
  /** id of the book being renamed, or "new" for a new book. */
  renaming: string | null;
  renameVal: string;
  libConfirm: string | null;
}

export const [state, setState] = createStore<AppState>({
  ready: false,
  library: [],
  book: null,
  curId: null,
  view: "library",
  prefs: { ...DEFAULT_PREFS },
  focus: false,
  panel: null,
  q: "",
  pIdx: 0,
  confirmDel: false,
  hits: [],
  prompt: null,
  indexSel: 0,
  toast: "",
  toastKey: 0,
  tripleHint: false,
  liveWords: 0,
  today: 0,
  libSel: 0,
  libQ: "",
  renaming: null,
  renameVal: "",
  libConfirm: null,
});

/** Values outside the store: they never need to re-render anything. */
export const session = {
  /** id reserved for the book being created (only picks the cover tone). */
  newId: "",
};

/** Mutates the open book in place; no-op when none is open. */
export function editBook(fn: (book: BookMeta) => void) {
  setState(
    produce((s) => {
      if (s.book) fn(s.book);
    }),
  );
}
```

- [ ] **Step 3: Seletores**

`src/store/selectors/library.ts`:

```ts
import { norm } from "../../lib/format";
import { state } from "../state";

export const sortedLibrary = () => state.library.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

/** Books shown in the library: most recent first, filtered by the query. */
export const libList = () => {
  const q = norm(state.libQ.trim());
  const list = sortedLibrary();
  return q ? list.filter((b) => norm(b.title).includes(q)) : list;
};

export const libSelIndex = (list = libList()) => Math.min(state.libSel, Math.max(0, list.length - 1));
```

`src/store/selectors/book.ts`:

```ts
import type { ChapterMeta } from "../../api/types";
import { fmt, plural } from "../../lib/format";
import { state } from "../state";

export const currentChapter = (): ChapterMeta | undefined => state.book?.chapters[state.book.cur];

/** Book total using the live count for the open chapter. */
export const bookWordsLive = () => {
  const b = state.book;
  if (!b) return 0;
  return b.chapters.reduce((a, c, i) => a + (i === b.cur ? state.liveWords : c.words), 0);
};

/** "3 capítulos · 1.234 na obra" label. */
export const bookLabel = () =>
  plural(state.book?.chapters.length ?? 0, "capítulo", "capítulos") + " · " + fmt(bookWordsLive()) + " na obra";

/** Daily progress: saved total from Rust plus unsaved typing in the open chapter. */
export const todayLive = () => Math.max(0, state.today + state.liveWords - (currentChapter()?.words ?? 0));
```

- [ ] **Step 4: Foco com handlers**

Em `src/store/focus.ts`, adicionar abaixo de `const refs…`:

```ts
const handlers: Partial<Record<FocusTarget, (caret: Caret) => void>> = {};

/** For targets that are not plain inputs (the rich editor). */
export const focusHandler = (t: FocusTarget, fn: (caret: Caret) => void) => {
  handlers[t] = fn;
};
```

E no início de `flush()`, depois de `if (!p) return;`:

```ts
  const handler = handlers[p.t];
  if (handler) return handler(p.caret);
```

- [ ] **Step 5: Ações de UI e preferências**

`src/store/actions/ui.ts`:

```ts
import type { Panel } from "../../lib/types";
import { focusTarget, type FocusTarget } from "../focus";
import { setState, state } from "../state";

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** Short message in the center of the bottom bar. */
export function flash(msg: string) {
  clearTimeout(toastTimer);
  setState({ toast: msg, toastKey: state.toastKey + 1, tripleHint: false });
  toastTimer = setTimeout(() => setState("toast", ""), 1800);
}

/** Shows a Rust/mock error as a toast. */
export const flashError = (e: unknown) => flash(typeof e === "string" ? e : "Algo deu errado");

export const homeTarget = (): FocusTarget => (state.view === "library" ? "lib" : "body");

/** Closes any panel and returns focus to the main screen. */
export function closePanel() {
  focusTarget(homeTarget());
  if (!state.panel) return;
  setState({ panel: null, q: "", pIdx: 0, confirmDel: false, prompt: null, hits: [] });
}

/** Opens a panel; closes it if already open. */
export function openPanel(name: Panel) {
  if (state.panel === name) return closePanel();
  focusTarget(name, name === "notes" ? "end" : null);
  setState({ panel: name, q: "", pIdx: 0, confirmDel: false, prompt: null, hits: [], indexSel: state.book?.cur ?? 0 });
}

export function toggleFocusMode() {
  const on = !state.focus;
  setState("focus", on);
  flash(on ? "Modo foco" : "Modo foco desligado");
}
```

`src/store/actions/prefs.ts`:

```ts
import * as api from "../../api/prefs";
import type { PrefsPatch } from "../../api/types";
import { FONT_LABEL, GOALS, WIDTH_LABEL } from "../../lib/constants";
import { fmt } from "../../lib/format";
import { setState, state } from "../state";
import { flash, flashError } from "./ui";

export async function loadPrefs() {
  try {
    setState("prefs", await api.getPrefs());
  } catch (e) {
    flashError(e);
  }
}

/** Applies locally at once, then persists in Rust. */
export function updatePrefs(patch: PrefsPatch) {
  setState("prefs", patch);
  api.setPrefs(patch).catch(flashError);
}

export const toggleTheme = () => updatePrefs({ theme: state.prefs.theme === "dark" ? "light" : "dark" });

export function cycleGoal() {
  const goal = GOALS[(GOALS.indexOf(state.prefs.goal) + 1) % GOALS.length];
  updatePrefs({ goal });
  flash("Meta diária: " + fmt(goal) + " palavras");
}

export function cycleWidth() {
  const width = ((state.prefs.width + 1) % 3) as 0 | 1 | 2;
  updatePrefs({ width });
  flash("Largura " + WIDTH_LABEL[width]);
}

export function cycleFont() {
  const font = ((state.prefs.font + 1) % 3) as 0 | 1 | 2;
  updatePrefs({ font });
  flash("Letra " + FONT_LABEL[font]);
}
```

- [ ] **Step 6: Commit (o app ainda não compila; o Task 13 fecha a integração)**

Run: `bun run test`
Expected: PASS (testes não dependem do store).

```bash
git add -A src/store src/lib src/data
git commit -m "refactor(store): split state, selectors, ui and prefs actions for rust backend"
```

---

### Task 12: Store — ações de biblioteca, obra, imagens e salvamento

**Files:**
- Create: `src/store/saving.ts`
- Create: `src/store/actions/library.ts`, `src/store/actions/book.ts`, `src/store/actions/images.ts`, `src/store/actions/chapters.ts`
- Delete: `src/store/library.ts`, `src/store/chapters.ts`

**Interfaces:**
- Consumes: Tasks 9–11.
- Produces:
  - `saving.ts`: `scheduleChapterSave()`, `scheduleChapterPatch(patch: ChapterPatch)`, `scheduleBookPatch(patch: BookPatch)`, `cancelChapterSave()`, `flushAll(): Promise<void>`.
  - `actions/library.ts`: `refreshLibrary()`, `openBook(id, target?)`, `goLibrary()`, `startNew()`, `startRename(id)`, `cancelRename()`, `commitRename()`, `deleteBook(id)`, `restoreSamples()`.
  - `actions/book.ts`: `setBookTitle(title)`, `setBookAuthor(author)`, `setSeparatorText(text)`.
  - `actions/images.ts`: `pickCover(id)`, `clearCover(id)`, `pickBookImage(slot)`, `clearBookImage(slot)`, `insertChapterImage()`.
  - `actions/chapters.ts`: `goChapter(i, caret?)`, `insertChapterAt(at)`, `splitCurrent(before, after)`, `moveChapter(from, dir)`, `cycleStatus()`, `deleteCurrentChapter()`, `copyCurrentChapter()`, `setChapterTitle(t)`, `setChapterNotes(n)`, `openFromIndex(i)`, `onEditorChange()`, `refreshToday()`.

- [ ] **Step 1: Salvamento**

`src/store/saving.ts`:

```ts
import * as bookApi from "../api/book";
import * as chapterApi from "../api/chapter";
import { statsToday } from "../api/prefs";
import type { BookPatch, ChapterPatch } from "../api/types";
import { getDoc } from "../editor/bridge";
import { editBook, setState, state } from "./state";
import { flashError } from "./actions/ui";

const DOC_DELAY = 800;
const META_DELAY = 300;

interface Pending<P> {
  timer: ReturnType<typeof setTimeout>;
  run: () => Promise<unknown>;
  patch?: P;
}

let docSave: Pending<never> | null = null;
let chapterPatch: Pending<ChapterPatch> | null = null;
let bookPatch: Pending<BookPatch> | null = null;

function target() {
  const b = state.book;
  const c = b?.chapters[b.cur];
  return b && c ? { bookId: b.id, chapterId: c.id } : null;
}

async function saveDocNow(bookId: string, chapterId: string) {
  const doc = getDoc();
  if (!doc) return;
  const saved = await chapterApi.saveChapter(bookId, chapterId, doc);
  editBook((b) => {
    const c = b.id === bookId ? b.chapters.find((x) => x.id === chapterId) : undefined;
    if (c) c.words = saved.words;
  });
  setState("today", (await statsToday()).today);
}

/** Debounced save of the open chapter's text. */
export function scheduleChapterSave() {
  const t = target();
  if (!t) return;
  if (docSave) clearTimeout(docSave.timer);
  const run = () => saveDocNow(t.bookId, t.chapterId).catch(flashError);
  docSave = { timer: setTimeout(() => { docSave = null; run(); }, DOC_DELAY), run };
}

export function cancelChapterSave() {
  if (docSave) clearTimeout(docSave.timer);
  docSave = null;
}

/** Debounced title/notes update; successive patches merge. */
export function scheduleChapterPatch(patch: ChapterPatch) {
  const t = target();
  if (!t) return;
  const merged = { ...(chapterPatch?.patch ?? {}), ...patch };
  if (chapterPatch) clearTimeout(chapterPatch.timer);
  const run = () => chapterApi.updateChapter(t.bookId, t.chapterId, merged).catch(flashError);
  chapterPatch = { timer: setTimeout(() => { chapterPatch = null; run(); }, META_DELAY), run, patch: merged };
}

/** Debounced book title/author update. */
export function scheduleBookPatch(patch: BookPatch) {
  const id = state.book?.id;
  if (!id) return;
  const merged = { ...(bookPatch?.patch ?? {}), ...patch };
  if (bookPatch) clearTimeout(bookPatch.timer);
  const run = () => bookApi.updateBook(id, merged).catch(flashError);
  bookPatch = { timer: setTimeout(() => { bookPatch = null; run(); }, META_DELAY), run, patch: merged };
}

/** Runs every pending save now. Call before switching chapter/book or closing. */
export async function flushAll() {
  const pending = [docSave, chapterPatch, bookPatch].filter((p): p is Pending<unknown> => !!p);
  docSave = chapterPatch = bookPatch = null;
  for (const p of pending) clearTimeout(p.timer);
  await Promise.all(pending.map((p) => p.run()));
}
```

- [ ] **Step 2: Ações de biblioteca**

`src/store/actions/library.ts`:

```ts
import { batch } from "solid-js";
import * as bookApi from "../../api/book";
import * as chapterApi from "../../api/chapter";
import * as api from "../../api/library";
import { statsToday } from "../../api/prefs";
import { loadDoc } from "../../editor/bridge";
import { docWords } from "../../lib/doc";
import { focusTarget } from "../focus";
import { flushAll } from "../saving";
import { sortedLibrary } from "../selectors/library";
import { session, setState, state } from "../state";
import { flash, flashError } from "./ui";

export async function refreshLibrary() {
  try {
    const { books, warnings } = await api.listLibrary();
    setState({ library: books, ready: true });
    setState("today", (await statsToday()).today);
    if (warnings.length) flash(warnings.join(" · "));
  } catch (e) {
    setState("ready", true);
    flashError(e);
  }
}

export async function openBook(id: string, target: "title" | "body" = "body") {
  try {
    await flushAll();
    const book = await bookApi.openBook(id);
    const chapter = book.chapters[book.cur];
    const doc = await chapterApi.loadChapter(book.id, chapter.id);
    batch(() => {
      setState({
        book, curId: id, view: "editor", panel: null, q: "", tripleHint: false, focus: false,
        libConfirm: null, renaming: null, liveWords: docWords(doc),
      });
    });
    loadDoc(doc);
    if (target === "title") focusTarget("title", 0);
    else focusTarget("body", "end");
  } catch (e) {
    flashError(e);
  }
}

export async function goLibrary() {
  await flushAll();
  await refreshLibrary();
  const idx = Math.max(0, sortedLibrary().findIndex((b) => b.id === state.curId));
  focusTarget("lib");
  setState({
    view: "library", book: null, panel: null, focus: false, libSel: idx, libQ: "",
    libConfirm: null, renaming: null, tripleHint: false,
  });
}

export function startNew() {
  session.newId = "n" + Date.now().toString(36);
  focusTarget("rename", 0);
  setState({ view: "library", panel: null, renaming: "new", renameVal: "", libConfirm: null });
}

export function startRename(id: string) {
  const b = state.library.find((x) => x.id === id);
  if (!b) return;
  focusTarget("rename", "end");
  setState({ renaming: id, renameVal: b.title, libConfirm: null });
}

export function cancelRename() {
  focusTarget("lib");
  setState({ renaming: null, renameVal: "" });
}

export async function commitRename() {
  const val = state.renameVal.trim();
  const renaming = state.renaming;
  setState({ renaming: null, renameVal: "" });
  try {
    if (renaming === "new") {
      const created = await api.createBook(val || "Obra sem título");
      await refreshLibrary();
      await openBook(created.id, "title");
      flash("Obra criada — escreva o título do capítulo 01");
      return;
    }
    if (!renaming || !val) return cancelRename();
    await api.renameBook(renaming, val);
    await refreshLibrary();
    focusTarget("lib");
    setState("libSel", 0);
    flash("Obra renomeada");
  } catch (e) {
    flashError(e);
  }
}

export async function deleteBook(id: string) {
  const gone = state.library.find((b) => b.id === id);
  try {
    await api.deleteBook(id);
    await refreshLibrary();
    focusTarget("lib");
    setState({
      curId: state.curId === id ? null : state.curId,
      libConfirm: null,
      libSel: Math.max(0, Math.min(state.libSel, state.library.length - 1)),
    });
    flash('"' + (gone ? gone.title : "Obra") + '" excluída');
  } catch (e) {
    flashError(e);
  }
}

export async function restoreSamples() {
  try {
    const { books } = await api.restoreSamples();
    focusTarget("lib");
    setState({ library: books, libSel: 0 });
    flash("Exemplos restaurados");
  } catch (e) {
    flashError(e);
  }
}
```

- [ ] **Step 3: Ações da obra e imagens**

`src/store/actions/book.ts`:

```ts
import * as api from "../../api/book";
import { scheduleBookPatch } from "../saving";
import { editBook, setState, state } from "../state";
import { flash, flashError } from "./ui";

export function setBookTitle(title: string) {
  editBook((b) => (b.title = title));
  scheduleBookPatch({ title });
}

export function setBookAuthor(author: string) {
  editBook((b) => (b.author = author));
  scheduleBookPatch({ author });
  flash(author ? "Autor: " + author : "Autor removido");
}

export async function setSeparatorText(text: string) {
  const id = state.book?.id;
  if (!id) return;
  try {
    setState("book", await api.updateBook(id, { separatorText: text || "* * *" }));
    flash("Separador: " + (text || "* * *"));
  } catch (e) {
    flashError(e);
  }
}
```

`src/store/actions/images.ts`:

```ts
import * as api from "../../api/book";
import type { ImageSlot } from "../../api/types";
import { insertImage } from "../../editor/bridge";
import { refreshLibrary } from "./library";
import { setState, state } from "../state";
import { flash, flashError } from "./ui";

const LABEL: Record<ImageSlot, string> = { cover: "Capa", header: "Cabeçalho", footer: "Rodapé", separator: "Separador" };

/** Library: pick a cover for any book (Rust opens the dialog and crops). */
export async function pickCover(id: string) {
  try {
    if (await api.pickBookImage(id, "cover")) {
      await refreshLibrary();
      flash("Capa atualizada");
    }
  } catch (e) {
    flashError(e);
  }
}

export async function clearCover(id: string) {
  try {
    await api.clearBookImage(id, "cover");
    await refreshLibrary();
    flash("Capa removida — volta a letra");
  } catch (e) {
    flashError(e);
  }
}

/** Editor: image settings of the open book. */
export async function pickBookImage(slot: ImageSlot) {
  const id = state.book?.id;
  if (!id) return;
  try {
    const meta = await api.pickBookImage(id, slot);
    if (meta) {
      setState("book", meta);
      flash(LABEL[slot] + " atualizado");
    }
  } catch (e) {
    flashError(e);
  }
}

export async function clearBookImage(slot: ImageSlot) {
  const id = state.book?.id;
  if (!id) return;
  try {
    setState("book", await api.clearBookImage(id, slot));
    flash(LABEL[slot] + " removido");
  } catch (e) {
    flashError(e);
  }
}

export async function insertChapterImage() {
  const id = state.book?.id;
  if (!id) return;
  try {
    const src = await api.insertChapterImage(id);
    if (src) insertImage(src);
  } catch (e) {
    flashError(e);
  }
}
```

- [ ] **Step 4: Ações de capítulo**

`src/store/actions/chapters.ts`:

```ts
import * as bookApi from "../../api/book";
import * as api from "../../api/chapter";
import { statsToday } from "../../api/prefs";
import type { BookMeta, DocJSON } from "../../api/types";
import { liveText, loadDoc } from "../../editor/bridge";
import { STATUS, STATUS_LABEL } from "../../lib/constants";
import { docWords } from "../../lib/doc";
import { pad, wc } from "../../lib/format";
import { focusTarget, type Caret } from "../focus";
import { cancelChapterSave, flushAll, scheduleChapterPatch, scheduleChapterSave } from "../saving";
import { currentChapter } from "../selectors/book";
import { editBook, setState, state } from "../state";
import { flash, flashError } from "./ui";

/** Where focus lands after showing a chapter: the title, or a caret in the text. */
type Target = Caret | "title";

export async function refreshToday() {
  setState("today", (await statsToday()).today);
}

/** Applies new book metadata and loads its current chapter into the editor. */
async function showCurrent(meta: BookMeta, target: Target) {
  const chapter = meta.chapters[meta.cur];
  const doc = await api.loadChapter(meta.id, chapter.id);
  setState({ book: meta, tripleHint: false, liveWords: docWords(doc) });
  loadDoc(doc);
  if (target === "title") focusTarget("title", 0);
  else focusTarget("body", target);
}

async function run(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    flashError(e);
  }
}

export function goChapter(i: number, caret: Target = "end") {
  const b = state.book;
  if (!b) return;
  if (i < 0 || i >= b.chapters.length) {
    flash(i < 0 ? "Este é o primeiro capítulo" : "Este é o último capítulo");
    return;
  }
  return run(async () => {
    await flushAll();
    const meta = await bookApi.updateBook(b.id, { cur: i });
    await showCurrent(meta, caret);
  });
}

export function insertChapterAt(at: number) {
  const b = state.book;
  if (!b) return;
  return run(async () => {
    await flushAll();
    await showCurrent(await api.insertChapter(b.id, at), "title");
    flash("Capítulo " + pad(at + 1) + " criado");
  });
}

/** Enter ×3 from the editor. */
export function splitCurrent(before: DocJSON, after: DocJSON) {
  const b = state.book;
  const c = currentChapter();
  if (!b || !c) return;
  cancelChapterSave();
  return run(async () => {
    await flushAll();
    const meta = await api.splitChapter(b.id, c.id, before, after);
    setState({ book: meta, tripleHint: false, liveWords: docWords(after) });
    loadDoc(after);
    focusTarget("title", 0);
    await refreshToday();
    flash("Capítulo " + pad(meta.cur + 1) + " criado" + (after.content.length ? " — o texto seguinte foi junto" : ""));
  });
}

/** Swaps chapter `from` with its neighbor. Resolves to the new index, or null. */
export async function moveChapter(from: number, dir: -1 | 1): Promise<number | null> {
  const b = state.book;
  const to = from + dir;
  if (!b || to < 0 || to >= b.chapters.length) return null;
  try {
    await flushAll();
    setState("book", await api.moveChapter(b.id, from, to));
    flash("Movido para a posição " + pad(to + 1));
    return to;
  } catch (e) {
    flashError(e);
    return null;
  }
}

export function cycleStatus() {
  const b = state.book;
  const c = currentChapter();
  if (!b || !c) return;
  const next = STATUS[(STATUS.indexOf(c.status) + 1) % STATUS.length];
  editBook((bk) => (bk.chapters[bk.cur].status = next));
  api.updateChapter(b.id, c.id, { status: next }).catch(flashError);
  flash("Status: " + STATUS_LABEL[next]);
}

export function deleteCurrentChapter() {
  const b = state.book;
  const c = currentChapter();
  if (!b || !c) return;
  if (b.chapters.length === 1) return flash("A obra precisa de pelo menos um capítulo");
  const gone = b.cur;
  cancelChapterSave();
  return run(async () => {
    await flushAll();
    await showCurrent(await api.deleteChapter(b.id, c.id), "end");
    await refreshToday();
    flash("Capítulo " + pad(gone + 1) + " excluído");
  });
}

export async function copyCurrentChapter() {
  const b = state.book;
  const c = currentChapter();
  if (!b || !c) return;
  try {
    await flushAll();
    await navigator.clipboard.writeText(await api.chapterMarkdown(b.id, c.id));
    flash("Capítulo copiado");
  } catch {
    flash("Não foi possível copiar aqui");
  }
}

export function setChapterTitle(title: string) {
  editBook((b) => (b.chapters[b.cur].title = title));
  scheduleChapterPatch({ title });
}

export function setChapterNotes(notes: string) {
  editBook((b) => (b.chapters[b.cur].notes = notes));
  scheduleChapterPatch({ notes });
}

export function openFromIndex(i: number) {
  setState("panel", null);
  return goChapter(i);
}

/** Called by the editor on every change: live count + debounced save. */
export function onEditorChange() {
  setState("liveWords", wc(liveText()));
  scheduleChapterSave();
}
```

- [ ] **Step 5: Commit**

```bash
git add -A src/store
git commit -m "feat(store): library, book, image and chapter actions backed by the api"
```

---

### Task 13: Teclado, paleta e integração dos componentes

**Files:**
- Create: `src/store/keys/global.ts`, `src/store/keys/library.ts`, `src/store/keys/index.ts`, `src/store/keys/palette.ts`, `src/store/keys/fields.ts`
- Create: `src/store/commands/palette.ts`, `src/store/commands/prompt.ts`
- Create: `src/components/editor/RichEditor.tsx`, `src/components/editor/BookImage.tsx`
- Delete: `src/store/keyboard.ts`, `src/store/commands.ts`, `src/components/editor/ChapterBody.tsx`, `src/components/library/CoverFileInput.tsx`
- Modify: `src/App.tsx`, `src/components/chrome/{TopBar,BottomBar,GoalProgress}.tsx`, `src/components/editor/{Editor,ChapterLabel,ChapterTitle}.tsx`, `src/components/library/{Library,LibraryHeader,BookTile,RenameInput,CoverArt}.tsx`, `src/components/panels/{ChapterIndex,CommandPalette,NotesPanel}.tsx`, `src/data/shortcuts.ts`, `src/styles/global.css`

**Interfaces:**
- Consumes: Tasks 9–12.
- Produces: app completo rodando no navegador com o mock; `promptFor(label, initial, submit)` em `commands/prompt.ts`.

- [ ] **Step 1: Handlers de teclado**

`src/store/keys/global.ts`:

```ts
import { cycleStatus, goChapter, moveChapter } from "../actions/chapters";
import { goLibrary } from "../actions/library";
import { toggleTheme } from "../actions/prefs";
import { closePanel, openPanel, toggleFocusMode } from "../actions/ui";
import { state } from "../state";

/**
 * Global shortcuts. Lives on `window`, so it runs after field/panel handlers,
 * which can call stopPropagation to keep a key for themselves.
 */
export function rootKey(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey;
  const k = (e.key || "").toLowerCase();
  const code = e.code || "";
  const ed = state.view === "editor";
  const cur = state.book?.cur ?? 0;
  let handled = true;

  if (mod && (k === "k" || code === "KeyK")) openPanel("palette");
  else if (mod && (k === "j" || code === "KeyJ")) toggleTheme();
  else if (mod && (k === "/" || k === "?" || code === "Slash" || code === "IntlRo" || code === "NumpadDivide")) openPanel("help");
  else if (ed && mod && (k === "o" || code === "KeyO")) goLibrary();
  else if (ed && mod && (k === "e" || code === "KeyE")) openPanel("index");
  else if (ed && mod && (k === "." || code === "Period")) toggleFocusMode();
  else if (ed && mod && (k === ";" || code === "Semicolon")) openPanel("notes");
  else if (ed && e.altKey && !mod && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    const dir = e.key === "ArrowUp" ? -1 : 1;
    if (e.shiftKey) moveChapter(cur, dir);
    else goChapter(cur + dir);
  } else if (ed && e.altKey && !mod && code === "KeyS") cycleStatus();
  else if (e.key === "Escape") closePanel();
  else handled = false;

  if (handled) {
    e.preventDefault();
    e.stopPropagation();
  }
}
```

`src/store/keys/library.ts`:

```ts
import { COLS } from "../../lib/constants";
import { clearCover, pickCover } from "../actions/images";
import { cancelRename, commitRename, deleteBook, openBook, startNew, startRename } from "../actions/library";
import { focusTarget } from "../focus";
import { libList, libSelIndex } from "../selectors/library";
import { setState, state } from "../state";

const is = (e: KeyboardEvent, letter: string) => e.code === "Key" + letter.toUpperCase() || e.key.toLowerCase() === letter;

/** Book grid keys (only when the grid itself has focus). */
export function libKey(e: KeyboardEvent, gridEl: HTMLElement) {
  if (e.target !== gridEl) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const list = libList();
  const n = list.length;
  const sel = libSelIndex(list);
  const cur = list[sel];
  const k = e.key;
  const isDel = k === "Delete" || k === "Backspace";
  if (!isDel && state.libConfirm && k !== "Shift") setState("libConfirm", null);

  const step = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS } as Record<string, number>)[k];
  if (step) {
    e.preventDefault();
    if (!n) return;
    const next = sel + step;
    if (next >= 0 && next < n) setState("libSel", next);
    else if (step === COLS && Math.floor(sel / COLS) < Math.floor((n - 1) / COLS)) setState("libSel", n - 1);
  } else if (is(e, "c") && cur) {
    e.preventDefault();
    if (!e.shiftKey) pickCover(cur.id);
    else if (cur.cover) clearCover(cur.id);
  } else if (k === "Enter") {
    e.preventDefault();
    if (cur) openBook(cur.id);
  } else if (is(e, "n")) {
    e.preventDefault();
    startNew();
  } else if (is(e, "r") && cur) {
    e.preventDefault();
    startRename(cur.id);
  } else if (isDel && cur) {
    e.preventDefault();
    if (state.libConfirm === cur.id) deleteBook(cur.id);
    else setState("libConfirm", cur.id);
  } else if (k === "/") {
    e.preventDefault();
    focusTarget("libq", "end");
  } else if (k === "Escape" && (state.libConfirm || state.libQ)) {
    e.preventDefault();
    e.stopPropagation();
    setState({ libConfirm: null, libQ: "" });
  }
}

export function libQKey(e: KeyboardEvent) {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    focusTarget("lib");
  } else if (e.key === "Enter") {
    e.preventDefault();
    const list = libList();
    const b = list[libSelIndex(list)];
    if (b) openBook(b.id);
  } else if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    focusTarget("lib");
    setState({ libQ: "", libSel: 0 });
  }
}

export function renameKey(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    commitRename();
  } else if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    cancelRename();
  }
}
```

`src/store/keys/index.ts`:

```ts
import { moveChapter, openFromIndex } from "../actions/chapters";
import { setState, state } from "../state";

/** Chapter drawer: arrows navigate, Alt+arrows reorder, Enter opens. */
export async function indexKey(e: KeyboardEvent) {
  const n = state.book?.chapters.length ?? 0;
  const sel = state.indexSel;
  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    e.preventDefault();
    e.stopPropagation();
    const dir = e.key === "ArrowUp" ? -1 : 1;
    if (e.altKey) {
      const to = await moveChapter(sel, dir);
      if (to != null) setState("indexSel", to);
    } else setState("indexSel", Math.max(0, Math.min(n - 1, sel + dir)));
  } else if (e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    openFromIndex(sel);
  }
}
```

`src/store/keys/fields.ts`:

```ts
import { focusTarget } from "../focus";

/** Book name input in the top bar: Enter/↓ go to the chapter title. */
export function bookTitleKey(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === "ArrowDown") {
    e.preventDefault();
    focusTarget("title", "end");
  }
}

/** Chapter title: Enter/↓ go to the text. */
export function titleKey(e: KeyboardEvent) {
  if (e.key === "Enter" || (e.key === "ArrowDown" && !e.altKey)) {
    e.preventDefault();
    focusTarget("body", 0);
  }
}
```

`src/store/keys/palette.ts`:

```ts
import { closePanel } from "../actions/ui";
import { runCommand, type Command } from "../commands/palette";
import { setState, state } from "../state";

export function paletteKey(e: KeyboardEvent, items: Command[]) {
  if (state.prompt) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const { submit, value } = state.prompt;
      closePanel();
      submit(value.trim());
    }
    return;
  }
  const n = items.length;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    e.stopPropagation();
    if (!n) return;
    const d = e.key === "ArrowDown" ? 1 : -1;
    setState("pIdx", (state.pIdx + d + n) % n);
  } else if (e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    const it = items[Math.min(state.pIdx, n - 1)];
    if (it) runCommand(it);
  }
}
```

- [ ] **Step 2: Comandos da paleta e modo campo**

`src/store/commands/prompt.ts`:

```ts
import { focusTarget } from "../focus";
import { setState } from "../state";

/** Turns the open palette into a single text field; Enter submits, Esc cancels. */
export function promptFor(label: string, initial: string, submit: (value: string) => void) {
  focusTarget("palette", "end");
  setState({ panel: "palette", prompt: { label, value: initial, submit }, q: "" });
}
```

`src/store/commands/palette.ts`:

```ts
import { insertSeparator } from "../../editor/bridge";
import { FONT_LABEL, STATUS_LABEL, WIDTH_LABEL } from "../../lib/constants";
import { fmt, norm, pad } from "../../lib/format";
import { setBookAuthor, setSeparatorText } from "../actions/book";
import {
  copyCurrentChapter, cycleStatus, deleteCurrentChapter, goChapter, insertChapterAt, moveChapter,
} from "../actions/chapters";
import { clearBookImage, clearCover, insertChapterImage, pickBookImage, pickCover } from "../actions/images";
import { goLibrary, openBook, restoreSamples, startNew, startRename } from "../actions/library";
import { cycleFont, cycleGoal, cycleWidth, toggleTheme } from "../actions/prefs";
import { homeTarget, openPanel } from "../actions/ui";
import { focusTarget } from "../focus";
import { currentChapter } from "../selectors/book";
import { libList, libSelIndex } from "../selectors/library";
import { setState, state } from "../state";
import { promptFor } from "./prompt";

export interface Command {
  /** Short left label (chapter number, "obra"). */
  kind?: string;
  label: string;
  hint: string;
  danger?: boolean;
  /** Keeps the palette open when run. */
  keep?: boolean;
  act: () => void;
}

function commonCommands(): Command[] {
  return [
    { label: state.prefs.theme === "dark" ? "Tema claro" : "Tema escuro", hint: "Ctrl J", act: toggleTheme },
    { label: "Atalhos", hint: "Ctrl /", act: () => openPanel("help") },
  ];
}

function libraryCommands(): Command[] {
  const list = libList();
  const cur = list[libSelIndex(list)];
  const out: Command[] = [{ label: "Nova obra", hint: "N", act: startNew }];
  if (cur) {
    out.push({ label: 'Renomear "' + cur.title + '"', hint: "R", act: () => startRename(cur.id) });
    out.push({ label: (cur.cover ? 'Trocar capa de "' : 'Escolher capa para "') + cur.title + '"', hint: "C", act: () => pickCover(cur.id) });
    if (cur.cover) out.push({ label: "Remover capa (volta a letra)", hint: "Shift C", act: () => clearCover(cur.id) });
    out.push({
      label: 'Excluir "' + cur.title + '"', hint: "Del", danger: true,
      act: () => { focusTarget("lib"); setState("libConfirm", cur.id); },
    });
  }
  return [...out, ...commonCommands(), { label: "Restaurar obras de exemplo", hint: "", act: restoreSamples }];
}

function bookSettingsCommands(): Command[] {
  const b = state.book!;
  const sep = b.separator;
  return [
    { label: "Autor da obra" + (b.author ? ": " + b.author : "…"), hint: "", keep: true, act: () => promptFor("Autor", b.author, setBookAuthor) },
    {
      label: "Separador: texto" + (sep.type === "text" ? " (" + sep.text + ")" : "…"), hint: "", keep: true,
      act: () => promptFor("Separador", sep.type === "text" ? sep.text : "* * *", setSeparatorText),
    },
    { label: "Separador: imagem…", hint: "", act: () => pickBookImage("separator") },
    { label: "Cabeçalho: escolher imagem", hint: "", act: () => pickBookImage("header") },
    ...(b.header ? [{ label: "Cabeçalho: remover", hint: "", act: () => clearBookImage("header") }] : []),
    { label: "Rodapé: escolher imagem", hint: "", act: () => pickBookImage("footer") },
    ...(b.footer ? [{ label: "Rodapé: remover", hint: "", act: () => clearBookImage("footer") }] : []),
    { label: "Inserir imagem no capítulo", hint: "", act: insertChapterImage },
    { label: "Inserir separador", hint: "Ctrl Enter", act: insertSeparator },
    { label: "Capa da obra", hint: "", act: () => pickCover(b.id) },
  ];
}

function editorCommands(): Command[] {
  const b = state.book;
  const c = currentChapter();
  if (!b || !c) return commonCommands();
  const cur = b.cur;
  const list: Command[] = [
    { label: "Novo capítulo", hint: "Enter ×3", act: () => insertChapterAt(cur + 1) },
    { label: "Voltar às obras", hint: "Ctrl O", act: goLibrary },
    { label: "Índice de capítulos", hint: "Ctrl E", act: () => openPanel("index") },
    { label: "Notas do capítulo", hint: "Ctrl ;", act: () => openPanel("notes") },
    { label: state.focus ? "Sair do modo foco" : "Modo foco", hint: "Ctrl .", act: () => setState("focus", !state.focus) },
    { label: "Mudar status  (" + STATUS_LABEL[c.status] + ")", hint: "Alt S", act: cycleStatus },
    { label: "Capítulo anterior", hint: "Alt ↑", act: () => goChapter(cur - 1) },
    { label: "Próximo capítulo", hint: "Alt ↓", act: () => goChapter(cur + 1) },
    { label: "Mover capítulo para cima", hint: "Alt Shift ↑", act: () => moveChapter(cur, -1) },
    { label: "Mover capítulo para baixo", hint: "Alt Shift ↓", act: () => moveChapter(cur, 1) },
    { label: "Copiar capítulo", hint: "", act: copyCurrentChapter },
    { label: "Meta diária: " + fmt(state.prefs.goal) + " palavras", hint: "", act: cycleGoal },
    { label: "Largura do texto: " + WIDTH_LABEL[state.prefs.width], hint: "", act: cycleWidth },
    { label: "Tamanho da letra: " + FONT_LABEL[state.prefs.font], hint: "", act: cycleFont },
    { label: "Renomear obra", hint: "", act: () => focusTarget("book", "end") },
    ...bookSettingsCommands(),
    ...commonCommands(),
  ];
  list.push(
    state.confirmDel
      ? { label: "Confirmar: excluir o capítulo " + pad(cur + 1) + "?", hint: "Enter", danger: true, act: deleteCurrentChapter }
      : { label: "Excluir capítulo", hint: "", danger: true, keep: true, act: () => setState("confirmDel", true) },
  );
  return list;
}

/** Palette items: Rust search hits, matching books, then commands. */
export function paletteItems(): Command[] {
  const q = norm(state.q.trim());
  let out: Command[] = [];
  const book = state.book;
  if (q && state.view === "editor" && book) {
    for (const hit of state.hits) {
      const c = book.chapters[hit.index];
      if (!c) continue;
      out.push({ kind: pad(hit.index + 1), label: c.title || "Sem título", hint: fmt(c.words) + " pal.", act: () => goChapter(hit.index) });
    }
  }
  if (q) {
    for (const b of state.library) {
      if (b.id !== state.curId && norm(b.title).includes(q)) {
        const id = b.id;
        out.push({ kind: "obra", label: b.title, hint: "", act: () => openBook(id) });
      }
    }
  }
  const cmds = state.view === "library" ? libraryCommands() : editorCommands();
  for (const c of cmds) if (!q || norm(c.label).includes(q)) out.push(c);
  if (q) out = out.slice(0, 9);
  return out;
}

export function runCommand(cmd: Command) {
  if (cmd.keep) return cmd.act();
  focusTarget(homeTarget());
  setState({ panel: null, q: "", pIdx: 0, confirmDel: false, hits: [] });
  cmd.act();
}
```

- [ ] **Step 3: Componentes novos**

`src/components/editor/RichEditor.tsx`:

```tsx
import { onCleanup, onMount } from "solid-js";
import { setEditor, focusEditor } from "../../editor/bridge";
import { createWriterEditor } from "../../editor/createEditor";
import type { SeparatorView } from "../../editor/separator";
import { bookAsset } from "../../lib/assets";
import { onEditorChange, splitCurrent } from "../../store/actions/chapters";
import { focusHandler, focusTarget } from "../../store/focus";
import { setState, state } from "../../store/state";

/** Chapter text (TipTap). The document lives only here, never in the store. */
export function RichEditor() {
  let host!: HTMLDivElement;

  const separator = (): SeparatorView => {
    const b = state.book;
    const s = b?.separator;
    if (!b || !s || s.type === "text") return { kind: "text", text: s?.type === "text" ? s.text : "* * *" };
    return { kind: "image", src: bookAsset(b.dir, s.image, b.updatedAt) };
  };
  const resolveImage = (src: string) => (state.book ? bookAsset(state.book.dir, src, 0) : null);

  onMount(() => {
    const editor = createWriterEditor({
      element: host,
      separator,
      resolveImage,
      onChange: onEditorChange,
      onSplit: splitCurrent,
      onHint: (show) => setState("tripleHint", show && !state.toast),
      onExitTop: () => focusTarget("title", "end"),
    });
    setEditor(editor);
    focusHandler("body", focusEditor);
    onCleanup(() => {
      setEditor(null);
      editor.destroy();
    });
  });

  return <div ref={host} class="ed-host" />;
}
```

`src/components/editor/BookImage.tsx`:

```tsx
import { Show } from "solid-js";
import { bookAsset } from "../../lib/assets";
import { state } from "../../store/state";

/** Header or footer image of the open book, outside the editable text. */
export function BookImage(props: { slot: "header" | "footer" }) {
  const src = () => {
    const b = state.book;
    return b ? bookAsset(b.dir, b[props.slot], b.updatedAt) : null;
  };
  return (
    <Show when={src()}>
      {(url) => <img class={"book-img book-" + props.slot} src={url()} alt="" />}
    </Show>
  );
}
```

- [ ] **Step 4: Adaptar componentes existentes**

Aplicar exatamente estas mudanças:

1. `src/components/editor/Editor.tsx`:

```tsx
import { focusTarget } from "../../store/focus";
import { BookImage } from "./BookImage";
import { ChapterLabel } from "./ChapterLabel";
import { ChapterTitle } from "./ChapterTitle";
import { RichEditor } from "./RichEditor";

/** Central writing column. Clicking outside the text refocuses it. */
export function Editor() {
  return (
    <div
      class="absolute inset-x-0 top-16 bottom-16 flex justify-center"
      onClick={(e) => e.target === e.currentTarget && focusTarget("body")}
    >
      <div class="col flex h-full flex-col gap-3.5 pt-16">
        <ChapterLabel />
        <div class="ed-scroll">
          <BookImage slot="header" />
          <ChapterTitle />
          <div class="h-[22px] shrink-0" />
          <RichEditor />
          <BookImage slot="footer" />
        </div>
      </div>
    </div>
  );
}
```
2. `src/components/editor/ChapterLabel.tsx` — `currentBook()?.cur` → `state.book?.cur`; `currentChapter` vem de `../../store/selectors/book`.
3. `src/components/editor/ChapterTitle.tsx` — `value={currentChapter()?.title ?? ""}`, `onInput={(e) => setChapterTitle(e.currentTarget.value)}`, `onKeyDown={titleKey}` de `../../store/keys/fields`.
4. `src/components/chrome/TopBar.tsx` — `value={state.book?.title ?? ""}`, `onInput={(e) => setBookTitle(e.currentTarget.value)}` de `actions/book`, `bookTitleKey` de `keys/fields`, `goLibrary` de `actions/library`.
5. `src/components/chrome/BottomBar.tsx` — `plural(state.liveWords, "palavra", "palavras")`; `bookLabel` de `selectors/book`; `openPanel` de `actions/ui`.
6. `src/components/chrome/GoalProgress.tsx`:

```tsx
import { fmt } from "../../lib/format";
import { todayLive } from "../../store/selectors/book";
import { state } from "../../store/state";

/** Daily goal: words written this session across all books. */
export function GoalProgress() {
  const pct = () => Math.min(100, Math.round((todayLive() / state.prefs.goal) * 100));
  return (
    <>
      <span>
        {fmt(todayLive())} de {fmt(state.prefs.goal)} hoje
      </span>
      <div class="h-[3px] w-[120px] overflow-hidden rounded-[3px] bg-faint">
        <div class="h-[3px] bg-accent transition-[width] duration-400" style={{ width: pct() + "%" }} />
      </div>
    </>
  );
}
```

7. `src/components/library/BookTile.tsx`:

```tsx
import { Show } from "solid-js";
import type { BookSummary } from "../../api/types";
import { fileAsset } from "../../lib/assets";
import { ago, fmt } from "../../lib/format";
import { openBook } from "../../store/actions/library";
import { state } from "../../store/state";
import { CoverArt } from "./CoverArt";
import { RenameInput } from "./RenameInput";

export function BookTile(props: { book: BookSummary; selected: boolean }) {
  const title = () => props.book.title || "Obra sem título";
  const renaming = () => state.renaming === props.book.id;
  const confirming = () => state.libConfirm === props.book.id;
  const meta = () => {
    const b = props.book;
    return fmt(b.chapters) + " cap. · " + fmt(b.words) + " pal. · " + fmt(b.ready) + (b.ready === 1 ? " pronto" : " prontos");
  };

  return (
    <div class="tile" classList={{ sel: props.selected, cur: props.book.id === state.curId }}>
      <button class="cover-btn" onClick={() => openBook(props.book.id)} aria-label={"Abrir " + title()}>
        <CoverArt id={props.book.id} title={props.book.title} cover={fileAsset(props.book.cover, props.book.updatedAt)} />
      </button>
      <Show when={!renaming()} fallback={<RenameInput label="Novo nome da obra" />}>
        <div class="flex flex-col gap-1.5">
          <div class="tile-title">{title()}</div>
          <Show
            when={confirming()}
            fallback={
              <div class="ui leading-normal">
                {meta()}
                <br />
                editada {ago(props.book.updatedAt)}
              </div>
            }
          >
            <div class="ui warn leading-normal">Del de novo exclui · Esc cancela</div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
```

8. `src/components/library/Library.tsx`:

```tsx
import { createEffect, For, on, Show } from "solid-js";
import { focusRef } from "../../store/focus";
import { libKey } from "../../store/keys/library";
import { libList, libSelIndex } from "../../store/selectors/library";
import { state } from "../../store/state";
import { Kbd } from "../ui/Kbd";
import { BookTile } from "./BookTile";
import { LibraryHeader } from "./LibraryHeader";
import { NewBookTile } from "./NewBookTile";

/** "Suas obras" screen: keyboard-navigable cover grid. */
export function Library() {
  let el!: HTMLDivElement;
  const list = () => libList();
  const sel = () => libSelIndex(list());

  createEffect(
    on(sel, () => el.querySelector(".tile.sel")?.scrollIntoView({ block: "nearest" }), { defer: true }),
  );

  return (
    <div
      class="lib absolute inset-x-0 top-16 bottom-16 flex justify-center"
      tabIndex={-1}
      ref={(e) => {
        el = e;
        focusRef("lib")(e);
      }}
      onKeyDown={(e) => libKey(e, el)}
    >
      <div class="flex h-full w-[1120px] max-w-[calc(100%_-_72px)] flex-col gap-10 pt-12">
        <LibraryHeader />
        <div class="-mx-3 grow overflow-y-auto px-3 pt-3 pb-12 [scrollbar-width:none]">
          <Show when={state.ready} fallback={<div class="ui py-6">Abrindo biblioteca…</div>}>
            <div class="grid grid-cols-6 gap-x-8 gap-y-11">
              <Show when={state.renaming === "new"}>
                <NewBookTile />
              </Show>
              <For each={list()}>{(book, i) => <BookTile book={book} selected={i() === sel() && !state.renaming} />}</For>
            </div>
            <Show when={list().length === 0 && state.renaming !== "new"}>
              <div class="flex flex-col gap-3 py-6">
                <div class="text-xl italic">{state.libQ ? "Nenhuma obra com esse nome." : "Nenhuma obra ainda."}</div>
                <div class="ui hint">
                  Aperte <Kbd>N</Kbd> para começar uma obra nova.
                </div>
              </div>
            </Show>
          </Show>
        </div>
      </div>
    </div>
  );
}
```
9. `src/components/library/LibraryHeader.tsx` — estatística: `plural(state.library.length, "obra", "obras") + " · " + plural(state.library.reduce((a, b) => a + b.words, 0), "palavra escrita", "palavras escritas")`; `libQKey` de `keys/library`.
10. `src/components/library/RenameInput.tsx` — `renameKey` de `keys/library`.
11. `src/components/panels/ChapterIndex.tsx`:

```tsx
import { createEffect, For, on } from "solid-js";
import { fmt, pad } from "../../lib/format";
import { openFromIndex } from "../../store/actions/chapters";
import { focusRef } from "../../store/focus";
import { indexKey } from "../../store/keys/index";
import { bookLabel } from "../../store/selectors/book";
import { state } from "../../store/state";
import { Hint } from "../ui/Hint";
import { Scrim } from "../ui/Scrim";
import { StatusDot } from "../ui/StatusDot";

/** Drawer listing the book's chapters (Ctrl E). */
export function ChapterIndex() {
  let el!: HTMLDivElement;

  createEffect(
    on(
      () => state.indexSel,
      () => el.querySelector(".ix-item.sel")?.scrollIntoView({ block: "nearest" }),
    ),
  );

  return (
    <>
      <Scrim />
      <div
        class="drawer"
        tabIndex={-1}
        ref={(e) => {
          el = e;
          focusRef("index")(e);
        }}
        onKeyDown={indexKey}
      >
        <div class="flex flex-col gap-1.5 px-3">
          <div class="text-xl font-medium">{state.book?.title || "Obra sem título"}</div>
          <div class="ui">{bookLabel()}</div>
        </div>
        <div class="flex grow flex-col gap-0.5 overflow-y-auto [scrollbar-width:none]">
          <For each={state.book?.chapters ?? []}>
            {(c, i) => (
              <button
                class="ix-item"
                classList={{ sel: i() === state.indexSel, cur: i() === state.book?.cur }}
                onClick={() => openFromIndex(i())}
              >
                <span class="ui">{pad(i() + 1)}</span>
                <span class="ix-t">{c.title || "Sem título"}</span>
                <span class="ui">{fmt(i() === state.book?.cur ? state.liveWords : c.words)}</span>
                <StatusDot status={c.status} />
              </button>
            )}
          </For>
        </div>
        <div class="ui flex flex-wrap gap-x-3.5 gap-y-2.5 px-3 leading-snug">
          <Hint keys="↑↓">navegar</Hint>
          <Hint keys="Enter">abrir</Hint>
          <Hint keys="Alt ↑↓">mover</Hint>
          <Hint keys="Esc">fechar</Hint>
        </div>
      </div>
    </>
  );
}
```
12. `src/components/panels/NotesPanel.tsx` — `currentChapter` de `selectors/book`, `onInput={(e) => setChapterNotes(e.currentTarget.value)}`, rótulo usa `state.book?.cur`.
13. `src/components/panels/CommandPalette.tsx`:

```tsx
import { createEffect, createMemo, For, on, onCleanup, Show } from "solid-js";
import { searchChapters } from "../../api/chapter";
import { paletteItems, runCommand } from "../../store/commands/palette";
import { focusRef } from "../../store/focus";
import { paletteKey } from "../../store/keys/palette";
import { setState, state } from "../../store/state";
import { Kbd } from "../ui/Kbd";
import { Scrim } from "../ui/Scrim";
import { SrLabel } from "../ui/SrLabel";

const SEARCH_DELAY = 150;

/** Command palette (Ctrl K): searches commands, chapters and other books. */
export function CommandPalette() {
  let listEl!: HTMLDivElement;
  const items = createMemo(paletteItems);
  const sel = () => Math.min(state.pIdx, Math.max(0, items().length - 1));

  // Chapter text search runs in Rust, debounced.
  createEffect(
    on(
      () => state.q,
      (q) => {
        const book = state.book;
        if (!q.trim() || !book || state.view !== "editor") return setState("hits", []);
        const timer = setTimeout(() => {
          searchChapters(book.id, q).then((hits) => state.q === q && setState("hits", hits)).catch(() => setState("hits", []));
        }, SEARCH_DELAY);
        onCleanup(() => clearTimeout(timer));
      },
    ),
  );

  createEffect(
    on([sel, () => state.q], () => listEl?.querySelector(".pal-item.sel")?.scrollIntoView({ block: "nearest" }), { defer: true }),
  );

  const value = () => (state.prompt ? state.prompt.value : state.q);
  const onInput = (v: string) =>
    state.prompt ? setState("prompt", "value", v) : setState({ q: v, pIdx: 0, confirmDel: false });

  return (
    <>
      <Scrim />
      <div class="pal">
        <SrLabel for="pal-in">{state.prompt ? state.prompt.label : "Buscar comando"}</SrLabel>
        <input
          id="pal-in"
          class="pal-in"
          value={value()}
          onInput={(e) => onInput(e.currentTarget.value)}
          onKeyDown={(e) => paletteKey(e, items())}
          ref={focusRef("palette")}
          placeholder={state.prompt ? state.prompt.label + "…" : state.view === "library" ? "Comando ou obra…" : "Comando, capítulo ou obra…"}
          autocomplete="off"
        />
        <Show
          when={!state.prompt}
          fallback={<div class="ui p-3.5">{state.prompt!.label} · Enter confirma · Esc cancela</div>}
        >
          <div class="pal-list" ref={listEl}>
            <For each={items()}>
              {(it, i) => (
                <button
                  class="pal-item"
                  classList={{ sel: i() === sel(), danger: !!it.danger }}
                  onClick={() => runCommand(it)}
                  onMouseEnter={() => state.pIdx !== i() && setState("pIdx", i())}
                >
                  <span>
                    <span class="pal-kind">{it.kind}</span>
                    {it.label}
                  </span>
                  <Show when={it.hint}>
                    <Kbd>{it.hint}</Kbd>
                  </Show>
                </button>
              )}
            </For>
            <Show when={items().length === 0}>
              <div class="ui p-3.5">Nada encontrado.</div>
            </Show>
          </div>
        </Show>
      </div>
    </>
  );
}
```

14. `src/data/shortcuts.ts` — adicionar depois de "Nova linha sem contar": `{ label: "Inserir separador", keys: ["Ctrl", "Enter"] },`.
15. `src/App.tsx`:

```tsx
import { Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { BottomBar } from "./components/chrome/BottomBar";
import { TopBar } from "./components/chrome/TopBar";
import { Editor } from "./components/editor/Editor";
import { Library } from "./components/library/Library";
import { ChapterIndex } from "./components/panels/ChapterIndex";
import { CommandPalette } from "./components/panels/CommandPalette";
import { HelpPanel } from "./components/panels/HelpPanel";
import { NotesPanel } from "./components/panels/NotesPanel";
import { refreshLibrary } from "./store/actions/library";
import { loadPrefs } from "./store/actions/prefs";
import { focusTarget } from "./store/focus";
import { rootKey } from "./store/keys/global";
import { flushAll } from "./store/saving";
import { state } from "./store/state";

export default function App() {
  const onUnload = () => void flushAll();

  onMount(async () => {
    window.addEventListener("keydown", rootKey);
    window.addEventListener("beforeunload", onUnload);
    await Promise.all([loadPrefs(), refreshLibrary()]);
    focusTarget("lib");
  });
  onCleanup(() => {
    window.removeEventListener("keydown", rootKey);
    window.removeEventListener("beforeunload", onUnload);
  });

  const editor = () => state.view === "editor" && !!state.book;

  return (
    <div class={`app ${state.prefs.theme} w${state.prefs.width} f${state.prefs.font}` + (state.focus && editor() ? " focus" : "")}>
      <TopBar />
      <Show when={editor()} fallback={<Library />}>
        <Editor />
      </Show>
      <BottomBar />

      <Switch>
        <Match when={state.panel === "notes" && editor()}>
          <NotesPanel />
        </Match>
        <Match when={state.panel === "index" && editor()}>
          <ChapterIndex />
        </Match>
        <Match when={state.panel === "palette"}>
          <CommandPalette />
        </Match>
        <Match when={state.panel === "help"}>
          <HelpPanel />
        </Match>
      </Switch>
    </div>
  );
}
```

16. `src/styles/global.css` — dentro de `@layer components`, na seção do editor, **substituir** o bloco `.ed-body { … }` e o `::-webkit-scrollbar` dele por:

```css
  .ed-scroll {
    flex-grow: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: none;
    display: flex;
    flex-direction: column;
  }
  .ed-scroll::-webkit-scrollbar {
    width: 0;
  }
  .ed-host {
    flex-grow: 1;
  }
  .ed-body {
    outline: 0;
    padding: 0 0 260px;
    font-size: 20px;
    line-height: 1.8;
    color: var(--ink);
    caret-color: var(--accent);
    white-space: pre-wrap;
  }
  .ed-body p {
    margin: 0 0 1em;
  }
  .ed-body p.is-editor-empty:first-child::before {
    content: attr(data-placeholder);
    color: var(--muted);
    opacity: 0.75;
    float: left;
    height: 0;
    pointer-events: none;
  }
  .sep {
    margin: 0.6em 0 1.6em;
    text-align: center;
    color: var(--muted);
    letter-spacing: 0.3em;
    user-select: none;
  }
  .sep img {
    max-width: 60%;
    max-height: 64px;
    display: inline-block;
  }
  .ProseMirror-selectednode.sep,
  .ProseMirror-selectednode.ed-img {
    outline: 2px solid var(--accent);
    outline-offset: 4px;
    border-radius: 4px;
  }
  .ed-img {
    margin: 0 0 1.4em;
    text-align: center;
  }
  .ed-img img {
    max-width: 100%;
    border-radius: 4px;
  }
  .book-img {
    display: block;
    max-width: 100%;
    max-height: 180px;
    margin: 0 auto;
    object-fit: contain;
  }
  .book-header {
    margin-bottom: 8px;
  }
  .book-footer {
    margin: 24px auto 0;
  }
```

E remover `.ed-body::placeholder` da lista de seletores de placeholder.

- [ ] **Step 5: Typecheck, testes, build**

Run: `./node_modules/.bin/tsc.exe --noEmit -p .` → sem erros.
Run: `bun run test` → PASS.
Run: `bun run build` → sucesso.
Run: `rg -n "store/(library|chapters|commands|keyboard|ui|persistence)\"|lib/storage|data/samples|shrinkImage" src` → nenhum resultado.

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "feat(front): wire rich editor, palette prompts and book images to rust api"
```

---

### Task 14: Testes e2e no navegador (mock)

**Files:**
- Create: `tests/e2e/smoke.mjs`
- Modify: `package.json` (devDependency `playwright-core`, script `e2e`)

**Interfaces:**
- Consumes: app completo (Task 13) servido por `bun run dev`.

- [ ] **Step 1: Dependência e script**

Run: `bun add -d playwright-core`. Em `package.json` → `"e2e": "node tests/e2e/smoke.mjs"`.

- [ ] **Step 2: Escrever o teste**

`tests/e2e/smoke.mjs`:

```js
// Smoke test against `bun run dev` (mock backend). Needs a Chromium-based browser:
// set BROWSER_PATH, e.g. "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe".
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const url = process.env.APP_URL ?? "http://localhost:1420/";
const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const label = () => page.locator(".col .cap").innerText();
const body = () => page.locator("#ch-body").innerText();

await page.goto(url);
await page.waitForSelector(".tile");

// new book → title → body
await page.keyboard.press("n");
await page.keyboard.type("Meu Livro");
await page.keyboard.press("Enter");
await page.waitForSelector("#ch-body");
await page.keyboard.type("Primeiro");
await page.keyboard.press("Enter");
await page.keyboard.type("Linha um.");

// Enter ×3 with text after the cursor
await page.keyboard.press("Enter");
await page.keyboard.type("vai junto");
await page.keyboard.press("Home");
await page.keyboard.press("Enter");
await page.keyboard.press("Enter");
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.querySelector(".col .cap")?.textContent?.includes("02"));
assert.match(await label(), /02/);
assert.equal((await body()).trim(), "vai junto");

// Ctrl Enter inserts a visible separator (focus is on the new chapter's title: Enter goes to the text)
await page.keyboard.press("Enter");
await page.keyboard.press("Control+End");
await page.keyboard.press("Control+Enter");
assert.equal(await page.locator("#ch-body .sep").count(), 1);
assert.equal((await page.locator("#ch-body .sep").innerText()).trim(), "* * *");

// typing then switching before the debounce keeps the text
await page.keyboard.type("depois do separador");
await page.keyboard.press("Alt+ArrowUp");
await page.waitForFunction(() => document.querySelector(".col .cap")?.textContent?.includes("01"));
assert.equal((await body()).trim(), "Linha um.");
await page.keyboard.press("Alt+ArrowDown");
await page.waitForFunction(() => document.querySelector("#ch-body")?.textContent?.includes("depois do separador"));

// separator text via palette prompt updates live
await page.keyboard.press("Control+k");
await page.keyboard.type("separador: texto");
await page.keyboard.press("Enter");
await page.keyboard.press("Control+a");
await page.keyboard.type("~ ~ ~");
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.querySelector("#ch-body .sep")?.textContent === "~ ~ ~");

// chapter search runs through the api
await page.keyboard.press("Control+k");
await page.keyboard.type("linha um");
await page.waitForSelector(".pal-item .pal-kind:text('01')");
await page.keyboard.press("Escape");

// back to library shows the new book first with its word count
await page.keyboard.press("Control+o");
await page.waitForSelector(".tile.sel");
assert.equal(await page.locator(".tile.sel .tile-title").innerText(), "Meu Livro");
assert.match(await page.locator(".tile.sel .ui").first().innerText(), /2 cap\./);

assert.deepEqual(errors, []);
await browser.close();
console.log("e2e ok");
```

- [ ] **Step 3: Rodar**

Em um terminal: `bun run dev`. Em outro: `BROWSER_PATH="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" bun run e2e` (usar **node**, via o script; Playwright com Bun no Windows trava no pipe).
Expected: `e2e ok`.

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock tests/e2e/smoke.mjs
git commit -m "test(e2e): browser smoke test for editor flows on the mock backend"
```

---

### Task 15: Verificação no app desktop

**Files:** nenhum código novo (só correções que a verificação apontar, cada uma com teste).

- [ ] **Step 1: Rodar o app**

Run: `bun run tauri dev`

- [ ] **Step 2: Checklist manual (registrar o resultado de cada item no relatório do task)**

1. Primeira abertura cria `~/Documentos/Scribalis` com 3 pastas de exemplo; cada uma tem `metadata.json`, `imagens/`, `capitulos/*.md`.
2. Criar obra "Teste Ção" → pasta `teste-cao/`; escrever texto, esperar 1 s → o `.md` no disco tem o texto e `metadata.json` tem `words` atualizado.
3. Enter ×3 no meio do texto → novo `.md` com o texto seguinte; ordem correta no `metadata.json`.
4. Ctrl Enter → `***` no `.md` após salvar.
5. Paleta → "Separador: imagem…" → escolher PNG → `imagens/separador.png` existe e o separador aparece como imagem no editor.
6. Cabeçalho e rodapé: escolher imagens → aparecem acima do título e abaixo do texto; "remover" apaga o arquivo.
7. Na biblioteca, C → escolher imagem grande → `imagens/capa.jpg` com 400×600 e capa visível; Shift C volta à letra.
8. "Inserir imagem no capítulo" → imagem aparece no texto; `.md` tem `![](../imagens/<id>.<ext>)`.
9. Tema/meta/largura/fonte persistem após fechar e abrir o app (arquivo `prefs.json` no AppData).
10. Colocar uma pasta `lixo/` sem metadata na raiz → toast "1 pasta ignorada…" ao abrir a biblioteca.
11. Excluir obra (Del ×2) → pasta some do disco.
12. Gerenciador de tarefas: anotar RAM do processo `scribalis.exe` e do WebView2 com uma obra aberta (referência para o objetivo de pouca RAM).

- [ ] **Step 3: Commit das correções (se houver)**

```bash
git add -A
git commit -m "fix: issues found in desktop verification"
```
