# Área de trabalho da obra e importação do Scrivener

Data: 2026-09-27
Status: aguardando revisão
Depende de: `2026-09-27-formatacao-no-editor-design.md` (negrito, itálico, alinhamento
e espaçamento no editor e no Markdown), que é implementado antes.

## Objetivo

Cada obra ganha uma segunda seção, a **Área de trabalho**: uma árvore livre de pastas e
arquivos (pesquisa, personagens, rascunhos soltos, imagens de referência) ao lado dos
capítulos. Um projeto do Scrivener (`.scriv`) pode ser importado inteiro para ela, e o
usuário reorganiza depois.

### Requisitos do usuário

- Uma aba dentro da obra, separada dos capítulos, que funciona como área de trabalho.
- Importar a estrutura completa de um projeto Scrivener (pastas e arquivos).
- Depois de importar, o usuário organiza livremente (criar, renomear, mover, excluir).
- Na importação, o usuário **escolhe quais pastas viram capítulos**; o resto vai para a
  área de trabalho.
- Tipos suportados: **texto** (editável, mesmo editor dos capítulos) e **imagens**
  (visualizáveis). PDFs e outros anexos são copiados e abertos no app padrão do sistema.
- Importar a partir de **dois lugares**: na biblioteca (cria obra nova) e dentro da aba
  da obra aberta (acrescenta à obra).

### Fora de escopo

- Visualizar PDF dentro do app.
- Formatação do RTF que o editor não suporta: fontes, tamanhos, cores, sublinhado,
  recuo esquerdo/direito, tabelas, notas de rodapé, comentários inline. O texto entra;
  essa formatação é descartada.
- Metadados do Scrivener além de título, sinopse e notas (labels, status, palavras-chave,
  metadados customizados, snapshots, configurações de compilação).
- Arrastar um `.scriv` para a janela; importar só pelo seletor de arquivos.
- Vigiar mudanças externas em `area/`.
- Exportar de volta para o Scrivener.
- Caminho inverso de "Enviar para capítulos" (capítulo → área de trabalho).

## Formato em disco

Dentro da pasta da obra:

```
minha-obra/
  metadata.json          (inalterado)
  capitulos/…            (inalterado)
  imagens/…              (inalterado)
  area/
    area.json            árvore: títulos, ordem, hierarquia, notas
    <id>.md              documentos de texto (mesmo markdown dos capítulos)
    arquivos/<id>.<ext>  imagens e anexos
```

- `area/` só é criada na primeira escrita; obra sem ela = área de trabalho vazia.
- Renomear e mover alteram só `area.json`. Arquivos nunca mudam de nome.
- `area.json` é gravado de forma atômica (mesmo `storage::atomic` do `metadata.json`) e
  preserva campos desconhecidos (`#[serde(flatten)] extra`), como o `metadata.json`.

```json
{
  "version": 1,
  "items": [
    { "id": "a1", "kind": "folder", "title": "Pesquisa", "notes": "", "children": [
      { "id": "b2", "kind": "text",  "title": "Ana", "notes": "Sinopse…", "file": "b2.md" },
      { "id": "c3", "kind": "image", "title": "Mapa", "file": "arquivos/c3.png" },
      { "id": "d4", "kind": "file",  "title": "Artigo", "file": "arquivos/d4.pdf" }
    ]}
  ]
}
```

- `kind`: `folder` | `text` | `image` | `file`. Só `folder` tem `children`; só os outros
  têm `file` (caminho relativo a `area/`, validado com `safe_join`).
- Imagens: extensões `png`, `jpg`, `jpeg`, `webp`, `gif`. Qualquer outra extensão é `file`.

## Rust

Seguindo a regra de um `mod` por assunto:

- `model/workspace.rs`: `Workspace { version, items, extra }`, `Node { id, kind, title,
  notes, file, children, extra }`, `NodeKind`. Busca por id, remoção e inserção na árvore
  (funções puras, testadas).
- `storage/workspace_io.rs`: ler/gravar `area.json`, ler/gravar documentos `.md`
  (reaproveita `markdown::parse/serialize`), copiar arquivos para `area/arquivos/`,
  apagar arquivos de um nó e da subárvore.
- `ops/workspace.rs`: operações sobre uma obra:
  - `tree` → árvore sem conteúdo;
  - `create(parent, index, kind, title)` → pasta ou texto vazio;
  - `rename`, `set_notes`, `move_node(id, new_parent, index)` (recusa mover uma pasta
    para dentro de si mesma ou de um descendente);
  - `delete(id)` → remove nó e arquivos da subárvore;
  - `load_doc(id)` / `save_doc(id, doc)`;
  - `import_files(parent, paths)` → copia imagens/anexos escolhidos no disco;
  - `to_chapter(id)` → move o `.md` para `capitulos/`, acrescenta um capítulo no fim
    (título e notas do nó) e remove o nó. Ordem de escrita: copia o arquivo, grava
    `metadata.json`, grava `area.json`, só então apaga o original — falha no meio deixa
    o texto duplicado, nunca perdido.
- `scrivener/` (novo módulo, um arquivo por assunto):
  - `binder.rs`: lê `project.scrivx` com `quick-xml` (dependência nova) e produz
    `BinderItem { key, kind, title, children }`. `key` é o `UUID` (Scrivener 3) ou `ID`
    (Scrivener 2). Tipos: `DraftFolder`, `ResearchFolder`, `TrashFolder`, `Folder`,
    `Text`, `Image`, `PDF`, `WebArchive`, `Other`…
  - `locate.rs`: acha os arquivos de um item nos dois formatos:
    - Scrivener 3: `Files/Data/<UUID>/content.rtf` (ou `content.<ext>` para mídia),
      `synopsis.txt`, `notes.rtf`;
    - Scrivener 2: `Files/Docs/<ID>.rtf` (ou `<ID>.<ext>`), `<ID>_synopsis.txt`,
      `<ID>_notes.rtf`.
  - `rtf.rs`: RTF → `Doc` **com formatação**: negrito (`\b`, `\b0`), itálico (`\i`,
    `\i0`), alinhamento (`\ql`, `\qc`, `\qr`, `\qj`), entrelinhas (`\sl` com
    `\slmult1` → `sl/240`; sem `\slmult` → pontos exatos ÷ 12pt, arredondado a 0,05),
    espaço antes/depois (`\sb`, `\sa`: twips ÷ 20 → pt) e recuo da primeira linha
    (`\fi`: twips ÷ 567 → cm; negativo vira 0). `\pard` zera os atributos de parágrafo,
    `\plain` zera as marcas; estado de caractere empilha/desempilha com os grupos
    `{ }`. Valores passam pelos mesmos clamps do modelo. Trata `\par`, `\line`
    (vira `HardBreak`), `\tab`, escapes `\'hh` (cp1252), `\uN` com `\ucN`, e descarta
    destinos ignoráveis (`\*`, `fonttbl`, `colortbl`, `stylesheet`, `info`, `pict`…).
    Parágrafo com só `#`, `*`, `***` ou `* * *` vira `Separator`.
  - `import.rs`: `scan(path) -> ScanResult` e `import(path, choices, target)`.
- `commands/workspace.rs` e `commands/scrivener.rs`: comandos Tauri finos, como os
  atuais (`lock(&state)?.with_book(...)`).

### Importação

1. **Escolher o projeto:** Rust abre o seletor de arquivos filtrando `scrivx` (no macOS
   também `scriv`, que lá é um pacote). Aceita o `.scriv` ou o `.scrivx` dentro dele.
2. **`scrivener_scan(path)`** devolve a árvore do binder (só títulos, tipos e chaves) e o
   nome do projeto. A Lixeira não aparece.
3. **Tela de importação** (modal) mostra a árvore; cada pasta tem um checkbox "virar
   capítulos". Vêm marcados: o Manuscrito (`DraftFolder`). Marcar uma pasta desmarca e
   desabilita os descendentes (a regra abaixo já cobre a subárvore).
4. **`scrivener_import(path, chapterFolders, target)`**, `target` = `new` (obra nova com
   o nome do projeto) ou `book: <id>` (obra aberta).

Regra para pastas marcadas como capítulos — cada **filho direto** vira um capítulo, na
ordem do binder:

- filho de texto → um capítulo com o título e o texto do documento;
- filho pasta → um capítulo com o título da pasta; o texto é a concatenação, em ordem de
  profundidade, do texto da própria pasta e de todos os documentos de texto descendentes,
  com um `Separator` entre documentos (padrão Scrivener: pasta = capítulo, documentos =
  cenas);
- mídia dentro de uma pasta marcada vai para a área de trabalho, numa pasta
  "Anexos do manuscrito";
- sinopse e notas do item (e das cenas, concatenadas) vão para as notas do capítulo.

Todo o resto (pastas não marcadas e seus filhos, Pesquisa, Personagens, Lugares,
documentos soltos na raiz) vai para a área de trabalho, preservando hierarquia e ordem:
texto → nó `text`, imagem → `image`, PDF/WebArchive/outros → `file` (arquivo copiado
como está). Sinopse e notas → `notes` do nó.

- **Obra nova:** capítulos na ordem; a raiz da área de trabalho recebe as pastas.
- **Obra aberta:** capítulos acrescentados ao fim dos existentes; o conteúdo da área de
  trabalho entra dentro de uma pasta nova com o nome do projeto.

Robustez: item cujo arquivo falta ou cujo RTF não pode ser lido entra vazio e conta como
aviso. O comando devolve `{ book, chapters, items, warnings }` e o front mostra
"Importado: 12 capítulos, 40 itens" e, se houver, "3 itens não puderam ser lidos".
`.scrivx` ilegível ou ausente é erro ("Projeto do Scrivener inválido").

A importação roda em um comando `async` e lê/converte um documento por vez; nada do
projeto inteiro fica em memória ao mesmo tempo.

## Front

- `View` ganha `"workspace"`. Na obra aberta, a TopBar mostra duas abas:
  **Capítulos** | **Área de trabalho**. Troca também pela paleta e por atalho
  (Ctrl 1 = Capítulos, Ctrl 2 = Área de trabalho; Ctrl B virou negrito).
- Layout da aba: árvore à esquerda (largura fixa, rolável), conteúdo à direita.
  - `text`: mesmo `RichEditor` dos capítulos, salvando por `workspace_save_doc` (com o
    mesmo debounce/flush de `saving.ts`).
  - `image`: imagem centralizada (protocolo `asset`, já habilitado).
  - `file`: nome, extensão e botão "Abrir no app padrão" (`tauri-plugin-opener`).
  - pasta ou nada selecionado: estado vazio com dicas ("Nova pasta", "Novo documento",
    "Importar do Scrivener", "Adicionar arquivos").
- Árvore:
  - clique seleciona/abre, duplo clique ou F2 renomeia (reaproveita `RenameInput`);
  - setas navegam, ←/→ recolhem/expandem pastas, Enter abre, Delete pede confirmação;
  - arrastar e soltar para mover (antes/depois/dentro de pasta);
  - menu de contexto: Nova pasta, Novo documento, Renomear, Adicionar arquivos,
    Enviar para capítulos (só `text`), Excluir;
  - pastas expandidas lembradas por obra no `localStorage` (conveniência; falha
    silenciosa).
- Estado no webview: só a árvore (sem conteúdo) e o documento aberto, como nos capítulos.
- Arquivos novos: `src/api/workspace.ts` e `src/api/scrivener.ts` (+ mocks),
  `src/store/actions/workspace.ts`, `src/store/actions/scrivener.ts`,
  `src/components/workspace/` (`Workspace.tsx`, `WorkspaceTree.tsx`, `TreeNode.tsx`,
  `NodeView.tsx`, `ScrivenerImport.tsx`), teclas em `src/store/keys/workspace.ts`.
- Biblioteca: ação "Importar do Scrivener" no cabeçalho e na paleta; ao terminar, abre a
  obra criada.
- Modo navegador (mock): área de trabalho funcional em memória; importar do Scrivener
  lança "Importar do Scrivener só funciona no app desktop".

## Erros

- Erros do Rust chegam como string em português e aparecem via `flashError`, como hoje.
- Mover para dentro de si mesma: "Não dá para mover uma pasta para dentro dela mesma".
- Operação em nó inexistente (árvore desatualizada): "Item não encontrado"; o front
  recarrega a árvore.

## Testes

- Rust (unit, `tempfile`):
  - `rtf.rs`: parágrafos, negrito/itálico aninhados em grupos, `\pard`/`\plain`,
    alinhamento, `\sl`/`\slmult`, `\sb`/`\sa`, `\fi`, `\line`, escapes `\'e9` e `\u233?`, destinos ignorados,
    separadores, RTF malformado sem pânico;
  - `binder.rs`: fixtures mínimas de `.scrivx` do Scrivener 2 e 3;
  - `import.rs`: projeto fixture em disco (2 e 3) → capítulos (pasta = capítulo com
    cenas separadas), área de trabalho com hierarquia, mídia copiada, Lixeira ignorada,
    item faltando vira aviso;
  - `model/workspace.rs` e `ops/workspace.rs`: criar, mover (incluindo recusa de ciclo),
    excluir subárvore com arquivos, `to_chapter` preserva texto, campos desconhecidos
    sobrevivem.
- vitest: actions de workspace sobre o mock.
- Manual/e2e: importar um projeto real do Scrivener 3 no app desktop.
