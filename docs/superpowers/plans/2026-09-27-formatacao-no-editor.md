# Formatação no editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O editor guarda e edita negrito, itálico, alinhamento e espaçamento por parágrafo (entrelinhas, espaço antes/depois, recuo da primeira linha) sem perder nada no Markdown em disco.

**Architecture:** O modelo `Doc` do Rust ganha `Marks` (bold/italic) nos trechos e `ParaAttrs` nos parágrafos, com clamps na desserialização. O Markdown usa `*`/`**`/`***` como *toggles* de marcas e uma linha kramdown `{: …}` depois de parágrafos formatados. No front, TipTap ganha Bold, Italic, TextAlign e uma extensão própria `ParagraphSpacing`, uma barra de formatação e um painel "Espaçamento".

**Tech Stack:** Rust (serde, serde_json), Tauri 2, SolidJS, TipTap 3, vitest, bun.

**Spec:** `docs/superpowers/specs/2026-09-27-formatacao-no-editor-design.md`

## Global Constraints

- Comentários de código sempre em **inglês**; textos de interface em **português**.
- Nada de arquivos Deus: cada arquivo uma responsabilidade; um `mod` Rust por assunto.
- Dados e processamento de dados no Rust; o webview guarda só estado de tela e o capítulo aberto.
- Todo task termina com um commit; mensagens de commit **sem** `Co-Authored-By` nem qualquer atribuição.
- Typecheck: `./node_modules/.bin/tsc.exe --noEmit -p .` — testes front: `bun run test` — testes Rust: `cargo test` em `src-tauri/`.
- Capítulos sem formatação e sem `*`/`\` no texto continuam **byte a byte iguais** no disco.
- Faixas: entrelinhas 1.0–3.0 (2 casas), antes/depois 0–96 pt (inteiro), recuo 0–5 cm (2 casas).
- Atalhos: Ctrl B negrito, Ctrl I itálico, Ctrl Shift L/E/R/J alinhamento, inserir imagem Ctrl Shift I; Ctrl E e Ctrl J globais só **sem** Shift.

## Rulings sobre o spec (decididas no planejamento)

- **Escapes:** só `\` e `*` são escapados em todo o texto; `{:` e `![` só no início de linha. O spec citava também `_` e `` ` ``; o parser nunca os interpreta, então escapá-los só mudaria bytes de capítulos existentes sem ganho.
- **Legado:** um `*palavra*` já existente em arquivo antigo passa a ser lido como itálico (semântica Markdown, e é o uso comum em webnovel). `*` sem par, `2 * 3` e barras soltas continuam literais.
- **Espaço nas bordas de trechos marcados:** um espaço em branco adjacente a uma troca de marcas recebe a interseção das marcas dos vizinhos não-brancos (ex.: o espaço final de "**oi **" deixa de ser negrito). É invisível e garante Markdown válido.
- **Marcas não atravessam linhas:** todas são fechadas antes de `\` (quebra de linha) e reabertas depois.
- `spaceBefore = 0` e `indent = 0` normalizam para `None` (iguais ao padrão); `spaceAfter = 0` é mantido (o padrão é 1em). `textAlign = "left"` normaliza para `None`.

## Review Focus

1. **Arquivo antigo com `*` e `\` soltos** (ex.: `2 * 3`, `a \ b`, `*nota` sem par): deve abrir com o mesmo texto visível, sem marcas espúrias e sem perder caracteres. Testes na Task 3.
2. **Negrito/itálico sobrepostos e adjacentes** (`**a***b*`, itálico dentro de negrito, trecho marcado contendo `*`): ida e volta exata. Testes na Task 3.
3. **Linha `{: …}` malformada ou texto do usuário começando com `{:`**: nada vira atributo por engano; nada se perde. Testes nas Tasks 2 e 3.
4. **JSON do front com valores estranhos** (null, string numérica, `"left"`, fora da faixa, marca desconhecida): salvar nunca falha, valores são limitados. Testes na Task 1.
5. **Enter ×3 (dividir capítulo) com texto formatado**: marcas e atributos seguem para os dois lados. Teste na Task 4.

---

### Task 1: Modelo Rust — marcas e atributos de parágrafo

**Files:**
- Modify: `src-tauri/src/model/doc.rs`
- Modify: `src-tauri/src/markdown/parse.rs` (só construtores, sem mudar comportamento)
- Modify: `src-tauri/src/markdown/serialize.rs` (só padrões `..`)
- Modify: `src-tauri/src/markdown/mod.rs` (helpers de teste)
- Modify: `src-tauri/src/text/words.rs`
- Modify: `src-tauri/src/storage/chapter_io.rs` (teste)

**Interfaces:**
- Produces:
  - `Block::Paragraph { attrs: ParaAttrs, content: Vec<Inline> }`
  - `Inline::Text { text: String, marks: Marks }`, `Inline::HardBreak`
  - `Marks { pub bold: bool, pub italic: bool }` (`Copy`, `Default`, `Eq`), `Marks::is_empty()`, `Marks::BOLD`, `Marks::ITALIC`, operador `^` (`BitXor`), `&` (`BitAnd`)
  - `Align { Center, Right, Justify }` (serde lowercase)
  - `ParaAttrs { text_align: Option<Align>, line_height: Option<f32>, space_before: Option<u16>, space_after: Option<u16>, indent: Option<f32> }`, `ParaAttrs::is_empty()`
  - Funções de clamp públicas: `ParaAttrs::clamp_line(f64) -> Option<f32>`, `clamp_before(f64) -> Option<u16>`, `clamp_after(f64) -> Option<u16>`, `clamp_indent(f64) -> Option<f32>`, `Align::parse(&str) -> Option<Align>`
  - Construtores: `Inline::text(&str) -> Inline`, `Inline::marked(&str, Marks) -> Inline`, `Block::paragraph(Vec<Inline>) -> Block`

- [ ] **Step 1: Escrever os testes que falham** — adicionar ao `mod tests` de `model/doc.rs`:

```rust
    #[test]
    fn reads_marks_and_paragraph_attrs() {
        let json = r#"{"type":"doc","content":[
            {"type":"paragraph","attrs":{"textAlign":"center","lineHeight":1.5,"spaceBefore":12,"spaceAfter":6,"indent":1.25},
             "content":[{"type":"text","text":"Oi","marks":[{"type":"italic"},{"type":"bold"}]}]}
        ]}"#;
        let doc: Doc = serde_json::from_str(json).unwrap();
        let Block::Paragraph { attrs, content } = &doc.content[0] else { panic!() };
        assert_eq!(attrs.text_align, Some(Align::Center));
        assert_eq!(attrs.line_height, Some(1.5));
        assert_eq!((attrs.space_before, attrs.space_after, attrs.indent), (Some(12), Some(6), Some(1.25)));
        assert_eq!(content[0], Inline::marked("Oi", Marks { bold: true, italic: true }));
    }

    #[test]
    fn odd_values_never_fail_and_are_clamped() {
        let json = r#"{"type":"doc","content":[
            {"type":"paragraph","attrs":{"textAlign":"left","lineHeight":"9","spaceBefore":null,"spaceAfter":-4,"indent":0},
             "content":[{"type":"text","text":"x","marks":[{"type":"underline"},{"type":"bold","attrs":{}}]}]},
            {"type":"paragraph","attrs":{"textAlign":"diagonal","lineHeight":0.2,"spaceBefore":500}}
        ]}"#;
        let doc: Doc = serde_json::from_str(json).unwrap();
        let Block::Paragraph { attrs, content } = &doc.content[0] else { panic!() };
        assert_eq!(attrs.text_align, None);
        assert_eq!(attrs.line_height, Some(3.0));
        assert_eq!(attrs.space_before, None);
        assert_eq!(attrs.space_after, Some(0));
        assert_eq!(attrs.indent, None);
        assert_eq!(content[0], Inline::marked("x", Marks::BOLD));
        let Block::Paragraph { attrs, .. } = &doc.content[1] else { panic!() };
        assert_eq!((attrs.text_align, attrs.line_height, attrs.space_before), (None, Some(1.0), Some(96)));
    }

    #[test]
    fn plain_content_serializes_without_marks_or_attrs() {
        let doc = Doc::new(vec![Block::paragraph(vec![Inline::text("a")])]);
        assert_eq!(serde_json::to_string(&doc).unwrap(),
            r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"a"}]}]}"#);
    }

    #[test]
    fn formatted_content_serializes_the_tiptap_shape() {
        let attrs = ParaAttrs { text_align: Some(Align::Justify), indent: Some(1.25), ..Default::default() };
        let doc = Doc::new(vec![Block::Paragraph { attrs, content: vec![Inline::marked("a", Marks::BOLD | Marks::ITALIC)] }]);
        assert_eq!(serde_json::to_string(&doc).unwrap(),
            r#"{"type":"doc","content":[{"type":"paragraph","attrs":{"textAlign":"justify","indent":1.25},"content":[{"type":"text","text":"a","marks":[{"type":"bold"},{"type":"italic"}]}]}]}"#);
    }
```

Atualizar o teste existente `reads_tiptap_json_and_ignores_unknown_fields`: a asserção vira
`assert_eq!(doc.content[1], Block::paragraph(vec![]));` (o `attrs {"x":1}` do primeiro parágrafo continua sendo ignorado).

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd src-tauri && cargo test model::doc`
Expected: erros de compilação (`Marks`, `ParaAttrs`, `Align` não existem).

- [ ] **Step 3: Implementar em `model/doc.rs`**

```rust
use std::ops::{BitAnd, BitOr, BitXor};

use serde::{ser::SerializeSeq, Deserialize, Deserializer, Serialize, Serializer};
use serde_json::Value;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Block {
    Paragraph {
        #[serde(default, skip_serializing_if = "ParaAttrs::is_empty")]
        attrs: ParaAttrs,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        content: Vec<Inline>,
    },
    Separator,
    Image {
        attrs: ImageAttrs,
    },
}

impl Block {
    pub fn paragraph(content: Vec<Inline>) -> Self {
        Block::Paragraph { attrs: ParaAttrs::default(), content }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Inline {
    Text {
        text: String,
        #[serde(default, skip_serializing_if = "Marks::is_empty")]
        marks: Marks,
    },
    HardBreak,
}

impl Inline {
    pub fn text(s: &str) -> Self {
        Inline::Text { text: s.to_string(), marks: Marks::default() }
    }
    pub fn marked(s: &str, marks: Marks) -> Self {
        Inline::Text { text: s.to_string(), marks }
    }
}

/// Character marks the editor supports; serialized as TipTap's `[{"type":"bold"}, …]`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Marks {
    pub bold: bool,
    pub italic: bool,
}

impl Marks {
    pub const BOLD: Marks = Marks { bold: true, italic: false };
    pub const ITALIC: Marks = Marks { bold: false, italic: true };
    pub fn is_empty(&self) -> bool {
        !self.bold && !self.italic
    }
}

impl BitXor for Marks {
    type Output = Marks;
    fn bitxor(self, o: Marks) -> Marks {
        Marks { bold: self.bold ^ o.bold, italic: self.italic ^ o.italic }
    }
}
impl BitAnd for Marks {
    type Output = Marks;
    fn bitand(self, o: Marks) -> Marks {
        Marks { bold: self.bold && o.bold, italic: self.italic && o.italic }
    }
}
impl BitOr for Marks {
    type Output = Marks;
    fn bitor(self, o: Marks) -> Marks {
        Marks { bold: self.bold || o.bold, italic: self.italic || o.italic }
    }
}

impl Serialize for Marks {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        #[derive(Serialize)]
        struct Tag {
            #[serde(rename = "type")]
            kind: &'static str,
        }
        let mut seq = s.serialize_seq(None)?;
        if self.bold { seq.serialize_element(&Tag { kind: "bold" })?; }
        if self.italic { seq.serialize_element(&Tag { kind: "italic" })?; }
        seq.end()
    }
}

impl<'de> Deserialize<'de> for Marks {
    /// Unknown marks (and their attrs) are dropped instead of failing the save.
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let list: Vec<Value> = Deserialize::deserialize(d)?;
        let mut m = Marks::default();
        for v in &list {
            match v.get("type").and_then(Value::as_str) {
                Some("bold") => m.bold = true,
                Some("italic") => m.italic = true,
                _ => {}
            }
        }
        Ok(m)
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Align {
    Center,
    Right,
    Justify,
}

impl Align {
    /// `left` (the default) and unknown values are `None`.
    pub fn parse(s: &str) -> Option<Align> {
        match s {
            "center" => Some(Align::Center),
            "right" => Some(Align::Right),
            "justify" => Some(Align::Justify),
            _ => None,
        }
    }
    pub fn as_str(self) -> &'static str {
        match self {
            Align::Center => "center",
            Align::Right => "right",
            Align::Justify => "justify",
        }
    }
}

/// Paragraph formatting; `None` means the app default.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "camelCase", from = "RawParaAttrs")]
pub struct ParaAttrs {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_align: Option<Align>,
    /// Line height multiplier.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line_height: Option<f32>,
    /// Points.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub space_before: Option<u16>,
    /// Points.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub space_after: Option<u16>,
    /// First-line indent in centimeters.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub indent: Option<f32>,
}

fn round2(v: f64) -> f32 {
    ((v * 100.0).round() / 100.0) as f32
}

impl ParaAttrs {
    pub fn is_empty(&self) -> bool {
        *self == ParaAttrs::default()
    }
    pub fn clamp_line(v: f64) -> Option<f32> {
        v.is_finite().then(|| round2(v.clamp(1.0, 3.0)))
    }
    pub fn clamp_before(v: f64) -> Option<u16> {
        // 0 is the default top margin.
        v.is_finite().then(|| v.clamp(0.0, 96.0).round() as u16).filter(|&n| n > 0)
    }
    pub fn clamp_after(v: f64) -> Option<u16> {
        v.is_finite().then(|| v.clamp(0.0, 96.0).round() as u16)
    }
    pub fn clamp_indent(v: f64) -> Option<f32> {
        // No indent is the default.
        v.is_finite().then(|| round2(v.clamp(0.0, 5.0))).filter(|&n| n > 0.0)
    }
}

/// What the webview sends: any field may be null, a string or out of range.
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct RawParaAttrs {
    text_align: Value,
    line_height: Value,
    space_before: Value,
    space_after: Value,
    indent: Value,
}

fn num(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.trim().parse().ok(),
        _ => None,
    }
}

impl From<RawParaAttrs> for ParaAttrs {
    fn from(r: RawParaAttrs) -> Self {
        ParaAttrs {
            text_align: r.text_align.as_str().and_then(Align::parse),
            line_height: num(&r.line_height).and_then(ParaAttrs::clamp_line),
            space_before: num(&r.space_before).and_then(ParaAttrs::clamp_before),
            space_after: num(&r.space_after).and_then(ParaAttrs::clamp_after),
            indent: num(&r.indent).and_then(ParaAttrs::clamp_indent),
        }
    }
}
```

(`Doc`, `ImageAttrs` e `doc_type` ficam como estão.)

- [ ] **Step 4: Ajustar os usos para compilar, sem mudar comportamento**
  - `markdown/parse.rs`: `Inline::Text { text: text.to_string() }` → `Inline::text(text)`; `Block::Paragraph { content }` → `Block::paragraph(content)`.
  - `markdown/serialize.rs`: `Block::Paragraph { content }` → `Block::Paragraph { content, .. }`; `Inline::Text { text }` → `Inline::Text { text, .. }`.
  - `markdown/mod.rs` testes: `fn p(parts) -> Block { Block::paragraph(parts) }`, `fn t(s) -> Inline { Inline::text(s) }`.
  - `text/words.rs`: padrões com `..`.
  - `storage/chapter_io.rs` teste: `Block::paragraph(vec![Inline::text("Oi")])`.

- [ ] **Step 5: Rodar tudo**

Run: `cd src-tauri && cargo test`
Expected: todos passam (os 58 anteriores + 4 novos).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src
git commit -m "feat(doc): bold/italic marks and paragraph formatting in the document model"
```

---

### Task 2: Markdown — linha de atributos `{: …}`

**Files:**
- Create: `src-tauri/src/markdown/attrs.rs`
- Modify: `src-tauri/src/markdown/mod.rs` (`pub mod attrs;`)

**Interfaces:**
- Consumes: `ParaAttrs`, `Align`, clamps da Task 1.
- Produces: `markdown::attrs::serialize(&ParaAttrs) -> Option<String>` (None se vazio) e `markdown::attrs::parse(&str) -> Option<ParaAttrs>` (None se a linha não for uma linha de atributos bem formada).

- [ ] **Step 1: Testes que falham** — em `attrs.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::doc::{Align, ParaAttrs};

    fn full() -> ParaAttrs {
        ParaAttrs { text_align: Some(Align::Center), line_height: Some(1.5), space_before: Some(24),
            space_after: Some(0), indent: Some(1.25) }
    }

    #[test]
    fn writes_keys_in_fixed_order_and_trims_numbers() {
        assert_eq!(serialize(&full()).unwrap(), "{: align=center line=1.5 before=24 after=0 indent=1.25}");
        let two = ParaAttrs { line_height: Some(2.0), ..Default::default() };
        assert_eq!(serialize(&two).unwrap(), "{: line=2}");
        assert_eq!(serialize(&ParaAttrs::default()), None);
    }

    #[test]
    fn reads_any_order_and_roundtrips() {
        assert_eq!(parse("{: indent=1.25 after=0 before=24 line=1.5 align=center}"), Some(full()));
        assert_eq!(parse(&serialize(&full()).unwrap()), Some(full()));
        assert_eq!(parse("  {:  align=justify  }  "), Some(ParaAttrs { text_align: Some(Align::Justify), ..Default::default() }));
    }

    #[test]
    fn unknown_keys_and_bad_values_are_ignored_but_clamped() {
        assert_eq!(parse("{: cor=azul line=abc before=500}"),
            Some(ParaAttrs { space_before: Some(96), ..Default::default() }));
    }

    #[test]
    fn malformed_lines_are_not_attrs() {
        assert_eq!(parse("{: align=center"), None);
        assert_eq!(parse("{: sem igual}"), None);
        assert_eq!(parse("texto {: align=center}"), None);
        assert_eq!(parse("{ align=center}"), None);
    }
}
```

- [ ] **Step 2: Rodar e ver falhar** — `cd src-tauri && cargo test markdown::attrs` → não compila.

- [ ] **Step 3: Implementar**

```rust
//! Kramdown-style attribute line written after a formatted paragraph:
//! `{: align=center line=1.5 before=12 after=6 indent=1.25}`.
use crate::model::doc::{Align, ParaAttrs};

/// Shortest decimal form: 2.0 → "2", 1.50 → "1.5".
fn num(v: f64) -> String {
    let s = format!("{v:.2}");
    s.trim_end_matches('0').trim_end_matches('.').to_string()
}

pub fn serialize(a: &ParaAttrs) -> Option<String> {
    let mut parts = Vec::new();
    if let Some(al) = a.text_align { parts.push(format!("align={}", al.as_str())); }
    if let Some(v) = a.line_height { parts.push(format!("line={}", num(v as f64))); }
    if let Some(v) = a.space_before { parts.push(format!("before={v}")); }
    if let Some(v) = a.space_after { parts.push(format!("after={v}")); }
    if let Some(v) = a.indent { parts.push(format!("indent={}", num(v as f64))); }
    (!parts.is_empty()).then(|| format!("{{: {}}}", parts.join(" ")))
}

/// `None` unless the whole line is `{: key=value …}`; bad values are skipped.
pub fn parse(line: &str) -> Option<ParaAttrs> {
    let inner = line.trim().strip_prefix("{:")?.strip_suffix('}')?;
    let mut a = ParaAttrs::default();
    for token in inner.split_whitespace() {
        let (key, value) = token.split_once('=')?;
        let n = value.parse::<f64>().ok();
        match key {
            "align" => a.text_align = Align::parse(value),
            "line" => a.line_height = n.and_then(ParaAttrs::clamp_line),
            "before" => a.space_before = n.and_then(ParaAttrs::clamp_before),
            "after" => a.space_after = n.and_then(ParaAttrs::clamp_after),
            "indent" => a.indent = n.and_then(ParaAttrs::clamp_indent),
            _ => {}
        }
    }
    Some(a)
}
```

Nota: `num(1.5f32 as f64)` — `1.5f32` é exato; para valores como `1.15f32` o `as f64` vira `1.149999…`, mas `{:.2}` arredonda para `1.15`. Adicione ao teste: `ParaAttrs { line_height: Some(1.15), ..}` serializa `{: line=1.15}`.

- [ ] **Step 4: Rodar** — `cd src-tauri && cargo test markdown::attrs` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/markdown
git commit -m "feat(markdown): paragraph attribute line"
```

---

### Task 3: Markdown — negrito/itálico, escapes e integração

**Files:**
- Create: `src-tauri/src/markdown/inline.rs`
- Modify: `src-tauri/src/markdown/mod.rs` (`pub mod inline;` + testes de ida e volta)
- Modify: `src-tauri/src/markdown/parse.rs`
- Modify: `src-tauri/src/markdown/serialize.rs`

**Interfaces:**
- Consumes: `Marks`, `Inline`, `Block`, `ParaAttrs` (Task 1), `attrs::{parse, serialize}` (Task 2).
- Produces:
  - `inline::serialize(content: &[Inline]) -> Vec<String>` — uma string Markdown por linha (linhas separadas por `HardBreak`), com escapes e delimitadores.
  - `inline::parse_line(line: &str) -> Vec<Inline>` — trechos `Inline::Text` de uma linha (sem `HardBreak`), trechos adjacentes com marcas iguais já unidos, texto vazio omitido.

**Regras (resumo do que o código abaixo implementa):**
- Escape: `\` → `\\`, `*` → `\*` sempre; depois, se a linha (ignorando espaços iniciais) começar com `{:` ou `![`, insere `\` antes.
- Delimitadores são *toggles*: `*` alterna itálico, `**` negrito, `***` ambos. Entre dois caracteres com marcas diferentes, emite-se o run correspondente a `anterior ^ próxima`.
- Espaço em branco recebe a interseção das marcas dos vizinhos não-brancos mais próximos (ausente = vazio), o que garante: abertura sempre antes de não-branco, fechamento sempre depois de não-branco, nada aberto no fim da linha.
- Parser: `\` seguido de `\ * { !` é escape; qualquer outra `\` é literal. Run de `*` com 1–3 caracteres é toggle se as aberturas forem seguidas de não-branco e os fechamentos precedidos de não-branco; senão é literal, assim como runs de 4+. Se a linha terminar com marcas abertas, a linha inteira é relida sem marcas (só escapes).

- [ ] **Step 1: Testes que falham** — em `inline.rs` (`mod tests`):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::doc::{Inline, Marks};

    const B: Marks = Marks::BOLD;
    const I: Marks = Marks::ITALIC;
    const BI: Marks = Marks { bold: true, italic: true };
    fn t(s: &str) -> Inline { Inline::text(s) }
    fn m(s: &str, k: Marks) -> Inline { Inline::marked(s, k) }
    fn line(c: &[Inline]) -> String { serialize(c).join("|") }

    #[test]
    fn writes_toggles() {
        assert_eq!(line(&[t("a "), m("b", B), t(" c")]), "a **b** c");
        assert_eq!(line(&[m("a", I), m("b", B)]), "*a***b**");
        assert_eq!(line(&[m("a", BI)]), "***a***");
        assert_eq!(line(&[m("a ", B), m("b", BI), t(" c")]), "**a *b*** c");
    }

    #[test]
    fn edge_whitespace_stays_outside_delimiters() {
        assert_eq!(line(&[t("a"), m(" b ", B), t("c")]), "a **b** c");
        assert_eq!(line(&[m("  ", B)]), "  ");
    }

    #[test]
    fn escapes_user_text() {
        assert_eq!(line(&[t("2 * 3 \\ 4")]), "2 \\* 3 \\\\ 4");
        assert_eq!(line(&[t("{: align=center}")]), "\\{: align=center}");
        assert_eq!(line(&[t("  ![](../x.png)")]), "  \\![](../x.png)");
        assert_eq!(line(&[t("***")]), "\\*\\*\\*");
        assert_eq!(line(&[m("*", B)]), "**\\***");
    }

    #[test]
    fn marks_close_before_hard_breaks() {
        assert_eq!(serialize(&[m("a", B), Inline::HardBreak, m("b", B)]), vec!["**a**", "**b**"]);
    }

    #[test]
    fn parses_what_it_writes() {
        let cases: Vec<Vec<Inline>> = vec![
            vec![t("a "), m("b", B), t(" c")],
            vec![m("a", I), m("b", B)],
            vec![m("a", BI)],
            vec![m("a ", B), m("b", BI), t(" c")],
            vec![t("2 * 3 \\ 4")],
            vec![t("{: align=center}")],
            vec![m("*", B), t("x")],
            vec![t("fim\\")],
            vec![m("negrito, ", B), m("itálico", BI), m(" e volta", B)],
        ];
        for c in cases {
            let s = line(&c);
            assert_eq!(parse_line(&s), c, "via {s:?}");
        }
    }

    #[test]
    fn legacy_text_keeps_its_characters() {
        assert_eq!(parse_line("2 * 3 = 6"), vec![t("2 * 3 = 6")]);
        assert_eq!(parse_line("a \\ b"), vec![t("a \\ b")]);
        assert_eq!(parse_line("*nota sem par"), vec![t("*nota sem par")]);
        assert_eq!(parse_line("**** quatro"), vec![t("**** quatro")]);
        assert_eq!(parse_line("isso acabou\\"), vec![t("isso acabou\\")]);
        assert_eq!(parse_line("um *dois* três"), vec![t("um "), m("dois", I), t(" três")]);
    }
}
```

- [ ] **Step 2: Rodar e ver falhar** — `cd src-tauri && cargo test markdown::inline` → não compila.

- [ ] **Step 3: Implementar `inline.rs`**

```rust
//! Bold/italic runs inside one markdown line. `*`, `**` and `***` toggle
//! italic, bold and both; `\` escapes `\ * { !`.
use crate::model::doc::{Inline, Marks};

const ESCAPABLE: [char; 4] = ['\\', '*', '{', '!'];

fn run(toggle: Marks) -> &'static str {
    match (toggle.bold, toggle.italic) {
        (true, true) => "***",
        (true, false) => "**",
        (false, true) => "*",
        (false, false) => "",
    }
}

/// One markdown string per line of the paragraph (lines split at hard breaks).
pub fn serialize(content: &[Inline]) -> Vec<String> {
    let mut lines = Vec::new();
    let mut chars: Vec<(char, Marks)> = Vec::new();
    for inline in content {
        match inline {
            Inline::Text { text, marks } => chars.extend(text.chars().map(|c| (c, *marks))),
            Inline::HardBreak => lines.push(line_md(std::mem::take(&mut chars))),
        }
    }
    lines.push(line_md(chars));
    lines
}

fn line_md(mut chars: Vec<(char, Marks)>) -> String {
    // Whitespace takes the marks both neighbours share, so delimiters always
    // touch non-whitespace and nothing is left open at the end of the line.
    let solid: Vec<Option<Marks>> = chars.iter().map(|&(c, m)| (!c.is_whitespace()).then_some(m)).collect();
    let mut left = vec![Marks::default(); chars.len()];
    let mut last = None;
    for (i, s) in solid.iter().enumerate() {
        left[i] = last.unwrap_or_default();
        if s.is_some() { last = *s; }
    }
    let mut next = None;
    for i in (0..chars.len()).rev() {
        if solid[i].is_some() {
            next = solid[i];
        } else {
            chars[i].1 = left[i] & next.unwrap_or_default();
        }
    }

    let mut out = String::new();
    let mut open = Marks::default();
    for (c, m) in chars {
        out.push_str(run(open ^ m));
        open = m;
        if c == '\\' || c == '*' { out.push('\\'); }
        out.push(c);
    }
    out.push_str(run(open));

    let lead = out.len() - out.trim_start().len();
    if out[lead..].starts_with("{:") || out[lead..].starts_with("![") {
        out.insert(lead, '\\');
    }
    out
}

/// Text runs of one line; falls back to literal text when marks stay open.
pub fn parse_line(line: &str) -> Vec<Inline> {
    let (runs, open) = scan(line, true);
    if open.is_empty() { runs } else { scan(line, false).0 }
}

fn push(out: &mut Vec<Inline>, c: char, marks: Marks) {
    if let Some(Inline::Text { text, marks: m }) = out.last_mut() {
        if *m == marks {
            text.push(c);
            return;
        }
    }
    out.push(Inline::Text { text: c.to_string(), marks });
}

fn scan(line: &str, with_marks: bool) -> (Vec<Inline>, Marks) {
    let chars: Vec<char> = line.chars().collect();
    let mut out = Vec::new();
    let mut open = Marks::default();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c == '\\' && chars.get(i + 1).is_some_and(|n| ESCAPABLE.contains(n)) {
            push(&mut out, chars[i + 1], open);
            i += 2;
            continue;
        }
        if c == '*' {
            let n = chars[i..].iter().take_while(|&&x| x == '*').count();
            let toggle = match n {
                1 => Some(Marks::ITALIC),
                2 => Some(Marks::BOLD),
                3 => Some(Marks::BOLD | Marks::ITALIC),
                _ => None,
            };
            if let Some(toggle) = toggle.filter(|_| with_marks) {
                let opening = toggle & (open ^ toggle);
                let closing = toggle & open;
                let before = i.checked_sub(1).map(|j| chars[j]);
                let after = chars.get(i + n).copied();
                let solid = |x: Option<char>| x.is_some_and(|x| !x.is_whitespace());
                if (opening.is_empty() || solid(after)) && (closing.is_empty() || solid(before)) {
                    open = open ^ toggle;
                    i += n;
                    continue;
                }
            }
            for _ in 0..n { push(&mut out, '*', open); }
            i += n;
            continue;
        }
        push(&mut out, c, open);
        i += 1;
    }
    (out, open)
}
```

Nota: em `parse_line("um *dois* três")`, o primeiro `*` abre (seguido de `d`), o segundo fecha (precedido de `s`). Em `"2 * 3"` o `*` falha as duas condições e fica literal.

- [ ] **Step 4: Rodar** — `cd src-tauri && cargo test markdown::inline` → PASS.

- [ ] **Step 5: Integrar no `serialize.rs`**

```rust
use super::parse::{IMAGE_PREFIX, SEPARATOR_LINE};
use super::{attrs, inline};
use crate::model::doc::{Block, Doc};

/// Writes a document back to chapter markdown. Empty paragraphs are dropped.
pub fn serialize(doc: &Doc) -> String {
    let parts: Vec<String> = doc.content.iter().filter_map(block_md).collect();
    if parts.is_empty() { String::new() } else { parts.join("\n\n") + "\n" }
}

fn block_md(block: &Block) -> Option<String> {
    match block {
        Block::Paragraph { attrs: a, content } => {
            let mut lines = inline::serialize(content);
            // A trailing blank line would reload as a paragraph break, leaving a
            // stray `\` on the line before it; drop such lines instead.
            while lines.len() > 1 && lines.last().is_some_and(|l| l.trim().is_empty()) {
                lines.pop();
            }
            let s = lines.join("\\\n");
            if s.trim().is_empty() {
                return None;
            }
            Some(match attrs::serialize(a) {
                Some(line) => format!("{s}\n{line}"),
                None => s,
            })
        }
        Block::Separator => Some(SEPARATOR_LINE.to_string()),
        Block::Image { attrs } => Some(format!("{IMAGE_PREFIX}{})", attrs.src)),
    }
}
```

- [ ] **Step 6: Integrar no `parse.rs`** — manter o laço de linhas; trocar `flush` por:

```rust
fn flush(lines: &mut Vec<&str>, blocks: &mut Vec<Block>) {
    if lines.is_empty() {
        return;
    }
    // A trailing `{: …}` line holds the paragraph's formatting.
    let mut attrs = ParaAttrs::default();
    if lines.len() > 1 {
        if let Some(a) = attrs::parse(lines[lines.len() - 1]) {
            attrs = a;
            lines.pop();
        }
    }
    let mut content = Vec::new();
    for (i, line) in lines.iter().enumerate() {
        if i > 0 {
            content.push(Inline::HardBreak);
        }
        // Only non-final lines end with the `\` hard-break marker.
        let is_last_line = i == lines.len() - 1;
        let text = if is_last_line { *line } else { line.strip_suffix('\\').unwrap_or(line) };
        content.extend(inline::parse_line(text));
    }
    blocks.push(Block::Paragraph { attrs, content });
    lines.clear();
}
```

Imports: `use super::{attrs, inline};` e `use crate::model::doc::{Block, Doc, ImageAttrs, Inline, ParaAttrs};`. Atualizar o doc-comment de `parse` para citar negrito/itálico e a linha `{: …}`.

- [ ] **Step 7: Testes de integração em `markdown/mod.rs`** — o teste existente `roundtrip_keeps_user_text_literal` continua valendo (agora via escapes). Adicionar:

```rust
    fn pa(attrs: ParaAttrs, parts: Vec<Inline>) -> Block {
        Block::Paragraph { attrs, content: parts }
    }

    #[test]
    fn roundtrip_formatting() {
        let centered = ParaAttrs { text_align: Some(Align::Center), space_before: Some(24), ..Default::default() };
        let novel = ParaAttrs { indent: Some(1.25), line_height: Some(1.5), space_after: Some(0), ..Default::default() };
        let doc = Doc::new(vec![
            pa(centered, vec![Inline::marked("Capítulo um", Marks::BOLD)]),
            pa(novel, vec![t("Era "), Inline::marked("uma", Marks::ITALIC), t(" vez"), Inline::HardBreak, t("{: não é attr}")]),
            Block::Separator,
            p(vec![t("***")]),
            p(vec![t("![](../imagens/falsa.png)")]),
        ]);
        let md = serialize(&doc);
        assert_eq!(parse(&md), doc, "via {md:?}");
        assert!(md.starts_with("**Capítulo um**\n{: align=center before=24}\n\n"));
    }

    #[test]
    fn plain_chapters_are_byte_identical() {
        let md = "Primeiro\\\nsegunda linha\n\n***\n\n![](../imagens/a.png)\n\n— Então é hoje — murmurou.\n";
        assert_eq!(serialize(&parse(md)), md);
    }

    #[test]
    fn a_lone_attr_line_is_text() {
        assert_eq!(parse("{: align=center}").content, vec![p(vec![t("{: align=center}")])]);
    }
```

(com `use crate::model::doc::{Align, Marks, ParaAttrs};` no `mod tests`.)

- [ ] **Step 8: Rodar tudo** — `cd src-tauri && cargo test` → PASS (incluindo busca e contagem de palavras, que não mudam).

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/markdown
git commit -m "feat(markdown): bold/italic runs, escapes and paragraph attributes in chapter files"
```

---

### Task 4: Editor TipTap — extensões, tipos e estilos

**Files:**
- Modify: `package.json` / `bun.lock` (via `bun add`)
- Modify: `src/api/types.ts`
- Create: `src/editor/spacing.ts` (atributos puros + extensão `ParagraphSpacing`)
- Create: `src/editor/spacing.test.ts`
- Modify: `src/editor/createEditor.ts`
- Modify: `src/editor/split.test.ts`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: formato JSON da Task 1 (`attrs.textAlign|lineHeight|spaceBefore|spaceAfter|indent`, `marks: [{type:"bold"|"italic"}]`).
- Produces:
  - Tipos: `MarkJSON = { type: "bold" | "italic" }`; `InlineJSON = { type: "text"; text: string; marks?: MarkJSON[] } | { type: "hardBreak" }`; `Align = "left" | "center" | "right" | "justify"`; `ParaAttrsJSON = Partial<{ textAlign: Align | null; lineHeight: number | null; spaceBefore: number | null; spaceAfter: number | null; indent: number | null }>`; `BlockJSON` paragraph `{ type: "paragraph"; attrs?: ParaAttrsJSON; content?: InlineJSON[] }`.
  - `src/editor/spacing.ts`: `export type SpacingAttrs = { lineHeight?: number | null; spaceBefore?: number | null; spaceAfter?: number | null; indent?: number | null }`; `export const SPACING_KEYS = ["lineHeight", "spaceBefore", "spaceAfter", "indent"] as const`; funções puras `spacingStyle(key, value): string | null` e `readSpacing(key, style: CSSStyleDeclaration | { [k: string]: string }): number | null`; extensão `ParagraphSpacing` com comandos TipTap `setSpacing(attrs: SpacingAttrs)` e `clearParagraphFormat()`.

- [ ] **Step 1: Dependências**

Run: `bun add @tiptap/extension-bold@3 @tiptap/extension-italic@3 @tiptap/extension-text-align@3`

- [ ] **Step 2: Teste que falha** — `src/editor/spacing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readSpacing, spacingStyle } from "./spacing";

describe("paragraph spacing attributes", () => {
  it("renders CSS with the stored units", () => {
    expect(spacingStyle("lineHeight", 1.5)).toBe("line-height: 1.5");
    expect(spacingStyle("spaceBefore", 12)).toBe("margin-top: 12pt");
    expect(spacingStyle("spaceAfter", 0)).toBe("margin-bottom: 0pt");
    expect(spacingStyle("indent", 1.25)).toBe("text-indent: 1.25cm");
    expect(spacingStyle("indent", null)).toBeNull();
  });

  it("reads back only the units it writes", () => {
    const style = { lineHeight: "1.5", marginTop: "12pt", marginBottom: "0pt", textIndent: "1.25cm" };
    expect(readSpacing("lineHeight", style)).toBe(1.5);
    expect(readSpacing("spaceBefore", style)).toBe(12);
    expect(readSpacing("spaceAfter", style)).toBe(0);
    expect(readSpacing("indent", style)).toBe(1.25);
    // Pasted HTML in other units is dropped, not misread.
    expect(readSpacing("lineHeight", { lineHeight: "24px" })).toBeNull();
    expect(readSpacing("spaceBefore", { marginTop: "1em" })).toBeNull();
    expect(readSpacing("indent", { textIndent: "" })).toBeNull();
  });
});
```

Run: `bun run test -- src/editor/spacing.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar `src/editor/spacing.ts`**

```ts
import { Extension } from "@tiptap/core";

export type SpacingAttrs = {
  lineHeight?: number | null;
  spaceBefore?: number | null;
  spaceAfter?: number | null;
  indent?: number | null;
};
export type SpacingKey = keyof SpacingAttrs;
export const SPACING_KEYS = ["lineHeight", "spaceBefore", "spaceAfter", "indent"] as const;

/** CSS property, style-object key and unit per attribute ("" = unitless). */
const CSS: Record<SpacingKey, { prop: string; key: string; unit: string }> = {
  lineHeight: { prop: "line-height", key: "lineHeight", unit: "" },
  spaceBefore: { prop: "margin-top", key: "marginTop", unit: "pt" },
  spaceAfter: { prop: "margin-bottom", key: "marginBottom", unit: "pt" },
  indent: { prop: "text-indent", key: "textIndent", unit: "cm" },
};

export function spacingStyle(key: SpacingKey, value: number | null | undefined): string | null {
  if (value == null) return null;
  const c = CSS[key];
  return `${c.prop}: ${value}${c.unit}`;
}

/** Parses a style value back, accepting only the unit we write. */
export function readSpacing(key: SpacingKey, style: { [k: string]: string } | CSSStyleDeclaration): number | null {
  const c = CSS[key];
  const raw = String((style as Record<string, string>)[c.key] ?? "").trim();
  const m = raw.match(/^(-?\d+(?:\.\d+)?)([a-z]*)$/);
  if (!m || m[2] !== c.unit) return null;
  return Number(m[1]);
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    paragraphSpacing: {
      /** Sets spacing on the paragraphs in the selection; null clears a value. */
      setSpacing: (attrs: SpacingAttrs) => ReturnType;
      /** Back to the app defaults: spacing and alignment. */
      clearParagraphFormat: () => ReturnType;
    };
  }
}

/** Line height, space before/after and first-line indent on paragraphs. */
export const ParagraphSpacing = Extension.create({
  name: "paragraphSpacing",

  addGlobalAttributes() {
    const attributes = Object.fromEntries(
      SPACING_KEYS.map((key) => [
        key,
        {
          default: null,
          parseHTML: (el: HTMLElement) => readSpacing(key, el.style),
          renderHTML: (attrs: Record<string, unknown>) => {
            const style = spacingStyle(key, attrs[key] as number | null);
            return style ? { style } : {};
          },
        },
      ]),
    );
    return [{ types: ["paragraph"], attributes }];
  },

  addCommands() {
    return {
      setSpacing:
        (attrs) =>
        ({ commands }) =>
          commands.updateAttributes("paragraph", attrs),
      clearParagraphFormat:
        () =>
        ({ commands }) =>
          commands.resetAttributes("paragraph", [...SPACING_KEYS, "textAlign"]),
    };
  },
});
```

Run: `bun run test -- src/editor/spacing.test.ts` → PASS.

- [ ] **Step 4: Registrar no editor** — `createEditor.ts`: importar `Bold` de `@tiptap/extension-bold`, `Italic` de `@tiptap/extension-italic`, `TextAlign` de `@tiptap/extension-text-align`, `ParagraphSpacing` de `./spacing`; acrescentar às extensões:

```ts
      Bold,
      Italic,
      TextAlign.configure({ types: ["paragraph"], alignments: ["left", "center", "right", "justify"] }),
      ParagraphSpacing,
```

Atualizar o doc-comment: "The chapter editor with only the nodes and marks our markdown can store." Se `TextAlign` salvar `"left"` explicitamente, está ok: o Rust normaliza para `None`.

- [ ] **Step 5: Tipos** — em `src/api/types.ts` aplicar exatamente os tipos listados em *Produces*. Rodar o typecheck e corrigir usos que quebrarem (ex.: mocks que constroem `InlineJSON`).

- [ ] **Step 6: Split preserva formatação** — em `split.test.ts`, criar um **segundo** schema só para este teste (o existente fica intacto, para não mudar o JSON esperado dos testes atuais):

```ts
const rich = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*", attrs: { textAlign: { default: null } } },
    text: { group: "inline" },
  },
  marks: { bold: {} },
});
```

e o teste abaixo usando `rich` no lugar de `schema`:

```ts
  it("keeps marks and paragraph attrs on both halves", () => {
    const bold = rich.marks.bold.create();
    const doc = rich.node("doc", null, [
      rich.node("paragraph", { textAlign: "center" }, [rich.text("antes", [bold])]),
      rich.node("paragraph"),
      rich.node("paragraph"),
      rich.node("paragraph", { textAlign: "right" }, [rich.text("depois", [bold])]),
    ]);
    let pos = 0;
    for (let i = 0; i < 3; i++) pos += doc.child(i).nodeSize;
    const base = EditorState.create({ doc, schema: rich });
    const state = base.apply(base.tr.setSelection(TextSelection.create(doc, pos + 1)));
    const out = splitAtCursor(state)!;
    expect(out.before.content[0]).toMatchObject({ attrs: { textAlign: "center" }, content: [{ text: "antes", marks: [{ type: "bold" }] }] });
    expect(out.after.content[0]).toMatchObject({ attrs: { textAlign: "right" }, content: [{ text: "depois", marks: [{ type: "bold" }] }] });
  });
```

Rodar: `bun run test` → PASS.

- [ ] **Step 7: CSS** — em `global.css`, junto de `.ed-body p`:

```css
  .ed-body strong {
    font-weight: 700;
  }
  .ed-body em {
    font-style: italic;
  }
```

- [ ] **Step 8: Verificar** — `./node_modules/.bin/tsc.exe --noEmit -p .` e `bun run test` → sem erros.

- [ ] **Step 9: Commit**

```bash
git add package.json bun.lock src
git commit -m "feat(editor): bold, italic, alignment and paragraph spacing in TipTap"
```

---

### Task 5: Comandos de formatação, atalhos, paleta e ajuda

**Files:**
- Create: `src/editor/format.ts`
- Modify: `src/editor/bridge.ts` (exportar o editor ativo)
- Modify: `src/editor/createEditor.ts` (callback `onFormat`)
- Modify: `src/components/editor/RichEditor.tsx`
- Create: `src/store/commands/format.ts`
- Modify: `src/store/commands/palette.ts`
- Modify: `src/store/keys/global.ts`
- Modify: `src/data/shortcuts.ts`
- Modify: `src/lib/types.ts` (Panel `"spacing"`)

**Interfaces:**
- Consumes: comandos TipTap `toggleBold`, `toggleItalic`, `setTextAlign`, `setSpacing`, `clearParagraphFormat` (Task 4).
- Produces:
  - `bridge.ts`: `export function activeEditor(): Editor | null`.
  - `format.ts`:
    - `export interface FormatState { bold: boolean; italic: boolean; align: Align; lineHeight: number | null; spaceBefore: number | null; spaceAfter: number | null; indent: number | null }`
    - `export const [formatState, setFormatState]` (Solid `createSignal<FormatState>`, valor inicial tudo falso/`"left"`/`null`)
    - `export function readFormat(editor: Editor): FormatState` — marcas via `editor.isActive("bold")`/`("italic")`; atributos do parágrafo em `editor.state.selection.$from.parent.attrs`.
    - `export function toggleBold()`, `toggleItalic()`, `setAlign(a: Align)`, `setSpacing(attrs: SpacingAttrs)`, `applySpacingToAll(attrs: SpacingAttrs)`, `clearParagraphFormat()`. Marcas e alinhamento usam `chain().focus()`; `setSpacing` **não** chama `focus()` (é usado com o foco nos campos do painel). `applySpacingToAll` guarda `{from, to}` da seleção, faz `selectAll().setSpacing(attrs)` e restaura a seleção.
  - `lib/types.ts`: `Panel = "palette" | "index" | "notes" | "help" | "spacing"`.
  - `store/commands/format.ts`: `export function formatCommands(): Command[]`.

- [ ] **Step 1:** `bridge.ts` — adicionar `export const activeEditor = (): Editor | null => editor;`.
- [ ] **Step 2:** `createEditor.ts` — `WriterEditorOptions` ganha `onFormat: (editor: Editor) => void`; no `new Editor({...})` adicionar `onTransaction: ({ editor }) => o.onFormat(editor)`. `RichEditor.tsx` passa `onFormat: (ed) => setFormatState(readFormat(ed))`.
- [ ] **Step 3:** Implementar `format.ts` conforme *Produces* (sem lógica de dados; só comandos do editor).
- [ ] **Step 4:** `store/keys/global.ts`:
  - `Ctrl J` (tema) e `Ctrl E` (índice): acrescentar `!e.shiftKey`.
  - Inserir imagem: `ed && mod && e.shiftKey && (k === "i" || code === "KeyI")`.
  - Nenhum handler para Ctrl B / Ctrl I / Ctrl Shift L,E,R,J: o keymap do TipTap trata dentro do editor. Garantir que o `rootKey` não os captura fora do editor de forma que atrapalhe (Ctrl I sem Shift deixa de fazer qualquer coisa globalmente).
- [ ] **Step 5:** `store/commands/format.ts` — comandos (só quando a view é `editor`): "Negrito" `Ctrl B`, "Itálico" `Ctrl I`, "Alinhar à esquerda" `Ctrl Shift L`, "Centralizar" `Ctrl Shift E`, "Alinhar à direita" `Ctrl Shift R`, "Justificar" `Ctrl Shift J`, "Espaçamento do parágrafo…" (abre `openPanel("spacing")`), "Limpar formatação do parágrafo". Em `palette.ts`: incluir `...formatCommands()` em `editorCommands()` e trocar o hint de "Inserir imagem no capítulo" para `"Ctrl Shift I"`.
- [ ] **Step 6:** `data/shortcuts.ts` — "Inserir imagem (ou arraste para a página)" passa para `["Ctrl", "Shift", "I"]`; acrescentar "Negrito" `["Ctrl", "B"]`, "Itálico" `["Ctrl", "I"]`, "Alinhar esquerda / centro / direita / justificado" `["Ctrl", "Shift", "L E R J"]`.
- [ ] **Step 7:** `Panel` ganha `"spacing"`. Se `FocusTarget`/`focusTarget` exigir registrar o nome do painel, registrar (o painel em si é a Task 6; até lá `openPanel("spacing")` pode não renderizar nada — aceitável dentro deste commit desde que compile).
- [ ] **Step 8:** Verificar — typecheck e `bun run test` sem erros.
- [ ] **Step 9: Commit**

```bash
git add src
git commit -m "feat(editor): formatting commands, shortcuts and palette entries"
```

---

### Task 6: Barra de formatação e painel "Espaçamento"

**Files:**
- Create: `src/components/editor/FormatBar.tsx`
- Create: `src/components/panels/SpacingPanel.tsx`
- Modify: `src/components/editor/Editor.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `formatState`, `toggleBold`, `toggleItalic`, `setAlign`, `setSpacing`, `applySpacingToAll`, `clearParagraphFormat` (Task 5); `openPanel`, `closePanel` (`store/actions/ui.ts`); Panel `"spacing"`.

- [ ] **Step 1: `FormatBar.tsx`** — linha fina, classe `chrome` (some no modo foco pelo CSS existente `.focus .chrome`). Botões: **B**, *I*, separador, quatro alinhamentos (ícones SVG inline de 4 linhas no estilo dos `win-btn`: `viewBox="0 0 14 14"`, traço `currentColor`), separador, botão "Espaçamento". Cada botão: `aria-pressed` refletindo `formatState()`, `title` com o atalho (ex.: "Negrito (Ctrl B)"), e `onMouseDown={(e) => e.preventDefault()}` para não tirar a seleção do editor. Em `Editor.tsx`, renderizar `<FormatBar />` logo acima de `.ed-scroll` (depois de `<ChapterLabel />`).
- [ ] **Step 2: `SpacingPanel.tsx`** — painel pequeno ancorado abaixo da barra (seguir o padrão visual de `NotesPanel`/`HelpPanel`), fecha com Esc via `closePanel` como os outros. Conteúdo:
  - Entrelinhas: botões `1`, `1,15`, `1,5`, `2` e "Padrão" (null);
  - Antes / Depois (pt): `<input type="number" min=0 max=96 step=1>`; vazio = padrão (null);
  - Recuo da primeira linha (cm): `<input type="number" min=0 max=5 step=0.05>` + botão "1,25 cm";
  - Botões "Aplicar ao capítulo todo" (`applySpacingToAll` com os valores do parágrafo atual) e "Limpar formatação do parágrafo".
  - Valores iniciais vêm de `formatState()`; cada mudança chama `setSpacing` imediatamente (a seleção do editor persiste enquanto o foco está no painel).
  - Rótulos visíveis e `<label for>` em cada campo.
- [ ] **Step 3:** `App.tsx` — `<Match when={state.panel === "spacing" && editor()}><SpacingPanel /></Match>`.
- [ ] **Step 4: CSS** — estilos da barra (`.fmt-bar`, `.fmt-btn`, `.fmt-btn[aria-pressed="true"]`) e do painel usando os tokens existentes (`--ink`, `--muted`, `--faint`, `--accent`), funcionando nos temas claro e escuro.
- [ ] **Step 5: Verificar** — typecheck, `bun run test`, `bun run build`.
- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat(editor): formatting toolbar and paragraph spacing panel"
```

---

### Task 7: Verificação ponta a ponta (controlador)

- [ ] `cd src-tauri && cargo test`, `bun run test`, typecheck, `bun run build`.
- [ ] `bun run tauri dev`: num capítulo, aplicar negrito, itálico, centralizar um título, recuo 1,25 cm e entrelinhas 1,5 em "aplicar ao capítulo todo"; trocar de capítulo e voltar; fechar e reabrir o app — tudo preservado. Conferir o `.md` gerado em `~/Documentos/Scribalis/<obra>/capitulos/`.
- [ ] Enter ×3 no meio de texto formatado: as duas metades mantêm a formatação.
- [ ] Ctrl Shift I insere imagem; Ctrl E abre o índice; Ctrl J troca o tema; Ctrl Shift E centraliza sem abrir o índice.
- [ ] Commit de qualquer ajuste.
