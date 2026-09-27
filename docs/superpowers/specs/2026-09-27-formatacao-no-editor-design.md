# Formatação no editor: negrito, itálico, alinhamento e espaçamento

Data: 2026-09-27
Status: aguardando revisão

## Objetivo

O editor de texto (capítulos e, depois, documentos da área de trabalho) passa a guardar
e editar **negrito**, **itálico**, **alinhamento** e **espaçamento por parágrafo**, sem
perder nada ao salvar e reabrir. É pré-requisito da importação do Scrivener
(`2026-09-27-area-de-trabalho-scrivener-design.md`), que converte essa formatação do RTF.

### Requisitos do usuário

- Negrito e itálico.
- Alinhamento: esquerda, centro, direita, justificado.
- Espaçamento por parágrafo: **entrelinhas**, **espaço antes/depois** e **recuo da
  primeira linha**.
- Nada disso pode se perder ao salvar/reabrir.
- Arquivo continua Markdown legível (formato A aprovado).
- Atalhos: Ctrl B negrito, Ctrl I itálico; inserir imagem passa para **Ctrl Shift I**.

### Fora de escopo

- Sublinhado, tachado, fontes, tamanhos, cores, listas, títulos, citações.
- Recuo esquerdo/direito do bloco inteiro.
- Estilos nomeados (ex.: "Corpo", "Cabeçalho de cena").
- Exportação (EPUB, DOCX etc.).

## Modelo de documento

Rust `model/doc.rs` (espelha o JSON do TipTap):

```rust
Block::Paragraph { attrs: ParaAttrs, content: Vec<Inline> }   // attrs default = vazio
Inline::Text { text: String, marks: Vec<Mark> }                // marks default = []
enum Mark { Bold, Italic }                                     // TipTap: "bold", "italic"

struct ParaAttrs {
    text_align: Option<Align>,      // "left" | "center" | "right" | "justify"
    line_height: Option<f32>,       // multiplicador: 1.0 … 3.0
    space_before: Option<u16>,      // pt, 0 … 96
    space_after: Option<u16>,       // pt, 0 … 96
    indent: Option<f32>,            // recuo da primeira linha em cm, 0 … 5
}
```

- `None` = padrão do app (CSS atual: entrelinhas 1.8, `margin-bottom: 1em`, sem recuo,
  alinhado à esquerda). `textAlign: "left"` é normalizado para `None`.
- JSON no fio (camelCase): `{"type":"paragraph","attrs":{"textAlign":"center",
  "lineHeight":1.5,"spaceBefore":12,"spaceAfter":6,"indent":1.25},"content":[
  {"type":"text","text":"Oi","marks":[{"type":"bold"}]}]}`. Atributos nulos são omitidos.
- Valores fora da faixa são limitados (clamp) na leitura, no Rust.
- Contagem de palavras, busca, `split` (Enter ×3) e normalização continuam operando sobre
  o texto; marcas e atributos acompanham os pedaços.

## Formato Markdown

Sem formatação, o arquivo é **idêntico ao atual** — capítulos existentes não mudam.

- **Negrito:** `**texto**`. **Itálico:** `*texto*`. Ambos: `***texto***`.
  - Marcas são emitidas por trechos: ao trocar o conjunto de marcas entre dois trechos,
    fecha as que saem e abre as que entram (itálico por dentro do negrito quando os dois
    abrem juntos).
  - Espaço em branco nas bordas de um trecho marcado fica fora dos delimitadores
    (`** a**` não é Markdown válido): `**a** b`, nunca `**a **b`.
- **Escape:** no texto, `\`, `*`, `_` e `` ` `` são escapados com `\`. Uma linha cujo
  texto começa com `{:` ganha `\{:`. Uma linha de texto igual a `***` ou `![](` não é
  mais ambígua porque `*` e `!`-seguido-de-`[` são escapados (`\*\*\*`, `\![](`).
- **Atributos de parágrafo:** linha logo após o parágrafo, no estilo kramdown, só quando
  há algum atributo:

  ```
  **Capítulo um**
  {: align=center before=24 after=12}

  Era uma vez uma torre.
  {: indent=1.25 line=1.5}
  ```

  - Chaves: `align` (`center|right|justify`), `line`, `before`, `after`, `indent`.
    Números com ponto decimal, sem unidade. Ordem fixa na escrita; qualquer ordem na
    leitura. Chaves desconhecidas são ignoradas.
  - Linha `{: …}` malformada é lida como texto normal (nada se perde).
- Parser: continua separando parágrafos por linha em branco; dentro do parágrafo lê
  delimitadores `*`/`**`/`***` com a regra de "flanqueamento" do CommonMark simplificada
  (abre se seguido de não-espaço, fecha se precedido de não-espaço), respeitando escapes.
  `*` sem par vira texto literal.
- Teste de ida e volta: `parse(serialize(doc)) == doc` para documentos gerados com
  combinações de marcas, atributos, quebras de linha e caracteres especiais.

## Editor (front)

- TipTap: `@tiptap/extension-bold`, `@tiptap/extension-italic`,
  `@tiptap/extension-text-align` (tipos `paragraph`, alinhamentos
  `left|center|right|justify`) e uma extensão própria `ParagraphSpacing` que adiciona ao
  `paragraph` os atributos `lineHeight`, `spaceBefore`, `spaceAfter`, `indent`,
  renderizados como `style` (`line-height`, `margin-top`, `margin-bottom`,
  `text-indent`) e lidos de volta do `style` ao colar HTML.
- Colar de fora (Word, Docs, Scrivener): TipTap mantém negrito/itálico e alinhamento;
  o resto do HTML colado é descartado pelo schema.
- **Barra de formatação** fina acima do texto (some no modo foco):
  `B`, `I` | alinhar esquerda, centro, direita, justificado | botão "Espaçamento".
  Estado ativo reflete a seleção.
- **Popover "Espaçamento"** (aplica aos parágrafos da seleção):
  - Entrelinhas: `1`, `1.15`, `1.5`, `2`, "Padrão";
  - Antes / Depois: campos numéricos em pt;
  - Recuo da primeira linha: campo em cm (atalho "1,25 cm");
  - "Aplicar ao capítulo todo" e "Limpar formatação do parágrafo".
- **Atalhos** (no editor): Ctrl B, Ctrl I; Ctrl Shift L/E/R/J alinham
  esquerda/centro/direita/justificado (padrão TipTap). Inserir imagem: Ctrl Shift I.
  Em `store/keys/global.ts`, Ctrl E (índice) e Ctrl J (tema) passam a exigir **sem
  Shift**, para não engolir Ctrl Shift E/J.
  Ajuda (`data/shortcuts.ts`) e paleta atualizadas; paleta ganha "Negrito", "Itálico",
  "Alinhar…", "Espaçamento do parágrafo".
- `bridge.ts` / `split.ts`: o Enter ×3 e a divisão de capítulo preservam marcas e
  atributos (usam o JSON do TipTap, que já os carrega).

## Rust — arquivos afetados

- `model/doc.rs`: `Mark`, `ParaAttrs`, `Align`, clamps; campos novos com `#[serde(default,
  skip_serializing_if…)]` para o JSON antigo continuar válido.
- `markdown/inline.rs` (novo): parse/serialize de trechos marcados e escapes.
- `markdown/attrs.rs` (novo): parse/serialize da linha `{: …}`.
- `markdown/parse.rs`, `markdown/serialize.rs`: usam os dois acima.
- `text/words.rs`, busca e `split`: ajustes para o novo formato de `Inline::Text`.

## Testes

- Rust: ida e volta Markdown (incluindo capítulos atuais sem formatação continuando
  byte-a-byte iguais), escapes, `*` sem par, espaços nas bordas, linha `{:` malformada,
  clamps, JSON antigo sem `marks`/`attrs`.
- vitest: extensão `ParagraphSpacing` (atributo ↔ `style`), split preservando marcas.
- Manual: formatar, salvar, fechar e reabrir o capítulo no app desktop.
