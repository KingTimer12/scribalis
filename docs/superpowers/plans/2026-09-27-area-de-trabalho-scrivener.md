# Área de trabalho e importação do Scrivener — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada obra ganha a aba "Área de trabalho" (árvore livre de pastas, textos, imagens e anexos) e um projeto do Scrivener pode ser importado inteiro — escolhendo quais pastas viram capítulos — com a formatação do RTF preservada.

**Architecture:** Rust guarda a árvore em `area/area.json` (títulos, ordem, hierarquia, notas) e os arquivos planos em `area/<id>.md` e `area/arquivos/<id>.<ext>`; todas as operações (criar, mover, excluir, enviar para capítulos) e toda a importação (XML do binder, RTF → `Doc`) rodam no Rust. O webview recebe só a árvore sem conteúdo e o documento aberto; o editor TipTap é reaproveitado com uma chave de documento generalizada (`scope: "chapter" | "area"`).

**Tech Stack:** Rust (serde, quick-xml 0.37 — nova), Tauri 2 (dialog, opener), SolidJS, TipTap 3, vitest, bun.

**Spec:** `docs/superpowers/specs/2026-09-27-area-de-trabalho-scrivener-design.md` (depende de `2026-09-27-formatacao-no-editor-design.md`, já implementado).

## Global Constraints

- Comentários de código sempre em **inglês**; textos de interface em **português**.
- Nada de arquivos Deus; um `mod` Rust por assunto.
- Dados e processamento de dados no Rust (disco, parsing, RTF, XML, árvore); o webview guarda só estado de tela, a árvore sem conteúdo e o documento aberto.
- Todo task termina com um commit; mensagens **sem** `Co-Authored-By` nem qualquer atribuição.
- Comandos: typecheck `./node_modules/.bin/tsc.exe --noEmit -p .`; front `bun run test`; Rust `cd src-tauri && cargo test` (zero warnings do crate).
- Formato em disco: `area/area.json` (`{"version":1,"items":[…]}`), textos `area/<id>.md` (mesmo Markdown dos capítulos), mídia `area/arquivos/<id>.<ext>`. `area/` só existe depois da primeira escrita. Campos desconhecidos do JSON sobrevivem (`#[serde(flatten)] extra`).
- `kind`: `folder` | `text` | `image` | `file`. Imagens: `png`, `jpg`, `jpeg`, `webp`, `gif`; qualquer outra extensão é `file`.
- Mensagens de erro (português): "Item não encontrado", "Não dá para mover uma pasta para dentro dela mesma", "Projeto do Scrivener inválido", "Importar do Scrivener só funciona no app desktop", "Adicionar arquivos só funciona no app desktop".
- Atalhos: Ctrl 1 = Capítulos, Ctrl 2 = Área de trabalho.

## Rulings sobre o spec (decididas no planejamento)

- **Arrastar e soltar na árvore usa eventos de ponteiro, não HTML5 DnD.** No Windows, com o drop de arquivos do Tauri ativo (usado para imagens nos capítulos), `dragover`/`drop` do HTML5 não disparam no webview.
- **Abrir anexo no app padrão é um comando Rust** (`tauri_plugin_opener::OpenerExt::open_path`) em vez de `openPath` no front — evita abrir escopo de caminho na capability.
- **Texto de pasta do Scrivener** (pasta com `content.rtf` não vazio) numa pasta que vai para a área de trabalho vira o **primeiro filho** `text` com o mesmo título. O texto próprio da pasta marcada como "capítulos" (ex.: o Manuscrito) é ignorado; os filhos dela seguem a regra do spec.
- **Documento de texto com filhos** (o Scrivener permite) vira, na área de trabalho, uma pasta com o texto como primeiro filho; numa pasta de capítulos conta como "filho pasta" (capítulo = texto dele + descendentes).
- **Texto sem `content.rtf`** é um documento vazio (o Scrivener não grava arquivo para documentos vazios), não um aviso. Avisos: mídia ausente e erro de leitura de arquivo existente.
- **Notas visíveis:** a sinopse/notas importadas ficam em `notes` do nó; o painel do documento aberto mostra um campo "Notas" editável (salva ao sair do campo).
- **Contagem "hoje":** palavras que entram na obra por importação ou por "Enviar para capítulos" não contam como escritas hoje (`Library::absorb`).
- **Edição de texto na área de trabalho não divide capítulo:** Enter ×3 só existe nos capítulos.

## Review Focus

1. **Projeto do Scrivener real e bagunçado** (títulos com `&amp;`, itens sem arquivo, mídia faltando, RTF com tabelas de fonte/estilo, Unicode `\u` e `\'hh`): importa sem pânico, texto correto, estilo da folha de estilos não vaza para os parágrafos. Testes nas Tasks 3, 4, 5.
2. **Mover pasta para dentro de si mesma ou de um descendente, ou soltar sobre si mesma:** recusado no Rust e ignorado no front. Testes nas Tasks 1 e 7.
3. **Trocar de documento/aba com texto não salvo** (digitou na área de trabalho e apertou Ctrl 1, ou abriu outro nó): o texto vai para o arquivo certo, nunca para o capítulo. Testes na Task 6.
4. **Excluir pasta com arquivos:** os arquivos da subárvore somem do disco só depois do `area.json` gravado. Teste na Task 2.
5. **"Enviar para capítulos" falhando no meio:** o texto fica duplicado, nunca perdido. Teste na Task 2.

---

### Task 1: Modelo da área de trabalho (Rust, funções puras)

**Files:**
- Create: `src-tauri/src/model/workspace.rs`
- Modify: `src-tauri/src/model/mod.rs` (`pub mod workspace;`)

**Interfaces:**
- Produces:
  - `pub const WORKSPACE_VERSION: u32 = 1;`
  - `Workspace { version: u32, items: Vec<Node>, extra: Map<String, Value> }` (`Default` = versão 1, vazio)
  - `Node { id: String, kind: NodeKind, title: String, notes: String, file: Option<String>, children: Vec<Node>, extra: Map<String, Value> }`
  - `NodeKind { Folder, Text, Image, File }` (serde lowercase)
  - `Node::folder(id, title) -> Node`, `Node::leaf(id, kind, title, file) -> Node`
  - `find(items: &[Node], id) -> Option<&Node>`, `find_mut(items: &mut [Node], id) -> Option<&mut Node>`
  - `remove(items: &mut Vec<Node>, id) -> Option<Node>`
  - `insert(items: &mut Vec<Node>, parent: Option<&str>, index: usize, node: Node) -> AppResult<()>` (índice limitado ao tamanho; pai precisa ser pasta)
  - `move_node(items: &mut Vec<Node>, id, parent: Option<&str>, index) -> AppResult<()>` — `index` é a posição na lista do destino **depois** de retirar o nó
  - `subtree_files(node: &Node) -> Vec<String>`
  - `NodeKind::for_extension(ext: &str) -> NodeKind` (Image para as 5 extensões, senão File)

- [ ] **Step 1: Testes que falham** (em `model/workspace.rs`):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn tree() -> Vec<Node> {
        let mut a = Node::folder("a".into(), "Pesquisa");
        a.children = vec![
            Node::leaf("b".into(), NodeKind::Text, "Ana", "b.md"),
            Node::leaf("c".into(), NodeKind::Image, "Mapa", "arquivos/c.png"),
        ];
        let mut d = Node::folder("d".into(), "Lugares");
        d.children = vec![Node::folder("e".into(), "Vael")];
        vec![a, d, Node::leaf("f".into(), NodeKind::File, "Artigo", "arquivos/f.pdf")]
    }

    fn ids(items: &[Node]) -> Vec<&str> {
        items.iter().map(|n| n.id.as_str()).collect()
    }

    #[test]
    fn json_shape_and_unknown_fields_survive() {
        let json = r#"{"version":1,"futuro":true,"items":[
            {"id":"a","kind":"folder","title":"P","notes":"","children":[
                {"id":"b","kind":"text","title":"Ana","notes":"sinopse","file":"b.md","cor":"azul"}]}]}"#;
        let ws: Workspace = serde_json::from_str(json).unwrap();
        assert_eq!(ws.items[0].children[0].notes, "sinopse");
        let back = serde_json::to_value(&ws).unwrap();
        assert_eq!(back["futuro"], true);
        assert_eq!(back["items"][0]["children"][0]["cor"], "azul");
        assert!(back["items"][0].get("file").is_none());
        assert!(back["items"][0]["children"][0].get("children").is_none());
    }

    #[test]
    fn finds_nested_nodes() {
        let t = tree();
        assert_eq!(find(&t, "e").unwrap().title, "Vael");
        assert!(find(&t, "zz").is_none());
    }

    #[test]
    fn insert_into_folder_and_clamps_index() {
        let mut t = tree();
        insert(&mut t, Some("d"), 99, Node::leaf("g".into(), NodeKind::Text, "Nota", "g.md")).unwrap();
        assert_eq!(ids(&find(&t, "d").unwrap().children), vec!["e", "g"]);
        insert(&mut t, None, 0, Node::folder("h".into(), "Topo")).unwrap();
        assert_eq!(t[0].id, "h");
        assert!(insert(&mut t, Some("b"), 0, Node::folder("i".into(), "x")).is_err());
        assert!(insert(&mut t, Some("zz"), 0, Node::folder("j".into(), "x")).is_err());
    }

    #[test]
    fn move_reorders_and_reparents() {
        let mut t = tree();
        move_node(&mut t, "f", Some("a"), 1).unwrap();
        assert_eq!(ids(&find(&t, "a").unwrap().children), vec!["b", "f", "c"]);
        move_node(&mut t, "a", None, 1).unwrap();
        assert_eq!(ids(&t), vec!["d", "a"]);
    }

    #[test]
    fn move_refuses_cycles_and_missing_nodes() {
        let mut t = tree();
        let err = move_node(&mut t, "d", Some("e"), 0).unwrap_err();
        assert_eq!(err.0, "Não dá para mover uma pasta para dentro dela mesma");
        assert!(move_node(&mut t, "d", Some("d"), 0).is_err());
        assert_eq!(move_node(&mut t, "zz", None, 0).unwrap_err().0, "Item não encontrado");
        // Tree untouched after a refused move.
        assert_eq!(ids(&t), vec!["a", "d", "f"]);
    }

    #[test]
    fn remove_returns_subtree_and_lists_its_files() {
        let mut t = tree();
        let a = remove(&mut t, "a").unwrap();
        assert_eq!(subtree_files(&a), vec!["b.md".to_string(), "arquivos/c.png".to_string()]);
        assert_eq!(ids(&t), vec!["d", "f"]);
        assert!(remove(&mut t, "a").is_none());
    }

    #[test]
    fn kind_from_extension() {
        assert_eq!(NodeKind::for_extension("JPG"), NodeKind::Image);
        assert_eq!(NodeKind::for_extension("gif"), NodeKind::Image);
        assert_eq!(NodeKind::for_extension("pdf"), NodeKind::File);
        assert_eq!(NodeKind::for_extension(""), NodeKind::File);
    }
}
```

- [ ] **Step 2: Rodar e ver falhar** — `cd src-tauri && cargo test model::workspace` → não compila.

- [ ] **Step 3: Implementar**

```rust
//! The book's workspace tree (`area/area.json`): folders, texts, images and attachments.
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::error::{AppError, AppResult};

pub const WORKSPACE_VERSION: u32 = 1;
const IMAGE_EXTENSIONS: [&str; 5] = ["png", "jpg", "jpeg", "webp", "gif"];

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Workspace {
    pub version: u32,
    #[serde(default)]
    pub items: Vec<Node>,
    /// Unknown keys survive a read/write cycle.
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Default for Workspace {
    fn default() -> Self {
        Self { version: WORKSPACE_VERSION, items: Vec::new(), extra: Map::new() }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum NodeKind {
    Folder,
    Text,
    Image,
    File,
}

impl NodeKind {
    pub fn for_extension(ext: &str) -> NodeKind {
        if IMAGE_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()) { NodeKind::Image } else { NodeKind::File }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Node {
    pub id: String,
    pub kind: NodeKind,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub notes: String,
    /// Path relative to `area/`; only non-folders have one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<Node>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Node {
    pub fn folder(id: String, title: &str) -> Node {
        Node { id, kind: NodeKind::Folder, title: title.to_string(), notes: String::new(), file: None, children: Vec::new(), extra: Map::new() }
    }
    pub fn leaf(id: String, kind: NodeKind, title: &str, file: &str) -> Node {
        Node { file: Some(file.to_string()), kind, ..Node::folder(id, title) }
    }
}

fn not_found() -> AppError {
    AppError::msg("Item não encontrado")
}

pub fn find<'a>(items: &'a [Node], id: &str) -> Option<&'a Node> {
    items.iter().find_map(|n| if n.id == id { Some(n) } else { find(&n.children, id) })
}

pub fn find_mut<'a>(items: &'a mut [Node], id: &str) -> Option<&'a mut Node> {
    for n in items.iter_mut() {
        if n.id == id {
            return Some(n);
        }
        if let Some(found) = find_mut(&mut n.children, id) {
            return Some(found);
        }
    }
    None
}

pub fn remove(items: &mut Vec<Node>, id: &str) -> Option<Node> {
    if let Some(i) = items.iter().position(|n| n.id == id) {
        return Some(items.remove(i));
    }
    items.iter_mut().find_map(|n| remove(&mut n.children, id))
}

pub fn insert(items: &mut Vec<Node>, parent: Option<&str>, index: usize, node: Node) -> AppResult<()> {
    let list = match parent {
        None => items,
        Some(pid) => {
            let p = find_mut(items, pid).ok_or_else(not_found)?;
            if p.kind != NodeKind::Folder {
                return Err(AppError::msg("Só dá para guardar itens dentro de pastas"));
            }
            &mut p.children
        }
    };
    let at = index.min(list.len());
    list.insert(at, node);
    Ok(())
}

/// Moves `id` under `parent` at `index` (position after taking the node out).
pub fn move_node(items: &mut Vec<Node>, id: &str, parent: Option<&str>, index: usize) -> AppResult<()> {
    let node = find(items, id).ok_or_else(not_found)?;
    if let Some(pid) = parent {
        if pid == id || find(&node.children, pid).is_some() {
            return Err(AppError::msg("Não dá para mover uma pasta para dentro dela mesma"));
        }
        let p = find(items, pid).ok_or_else(not_found)?;
        if p.kind != NodeKind::Folder {
            return Err(AppError::msg("Só dá para guardar itens dentro de pastas"));
        }
    }
    let node = remove(items, id).ok_or_else(not_found)?;
    insert(items, parent, index, node)
}

/// Files of a node and all its descendants.
pub fn subtree_files(node: &Node) -> Vec<String> {
    let mut out: Vec<String> = node.file.iter().cloned().collect();
    for c in &node.children {
        out.extend(subtree_files(c));
    }
    out
}
```

- [ ] **Step 4: Rodar** — `cd src-tauri && cargo test model::workspace` → PASS. (Dead-code warnings são esperados até a Task 2 usar as funções; a Task 2 zera.)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/model
git commit -m "feat(workspace): workspace tree model"
```

---

### Task 2: Área de trabalho no disco, operações e comandos (Rust)

**Files:**
- Modify: `src-tauri/src/storage/paths.rs` (constantes)
- Create: `src-tauri/src/storage/workspace_io.rs`
- Modify: `src-tauri/src/storage/mod.rs`
- Create: `src-tauri/src/ops/workspace.rs`
- Modify: `src-tauri/src/ops/mod.rs`
- Modify: `src-tauri/src/state.rs` (`total_of`, `absorb`)
- Create: `src-tauri/src/commands/workspace.rs`
- Modify: `src-tauri/src/commands/mod.rs`, `src-tauri/src/commands/dialog.rs`, `src-tauri/src/lib.rs` (registrar comandos)

**Interfaces:**
- Consumes: Task 1 (`Workspace`, `Node`, `NodeKind`, `find*`, `insert`, `remove`, `move_node`, `subtree_files`); existentes `write_atomic`, `safe_join`, `markdown::{parse::parse, serialize::serialize}`, `chapter_io::write_chapter`, `metadata_io::write_metadata`, `ChapterEntry::new`, `new_id`, `now_ms`, `doc_words`, `BookMeta::from_meta`.
- Produces (Rust):
  - `paths.rs`: `pub const AREA_DIR: &str = "area"; pub const AREA_FILE: &str = "area.json"; pub const AREA_FILES_DIR: &str = "arquivos";`
  - `workspace_io.rs`: `read_workspace(book_dir) -> AppResult<Workspace>` (sem arquivo = `Workspace::default()`), `write_workspace(book_dir, &Workspace) -> AppResult<()>`, `read_node_doc(book_dir, file) -> AppResult<Doc>` (ausente = vazio), `write_node_doc(book_dir, file, &Doc) -> AppResult<()>`, `copy_into_area(book_dir, src: &Path, id) -> AppResult<(String, NodeKind)>` (retorna `arquivos/<id>.<ext>` e o tipo pela extensão), `remove_area_file(book_dir, rel)` (ausente ok), `area_path(book_dir, rel) -> AppResult<PathBuf>`.
  - `ops/workspace.rs` (todas recebem `dir: &Path` da obra): `tree`, `create(dir, parent, index, kind, title) -> AppResult<Created>`, `rename(dir, id, title)`, `set_notes(dir, id, notes)`, `move_to(dir, id, parent, index)`, `delete(dir, id)`, `load_doc(dir, id) -> Doc`, `save_doc(dir, id, &Doc)`, `import_files(dir, parent, &[PathBuf])`, `to_chapter(dir, meta, id)`, `file_path(dir, id) -> PathBuf`. Mutações retornam `AppResult<Vec<Node>>` (a árvore nova).
  - `Created { id: String, items: Vec<Node> }` (Serialize camelCase).
  - `Library::total_of(&self, id) -> usize`, `Library::absorb(&mut self, words: usize)` (soma à base da sessão).
  - Comandos (nomes exatos): `workspace_tree(book_id)`, `workspace_create(book_id, parent: Option<String>, index: usize, kind: NodeKind, title: String) -> Created`, `workspace_rename(book_id, id, title) -> Vec<Node>`, `workspace_set_notes(book_id, id, notes) -> Vec<Node>`, `workspace_move(book_id, id, parent: Option<String>, index: usize) -> Vec<Node>`, `workspace_delete(book_id, id) -> Vec<Node>`, `workspace_load_doc(book_id, id) -> Doc`, `workspace_save_doc(book_id, id, doc: Doc) -> ()`, `workspace_pick_files(window, book_id, parent: Option<String>) -> Option<Vec<Node>>`, `workspace_to_chapter(book_id, id) -> ToChapter { book: BookMeta, items: Vec<Node> }`, `workspace_open_file(app: AppHandle, book_id, id) -> ()`.
  - `dialog.rs`: `pick_files(window) -> Vec<PathBuf>` (múltiplos, sem filtro).

- [ ] **Step 1: Testes que falham** — em `ops/workspace.rs` (`mod tests`, com `tempfile`):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::markdown::parse::parse;
    use crate::ops::library::create_book;
    use crate::storage::paths::AREA_DIR;

    fn book() -> (tempfile::TempDir, std::path::PathBuf, Metadata) {
        let root = tempfile::tempdir().unwrap();
        let (dir, meta) = create_book(root.path(), "Obra").unwrap();
        (root, dir, meta)
    }

    #[test]
    fn empty_book_has_empty_tree_and_no_area_folder() {
        let (_r, dir, _m) = book();
        assert!(tree(&dir).unwrap().is_empty());
        assert!(!dir.join(AREA_DIR).exists());
    }

    #[test]
    fn create_text_writes_file_and_saves_tree() {
        let (_r, dir, _m) = book();
        let folder = create(&dir, None, 0, NodeKind::Folder, "Pesquisa").unwrap();
        let text = create(&dir, Some(&folder.id), 0, NodeKind::Text, "Ana").unwrap();
        let node = find(&text.items, &text.id).unwrap();
        assert_eq!(node.file.as_deref(), Some(format!("{}.md", text.id).as_str()));
        assert!(dir.join(AREA_DIR).join(node.file.as_ref().unwrap()).exists());
        assert_eq!(tree(&dir).unwrap(), text.items);
        assert!(create(&dir, None, 0, NodeKind::Image, "x").is_err());
    }

    #[test]
    fn save_and_load_text_roundtrip() {
        let (_r, dir, _m) = book();
        let c = create(&dir, None, 0, NodeKind::Text, "Ana").unwrap();
        let doc = parse("Ela tinha **olhos** cinzentos.");
        save_doc(&dir, &c.id, &doc).unwrap();
        assert_eq!(load_doc(&dir, &c.id).unwrap(), doc);
        let f = create(&dir, None, 0, NodeKind::Folder, "P").unwrap();
        assert!(load_doc(&dir, &f.id).is_err());
    }

    #[test]
    fn delete_folder_removes_subtree_files_after_saving_tree() {
        let (_r, dir, _m) = book();
        let f = create(&dir, None, 0, NodeKind::Folder, "P").unwrap();
        let t = create(&dir, Some(&f.id), 0, NodeKind::Text, "Ana").unwrap();
        let file = dir.join(AREA_DIR).join(format!("{}.md", t.id));
        assert!(file.exists());
        let items = delete(&dir, &f.id).unwrap();
        assert!(items.is_empty());
        assert!(tree(&dir).unwrap().is_empty());
        assert!(!file.exists());
    }

    #[test]
    fn import_files_copies_and_detects_kind() {
        let (root, dir, _m) = book();
        let png = root.path().join("mapa.png");
        std::fs::write(&png, b"not really a png").unwrap();
        let pdf = root.path().join("Artigo.PDF");
        std::fs::write(&pdf, b"%PDF").unwrap();
        let items = import_files(&dir, None, &[png, pdf]).unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!((items[0].kind, items[0].title.as_str()), (NodeKind::Image, "mapa"));
        assert_eq!((items[1].kind, items[1].title.as_str()), (NodeKind::File, "Artigo"));
        assert!(items[1].file.as_ref().unwrap().ends_with(".pdf"));
        assert!(dir.join(AREA_DIR).join(items[1].file.as_ref().unwrap()).exists());
    }

    #[test]
    fn to_chapter_moves_text_to_the_end_of_the_chapters() {
        let (_r, dir, mut meta) = book();
        let c = create(&dir, None, 0, NodeKind::Text, "Prólogo").unwrap();
        set_notes(&dir, &c.id, "cena solta").unwrap();
        save_doc(&dir, &c.id, &parse("um dois três")).unwrap();
        let items = to_chapter(&dir, &mut meta, &c.id).unwrap();
        assert!(items.is_empty());
        let last = meta.chapters.last().unwrap();
        assert_eq!((last.title.as_str(), last.notes.as_str(), last.words), ("Prólogo", "cena solta", 3));
        assert_eq!(crate::storage::chapter_io::read_chapter(&dir, last).unwrap(), parse("um dois três"));
        assert!(!dir.join(AREA_DIR).join(format!("{}.md", c.id)).exists());
        let f = create(&dir, None, 0, NodeKind::Folder, "P").unwrap();
        assert!(to_chapter(&dir, &mut meta, &f.id).is_err());
    }

    #[test]
    fn rename_move_and_missing_ids() {
        let (_r, dir, _m) = book();
        let a = create(&dir, None, 0, NodeKind::Folder, "A").unwrap();
        let b = create(&dir, None, 1, NodeKind::Text, "B").unwrap();
        let items = rename(&dir, &b.id, "Bê").unwrap();
        assert_eq!(find(&items, &b.id).unwrap().title, "Bê");
        let items = move_to(&dir, &b.id, Some(&a.id), 0).unwrap();
        assert_eq!(items[0].children[0].id, b.id);
        assert_eq!(rename(&dir, "zz", "x").unwrap_err().0, "Item não encontrado");
    }
}
```

E em `state.rs` (`mod tests`):

```rust
    #[test]
    fn absorbed_words_do_not_count_as_today() {
        let root = tempfile::tempdir().unwrap();
        let (dir, meta) = create_book(root.path(), "A").unwrap();
        let mut lib = Library::new(root.path().to_path_buf());
        lib.register(&dir, &meta);
        lib.start_session_if_needed();
        let chapter_id = meta.chapters[0].id.clone();
        let before = lib.total_of(&meta.id);
        lib.with_book(&meta.id, |d, m| {
            chapter::save(d, m, &chapter_id, &crate::markdown::parse::parse("um dois três")).map(|_| ())
        })
        .unwrap();
        lib.absorb(lib.total_of(&meta.id) - before);
        assert_eq!(lib.today(), 0);
    }
```

- [ ] **Step 2: Rodar e ver falhar** — `cd src-tauri && cargo test workspace` → não compila.

- [ ] **Step 3: Implementar `storage/workspace_io.rs`**

```rust
use std::{fs, io::ErrorKind, path::{Path, PathBuf}};

use super::{atomic::write_atomic, paths::{safe_join, AREA_DIR, AREA_FILE, AREA_FILES_DIR}};
use crate::error::AppResult;
use crate::markdown::{parse::parse, serialize::serialize};
use crate::model::{doc::Doc, workspace::{NodeKind, Workspace}};

/// Absolute path of a file referenced from `area.json`.
pub fn area_path(book_dir: &Path, rel: &str) -> AppResult<PathBuf> {
    safe_join(&book_dir.join(AREA_DIR), rel)
}

/// The workspace tree; a book without `area/` has an empty one.
pub fn read_workspace(book_dir: &Path) -> AppResult<Workspace> {
    match fs::read_to_string(book_dir.join(AREA_DIR).join(AREA_FILE)) {
        Ok(s) => Ok(serde_json::from_str(&s)?),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(Workspace::default()),
        Err(e) => Err(e.into()),
    }
}

pub fn write_workspace(book_dir: &Path, ws: &Workspace) -> AppResult<()> {
    let dir = book_dir.join(AREA_DIR);
    fs::create_dir_all(&dir)?;
    write_atomic(&dir.join(AREA_FILE), serde_json::to_string_pretty(ws)?.as_bytes())?;
    Ok(())
}

/// A text node's document; a missing file reads as empty.
pub fn read_node_doc(book_dir: &Path, rel: &str) -> AppResult<Doc> {
    match fs::read_to_string(area_path(book_dir, rel)?) {
        Ok(s) => Ok(parse(&s)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(Doc::default()),
        Err(e) => Err(e.into()),
    }
}

pub fn write_node_doc(book_dir: &Path, rel: &str, doc: &Doc) -> AppResult<()> {
    let path = area_path(book_dir, rel)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    write_atomic(&path, serialize(doc).as_bytes())?;
    Ok(())
}

/// Copies `src` to `area/arquivos/<id>.<ext>`; the kind comes from the extension.
pub fn copy_into_area(book_dir: &Path, src: &Path, id: &str) -> AppResult<(String, NodeKind)> {
    let ext = src.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).unwrap_or_default();
    let name = if ext.is_empty() { id.to_string() } else { format!("{id}.{ext}") };
    let rel = format!("{AREA_FILES_DIR}/{name}");
    let dest = area_path(book_dir, &rel)?;
    fs::create_dir_all(dest.parent().expect("has a parent"))?;
    fs::copy(src, &dest)?;
    Ok((rel, NodeKind::for_extension(&ext)))
}

pub fn remove_area_file(book_dir: &Path, rel: &str) -> AppResult<()> {
    match fs::remove_file(area_path(book_dir, rel)?) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.into()),
    }
}
```

- [ ] **Step 4: Implementar `ops/workspace.rs`**

```rust
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::ids::{new_id, now_ms};
use crate::model::{
    doc::Doc,
    metadata::{ChapterEntry, Metadata},
    workspace::{find, find_mut, insert, move_node, remove, subtree_files, Node, NodeKind},
};
use crate::storage::{
    chapter_io::write_chapter,
    metadata_io::write_metadata,
    workspace_io::{area_path, copy_into_area, read_node_doc, read_workspace, remove_area_file, write_node_doc, write_workspace},
};
use crate::text::words::doc_words;

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Created {
    pub id: String,
    pub items: Vec<Node>,
}

fn not_found() -> AppError {
    AppError::msg("Item não encontrado")
}

/// Loads the tree, applies `f`, saves it and returns the new items.
fn edit(dir: &Path, f: impl FnOnce(&mut Vec<Node>) -> AppResult<()>) -> AppResult<Vec<Node>> {
    let mut ws = read_workspace(dir)?;
    f(&mut ws.items)?;
    write_workspace(dir, &ws)?;
    Ok(ws.items)
}

/// Discards files the tree no longer references; the tree is already saved.
fn discard(dir: &Path, files: &[String]) {
    for rel in files {
        if let Err(e) = remove_area_file(dir, rel) {
            eprintln!("could not remove workspace file {rel}: {e}");
        }
    }
}

fn text_file(dir: &Path, id: &str) -> AppResult<String> {
    let ws = read_workspace(dir)?;
    let node = find(&ws.items, id).ok_or_else(not_found)?;
    match (node.kind, &node.file) {
        (NodeKind::Text, Some(f)) => Ok(f.clone()),
        _ => Err(AppError::msg("Este item não é um texto")),
    }
}

pub fn tree(dir: &Path) -> AppResult<Vec<Node>> {
    Ok(read_workspace(dir)?.items)
}

/// New folder or empty text under `parent` (None = root).
pub fn create(dir: &Path, parent: Option<&str>, index: usize, kind: NodeKind, title: &str) -> AppResult<Created> {
    let id = new_id();
    let node = match kind {
        NodeKind::Folder => Node::folder(id.clone(), title),
        NodeKind::Text => {
            let file = format!("{id}.md");
            write_node_doc(dir, &file, &Doc::default())?;
            Node::leaf(id.clone(), NodeKind::Text, title, &file)
        }
        _ => return Err(AppError::msg("Use \"Adicionar arquivos\" para imagens e anexos")),
    };
    let items = edit(dir, |items| insert(items, parent, index, node))?;
    Ok(Created { id, items })
}

pub fn rename(dir: &Path, id: &str, title: &str) -> AppResult<Vec<Node>> {
    edit(dir, |items| {
        find_mut(items, id).ok_or_else(not_found)?.title = title.to_string();
        Ok(())
    })
}

pub fn set_notes(dir: &Path, id: &str, notes: &str) -> AppResult<Vec<Node>> {
    edit(dir, |items| {
        find_mut(items, id).ok_or_else(not_found)?.notes = notes.to_string();
        Ok(())
    })
}

pub fn move_to(dir: &Path, id: &str, parent: Option<&str>, index: usize) -> AppResult<Vec<Node>> {
    edit(dir, |items| move_node(items, id, parent, index))
}

/// Removes the node and its subtree; files go only after the tree is saved.
pub fn delete(dir: &Path, id: &str) -> AppResult<Vec<Node>> {
    let mut files = Vec::new();
    let items = edit(dir, |items| {
        let node = remove(items, id).ok_or_else(not_found)?;
        files = subtree_files(&node);
        Ok(())
    })?;
    discard(dir, &files);
    Ok(items)
}

pub fn load_doc(dir: &Path, id: &str) -> AppResult<Doc> {
    read_node_doc(dir, &text_file(dir, id)?)
}

pub fn save_doc(dir: &Path, id: &str, doc: &Doc) -> AppResult<()> {
    write_node_doc(dir, &text_file(dir, id)?, doc)
}

/// Copies files chosen on disk into the workspace, appended under `parent`.
pub fn import_files(dir: &Path, parent: Option<&str>, paths: &[PathBuf]) -> AppResult<Vec<Node>> {
    let mut nodes = Vec::new();
    for src in paths {
        let id = new_id();
        let (rel, kind) = copy_into_area(dir, src, &id)?;
        let title = src.file_stem().and_then(|s| s.to_str()).unwrap_or("Arquivo");
        nodes.push(Node::leaf(id, kind, title, &rel));
    }
    edit(dir, |items| {
        for node in nodes {
            insert(items, parent, usize::MAX, node)?;
        }
        Ok(())
    })
}

/// Absolute path of an image/attachment node (to open it in the default app).
pub fn file_path(dir: &Path, id: &str) -> AppResult<PathBuf> {
    let ws = read_workspace(dir)?;
    let node = find(&ws.items, id).ok_or_else(not_found)?;
    area_path(dir, node.file.as_deref().ok_or_else(not_found)?)
}

/// Turns a text into the last chapter. Order: chapter file, metadata, tree,
/// and only then the old file — a failure midway duplicates, never loses, the text.
pub fn to_chapter(dir: &Path, meta: &mut Metadata, id: &str) -> AppResult<Vec<Node>> {
    let ws = read_workspace(dir)?;
    let node = find(&ws.items, id).ok_or_else(not_found)?.clone();
    let file = match (node.kind, &node.file) {
        (NodeKind::Text, Some(f)) => f.clone(),
        _ => return Err(AppError::msg("Só textos podem virar capítulos")),
    };
    let doc = read_node_doc(dir, &file)?;
    let mut entry = ChapterEntry::new(new_id());
    entry.title = node.title.clone();
    entry.notes = node.notes.clone();
    entry.words = doc_words(&doc);
    write_chapter(dir, &entry, &doc)?;
    meta.chapters.push(entry);
    meta.updated_at = now_ms();
    write_metadata(dir, meta)?;
    let items = edit(dir, |items| remove(items, id).map(|_| ()).ok_or_else(not_found))?;
    discard(dir, &[file]);
    Ok(items)
}
```

- [ ] **Step 5: `state.rs`** — acrescentar a `impl Library`:

```rust
    /// Word total of a book as last seen (0 if unknown).
    pub fn total_of(&self, id: &str) -> usize {
        self.totals.get(id).copied().unwrap_or(0)
    }

    /// Words that entered a book without being typed (import, workspace text
    /// sent to chapters) join the session baseline, so today is unchanged.
    pub fn absorb(&mut self, words: usize) {
        if let Some(base) = self.session_base.as_mut() {
            *base += words;
        }
    }
```

- [ ] **Step 6: `dialog.rs`** — acrescentar:

```rust
/// Native multi-file picker, any file type. Blocking: call only from async commands.
pub fn pick_files(window: &WebviewWindow) -> Vec<PathBuf> {
    window
        .dialog()
        .file()
        .set_parent(window)
        .blocking_pick_files()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|f| f.into_path().ok())
        .collect()
}
```

- [ ] **Step 7: `commands/workspace.rs`** — comandos finos no padrão de `commands/book.rs` (`lock(&state)?.with_book(&book_id, |dir, meta| …)`), com os nomes e tipos de *Produces*:
  - `workspace_pick_files`: abre `pick_files` **antes** de travar o estado; lista vazia → `Ok(None)`.
  - `workspace_to_chapter`: `let before = lib.total_of(&book_id);` → `with_book(… ops::to_chapter …)` → `lib.absorb(lib.total_of(&book_id).saturating_sub(before))`; retorna `ToChapter { book: BookMeta::from_meta(dir, meta), items }` (struct `Serialize` camelCase no próprio arquivo de comandos).
  - `workspace_open_file(app: tauri::AppHandle, …)`: pega o caminho com `ops::workspace::file_path` dentro do lock, solta o lock, e chama `app.opener().open_path(path.to_string_lossy(), None::<&str>)` (`use tauri_plugin_opener::OpenerExt;`), mapeando erro para `AppError::msg("Não foi possível abrir o arquivo")`.
  - Registrar todos em `commands/mod.rs` (`pub mod workspace;`) e no `generate_handler!` de `lib.rs`.

- [ ] **Step 8: Rodar tudo** — `cd src-tauri && cargo test` → PASS, zero warnings.

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src
git commit -m "feat(workspace): workspace storage, operations and commands"
```

---

### Task 3: RTF → `Doc` com formatação (Rust)

**Files:**
- Create: `src-tauri/src/scrivener/mod.rs` (`pub mod rtf;` — as Tasks 4 e 5 acrescentam os outros)
- Create: `src-tauri/src/scrivener/rtf.rs`
- Modify: `src-tauri/src/lib.rs` (`mod scrivener;`)

**Interfaces:**
- Consumes: `Doc`, `Block`, `Inline`, `Marks` (`model::marks`), `ParaAttrs`, `Align`, clamps (`model::para_attrs`).
- Produces: `scrivener::rtf::rtf_to_doc(src: &[u8]) -> Doc` — nunca falha nem entra em pânico.

**Regras:** grupos `{ }` empilham/desempilham o estado de caractere (marcas, `skip`, `uc`); `\*` e os destinos da lista `SKIP_DESTINATIONS` descartam o grupo inteiro (e nenhuma palavra de controle dentro dele afeta parágrafo); `\par`/`\sect`/`\page`/`\row` fecham parágrafo; `\line` = `HardBreak`; `\tab`/`\cell` = `\t`; `\b`/`\i` (parâmetro 0 desliga); `\plain` zera marcas; `\pard` zera atributos de parágrafo, que **persistem** entre `\par` até o próximo `\pard`; `\ql` `\qc` `\qr` `\qj`; `\sl` + `\slmult1` → `sl/240`; `\sl` sem `\slmult1` → `|sl|/20/12` arredondado a 0,05; `\sb`/`\sa` twips ÷ 20 → pt; `\fi` twips ÷ 567 → cm; `\uN` (negativo + 65536) e pula `uc` caracteres de fallback (`\uc` padrão 1); `\'hh` em cp1252; bytes crus ≥ 0x80 decodificados como UTF-8 quando válidos, senão cp1252; parágrafo cujo texto (trim) é `#`, `*`, `***` ou `* * *` vira `Separator`; último parágrafo sem `\par` entra se tiver conteúdo.

- [ ] **Step 1: Testes que falham** (em `rtf.rs`):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::doc::{Block, Inline};
    use crate::model::marks::Marks;
    use crate::model::para_attrs::{Align, ParaAttrs};

    fn t(s: &str) -> Inline { Inline::text(s) }
    fn m(s: &str, k: Marks) -> Inline { Inline::marked(s, k) }
    fn p(c: Vec<Inline>) -> Block { Block::paragraph(c) }
    fn doc(s: &str) -> Vec<Block> { rtf_to_doc(s.as_bytes()).content }

    #[test]
    fn text_marks_breaks_and_hex_escapes() {
        let d = doc(r"{\rtf1\ansi{\fonttbl{\f0 Times;}}\f0 Ol\'e1 {\b mundo}\par Linha\line dois\par}");
        assert_eq!(d, vec![
            p(vec![t("Olá "), m("mundo", Marks::BOLD)]),
            p(vec![t("Linha"), Inline::HardBreak, t("dois")]),
        ]);
    }

    #[test]
    fn groups_restore_marks_and_plain_resets() {
        let d = doc(r"{\rtf1 a{\i b}c\b d\b0 e\i f\plain g\par}");
        assert_eq!(d, vec![p(vec![t("a"), m("b", Marks::ITALIC), t("c"), m("d", Marks::BOLD), t("e"), m("f", Marks::ITALIC), t("g")])]);
    }

    #[test]
    fn unicode_escapes_and_fallback_chars() {
        assert_eq!(doc(r"{\rtf1\uc1 caf\u233?\par}"), vec![p(vec![t("café")])]);
        assert_eq!(doc(r"{\rtf1\uc0 \u8212 x\par}"), vec![p(vec![t("—x")])]);
        assert_eq!(doc(r"{\rtf1 \u-3913?\par}"), vec![p(vec![t("\u{f0b7}")])]);
        assert_eq!(rtf_to_doc("{\\rtf1 ação\\par}".as_bytes()).content, vec![p(vec![t("ação")])]);
        assert_eq!(doc(r"{\rtf1 \emdash\ \ldblquote x\rdblquote\par}"), vec![p(vec![t("— “x”")])]);
    }

    #[test]
    fn paragraph_formatting() {
        let d = doc(r"{\rtf1\pard\qc\sl360\slmult1\sb240\sa120\fi720 T\par}");
        let want = ParaAttrs { text_align: Some(Align::Center), line_height: Some(1.5), space_before: Some(12),
            space_after: Some(6), indent: Some(1.27) };
        assert_eq!(d, vec![Block::Paragraph { attrs: want, content: vec![t("T")] }]);
        let exact = doc(r"{\rtf1\pard\sl288 T\par}");
        let Block::Paragraph { attrs, .. } = &exact[0] else { panic!() };
        assert_eq!(attrs.line_height, Some(1.2));
    }

    #[test]
    fn paragraph_formatting_persists_until_pard() {
        let d = doc(r"{\rtf1\qc A\par B\par\pard C\par}");
        let center = ParaAttrs { text_align: Some(Align::Center), ..Default::default() };
        assert_eq!(d, vec![
            Block::Paragraph { attrs: center, content: vec![t("A")] },
            Block::Paragraph { attrs: center, content: vec![t("B")] },
            p(vec![t("C")]),
        ]);
    }

    #[test]
    fn ignorable_destinations_leak_nothing() {
        let d = doc(r"{\rtf1{\*\generator Foo;}{\stylesheet{\s0\qc\b Normal;}}{\info{\title X}}{\*\expandedcolortbl;;}Texto\par}");
        assert_eq!(d, vec![p(vec![t("Texto")])]);
    }

    #[test]
    fn scene_markers_become_separators() {
        let d = doc(r"{\rtf1 A\par #\par  * * * \par ***\par B\par}");
        assert_eq!(d, vec![p(vec![t("A")]), Block::Separator, Block::Separator, Block::Separator, p(vec![t("B")])]);
    }

    #[test]
    fn malformed_input_never_panics() {
        assert_eq!(doc(r"{\rtf1 {\b abc"), vec![p(vec![m("abc", Marks::BOLD)])]);
        let _ = doc(r"}}}\'zz\u\uc\'");
        let _ = rtf_to_doc(&[0xff, 0xfe, b'\\', b'u', b'9', b'9', b'9', b'9', b'9', b'9', b'9', b'9', b'9', b'9', b'9']);
        assert_eq!(doc(""), vec![]);
    }
}
```

- [ ] **Step 2: Rodar e ver falhar** — `cd src-tauri && cargo test scrivener::rtf` → não compila.

- [ ] **Step 3: Implementar `rtf.rs`**

```rust
//! Minimal RTF reader for Scrivener documents: text, bold/italic and the
//! paragraph formatting the editor supports. Everything else is dropped.
use crate::model::doc::{Block, Doc, Inline};
use crate::model::marks::Marks;
use crate::model::para_attrs::{Align, ParaAttrs};

/// Groups whose whole content is metadata, never document text.
const SKIP_DESTINATIONS: &[&str] = &[
    "fonttbl", "colortbl", "stylesheet", "info", "pict", "header", "headerl", "headerr", "headerf", "footer",
    "footerl", "footerr", "footerf", "footnote", "listtable", "listoverridetable", "rsidtbl", "generator",
    "xmlnstbl", "themedata", "colorschememapping", "latentstyles", "datastore", "object", "fldinst",
    "filetbl", "revtbl", "annotation", "atnid", "atnauthor",
];

const CP1252: [char; 32] = [
    '€', '\u{81}', '‚', 'ƒ', '„', '…', '†', '‡', 'ˆ', '‰', 'Š', '‹', 'Œ', '\u{8d}', 'Ž', '\u{8f}',
    '\u{90}', '‘', '’', '“', '”', '•', '–', '—', '˜', '™', 'š', '›', 'œ', '\u{9d}', 'ž', 'Ÿ',
];

fn cp1252(b: u8) -> char {
    match b {
        0x80..=0x9f => CP1252[(b - 0x80) as usize],
        _ => b as char,
    }
}

/// A raw byte outside control words: UTF-8 when it forms a valid sequence, else cp1252.
fn decode_raw(src: &[u8], i: usize) -> (char, usize) {
    let b = src[i];
    if b < 0x80 {
        return (b as char, 1);
    }
    let len = match b {
        0xc0..=0xdf => 2,
        0xe0..=0xef => 3,
        0xf0..=0xf7 => 4,
        _ => 0,
    };
    if len > 0 {
        if let Some(c) = src.get(i..i + len).and_then(|s| std::str::from_utf8(s).ok()).and_then(|s| s.chars().next()) {
            return (c, len);
        }
    }
    (cp1252(b), 1)
}

#[derive(Clone, Copy)]
struct Group {
    marks: Marks,
    skip: bool,
    /// Fallback characters that follow each `\uN`.
    uc: usize,
}

#[derive(Default)]
struct Para {
    align: Option<Align>,
    sl: i32,
    slmult: bool,
    sb: Option<i32>,
    sa: Option<i32>,
    fi: i32,
}

impl Para {
    fn attrs(&self) -> ParaAttrs {
        let line_height = match (self.sl, self.slmult) {
            (0, _) => None,
            (sl, true) => ParaAttrs::clamp_line(sl.unsigned_abs() as f64 / 240.0),
            // Exact spacing in twips, relative to a 12pt line, to the nearest 0.05.
            (sl, false) => ParaAttrs::clamp_line((sl.unsigned_abs() as f64 / 20.0 / 12.0 * 20.0).round() / 20.0),
        };
        ParaAttrs {
            text_align: self.align,
            line_height,
            space_before: self.sb.and_then(|v| ParaAttrs::clamp_before(v as f64 / 20.0)),
            space_after: self.sa.and_then(|v| ParaAttrs::clamp_after(v as f64 / 20.0)),
            indent: ParaAttrs::clamp_indent(self.fi as f64 / 567.0),
        }
    }
}

struct Reader {
    blocks: Vec<Block>,
    content: Vec<Inline>,
    para: Para,
    stack: Vec<Group>,
    cur: Group,
    skip_chars: usize,
}

pub fn rtf_to_doc(src: &[u8]) -> Doc {
    let mut r = Reader {
        blocks: Vec::new(),
        content: Vec::new(),
        para: Para::default(),
        stack: Vec::new(),
        cur: Group { marks: Marks::default(), skip: false, uc: 1 },
        skip_chars: 0,
    };
    let mut i = 0;
    while i < src.len() {
        match src[i] {
            b'{' => {
                r.stack.push(r.cur);
                i += 1;
            }
            b'}' => {
                if let Some(g) = r.stack.pop() {
                    r.cur = g;
                }
                i += 1;
            }
            b'\\' => i = r.control(src, i + 1),
            b'\r' | b'\n' => i += 1,
            _ => {
                let (c, len) = decode_raw(src, i);
                r.text(c);
                i += len;
            }
        }
    }
    if !r.content.is_empty() {
        r.cur.skip = false;
        r.end_paragraph();
    }
    Doc::new(r.blocks)
}

impl Reader {
    fn text(&mut self, c: char) {
        if self.cur.skip {
            return;
        }
        if self.skip_chars > 0 {
            self.skip_chars -= 1;
            return;
        }
        let marks = self.cur.marks;
        if let Some(Inline::Text { text, marks: m }) = self.content.last_mut() {
            if *m == marks {
                text.push(c);
                return;
            }
        }
        self.content.push(Inline::Text { text: c.to_string(), marks });
    }

    fn end_paragraph(&mut self) {
        if self.cur.skip {
            return;
        }
        let content = std::mem::take(&mut self.content);
        let plain: String = content
            .iter()
            .map(|i| match i {
                Inline::Text { text, .. } => text.as_str(),
                Inline::HardBreak => "\n",
            })
            .collect();
        let block = if matches!(plain.trim(), "#" | "*" | "***" | "* * *") {
            Block::Separator
        } else {
            Block::Paragraph { attrs: self.para.attrs(), content }
        };
        self.blocks.push(block);
    }

    /// Parses the control word/symbol after a backslash at `i`; returns the next index.
    fn control(&mut self, src: &[u8], mut i: usize) -> usize {
        let Some(&c) = src.get(i) else { return i };
        if c.is_ascii_alphabetic() {
            let start = i;
            while i < src.len() && src[i].is_ascii_alphabetic() {
                i += 1;
            }
            let word = std::str::from_utf8(&src[start..i]).unwrap_or("");
            let num_start = i;
            if i < src.len() && (src[i] == b'-' || src[i].is_ascii_digit()) {
                i += 1;
                while i < src.len() && src[i].is_ascii_digit() {
                    i += 1;
                }
            }
            let param = std::str::from_utf8(&src[num_start..i]).ok().and_then(|s| s.parse::<i32>().ok());
            if src.get(i) == Some(&b' ') {
                i += 1;
            }
            self.word(word, param);
            return i;
        }
        match c {
            b'\'' => {
                let byte = src.get(i + 1..i + 3).and_then(|h| std::str::from_utf8(h).ok()).and_then(|h| u8::from_str_radix(h, 16).ok());
                match byte {
                    Some(b) => {
                        self.text(cp1252(b));
                        i + 3
                    }
                    None => i + 1,
                }
            }
            b'*' => {
                self.cur.skip = true;
                i + 1
            }
            b'~' => {
                self.text('\u{a0}');
                i + 1
            }
            b'_' => {
                self.text('\u{2011}');
                i + 1
            }
            b'-' => i + 1,
            b'\n' | b'\r' => {
                self.end_paragraph();
                i + 1
            }
            _ => {
                // `\\`, `\{`, `\}` and any other escaped symbol.
                self.text(c as char);
                i + 1
            }
        }
    }

    fn word(&mut self, w: &str, p: Option<i32>) {
        if SKIP_DESTINATIONS.contains(&w) {
            self.cur.skip = true;
            return;
        }
        if self.cur.skip {
            return;
        }
        let on = p.map_or(true, |n| n != 0);
        match w {
            "par" | "sect" | "page" | "row" => self.end_paragraph(),
            "line" => self.content.push(Inline::HardBreak),
            "tab" | "cell" => self.text('\t'),
            "b" => self.cur.marks.bold = on,
            "i" => self.cur.marks.italic = on,
            "plain" => self.cur.marks = Marks::default(),
            "pard" => self.para = Para::default(),
            "ql" => self.para.align = None,
            "qc" => self.para.align = Some(Align::Center),
            "qr" => self.para.align = Some(Align::Right),
            "qj" => self.para.align = Some(Align::Justify),
            "sl" => self.para.sl = p.unwrap_or(0),
            "slmult" => self.para.slmult = p == Some(1),
            "sb" => self.para.sb = p,
            "sa" => self.para.sa = p,
            "fi" => self.para.fi = p.unwrap_or(0),
            "uc" => self.cur.uc = p.unwrap_or(1).max(0) as usize,
            "u" => {
                if let Some(n) = p {
                    let code = if n < 0 { n + 65536 } else { n };
                    if let Some(c) = u32::try_from(code).ok().and_then(char::from_u32) {
                        self.text(c);
                    }
                    self.skip_chars = self.cur.uc;
                }
            }
            "emdash" => self.text('—'),
            "endash" => self.text('–'),
            "lquote" => self.text('‘'),
            "rquote" => self.text('’'),
            "ldblquote" => self.text('“'),
            "rdblquote" => self.text('”'),
            "bullet" => self.text('•'),
            _ => {}
        }
    }
}
```

Notas: o teste `\emdash\ ` usa `\ ` (barra + espaço) como símbolo que vira espaço literal — o caso `_ => self.text(c as char)` cobre. `Inline::text`/`Inline::marked`/`Block::paragraph` são `#[cfg(test)]` e só aparecem nos testes; o código de produção constrói as variantes direto.

- [ ] **Step 4: Rodar** — `cd src-tauri && cargo test scrivener::rtf` → PASS. Se algum caso da lista falhar contra o código dado, reporte o caso e a saída; uma correção mínima que mantenha todas as regras acima é aceitável e deve ser descrita no relatório.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src
git commit -m "feat(scrivener): RTF reader with bold, italic and paragraph formatting"
```

---

### Task 4: Binder do Scrivener e localização dos arquivos (Rust)

**Files:**
- Modify: `src-tauri/Cargo.toml` (`quick-xml = "0.37"`)
- Create: `src-tauri/src/scrivener/binder.rs`
- Create: `src-tauri/src/scrivener/project.rs`
- Modify: `src-tauri/src/scrivener/mod.rs`

**Interfaces:**
- Consumes: `rtf_to_doc` (Task 3), `doc_text` (`text::words`).
- Produces:
  - `binder.rs`: `ItemKind { Draft, Research, Trash, Folder, Text, Image, File }`, `BinderItem { key: String, kind: ItemKind, title: String, children: Vec<BinderItem> }`, `parse_binder(xml: &str) -> AppResult<Vec<BinderItem>>` (só itens dentro de `<Binder>`; título vem do `<Title>` filho direto; `UUID` ou `ID` vira `key`; tipos desconhecidos → `File`; XML malformado → `Err("Projeto do Scrivener inválido")`).
  - `project.rs`: `Project { dir: PathBuf, scrivx: PathBuf, title: String }` (+ campo privado `v3: bool`), `Project::open(path: &Path) -> AppResult<Project>` (aceita a pasta `.scriv` ou o `.scrivx`; título = nome da pasta sem `.scriv`, ou nome do `.scrivx` se a pasta não terminar em `.scriv`), `Project::binder(&self) -> AppResult<Vec<BinderItem>>`, `content(&self, key) -> Option<PathBuf>`, `text(&self, key) -> AppResult<Doc>` (sem `content.rtf` = `Doc::default()`), `notes(&self, key) -> String` (sinopse, linha em branco, notas em texto puro; partes vazias omitidas).

Formatos:
- Scrivener 3 (`Files/Data` existe): `Files/Data/<UUID>/content.<ext>` (texto em `content.rtf`), `synopsis.txt`, `notes.rtf`.
- Scrivener 2: `Files/Docs/<ID>.<ext>` (texto em `<ID>.rtf`), `<ID>_synopsis.txt`, `<ID>_notes.rtf`.
- `key` só é usado em caminho se tiver apenas `[A-Za-z0-9-]` (senão `None`/vazio).

- [ ] **Step 1: Testes que falham**

Em `binder.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    const V3: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Identifier="X" Version="2.0">
  <Binder>
    <BinderItem UUID="D-1" Type="DraftFolder" Created="x">
      <Title>Manuscrito</Title>
      <MetaData><IncludeInCompile>Yes</IncludeInCompile></MetaData>
      <Children>
        <BinderItem UUID="C-1" Type="Folder"><Title>Cap&#237;tulo 1</Title>
          <Children><BinderItem UUID="S-1" Type="Text"><Title>Cena &amp; fuga</Title></BinderItem></Children>
        </BinderItem>
        <BinderItem UUID="S-2" Type="Text"/>
      </Children>
    </BinderItem>
    <BinderItem UUID="R-1" Type="ResearchFolder"><Title>Pesquisa</Title>
      <Children><BinderItem UUID="I-1" Type="Image"><Title>Mapa</Title></BinderItem>
      <BinderItem UUID="P-1" Type="PDF"><Title>Artigo</Title></BinderItem></Children>
    </BinderItem>
    <BinderItem UUID="T-1" Type="TrashFolder"><Title>Lixeira</Title></BinderItem>
  </Binder>
  <Collections><Collection><Title>Busca</Title></Collection></Collections>
</ScrivenerProject>"#;

    #[test]
    fn reads_the_scrivener3_binder() {
        let items = parse_binder(V3).unwrap();
        assert_eq!(items.len(), 3);
        assert_eq!((items[0].kind.clone(), items[0].title.as_str(), items[0].key.as_str()), (ItemKind::Draft, "Manuscrito", "D-1"));
        let ch = &items[0].children[0];
        assert_eq!((ch.kind.clone(), ch.title.as_str()), (ItemKind::Folder, "Capítulo 1"));
        assert_eq!(ch.children[0].title, "Cena & fuga");
        assert_eq!((items[0].children[1].kind.clone(), items[0].children[1].title.as_str()), (ItemKind::Text, ""));
        assert_eq!(items[1].children[0].kind, ItemKind::Image);
        assert_eq!(items[1].children[1].kind, ItemKind::File);
        assert_eq!(items[2].kind, ItemKind::Trash);
    }

    #[test]
    fn reads_the_scrivener2_ids() {
        let xml = r#"<ScrivenerProject><Binder><BinderItem ID="0" Type="DraftFolder"><Title>Draft</Title>
            <Children><BinderItem ID="7" Type="Text"><Title>Um</Title></BinderItem></Children></BinderItem></Binder></ScrivenerProject>"#;
        let items = parse_binder(xml).unwrap();
        assert_eq!(items[0].children[0].key, "7");
    }

    #[test]
    fn broken_xml_is_an_invalid_project() {
        assert_eq!(parse_binder("<ScrivenerProject><Binder><BinderItem").unwrap_err().0, "Projeto do Scrivener inválido");
        assert_eq!(parse_binder("<nada/>").unwrap_err().0, "Projeto do Scrivener inválido");
    }
}
```

Em `project.rs` (monta projetos falsos em disco):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    const BINDER: &str = r#"<ScrivenerProject><Binder><BinderItem UUID="A-1" Type="Text"><Title>Um</Title></BinderItem></Binder></ScrivenerProject>"#;

    #[test]
    fn opens_scrivener3_by_folder_or_scrivx() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("Meu Livro.scriv");
        fs::create_dir_all(dir.join("Files/Data/A-1")).unwrap();
        fs::write(dir.join("Meu Livro.scrivx"), BINDER).unwrap();
        fs::write(dir.join("Files/Data/A-1/content.rtf"), r"{\rtf1 Ol\'e1\par}").unwrap();
        fs::write(dir.join("Files/Data/A-1/synopsis.txt"), "Resumo").unwrap();
        fs::write(dir.join("Files/Data/A-1/notes.rtf"), r"{\rtf1 Nota\par}").unwrap();
        for p in [dir.clone(), dir.join("Meu Livro.scrivx")] {
            let project = Project::open(&p).unwrap();
            assert_eq!(project.title, "Meu Livro");
            assert_eq!(project.binder().unwrap()[0].title, "Um");
            assert_eq!(crate::text::words::doc_text(&project.text("A-1").unwrap()), "Olá");
            assert_eq!(project.notes("A-1"), "Resumo\n\nNota");
        }
    }

    #[test]
    fn opens_scrivener2_layout_and_media() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("Velho.scriv");
        fs::create_dir_all(dir.join("Files/Docs")).unwrap();
        fs::write(dir.join("project.scrivx"), BINDER).unwrap();
        fs::write(dir.join("Files/Docs/3.rtf"), r"{\rtf1 Tr\u234?s\par}").unwrap();
        fs::write(dir.join("Files/Docs/3_notes.rtf"), r"{\rtf1 N\par}").unwrap();
        fs::write(dir.join("Files/Docs/4.jpg"), b"jpg").unwrap();
        let project = Project::open(&dir).unwrap();
        assert_eq!(crate::text::words::doc_text(&project.text("3").unwrap()), "Três");
        assert_eq!(project.notes("3"), "N");
        assert_eq!(project.content("4").unwrap().file_name().unwrap(), "4.jpg");
        // Missing text = empty document, not an error.
        assert_eq!(project.text("99").unwrap(), crate::model::doc::Doc::default());
        assert!(project.content("../x").is_none());
    }

    #[test]
    fn folder_without_scrivx_is_invalid() {
        let tmp = tempfile::tempdir().unwrap();
        assert_eq!(Project::open(tmp.path()).unwrap_err().0, "Projeto do Scrivener inválido");
    }
}
```

- [ ] **Step 2: Rodar e ver falhar** — `cd src-tauri && cargo test scrivener` → não compila.

- [ ] **Step 3: Implementar `binder.rs`** (quick-xml 0.37; se a API da versão resolvida divergir, adapte minimamente e descreva no relatório):

```rust
//! The binder tree of a `.scrivx` project file.
use quick_xml::{events::{BytesStart, Event}, Reader};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, PartialEq)]
pub enum ItemKind {
    Draft,
    Research,
    Trash,
    Folder,
    Text,
    Image,
    File,
}

#[derive(Debug, Clone, PartialEq)]
pub struct BinderItem {
    /// `UUID` (Scrivener 3) or `ID` (Scrivener 2).
    pub key: String,
    pub kind: ItemKind,
    pub title: String,
    pub children: Vec<BinderItem>,
}

fn invalid() -> AppError {
    AppError::msg("Projeto do Scrivener inválido")
}

fn kind_of(t: &str) -> ItemKind {
    match t {
        "DraftFolder" => ItemKind::Draft,
        "ResearchFolder" => ItemKind::Research,
        "TrashFolder" => ItemKind::Trash,
        "Folder" => ItemKind::Folder,
        "Text" => ItemKind::Text,
        "Image" => ItemKind::Image,
        _ => ItemKind::File,
    }
}

fn item_from(e: &BytesStart) -> BinderItem {
    let mut item = BinderItem { key: String::new(), kind: ItemKind::File, title: String::new(), children: Vec::new() };
    for a in e.attributes().flatten() {
        let value = a.unescape_value().map(|v| v.into_owned()).unwrap_or_default();
        match a.key.local_name().as_ref() {
            b"UUID" | b"ID" => item.key = value,
            b"Type" => item.kind = kind_of(&value),
            _ => {}
        }
    }
    item
}

/// True when the element path is inside `<Binder>` (collections list items too).
fn in_binder(path: &[Vec<u8>]) -> bool {
    path.iter().any(|n| n.as_slice() == b"Binder")
}

fn attach(stack: &mut [BinderItem], roots: &mut Vec<BinderItem>, item: BinderItem) {
    match stack.last_mut() {
        Some(parent) => parent.children.push(item),
        None => roots.push(item),
    }
}

pub fn parse_binder(xml: &str) -> AppResult<Vec<BinderItem>> {
    let mut reader = Reader::from_str(xml);
    let mut roots = Vec::new();
    let mut stack: Vec<BinderItem> = Vec::new();
    let mut path: Vec<Vec<u8>> = Vec::new();
    let mut saw_binder = false;
    loop {
        match reader.read_event().map_err(|_| invalid())? {
            Event::Start(e) => {
                let name = e.local_name().as_ref().to_vec();
                if name == b"Binder" {
                    saw_binder = true;
                }
                if name == b"BinderItem" && in_binder(&path) {
                    stack.push(item_from(&e));
                }
                path.push(name);
            }
            Event::Empty(e) => {
                if e.local_name().as_ref() == b"BinderItem" && in_binder(&path) {
                    attach(&mut stack, &mut roots, item_from(&e));
                }
            }
            Event::Text(t) => {
                let n = path.len();
                if n >= 2 && path[n - 1] == b"Title" && path[n - 2] == b"BinderItem" && in_binder(&path[..n - 1]) {
                    if let Some(item) = stack.last_mut() {
                        item.title.push_str(&t.unescape().map_err(|_| invalid())?);
                    }
                }
            }
            Event::End(e) => {
                path.pop();
                if e.local_name().as_ref() == b"BinderItem" && in_binder(&path) {
                    if let Some(item) = stack.pop() {
                        attach(&mut stack, &mut roots, item);
                    }
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    if !saw_binder || !stack.is_empty() || !path.is_empty() {
        return Err(invalid());
    }
    Ok(roots)
}
```

Nota: `&#237;` (entidade numérica) e `&amp;` são resolvidos por `unescape`. Se o `Text` vier com espaços em volta do título, use `trim()` ao gravar o título final (no `binder`, depois do laço, ou já aqui).

- [ ] **Step 4: Implementar `project.rs`**

```rust
//! A `.scriv` project on disk: where each binder item's files live (Scrivener 2 and 3).
use std::{fs, io::ErrorKind, path::{Path, PathBuf}};

use super::{binder::{parse_binder, BinderItem}, rtf::rtf_to_doc};
use crate::error::{AppError, AppResult};
use crate::model::doc::Doc;
use crate::text::words::doc_text;

pub struct Project {
    pub dir: PathBuf,
    pub scrivx: PathBuf,
    pub title: String,
    v3: bool,
}

fn invalid() -> AppError {
    AppError::msg("Projeto do Scrivener inválido")
}

fn safe_key(key: &str) -> bool {
    !key.is_empty() && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn read_optional(path: &Path) -> AppResult<Option<Vec<u8>>> {
    match fs::read(path) {
        Ok(b) => Ok(Some(b)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}

impl Project {
    /// Accepts the `.scriv` folder or the `.scrivx` file inside it.
    pub fn open(path: &Path) -> AppResult<Project> {
        let (dir, scrivx) = if path.is_file() {
            (path.parent().ok_or_else(invalid)?.to_path_buf(), path.to_path_buf())
        } else {
            let found = fs::read_dir(path)
                .map_err(|_| invalid())?
                .filter_map(|e| e.ok().map(|e| e.path()))
                .find(|p| p.extension().is_some_and(|x| x.eq_ignore_ascii_case("scrivx")))
                .ok_or_else(invalid)?;
            (path.to_path_buf(), found)
        };
        let dir_name = dir.file_name().and_then(|n| n.to_str()).unwrap_or("");
        let title = match dir_name.strip_suffix(".scriv") {
            Some(t) if !t.is_empty() => t.to_string(),
            _ => scrivx.file_stem().and_then(|s| s.to_str()).unwrap_or("Projeto").to_string(),
        };
        let v3 = dir.join("Files").join("Data").is_dir();
        Ok(Project { dir, scrivx, title, v3 })
    }

    pub fn binder(&self) -> AppResult<Vec<BinderItem>> {
        let xml = fs::read_to_string(&self.scrivx).map_err(|_| invalid())?;
        parse_binder(&xml)
    }

    fn item_dir(&self) -> PathBuf {
        self.dir.join("Files").join(if self.v3 { "Data" } else { "Docs" })
    }

    /// The item's main file (`content.*` / `<ID>.*`), text preferred as `.rtf`.
    pub fn content(&self, key: &str) -> Option<PathBuf> {
        if !safe_key(key) {
            return None;
        }
        let (dir, stem) = if self.v3 { (self.item_dir().join(key), "content") } else { (self.item_dir(), key) };
        let mut found: Vec<PathBuf> = fs::read_dir(dir)
            .ok()?
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.is_file() && p.file_stem().and_then(|s| s.to_str()) == Some(stem))
            .collect();
        found.sort_by_key(|p| !p.extension().is_some_and(|x| x.eq_ignore_ascii_case("rtf")));
        found.into_iter().next()
    }

    fn side_file(&self, key: &str, v3_name: &str, v2_suffix: &str) -> Option<PathBuf> {
        if !safe_key(key) {
            return None;
        }
        Some(if self.v3 { self.item_dir().join(key).join(v3_name) } else { self.item_dir().join(format!("{key}{v2_suffix}")) })
    }

    /// The item's text; an item without a text file is an empty document.
    pub fn text(&self, key: &str) -> AppResult<Doc> {
        match self.content(key) {
            Some(p) if p.extension().is_some_and(|x| x.eq_ignore_ascii_case("rtf")) => {
                Ok(rtf_to_doc(&read_optional(&p)?.unwrap_or_default()))
            }
            _ => Ok(Doc::default()),
        }
    }

    /// Synopsis and document notes as plain text (unreadable parts are skipped).
    pub fn notes(&self, key: &str) -> String {
        let synopsis = self
            .side_file(key, "synopsis.txt", "_synopsis.txt")
            .and_then(|p| read_optional(&p).ok().flatten())
            .map(|b| String::from_utf8_lossy(&b).trim().to_string())
            .unwrap_or_default();
        let notes = self
            .side_file(key, "notes.rtf", "_notes.rtf")
            .and_then(|p| read_optional(&p).ok().flatten())
            .map(|b| doc_text(&rtf_to_doc(&b)).trim().to_string())
            .unwrap_or_default();
        [synopsis, notes].into_iter().filter(|s| !s.is_empty()).collect::<Vec<_>>().join("\n\n")
    }
}
```

- [ ] **Step 5: Rodar** — `cd src-tauri && cargo test scrivener` → PASS. (Dead-code warnings de `Project`/`ItemKind` só somem na Task 5; aceitável neste commit.)

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src
git commit -m "feat(scrivener): read the binder and locate item files (Scrivener 2 and 3)"
```

---

### Task 5: Importação do Scrivener e comandos (Rust)

**Files:**
- Create: `src-tauri/src/scrivener/import.rs`
- Create: `src-tauri/src/scrivener/scan.rs`
- Modify: `src-tauri/src/scrivener/mod.rs`
- Create: `src-tauri/src/commands/scrivener.rs`
- Modify: `src-tauri/src/commands/mod.rs`, `src-tauri/src/commands/dialog.rs`, `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `Project`, `BinderItem`, `ItemKind` (Task 4); `Workspace`/`Node`/`NodeKind` + `workspace_io::{read_workspace, write_workspace, write_node_doc, copy_into_area}` (Tasks 1–2); `ChapterEntry::new`, `write_chapter`, `delete_chapter_file`, `write_metadata`, `create_book`, `doc_words`, `new_id`, `now_ms`; `Library::{register, total_of, absorb, with_book}`.
- Produces:
  - `scan.rs`: `ScanItem { key, kind: String /* "draft"|"research"|"folder"|"text"|"image"|"file" */, title, children }` e `ScanView { title, items }` (Serialize camelCase); `scan(project: &Project) -> AppResult<ScanView>` (Lixeira fora; título vazio → "Sem título").
  - `import.rs`: `Outcome { chapters: usize, items: usize, warnings: usize }`; `import_into(project, chapter_folders: &HashSet<String>, dir, meta: &mut Metadata, wrap: Option<&str>) -> AppResult<Outcome>`; `import_new_book(root: &Path, project, chapter_folders) -> AppResult<(PathBuf, Metadata, Outcome)>`.
  - Comandos: `scrivener_pick(window) -> Option<String>`, `scrivener_scan(path: String) -> ScanView`, `scrivener_import(state, path: String, chapter_folders: Vec<String>, target: ImportTarget) -> ImportResult`, com `#[serde(tag = "type", rename_all = "camelCase")] enum ImportTarget { New, Book { id: String } }` e `ImportResult { book_id, chapters, items, warnings }` (camelCase).
  - `dialog.rs`: `pick_scrivener(window) -> Option<PathBuf>` com filtro "Projeto do Scrivener" `["scrivx", "scriv"]`.

**Regras de importação** (spec + rulings):
- Percorre o binder em ordem. Lixeira: ignorada.
- Item cujo `key` está em `chapter_folders` (pasta, Manuscrito, Pesquisa ou texto com filhos): cada **filho direto** vira capítulo:
  - texto sem filhos → capítulo (título, texto, notas do item);
  - pasta ou texto com filhos → capítulo com o título do filho; texto = texto próprio do filho + textos de todos os descendentes em profundidade, com `Separator` entre documentos não vazios; notas = notas não vazias do filho e dos descendentes unidas por linha em branco;
  - mídia (no nível do filho ou nos descendentes) → pasta "Anexos do manuscrito" na área de trabalho (plana);
  - o texto próprio da pasta marcada é ignorado.
- Qualquer outro item vai para a área de trabalho preservando hierarquia: pasta/Manuscrito/Pesquisa → `folder` (texto próprio não vazio vira primeiro filho `text` com o mesmo título); texto sem filhos → `text`; texto com filhos → `folder` com o texto como primeiro filho; imagem/PDF/outros → copia `content` para `area/arquivos/` (tipo pela extensão); mídia sem arquivo → aviso, sem nó.
- Notas do item → `notes` do nó / do capítulo. Título vazio → "Sem título".
- Documento de texto = `project.text(key)`; erro de leitura → aviso, documento vazio.
- Escrita: arquivos de capítulo e de nó conforme são criados (um documento em memória por vez); depois `area.json`; por último `metadata.json`.
- `wrap = Some(título)`: os nós novos da área de trabalho entram numa pasta nova com esse título (obra aberta); `None`: vão para a raiz (obra nova). Nada a acrescentar → `area.json` não é criado/alterado.
- Obra nova: `create_book(root, &project.title)`; o capítulo vazio inicial é retirado antes de importar e só volta (arquivo intacto) se a importação não trouxer capítulos; senão o arquivo dele é apagado.

- [ ] **Step 1: Testes que falham** — em `import.rs`, com um helper que monta um projeto Scrivener 3 falso:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use crate::model::doc::Block;
    use crate::model::workspace::NodeKind;
    use crate::ops::library::create_book;
    use crate::storage::{chapter_io::read_chapter, workspace_io::read_workspace};
    use crate::text::words::doc_text;

    const BINDER: &str = r#"<ScrivenerProject><Binder>
      <BinderItem UUID="D" Type="DraftFolder"><Title>Manuscrito</Title><Children>
        <BinderItem UUID="C1" Type="Folder"><Title>Capítulo 1</Title><Children>
          <BinderItem UUID="S1" Type="Text"><Title>Cena 1</Title></BinderItem>
          <BinderItem UUID="S2" Type="Text"><Title>Cena 2</Title></BinderItem>
          <BinderItem UUID="IMG" Type="Image"><Title>Esboço</Title></BinderItem>
        </Children></BinderItem>
        <BinderItem UUID="C2" Type="Text"><Title>Capítulo 2</Title></BinderItem>
      </Children></BinderItem>
      <BinderItem UUID="R" Type="ResearchFolder"><Title>Pesquisa</Title><Children>
        <BinderItem UUID="N1" Type="Text"><Title>Ana</Title></BinderItem>
        <BinderItem UUID="PDF" Type="PDF"><Title>Artigo</Title></BinderItem>
        <BinderItem UUID="GONE" Type="Image"><Title>Sumiu</Title></BinderItem>
      </Children></BinderItem>
      <BinderItem UUID="T" Type="TrashFolder"><Title>Lixeira</Title><Children>
        <BinderItem UUID="X" Type="Text"><Title>Apagado</Title></BinderItem></Children></BinderItem>
    </Binder></ScrivenerProject>"#;

    fn project(root: &Path) -> Project {
        let dir = root.join("Livro.scriv");
        let data = dir.join("Files/Data");
        let put = |key: &str, name: &str, body: &[u8]| {
            fs::create_dir_all(data.join(key)).unwrap();
            fs::write(data.join(key).join(name), body).unwrap();
        };
        fs::create_dir_all(&data).unwrap();
        fs::write(dir.join("Livro.scrivx"), BINDER).unwrap();
        put("S1", "content.rtf", br"{\rtf1 Primeira {\b cena}.\par}");
        put("S1", "synopsis.txt", b"Abertura");
        put("S2", "content.rtf", br"{\rtf1 Segunda cena.\par}");
        put("C2", "content.rtf", br"{\rtf1\qc Fim\par}");
        put("N1", "content.rtf", br"{\rtf1 Olhos cinzentos.\par}");
        put("N1", "notes.rtf", br"{\rtf1 Protagonista\par}");
        put("IMG", "content.png", b"png");
        put("PDF", "content.pdf", b"%PDF");
        Project::open(&dir).unwrap()
    }

    fn folders(keys: &[&str]) -> HashSet<String> {
        keys.iter().map(|k| k.to_string()).collect()
    }

    #[test]
    fn new_book_gets_chapters_and_workspace() {
        let tmp = tempfile::tempdir().unwrap();
        let p = project(tmp.path());
        let root = tmp.path().join("Scribalis");
        fs::create_dir_all(&root).unwrap();
        let (dir, meta, out) = import_new_book(&root, &p, &folders(&["D"])).unwrap();
        assert_eq!(meta.title, "Livro");
        assert_eq!((out.chapters, out.warnings), (2, 1));
        assert_eq!(meta.chapters.len(), 2);
        let c1 = &meta.chapters[0];
        assert_eq!((c1.title.as_str(), c1.notes.as_str()), ("Capítulo 1", "Abertura"));
        let d1 = read_chapter(&dir, c1).unwrap();
        assert_eq!(d1.content.len(), 3);
        assert_eq!(d1.content[1], Block::Separator);
        assert_eq!(doc_text(&d1), "Primeira cena.\n\nSegunda cena.");
        assert_eq!(meta.chapters[1].title, "Capítulo 2");
        let ws = read_workspace(&dir).unwrap();
        let titles: Vec<&str> = ws.items.iter().map(|n| n.title.as_str()).collect();
        assert_eq!(titles, vec!["Pesquisa", "Anexos do manuscrito"]);
        let research = &ws.items[0];
        assert_eq!(research.children.len(), 2); // "Sumiu" has no file: warning, no node
        assert_eq!((research.children[0].kind, research.children[0].notes.as_str()), (NodeKind::Text, "Protagonista"));
        assert_eq!(research.children[1].kind, NodeKind::File);
        assert_eq!(ws.items[1].children[0].kind, NodeKind::Image);
        assert!(!ws.items.iter().any(|n| n.title == "Lixeira"));
    }

    #[test]
    fn open_book_appends_chapters_and_wraps_workspace() {
        let tmp = tempfile::tempdir().unwrap();
        let p = project(tmp.path());
        let (dir, mut meta) = create_book(tmp.path(), "Minha").unwrap();
        let out = import_into(&p, &folders(&["D"]), &dir, &mut meta, Some("Livro")).unwrap();
        assert_eq!(out.chapters, 2);
        assert_eq!(meta.chapters.len(), 3);
        let ws = read_workspace(&dir).unwrap();
        assert_eq!(ws.items.len(), 1);
        assert_eq!(ws.items[0].title, "Livro");
        assert_eq!(ws.items[0].children[0].title, "Pesquisa");
    }

    #[test]
    fn nothing_marked_puts_everything_in_the_workspace() {
        let tmp = tempfile::tempdir().unwrap();
        let p = project(tmp.path());
        let root = tmp.path().join("Scribalis");
        fs::create_dir_all(&root).unwrap();
        let (dir, meta, out) = import_new_book(&root, &p, &HashSet::new()).unwrap();
        assert_eq!(out.chapters, 0);
        // The empty starter chapter stays, so the book is still valid.
        assert_eq!(meta.chapters.len(), 1);
        assert!(read_chapter(&dir, &meta.chapters[0]).is_ok());
        let ws = read_workspace(&dir).unwrap();
        assert_eq!(ws.items[0].title, "Manuscrito");
        assert_eq!(ws.items[0].children[0].kind, NodeKind::Folder);
    }

    #[test]
    fn scan_hides_the_trash() {
        let tmp = tempfile::tempdir().unwrap();
        let p = project(tmp.path());
        let view = crate::scrivener::scan::scan(&p).unwrap();
        assert_eq!(view.title, "Livro");
        let kinds: Vec<&str> = view.items.iter().map(|i| i.kind.as_str()).collect();
        assert_eq!(kinds, vec!["draft", "research"]);
    }
}
```

- [ ] **Step 2: Rodar e ver falhar** — `cd src-tauri && cargo test scrivener::import` → não compila.

- [ ] **Step 3: Implementar `scan.rs`**

```rust
//! What the import screen shows: the binder without the trash.
use serde::Serialize;

use super::{binder::{BinderItem, ItemKind}, project::Project};
use crate::error::AppResult;

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScanItem {
    pub key: String,
    pub kind: String,
    pub title: String,
    pub children: Vec<ScanItem>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScanView {
    pub title: String,
    pub items: Vec<ScanItem>,
}

fn kind_name(k: &ItemKind) -> &'static str {
    match k {
        ItemKind::Draft => "draft",
        ItemKind::Research => "research",
        ItemKind::Folder | ItemKind::Trash => "folder",
        ItemKind::Text => "text",
        ItemKind::Image => "image",
        ItemKind::File => "file",
    }
}

fn to_scan(items: &[BinderItem]) -> Vec<ScanItem> {
    items
        .iter()
        .filter(|i| i.kind != ItemKind::Trash)
        .map(|i| ScanItem {
            key: i.key.clone(),
            kind: kind_name(&i.kind).to_string(),
            title: if i.title.trim().is_empty() { "Sem título".to_string() } else { i.title.trim().to_string() },
            children: to_scan(&i.children),
        })
        .collect()
}

pub fn scan(project: &Project) -> AppResult<ScanView> {
    Ok(ScanView { title: project.title.clone(), items: to_scan(&project.binder()?) })
}
```

- [ ] **Step 4: Implementar `import.rs`**

```rust
//! Brings a Scrivener project into a book: chosen folders become chapters,
//! everything else lands in the workspace. One document in memory at a time.
use std::{collections::HashSet, path::{Path, PathBuf}};

use super::{binder::{BinderItem, ItemKind}, project::Project};
use crate::error::AppResult;
use crate::ids::{new_id, now_ms};
use crate::model::{
    doc::{Block, Doc},
    metadata::{ChapterEntry, Metadata},
    workspace::{Node, NodeKind},
};
use crate::ops::library::create_book;
use crate::storage::{
    chapter_io::{delete_chapter_file, write_chapter},
    metadata_io::write_metadata,
    workspace_io::{copy_into_area, read_workspace, write_node_doc, write_workspace},
};
use crate::text::words::doc_words;

pub struct Outcome {
    pub chapters: usize,
    pub items: usize,
    pub warnings: usize,
}

const ATTACHMENTS_TITLE: &str = "Anexos do manuscrito";

struct Ctx<'a> {
    project: &'a Project,
    dir: &'a Path,
    chapter_folders: &'a HashSet<String>,
    chapters: Vec<ChapterEntry>,
    attachments: Vec<Node>,
    items: usize,
    warnings: usize,
}

fn title_of(item: &BinderItem) -> String {
    let t = item.title.trim();
    if t.is_empty() { "Sem título".to_string() } else { t.to_string() }
}

fn has_text(doc: &Doc) -> bool {
    doc.content.iter().any(|b| !matches!(b, Block::Paragraph { content, .. } if content.is_empty()))
}

fn is_container(item: &BinderItem) -> bool {
    matches!(item.kind, ItemKind::Draft | ItemKind::Research | ItemKind::Folder | ItemKind::Trash)
        || (item.kind == ItemKind::Text && !item.children.is_empty())
}

impl Ctx<'_> {
    fn text(&mut self, key: &str) -> Doc {
        self.project.text(key).unwrap_or_else(|_| {
            self.warnings += 1;
            Doc::default()
        })
    }

    fn text_node(&mut self, title: &str, notes: String, doc: &Doc) -> AppResult<Node> {
        let id = new_id();
        let file = format!("{id}.md");
        write_node_doc(self.dir, &file, doc)?;
        let mut node = Node::leaf(id, NodeKind::Text, title, &file);
        node.notes = notes;
        self.items += 1;
        Ok(node)
    }

    fn media_node(&mut self, item: &BinderItem) -> AppResult<Option<Node>> {
        let Some(src) = self.project.content(&item.key) else {
            self.warnings += 1;
            return Ok(None);
        };
        let id = new_id();
        let (rel, kind) = copy_into_area(self.dir, &src, &id)?;
        let mut node = Node::leaf(id, kind, &title_of(item), &rel);
        node.notes = self.project.notes(&item.key);
        self.items += 1;
        Ok(Some(node))
    }

    /// Workspace node for an item outside chapter folders (None = skipped).
    fn node(&mut self, item: &BinderItem) -> AppResult<Option<Node>> {
        if item.kind == ItemKind::Trash {
            return Ok(None);
        }
        if self.chapter_folders.contains(&item.key) && is_container(item) {
            self.emit_chapters(item)?;
            return Ok(None);
        }
        match item.kind {
            ItemKind::Image | ItemKind::File => self.media_node(item),
            ItemKind::Text if item.children.is_empty() => {
                let doc = self.text(&item.key);
                let notes = self.project.notes(&item.key);
                self.text_node(&title_of(item), notes, &doc).map(Some)
            }
            _ => {
                let title = title_of(item);
                let mut folder = Node::folder(new_id(), &title);
                self.items += 1;
                let doc = self.text(&item.key);
                let notes = self.project.notes(&item.key);
                if has_text(&doc) || item.kind == ItemKind::Text {
                    folder.children.push(self.text_node(&title, notes, &doc)?);
                } else {
                    folder.notes = notes;
                }
                for child in &item.children {
                    if let Some(n) = self.node(child)? {
                        folder.children.push(n);
                    }
                }
                Ok(Some(folder))
            }
        }
    }

    /// Depth-first texts and notes under `item` (itself included); media go to attachments.
    fn gather(&mut self, item: &BinderItem, blocks: &mut Vec<Block>, notes: &mut Vec<String>) -> AppResult<()> {
        if item.kind == ItemKind::Trash {
            return Ok(());
        }
        if matches!(item.kind, ItemKind::Image | ItemKind::File) {
            if let Some(n) = self.media_node(item)? {
                self.attachments.push(n);
            }
            return Ok(());
        }
        let doc = self.text(&item.key);
        if has_text(&doc) {
            if !blocks.is_empty() {
                blocks.push(Block::Separator);
            }
            blocks.extend(doc.content);
        }
        let n = self.project.notes(&item.key);
        if !n.is_empty() {
            notes.push(n);
        }
        for child in &item.children {
            self.gather(child, blocks, notes)?;
        }
        Ok(())
    }

    fn emit_chapters(&mut self, folder: &BinderItem) -> AppResult<()> {
        for child in &folder.children {
            if matches!(child.kind, ItemKind::Image | ItemKind::File | ItemKind::Trash) {
                let (mut b, mut n) = (Vec::new(), Vec::new());
                self.gather(child, &mut b, &mut n)?;
                continue;
            }
            let (mut blocks, mut notes) = (Vec::new(), Vec::new());
            self.gather(child, &mut blocks, &mut notes)?;
            let doc = Doc::new(blocks);
            let mut entry = ChapterEntry::new(new_id());
            entry.title = title_of(child);
            entry.notes = notes.join("\n\n");
            entry.words = doc_words(&doc);
            write_chapter(self.dir, &entry, &doc)?;
            self.chapters.push(entry);
        }
        Ok(())
    }
}

/// Imports into an existing book: chapters go after the current ones; workspace
/// items go into a new folder named `wrap` (or the root when `None`).
pub fn import_into(
    project: &Project,
    chapter_folders: &HashSet<String>,
    dir: &Path,
    meta: &mut Metadata,
    wrap: Option<&str>,
) -> AppResult<Outcome> {
    let binder = project.binder()?;
    let mut ctx = Ctx { project, dir, chapter_folders, chapters: Vec::new(), attachments: Vec::new(), items: 0, warnings: 0 };
    let mut nodes = Vec::new();
    for item in &binder {
        if let Some(n) = ctx.node(item)? {
            nodes.push(n);
        }
    }
    if !ctx.attachments.is_empty() {
        let mut folder = Node::folder(new_id(), ATTACHMENTS_TITLE);
        folder.children = std::mem::take(&mut ctx.attachments);
        ctx.items += 1;
        nodes.push(folder);
    }
    if !nodes.is_empty() {
        let mut ws = read_workspace(dir)?;
        match wrap {
            Some(title) => {
                let mut folder = Node::folder(new_id(), title);
                folder.children = nodes;
                ws.items.push(folder);
            }
            None => ws.items.extend(nodes),
        }
        write_workspace(dir, &ws)?;
    }
    let chapters = ctx.chapters.len();
    meta.chapters.extend(ctx.chapters);
    meta.updated_at = now_ms();
    write_metadata(dir, meta)?;
    Ok(Outcome { chapters, items: ctx.items, warnings: ctx.warnings })
}

/// Creates a book named after the project and imports into it.
pub fn import_new_book(root: &Path, project: &Project, chapter_folders: &HashSet<String>) -> AppResult<(PathBuf, Metadata, Outcome)> {
    let (dir, mut meta) = create_book(root, &project.title)?;
    let starter = meta.chapters.remove(0);
    let outcome = import_into(project, chapter_folders, &dir, &mut meta, None)?;
    if meta.chapters.is_empty() {
        // Nothing became a chapter: keep the empty starter so the book stays valid.
        meta.chapters.push(starter);
        write_metadata(&dir, &meta)?;
    } else {
        delete_chapter_file(&dir, &starter)?;
    }
    Ok((dir, meta, outcome))
}
```

- [ ] **Step 5: `dialog.rs` + `commands/scrivener.rs`**
  - `pick_scrivener(window)`: igual a `pick_image`, filtro `("Projeto do Scrivener", &["scrivx", "scriv"])`.
  - `scrivener_pick(window) -> AppResult<Option<String>>`.
  - `scrivener_scan(path: String) -> AppResult<ScanView>`: `scan(&Project::open(Path::new(&path))?)` — não usa o estado.
  - `scrivener_import(state, path, chapter_folders, target)`:
    - `New`: `let mut lib = lock(&state)?; fs::create_dir_all(&lib.root)?; let (dir, meta, out) = import_new_book(&lib.root.clone(), &project, &set)?; lib.register(&dir, &meta);` → `ImportResult { book_id: meta.id, … }`.
    - `Book { id }`: `let before = lib.total_of(&id); lib.with_book(&id, |dir, meta| import_into(&project, &set, dir, meta, Some(&project.title)))?; lib.absorb(lib.total_of(&id).saturating_sub(before));`.
  - Registrar `pub mod scrivener;` e os três comandos no `generate_handler!`; `scrivener/mod.rs` com `pub mod binder; pub mod import; pub mod project; pub mod rtf; pub mod scan;`.

- [ ] **Step 6: Rodar tudo** — `cd src-tauri && cargo test` → PASS, **zero warnings**.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src
git commit -m "feat(scrivener): import projects into new or open books"
```

---

### Task 6: Editor reaproveitável — chave de documento com escopo

**Files:**
- Modify: `src/editor/bridge.ts`, `src/editor/bridge.test.ts`
- Modify: `src/store/saving.ts`, `src/store/saving.test.ts`
- Modify: `src/store/actions/chapters.ts`, `src/store/actions/library.ts` (e qualquer outro uso de `DocKey`/`chapterId` da ponte — `grep -rn "chapterId" src/editor src/store`)
- Modify: `src/editor/createEditor.ts`, `src/editor/writerKeys.ts`
- Modify: `src/components/editor/RichEditor.tsx`
- Create: `src/api/workspace.ts` (só `saveAreaDoc`/`loadAreaDoc` neste task; o resto vem na Task 7)

**Interfaces:**
- Produces:
  - `DocKey = { bookId: string; docId: string; scope: "chapter" | "area" }`; `sameKey` compara os três.
  - `saving.ts`: `scheduleDocSave()` (renomeia `scheduleChapterSave`; mantenha `scheduleChapterSave` só se simplificar — preferir renomear e atualizar usos), `cancelDocSave`, `settleDocSave`, `swapDocument(doc, key, apply)` inalterado na semântica. `saveDocNow(key)`: `scope === "chapter"` → comportamento atual (salva, atualiza palavras e "hoje"); `scope === "area"` → `saveAreaDoc(bookId, docId, doc)` sem mexer em palavras.
  - `src/api/workspace.ts`: `loadAreaDoc(bookId, id) → call<DocJSON>("workspace_load_doc", { bookId, id })`, `saveAreaDoc(bookId, id, doc) → call<void>("workspace_save_doc", { bookId, id, doc })`.
  - `createWriterEditor` options: `onSplit?: (before, after) => void` (ausente = Enter ×3 não divide, o terceiro Enter é um Enter normal), `ariaLabel: string`, `placeholder: string`; o id DOM continua `ch-body` (só um editor montado por vez).
  - `RichEditor` props: `{ scope: "chapter" | "area" }` — `chapter` mantém tudo como hoje (`onEditorChange`, `splitCurrent`, dica de Enter ×3, "Texto do capítulo", "Comece a escrever…"); `area` usa `onChange: scheduleDocSave`, sem `onSplit`, sem dica, `ariaLabel: "Texto do documento"`, `placeholder: "Escreva aqui…"`.

- [ ] **Step 1: Testes** — atualizar `bridge.test.ts` e `saving.test.ts` para a nova forma de `DocKey` e acrescentar em `saving.test.ts` (seguindo o padrão de mocks já usado no arquivo):
  - uma chave `area` salva via `workspace_save_doc` e **não** chama `chapter_save` nem `stats_today`;
  - trocar de uma chave `area` com texto pendente para uma chave `chapter` (via `swapDocument`) salva o texto pendente no documento da área, nunca no capítulo (Review Focus 3).
- [ ] **Step 2:** Rodar `bun run test` e ver os novos testes falharem.
- [ ] **Step 3:** Implementar conforme *Produces*. Em `writerKeys.ts`, o default de `onSplit` vira `null` e o ramo do Enter ×3 só corta quando `opts.onSplit` existe (sem ele, não conta streak nem mostra dica).
- [ ] **Step 4:** Typecheck + `bun run test` → PASS. O app dos capítulos deve continuar idêntico (Enter ×3, dica, salvamento).
- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "refactor(editor): scoped document keys so the editor can hold workspace texts"
```

---

### Task 7: Dados da área de trabalho no front (API, mock, estado, ações, árvore)

**Files:**
- Modify: `src/api/types.ts`, `src/api/workspace.ts`
- Create: `src/api/mock/workspace.ts`; Modify: `src/api/mock/index.ts`, `src/api/mock/db.ts` (árvore/documentos por obra no `MockBook`)
- Create: `src/lib/tree.ts`, `src/lib/tree.test.ts`
- Modify: `src/store/state.ts`
- Create: `src/store/actions/workspace.ts`, `src/store/actions/workspace.test.ts`

**Interfaces:**
- Consumes: `DocKey` com `scope`, `swapDocument`, `flushAll`, `scheduleDocSave` (Task 6); comandos Rust da Task 2.
- Produces:
  - Tipos: `NodeKind = "folder" | "text" | "image" | "file"`; `AreaNode { id; kind: NodeKind; title; notes; file?: string; children?: AreaNode[] }`; `Created { id; items: AreaNode[] }`; `ToChapterResult { book: BookMeta; items: AreaNode[] }`.
  - `src/api/workspace.ts`: `areaTree(bookId)`, `areaCreate(bookId, parent: string | null, index, kind: "folder" | "text", title)`, `areaRename(bookId, id, title)`, `areaSetNotes(bookId, id, notes)`, `areaMove(bookId, id, parent, index)`, `areaDelete(bookId, id)`, `loadAreaDoc`, `saveAreaDoc`, `areaPickFiles(bookId, parent) → AreaNode[] | null`, `areaToChapter(bookId, id) → ToChapterResult`, `areaOpenFile(bookId, id)` — nomes de comando da Task 2.
  - Mock: árvore e documentos em memória por obra, mesmas regras (ciclo recusado, "Item não encontrado"); `workspace_pick_files` lança "Adicionar arquivos só funciona no app desktop"; `workspace_open_file` lança "Abrir arquivos só funciona no app desktop"; `workspace_to_chapter` acrescenta um `MockChapter`.
  - `src/lib/tree.ts` (puro): `findNode(items, id)`, `locate(items, id) → { parent: string | null; index: number } | null`, `visibleRows(items, expanded: Set<string>) → { node; depth; parent: string | null }[]`, `type DropPos = "before" | "after" | "inside"`, `dropTarget(items, dragId, targetId, pos) → { parent: string | null; index: number } | null` — `null` se `dragId === targetId`, se o alvo está dentro do arrastado, ou `inside` em não-pasta; `index` é a posição **depois** de retirar o nó arrastado (mesma semântica de `move_node`).
  - Estado (`AppState`): `area: AreaNode[]`, `areaSel: string | null`, `areaOpen: string | null`, `areaExpanded: string[]`, `areaRenaming: string | null`, `areaRenameVal: string`, `areaConfirm: string | null`.
  - `actions/workspace.ts`: `loadArea()`, `selectNode(id)`, `openNode(id)` (texto: `flushAll` → `loadAreaDoc` → `swapDocument(doc, { bookId, docId: id, scope: "area" }, …)` → foco no corpo; imagem/anexo: só `areaOpen`), `toggleExpanded(id)`, `createNode(kind: "folder" | "text")` (pai = pasta selecionada, ou o pai do item selecionado, no fim; título padrão "Nova pasta"/"Novo documento"; já entra renomeando), `startNodeRename(id)`, `commitNodeRename()`, `cancelNodeRename()`, `setNodeNotes(id, notes)`, `deleteNode(id)` (primeira chamada arma `areaConfirm`, segunda exclui; se o aberto estava na subárvore, fecha), `moveNode(dragId, targetId, pos)` (usa `dropTarget`; `null` → nada), `addFiles()`, `sendToChapter(id)` (atualiza `state.book` e a árvore; flash "Enviado para os capítulos como capítulo NN"), `openFile(id)`. Erro "Item não encontrado" → recarrega a árvore. Pastas expandidas lembradas em `localStorage` (`area-expanded:<bookId>`, try/catch).

- [ ] **Step 1: Testes que falham** — `src/lib/tree.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AreaNode } from "../api/types";
import { dropTarget, locate, visibleRows } from "./tree";

const n = (id: string, kind: AreaNode["kind"], children?: AreaNode[]): AreaNode => ({ id, kind, title: id, notes: "", children });
const items: AreaNode[] = [n("a", "folder", [n("b", "text"), n("c", "image")]), n("d", "folder", [n("e", "folder")]), n("f", "file")];

describe("workspace tree helpers", () => {
  it("lists only rows under expanded folders", () => {
    expect(visibleRows(items, new Set()).map((r) => r.node.id)).toEqual(["a", "d", "f"]);
    const rows = visibleRows(items, new Set(["a"]));
    expect(rows.map((r) => [r.node.id, r.depth, r.parent])).toEqual([["a", 0, null], ["b", 1, "a"], ["c", 1, "a"], ["d", 0, null], ["f", 0, null]]);
  });

  it("locates parent and index", () => {
    expect(locate(items, "c")).toEqual({ parent: "a", index: 1 });
    expect(locate(items, "zz")).toBeNull();
  });

  it("computes drop targets with the index after removal", () => {
    expect(dropTarget(items, "f", "b", "after")).toEqual({ parent: "a", index: 1 });
    expect(dropTarget(items, "a", "f", "after")).toEqual({ parent: null, index: 2 });
    expect(dropTarget(items, "f", "a", "before")).toEqual({ parent: null, index: 0 });
    expect(dropTarget(items, "b", "d", "inside")).toEqual({ parent: "d", index: 1 });
  });

  it("refuses drops onto itself, into its own subtree or inside a non-folder", () => {
    expect(dropTarget(items, "d", "d", "inside")).toBeNull();
    expect(dropTarget(items, "d", "e", "inside")).toBeNull();
    expect(dropTarget(items, "d", "e", "before")).toBeNull();
    expect(dropTarget(items, "f", "b", "inside")).toBeNull();
  });
});
```

E `src/store/actions/workspace.test.ts` (sobre o mock, no padrão de `src/api/mock/chapter.test.ts`): criar pasta e texto, renomear, mover para dentro da pasta, excluir com confirmação dupla, `sendToChapter` acrescenta um capítulo ao `state.book`.

- [ ] **Step 2:** `bun run test` → falha.
- [ ] **Step 3:** Implementar conforme *Produces*.
- [ ] **Step 4:** Typecheck + `bun run test` → PASS.
- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat(workspace): workspace API, mock, state and actions"
```

---

### Task 8: Aba "Área de trabalho": navegação, layout e painel do documento

**Files:**
- Modify: `src/lib/types.ts` (`View = "library" | "editor" | "workspace"`), `src/store/focus.ts` (`"tree"`)
- Modify: `src/store/actions/workspace.ts` (`goWorkspace`, `goChapters`), `src/store/actions/ui.ts` (`homeTarget`)
- Modify: `src/components/chrome/TopBar.tsx` (abas), `src/App.tsx`
- Modify: `src/store/keys/global.ts` (Ctrl 1 / Ctrl 2), `src/data/shortcuts.ts`
- Create: `src/store/commands/workspace.ts`; Modify: `src/store/commands/palette.ts`
- Create: `src/components/workspace/Workspace.tsx`, `src/components/workspace/NodeView.tsx`, `src/components/workspace/EmptyArea.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: Task 6 (`RichEditor scope="area"`), Task 7 (estado e ações), `FormatBar`, `bookAsset`.
- Produces: `goWorkspace()` (flushAll → `loadArea` → `view: "workspace"`, fecha painéis, foco `"tree"`), `goChapters()` (flushAll → reabre o capítulo atual como `openBook` faz, `view: "editor"`), `workspaceCommands(): Command[]`.

Comportamento:
- **Abas** na TopBar sempre que há obra aberta (`editor` ou `workspace`): "Capítulos" | "Área de trabalho", botões com `aria-pressed`, mesmos estilos de `.crumb`; ficam depois do nome da obra.
- **Ctrl 1 / Ctrl 2** (`e.code === "Digit1"/"Digit2"`, sem Shift/Alt) no `rootKey` com obra aberta. Ajuda: "Capítulos / Área de trabalho" `["Ctrl", "1 2"]`.
- **App**: `workspace()` = `view === "workspace" && !!state.book` → `<Workspace />`; painel `spacing` também aparece na área de trabalho quando há texto aberto; `notes`/`index` só nos capítulos.
- **Paleta** na área de trabalho (`workspaceCommands`): "Capítulos" (Ctrl 1), "Novo documento", "Nova pasta", "Adicionar arquivos…", "Importar do Scrivener…" (a ação chega na Task 10 — até lá o item não aparece), "Renomear" e "Excluir" (com item selecionado), "Enviar para capítulos" (texto selecionado), "Voltar às obras", comandos de formatação quando há texto aberto, e os comuns. Nos capítulos, acrescentar "Área de trabalho" (Ctrl 2).
- **Layout** (`Workspace.tsx`): mesma área útil do `Editor` (`absolute inset-x-0 top-16 bottom-16`); coluna esquerda fixa de 280px para a árvore (a árvore é a Task 9 — aqui um contêiner com `role="tree"` e `focusRef("tree")` que lista `visibleRows` como texto simples é suficiente e será substituído) e à direita o `NodeView`.
- **NodeView**: 
  - `text`: título do nó (h2, estilo do título do capítulo, só leitura), `FormatBar`, `RichEditor scope="area"`, e abaixo um campo "Notas" (`textarea`, rótulo visível) que salva com `setNodeNotes` no `change`.
  - `image`: título e a imagem (`bookAsset(state.book.dir, "area/" + file, 0)`), contida na área (`object-contain`).
  - `file`: título, "Arquivo .ext" e botão "Abrir no app padrão" (`openFile`).
  - pasta ou nada aberto: `EmptyArea` com botões "Novo documento", "Nova pasta", "Adicionar arquivos" e uma linha de ajuda com os atalhos da árvore.
- `homeTarget()`: `library` → `"lib"`; `workspace` → `"body"` se há texto aberto, senão `"tree"`; `editor` → `"body"`.
- CSS com os tokens existentes, temas claro e escuro.

- [ ] **Step 1:** Implementar. Onde houver lógica pura nova (ex.: escolha do `homeTarget`), cobrir com vitest.
- [ ] **Step 2:** Typecheck, `bun run test`, `bun run build`. Conferir no navegador (`bun run dev`, mock): Ctrl 2 abre a aba, criar documento pela tela vazia, digitar, Ctrl 1 volta ao capítulo com o texto dele intacto, Ctrl 2 de novo reabre a árvore. Parar o servidor ao terminar.
- [ ] **Step 3: Commit**

```bash
git add src
git commit -m "feat(workspace): workspace tab, navigation and document pane"
```

---

### Task 9: Árvore interativa (teclado, renomear, excluir, arrastar, menu de contexto)

**Files:**
- Create: `src/components/workspace/WorkspaceTree.tsx`, `src/components/workspace/TreeRow.tsx`, `src/components/workspace/ContextMenu.tsx`
- Create: `src/store/keys/workspace.ts`
- Create: `src/components/workspace/dragMove.ts` (lógica de arrasto por ponteiro, sem JSX)
- Modify: `src/components/workspace/Workspace.tsx` (usa a árvore real), `src/styles/global.css`

**Interfaces:**
- Consumes: `visibleRows`, `dropTarget`, `DropPos` (Task 7); ações da Task 7.

Comportamento:
- **Árvore** (`role="tree"`, `tabIndex=0`, `aria-activedescendant` apontando para a linha selecionada, `focusRef("tree")`). Linha (`role="treeitem"`, `aria-selected`, `aria-expanded` em pastas, `data-node-id`): recuo por profundidade, chevron em pastas, ícone por tipo (SVG inline de traço, no estilo dos botões da barra), título, ou o input de renomear quando `areaRenaming === id`.
- **Mouse**: clique seleciona e abre (pasta: alterna expandir); duplo clique renomeia; botão direito abre o menu de contexto (`preventDefault`) no ponto do clique; clique direito no fundo vazio abre o menu da raiz (Novo documento, Nova pasta, Adicionar arquivos).
- **Teclado** (árvore focada, sem Ctrl/Alt): ↑/↓ movem a seleção pelas linhas visíveis; → expande pasta fechada ou vai ao primeiro filho; ← recolhe pasta aberta ou vai ao pai; Enter abre (texto/imagem/anexo) ou alterna pasta; F2 renomeia; Delete/Backspace excluem com confirmação dupla (o primeiro aperto mostra "Aperte Delete de novo para excluir «título»" via flash e marca a linha); Esc cancela a confirmação; `N` novo documento; `Shift N` nova pasta. Input de renomear: Enter confirma, Esc cancela, perde foco confirma; `stopPropagation` para o `rootKey` não agir.
- **Arrastar** com eventos de ponteiro (ruling: HTML5 DnD não funciona no Windows com o drop de arquivos do Tauri): `pointerdown` na linha guarda a origem; ao passar de 4px de movimento começa o arrasto (`setPointerCapture`); em cada `pointermove` acha a linha sob o ponteiro (`document.elementFromPoint` → `closest("[data-node-id]")`) e a posição: quarto de cima = `before`, quarto de baixo = `after`, meio = `inside` se for pasta, senão metade de cima/baixo; mostra um indicador (linha fina antes/depois ou fundo na pasta); se `dropTarget(...)` for `null`, o indicador some; `pointerup` chama `moveNode`; Esc durante o arrasto cancela. Clique simples sem movimento continua sendo clique. Pasta fechada sob o ponteiro por 600ms durante o arrasto se expande.
- **Menu de contexto** (`ContextMenu.tsx`, genérico: `items: { label; act; danger?; disabled? }[]`, posição, fecha com Esc, clique fora e após agir; setas ↑/↓ + Enter navegam; foco volta à árvore ao fechar). Itens por tipo: pasta → Novo documento, Nova pasta, Adicionar arquivos, Renomear, Excluir; texto → Abrir, Renomear, Enviar para capítulos, Excluir; imagem/anexo → Abrir, Abrir no app padrão (anexo), Renomear, Excluir.
- Seleção e abertura seguem o estado (`areaSel`, `areaOpen`) — o item aberto tem destaque próprio além da seleção.

- [ ] **Step 1:** Implementar. A lógica de posição de soltura dentro da linha (`offsetY/height` + `isFolder` → `DropPos`) fica como função pura em `dragMove.ts`, com teste vitest.
- [ ] **Step 2:** Typecheck, `bun run test`, `bun run build`. Conferir no navegador (mock): navegar por teclado, renomear (F2), excluir (Del Del), arrastar um texto para dentro de uma pasta e para antes de outro item, tentar arrastar uma pasta para dentro dela mesma (nada acontece), menu de contexto por mouse e por teclado. Parar o servidor ao terminar.
- [ ] **Step 3: Commit**

```bash
git add src
git commit -m "feat(workspace): interactive tree with keyboard, rename, delete, drag and context menu"
```

---

### Task 10: Tela de importação do Scrivener

**Files:**
- Modify: `src/api/types.ts`
- Create: `src/api/scrivener.ts`, `src/api/mock/scrivener.ts`; Modify: `src/api/mock/index.ts`
- Modify: `src/store/state.ts`
- Create: `src/store/actions/scrivener.ts`, `src/lib/scrivenerChoice.ts`, `src/lib/scrivenerChoice.test.ts`
- Create: `src/components/scrivener/ScrivenerImport.tsx`
- Modify: `src/App.tsx`, `src/components/library/LibraryHeader.tsx`, `src/store/commands/palette.ts` (biblioteca), `src/store/commands/workspace.ts`, `src/components/workspace/EmptyArea.tsx`, `src/styles/global.css`

**Interfaces:**
- Consumes: comandos da Task 5; `refreshLibrary`, `openBook`, `loadArea`, `flash`, `flashError`.
- Produces:
  - Tipos: `ScanKind = "draft" | "research" | "folder" | "text" | "image" | "file"`; `ScanItem { key; kind: ScanKind; title; children: ScanItem[] }`; `ScanView { title; items: ScanItem[] }`; `ImportTarget = { type: "new" } | { type: "book"; id: string }`; `ImportResult { bookId; chapters; items; warnings }`.
  - `src/api/scrivener.ts`: `pickScrivener() → string | null` (`scrivener_pick`), `scanScrivener(path)` (`scrivener_scan`), `importScrivener(path, chapterFolders: string[], target)` (`scrivener_import`). Mock: os três lançam "Importar do Scrivener só funciona no app desktop".
  - Estado: `scrivener: { path: string; view: ScanView; chosen: string[]; target: ImportTarget; busy: boolean } | null`.
  - `src/lib/scrivenerChoice.ts` (puro): `canBeChapters(item)` (draft, research, folder, ou text com filhos), `defaultChosen(view) → string[]` (keys dos itens `draft`), `toggleChosen(view, chosen, key) → string[]` (marcar uma pasta remove as descendentes marcadas), `coveredBy(view, chosen, key) → boolean` (algum ancestral está marcado — o checkbox aparece marcado e desabilitado), `countChapters(view, chosen) → number` (filhos diretos não-mídia das pastas marcadas).
  - `actions/scrivener.ts`: `startScrivenerImport(target)`, `toggleScrivenerFolder(key)`, `confirmScrivenerImport()`, `cancelScrivenerImport()`.

Comportamento:
- **Entrada:** botão "Importar do Scrivener" no cabeçalho da biblioteca (à esquerda da busca) e comando na paleta da biblioteca → `target: new`; na área de trabalho (tela vazia e paleta) → `target: book` da obra aberta.
- **Fluxo:** `pickScrivener` (cancelou → nada) → `scanScrivener` → abre o modal com `defaultChosen`.
- **Modal** (`ScrivenerImport.tsx`, com fundo escurecido como os outros painéis modais): título "Importar «nome do projeto»", texto curto explicando "Marque as pastas cujos itens viram capítulos. O resto vai para a área de trabalho."; árvore do binder (recuo, ícone por tipo) com checkbox "virar capítulos" só em itens `canBeChapters`; descendentes de uma pasta marcada aparecem marcados e desabilitados (`coveredBy`); rodapé com "N capítulos · o resto vai para a área de trabalho" (`countChapters`), botões "Importar" (primário) e "Cancelar". Esc cancela (com `stopPropagation`), Enter no botão importa. Enquanto importa: botões desabilitados e "Importando…".
- **Depois:** `new` → `refreshLibrary()` e `openBook(bookId)`; `book` → recarregar `state.book` (`bookApi.openBook`) e `loadArea()`. Flash: "Importado: X capítulos, Y itens" + (avisos > 0 ? " · N itens não puderam ser lidos" : ""), com singular/plural corretos (`plural` de `lib/format`). Erro → `flashError` e o modal continua aberto.

- [ ] **Step 1: Testes que falham** — `src/lib/scrivenerChoice.test.ts` cobrindo as cinco funções com uma `ScanView` pequena (Manuscrito com pasta de capítulo + texto; Pesquisa com imagem).
- [ ] **Step 2:** `bun run test` → falha.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Typecheck, `bun run test`, `bun run build`. No navegador (mock), clicar "Importar do Scrivener" mostra o flash de "só funciona no app desktop" sem quebrar nada. Parar o servidor ao terminar.
- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat(scrivener): import screen with chapter folder selection"
```

---

### Task 11: Verificação ponta a ponta (controlador)

- [ ] `cd src-tauri && cargo test` (zero warnings), `bun run test`, typecheck, `bun run build`.
- [ ] Navegador (mock): fluxo completo da área de trabalho (criar, renomear, mover por arrasto e teclado, excluir, notas, enviar para capítulos, alternar Ctrl 1/Ctrl 2 com texto pendente), temas claro e escuro, screenshots.
- [ ] Rust: importar um projeto Scrivener 3 falso mais realista (várias pastas, RTF do Scrivener com `\fonttbl`, `\stylesheet`, `\uc0\u`) montado em diretório temporário via teste — incluído na Task 5; o usuário testa com um projeto real no `bun run tauri dev`.
- [ ] Commit de qualquer ajuste.
