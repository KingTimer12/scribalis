# Obras em pastas, lógica de dados no Rust e editor rico

Data: 2026-09-27
Status: aguardando revisão

## Objetivo

Trocar a persistência em `localStorage` por pastas no disco, uma por obra, e mover
para o Rust todo acesso e processamento de dados. O webview fica só com estado de
tela. O editor passa a exibir separador, cabeçalho, rodapé e imagens dentro dos
capítulos.

### Requisitos do usuário

- Cada obra é uma pasta. Dentro dela: `metadata.json` (nome, autor, caminho da capa),
  uma pasta de imagens (capa e imagens usadas nos capítulos) e uma pasta com os
  capítulos em markdown.
- Cada obra configura um **separador** (texto ou imagem), um **cabeçalho** (imagem) e
  um **rodapé** (imagem).
- Pasta raiz fixa em `~/Documentos/Scribalis` (`BaseDirectory::Document`).
- Título, status, notas e ordem dos capítulos ficam **no `metadata.json`**; o `.md`
  tem só o texto.
- Separador, cabeçalho, rodapé e imagens aparecem **também no editor**.
- Separador inserido por atalho: **Ctrl Enter**.
- Editor rico com **TipTap**.
- **Tudo que é dado ou processamento de dado roda no Rust.** Meta: baixo consumo de
  RAM no webview e no processo Rust.

### Fora de escopo

- Migrar os dados atuais do `localStorage`. Pasta raiz vazia gera as obras de exemplo.
- Vigiar mudanças externas nos arquivos com o app aberto. A biblioteca é lida ao
  abrir o app e ao voltar para a biblioteca.
- Exportação/publicação (volumes, EPUB etc.), fichas de personagens.
- Negrito/itálico e outras marcações no editor.
- Modo navegador com dados reais: sem Tauri, o front usa um mock em memória só para
  desenvolvimento e testes.

## Regra de divisão Rust × webview

| Rust | Webview |
|---|---|
| Ler/escrever arquivos, criar/excluir pastas | Estado de tela (view, painel, seleção, toasts) |
| Parse e serialização de markdown ↔ documento do editor | Documento do capítulo **aberto** (dentro do TipTap) |
| Processar imagens (recorte da capa, cópia para `imagens/`) | Resumos pequenos: lista de obras, metadados da obra aberta |
| Contagem de palavras persistida, totais, meta diária | Contagem ao vivo do capítulo aberto (evita IPC por tecla) |
| Busca no texto dos capítulos | Filtro da lista de obras por título (lista pequena, já em memória) |
| Diálogo de escolher arquivo | — |
| Preferências | — |

O webview nunca guarda o texto de capítulos que não estão abertos.

## Estrutura no disco

```
~/Documentos/Scribalis/
  a-torre-das-mil-luas/
    metadata.json
    imagens/
      capa.jpg            recortada para 400×600, JPEG
      cabecalho.png       tamanho original, extensão do arquivo escolhido
      rodape.png
      separador.png
      <id>.<ext>          imagens inseridas nos capítulos
    capitulos/
      <idDoCapitulo>.md
```

- O nome da pasta é um slug do título na criação (minúsculo, sem acento, espaços
  viram `-`; se já existir, sufixo `-2`, `-3`…). **Renomear a obra não renomeia a
  pasta.**
- Arquivos de capítulo usam o id estável; a ordem vem do `metadata.json`.
- Toda escrita é atômica: grava `arquivo.tmp` e renomeia por cima.

### `metadata.json`

```json
{
  "version": 1,
  "id": "x1k2…",
  "title": "A Torre das Mil Luas",
  "author": "",
  "cover": "imagens/capa.jpg",
  "updatedAt": 1790000000000,
  "cur": 2,
  "separator": { "type": "text", "text": "* * *" },
  "header": "imagens/cabecalho.png",
  "footer": null,
  "chapters": [
    {
      "id": "c9a…",
      "file": "capitulos/c9a….md",
      "title": "O sino que não tocava",
      "status": "rascunho",
      "notes": "",
      "words": 86
    }
  ]
}
```

- `separator` é `{ "type": "text", "text": string }` ou
  `{ "type": "image", "image": string }`. Padrão: texto `* * *`.
- Caminhos são relativos à pasta da obra. `cover`, `header` e `footer` podem ser `null`.
- `words` é gravado pelo Rust a cada salvamento. Assim a biblioteca e os totais não
  precisam ler os `.md`.
- `status`: `rascunho` | `revisao` | `pronto`.
- Campo desconhecido é preservado na leitura e na escrita (`serde_json::Value` extra),
  para edições futuras não perderem dados.

### Formato do `.md`

Formato propositalmente simples, lido e escrito por um parser próprio no Rust (sem
crate de markdown):

- Parágrafos separados por uma linha em branco.
- Quebra de linha dentro do parágrafo (Shift+Enter): `\` no fim da linha
  (hard break do CommonMark). Na leitura, uma quebra simples também vira hard break.
- Separador: linha contendo só `***`.
- Imagem: linha contendo só `![](../imagens/<arquivo>)`.
- Qualquer outro texto é literal. Nenhum escape é aplicado, então `*x*` digitado
  continua `*x*` no disco.

## Documento do editor

O Rust converte `.md` → documento ProseMirror (JSON) ao carregar e documento → `.md`
ao salvar. O webview não carrega nenhuma biblioteca de markdown.

Schema do TipTap (o mínimo necessário):

- `doc` → `paragraph | separator | image`
- `paragraph` → `text | hardBreak`
- `separator`: nó atômico, sem atributos. A exibição (texto ou imagem) vem da
  configuração da obra e muda na hora quando ela muda.
- `image`: nó atômico com `src` (relativo à obra, ex. `imagens/abc.png`). O webview
  converte para URL com `convertFileSrc`.

## API Rust (comandos Tauri)

Todos os comandos são `async` e devolvem `Result<T, String>`; a mensagem de erro já
vem pronta em português para o toast.

### Biblioteca

| Comando | Retorno | Faz |
|---|---|---|
| `library_list()` | `{ books: BookSummary[], warnings: string[] }` | Varre a raiz e lê só os `metadata.json`. Pasta vazia → cria exemplos |
| `library_create(title)` | `BookSummary` | Cria pasta, subpastas, metadata e um capítulo vazio |
| `library_rename(id, title)` | `BookSummary` | Muda `title` no metadata |
| `library_delete(id)` | `()` | Remove a pasta da obra (definitivo) |
| `library_restore_samples()` | `BookSummary[]` | Cria de novo as 3 obras de exemplo |

`BookSummary`: `id, title, author, cover (caminho absoluto | null), chapters, words, ready, updatedAt`.

### Obra aberta

| Comando | Retorno | Faz |
|---|---|---|
| `book_open(id)` | `BookMeta` | Metadados completos, sem os textos |
| `book_update(id, patch)` | `BookMeta` | `patch`: `title?, author?, cur?, separatorText?` |
| `book_pick_image(id, slot)` | `BookMeta \| null` | Abre o diálogo (`tauri-plugin-dialog`), copia/processa para `imagens/`, atualiza o metadata. `null` se cancelar |
| `book_clear_image(id, slot)` | `BookMeta` | Remove a referência e apaga o arquivo |
| `book_insert_image(id)` | `string \| null` | Diálogo + cópia; devolve o `src` relativo para inserir no capítulo |

`slot`: `cover` | `header` | `footer` | `separator`. Escolher imagem para `separator`
muda o tipo para imagem; `separatorText` muda para texto.

`BookMeta`: `id, title, author, cur, updatedAt, dir (absoluto), cover, header, footer, separator, chapters: ChapterMeta[]`.
`ChapterMeta`: `id, title, status, notes, words`.

### Capítulos

| Comando | Retorno | Faz |
|---|---|---|
| `chapter_load(bookId, chapterId)` | `Doc` | Lê o `.md` e converte. Arquivo ausente → doc vazio |
| `chapter_save(bookId, chapterId, doc)` | `ChapterMeta` | Serializa, grava, recalcula `words`, atualiza `updatedAt` |
| `chapter_update(bookId, chapterId, patch)` | `ChapterMeta` | `patch`: `title?, status?, notes?` |
| `chapter_insert(bookId, at)` | `BookMeta` | Capítulo vazio na posição `at` |
| `chapter_split(bookId, chapterId, before, after)` | `BookMeta` | Grava `before` no atual e cria o próximo com `after` (Enter ×3) |
| `chapter_move(bookId, from, to)` | `BookMeta` | Reordena |
| `chapter_delete(bookId, chapterId)` | `BookMeta` | Remove do metadata e apaga o `.md`. Recusa se for o único |
| `chapter_search(bookId, q)` | `{ index, chapterId }[]` | Busca sem acento/caixa em título e texto, lendo um arquivo por vez |
| `chapter_markdown(bookId, chapterId)` | `string` | Texto para "Copiar capítulo" |

### Preferências e estatísticas

| Comando | Retorno | Faz |
|---|---|---|
| `prefs_get()` | `Prefs` | Lê via `tauri-plugin-store` (`prefs.json` no AppData) |
| `prefs_set(patch)` | `Prefs` | Grava |
| `stats_today()` | `{ today }` | Total atual − total no início da sessão |

### Estado no Rust

Guardado com `app.manage(Mutex<Library>)`:

- caminho da raiz;
- índice `id → pasta` (montado no `library_list`);
- `BookMeta` da obra aberta (só uma por vez; trocar de obra descarta a anterior);
- total de palavras no início da sessão, para a meta diária.

Os textos dos capítulos não ficam em memória no Rust: são lidos, convertidos e
descartados em cada comando.

## Front-end

- `src/api/`: um wrapper tipado para cada comando (`invoke`). Sem
  `window.__TAURI_INTERNALS__`, usa `src/api/mock.ts`, um backend em memória só para
  `bun run dev` no navegador e para os testes Playwright.
- `store/state.ts` passa a guardar `library: BookSummary[]`, `book: BookMeta | null`
  e `prefs`. Não guarda mais textos.
- `store/persistence.ts` e `lib/storage.ts` saem. As ações em `store/*` chamam a API e
  aplicam o retorno no store.
- Salvamento:
  - texto do capítulo: `chapter_save` com debounce de 800 ms, e também ao trocar de
    capítulo, voltar para a biblioteca ou fechar a janela;
  - título do capítulo e notas: `chapter_update` com debounce de 300 ms;
  - nome e autor da obra: `book_update` com debounce de 300 ms.
- `data/samples.ts` sai; os exemplos passam a ser gerados pelo Rust.

### Editor

- `ChapterBody` vira `RichEditor`: TipTap montado com `@tiptap/core` (sem wrapper de
  framework) e só as extensões do schema acima.
- Comportamentos mantidos, reimplementados como atalhos do TipTap:
  - **Enter ×3** no fim de dois parágrafos vazios divide o capítulo no cursor. O
    front fatia o documento (`doc.cut`) e chama `chapter_split`. O aviso aparece
    depois do 2º Enter;
  - **Shift+Enter**: `hardBreak`, não conta para a sequência;
  - **↑ no início do documento**: vai para o título;
  - contagem de palavras ao vivo a partir do texto do editor.
- **Ctrl Enter** insere um `separator` no cursor.
- O NodeView do separador mostra o texto configurado ou a imagem
  (`convertFileSrc(dir + image)`).
- **Cabeçalho** acima do título e **rodapé** abaixo do corpo, como `<img>` fora do
  conteúdo editável. Não aparecem se forem `null`.
- Total da obra na barra inferior = `words` dos outros capítulos (do `BookMeta`) +
  contagem ao vivo do capítulo aberto.

### Comandos novos na paleta

- "Autor da obra…" e "Separador: texto…" transformam a paleta em campo de texto
  (`Autor: ___`, Enter confirma, Esc cancela).
- "Separador: imagem…", "Cabeçalho: escolher imagem", "Cabeçalho: remover",
  "Rodapé: escolher imagem", "Rodapé: remover", "Inserir imagem no capítulo".
- Na biblioteca, C e Shift C continuam trocando/removendo a capa, agora via
  `book_pick_image` / `book_clear_image`.

## Organização do código

Regras do projeto (`CLAUDE.md`): comentários em inglês e nenhum arquivo Deus, ou seja,
cada arquivo com uma responsabilidade.

### Rust (`src-tauri/src/`)

```
lib.rs                 só monta o Builder: plugins, estado, lista de comandos
state.rs               struct Library (raiz, índice id→pasta, obra aberta, base da sessão)
error.rs               tipo de erro e conversão para mensagem em português
model/                 structs serde: metadata.rs, summary.rs, doc.rs (JSON do editor), prefs.rs
storage/
  paths.rs             raiz, slug e desduplicação de pastas
  atomic.rs            escrita atômica (tmp + rename)
  metadata_io.rs       ler/gravar metadata.json preservando campos extras
  chapter_io.rs        ler/gravar .md de capítulo
  images.rs            copiar imagem, recortar capa (crate image)
markdown/
  parse.rs             .md → Doc
  serialize.rs         Doc → .md
text/
  words.rs             contagem de palavras
  normalize.rs         sem acento/caixa para busca
samples.rs             obras de exemplo
commands/              um arquivo por grupo, só adaptando IPC → funções acima
  library.rs, book.rs, chapter.rs, prefs.rs, stats.rs
```

### Front (`src/`)

```
api/                   um arquivo por grupo de comandos + mock.ts
editor/                extensões TipTap: separator.ts, image.ts, keymap.ts (Enter×3, Ctrl Enter, ↑),
                       split.ts (fatiar documento), createEditor.ts
store/
  state.ts             só o store e tipos de estado
  selectors/           library.ts, book.ts
  actions/             library.ts, book.ts, chapters.ts, images.ts, prefs.ts, ui.ts
  keys/                global.ts, library.ts, index.ts, palette.ts (handlers de teclado)
  commands/            palette.ts (itens) e prompt.ts (modo campo de texto)
  saving.ts            debounce e flush dos salvamentos
components/            como hoje; RichEditor.tsx, BookHeaderImage.tsx, BookFooterImage.tsx novos
```

Hoje `store/library.ts` e `store/chapters.ts` misturam ações e handlers de teclado.
Nesta mudança eles são reescritos já separados em `actions/` e `keys/`.

## Dependências e configuração

- **Rust:** `tauri-plugin-dialog`, `tauri-plugin-store`,
  `image` (`default-features = false`, features `jpeg`, `png`, `webp`),
  `unicode-normalization`, feature `protocol-asset` do `tauri`.
- **Sai:** `tauri-plugin-fs` (Rust e `@tauri-apps/plugin-fs` no JS) e a permissão
  `fs:default`. O Rust usa `std::fs` direto, e o webview não tem acesso a arquivos.
- **JS:** `@tiptap/core`, `@tiptap/pm` e as extensões mínimas: documento, parágrafo,
  texto, hard break e desfazer/refazer. Nós `separator` e `image` são próprios.
  Nenhum plugin JS do Tauri além de `@tauri-apps/api` (o diálogo abre pelo Rust).
  Dev: `vitest`.
- `tauri.conf.json`: `app.security.assetProtocol` com `enable: true` e
  `scope: ["$DOCUMENT/Scribalis/**"]`.
- Capabilities: `core:default`, `opener:default`, `store:default`, e os comandos do
  app.

## Erros

- Falha de leitura/escrita → comando devolve erro → toast ("Não foi possível salvar o
  capítulo" etc.). O texto continua no editor e o próximo salvamento tenta de novo.
- `metadata.json` inválido ou ausente → a pasta é ignorada no `library_list` e entra
  em `warnings` ("1 pasta ignorada: metadata inválido"), mostrado como toast.
- `.md` ausente → capítulo abre vazio.
- Imagem que não decodifica → toast "Não foi possível ler a imagem".
- Pasta raiz impossível de criar → tela de biblioteca com mensagem de erro.

## Testes

- **Rust (`cargo test`):**
  - ida e volta do markdown (parágrafos, hard break, separador, imagem, texto com `*`);
  - leitura/escrita do metadata preservando campos desconhecidos;
  - slug e desduplicação de pasta;
  - contagem de palavras;
  - `chapter_split`, `chapter_move` e `chapter_delete` num diretório temporário;
  - busca sem acento.
- **Front (vitest):** fatiar o documento para o Enter ×3; regras da paleta.
- **Playwright** (navegador + mock): fluxo da biblioteca e do editor, como hoje, mais
  Ctrl Enter e o separador visível.
- **Manual:** `bun run tauri dev` para conferir as pastas, imagens e o asset protocol
  no disco real.
