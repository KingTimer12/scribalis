# Quadro do livro (tab Editor | Quadro)

## Por quê

O quadro por pasta (spec `2026-09-29-quadro-de-cortica-design.md`) mostrava os filhos como cartões. Não é o que o
escritor quer: o quadro é um lugar para **anotar e relembrar**, com cartões livres ("Capítulo 1 — O capítulo introduz o
mundo venante, desde a queda…"), no visual de fichas sobre cortiça do Scrivener. Este spec troca o quadro por pasta por
um **quadro do livro**, numa tab ao lado do editor.

A **Sinopse** do nó continua: é o guia do capítulo, no painel de notas (Ctrl ;), e o import do Scrivener continua
preenchendo-a.

## O que sai

- Quadro por pasta: `components/corkboard/` (Corkboard, IndexCard, boardMenu, cardDrag), `store/keys/board.ts`, a Match
  de container em `NodeView.tsx`, `corkboard.css`. Clicar numa pasta ou no Manuscrito volta a só expandir/recolher (como
  antes do quadro por pasta); `initialNode` volta a ignorar containers; o guarda de modo foco sobre container sai.
- Fica: `synopsis` no nó, `workspace_set_synopsis`, `store/actions/synopsis.ts`, o campo Sinopse no painel de notas,
  `lib/grid.ts` (reusado pelo quadro novo), `MissingIcon`, a correção do chevron na árvore.

## Dados (Rust)

- Pasta `quadro/` no livro:
  - `quadro/quadro.json`: `{ "version": 1, "cards": [{ "id", "title" }] }`, na ordem do quadro. Campos desconhecidos
    sobrevivem (`extra`), como em `area.json`.
  - `quadro/<id>.md`: texto do cartão, texto puro (UTF-8). Arquivo ausente = texto vazio, sem erro.
- Módulos: `model/board.rs` (tipos e regras puras: inserir, mover, remover), `storage/board_io.rs` (ler/gravar
  atômico), `ops/board.rs` (operações), `commands/board.rs` (comandos).
- Comandos (todos por `book_id`, devolvem a lista de cartões `[{ id, title }]` salvo dito o contrário):
  - `board_list`
  - `board_create(index, title) -> { id, cards }`: cria cartão vazio em `index` (limitado ao tamanho).
  - `board_rename(id, title)`
  - `board_load_text(id) -> String`, `board_save_text(id, text) -> ()`
  - `board_move(id, index)`: índice depois de tirar o cartão.
  - `board_delete(id)`: remove do JSON e depois apaga o `.md`.
  - `board_duplicate(id) -> { id, cards }`: cópia logo depois do original, título + " (cópia)".
- Limites: título 200 caracteres, texto 20 000 caracteres (Rust corta por caractere).
- Livro sem `quadro/` = quadro vazio; a pasta só nasce no primeiro cartão. Não entra em `metadata.chapters`, não muda o
  servidor; o backup da nuvem já leva a pasta inteira do livro.
- O webview guarda só a lista `{ id, title }` e o texto dos cartões visíveis; texto é carregado por cartão
  (`board_load_text`) quando o cartão aparece e fica em cache enquanto o quadro está aberto.

## Import do Scrivener

- Todo item importado com sinopse não vazia vira um cartão, na ordem do binder (busca em profundidade, lixeira fora):
  título = título do item, texto = sinopse. Vale para itens que viram capítulo, texto, pasta, imagem ou arquivo, e para os
  filhos juntados num capítulo composto.
- Os cartões entram no fim do quadro do livro (import em livro novo ou existente).
- Sinopse e notas continuam como hoje (campo `synopsis` do nó; filhos de capítulo composto nas notas).

## Tela

### Tabs

- Topo do painel principal: **Editor | Quadro** (tablist, `role="tab"`). A tab ativa é lembrada por livro (prefs do
  Rust, como `sidebarClosed`); livro novo abre em Editor.
- Editor: exatamente o painel de hoje (capítulo, texto, imagem, arquivo ou estado vazio).
- Quadro: o quadro do livro, qualquer que seja o item aberto na árvore. Abrir um item na árvore (clique, Enter) muda para
  Editor.
- Modo foco só vale na tab Editor; na tab Quadro `Ctrl .` não faz nada.

### Quadro

- Fundo de cortiça em CSS (gradientes, sem imagem); tema escuro vira feltro escuro. Contraste do texto dos cartões ≥
  4.5:1 nos dois temas.
- Grade de cartões na ordem salva. Tamanho P / M / G (≈ 220×132, 300×180, 380×228 px), controle no topo do quadro, salvo
  nas prefs (global, não por livro).
- Cartão = ficha pautada: título numa linha, linha vermelha embaixo, texto sobre pautas azul-claras. Título e texto
  editáveis direto no cartão (input + textarea sem borda). Texto maior que o cartão rola dentro dele.
- Salvamento: título e texto com debounce ao digitar e na saída do campo; entram no `flushAll` (trocar de livro, fechar a
  janela). O livro fica preso ao cartão digitado, como a sinopse.
- Quadro vazio: mensagem "Nenhum cartão ainda." e botão "Novo cartão".
- Topo do quadro: botão "+ Novo cartão" e o controle de tamanho.

### Interação

- Botão direito no fundo: "Novo cartão" (entra no fim; se foi num espaço entre cartões, no fim também).
- Botão direito num cartão: "Novo cartão depois", "Duplicar", "Excluir" (com o diálogo de confirmação:
  "Excluir “Título”?" / "O cartão e o texto dele serão excluídos.").
- Clique no cartão seleciona; clique no título ou no texto edita. Esc sai da edição e volta a seleção.
- Arrastar reordena (ponteiro, como na árvore); com `prefers-reduced-motion`, sem transições.
- Teclado com o quadro em foco: setas movem a seleção pela grade (`lib/grid.ts`), Enter edita o texto do cartão
  selecionado, Delete pede para excluir, Esc volta à árvore. Teclas digitadas num campo do cartão são do campo;
  atalhos com Ctrl/Cmd passam para os atalhos globais.
- Novo cartão: nasce com o título em edição e selecionado.

## Arquivos (orientação)

- Rust: `model/board.rs`, `storage/board_io.rs`, `ops/board.rs`, `commands/board.rs` + `lib.rs`, `model/prefs.rs`
  (tab por livro, tamanho), `scrivener/import.rs` (cartões).
- Front: `api/board.ts` (+ mock), `store/actions/board.ts` (lista, criar/mover/excluir), `store/actions/boardText.ts`
  (debounce + flusher de título e texto), `store/keys/board.ts` (novo), `components/board/` (`BoardView.tsx`,
  `BoardCard.tsx`, `boardMenu.ts`, `cardDrag.ts`), `components/workspace/MainTabs.tsx`, `styles/board.css`.
- Remover o que a seção "O que sai" lista.

## Testes

- Rust: quadro ausente lista vazio; criar/mover/excluir/duplicar mantêm ordem e arquivos; excluir apaga o `.md` só
  depois do JSON; limites de título e texto cortam por caractere; campos desconhecidos sobrevivem; import põe um cartão
  por item com sinopse, na ordem do binder, no fim do quadro existente.
- Front: tab ativa lembrada por livro e abrir item na árvore volta ao Editor; texto e título digitados entram no flush e
  vão para o livro certo após troca de livro; soltar cartão chama mover com o índice certo; teclas dentro do cartão não
  chegam ao quadro; clicar numa pasta só expande/recolhe.

## Fora do escopo

- Quadro por pasta, modo livre (freeform) e cores de label do Scrivener.
- Ligar cartão a um capítulo ou texto da árvore.
- Imprimir ou exportar cartões.
- A revisão de usabilidade (atalhos pouco comuns para escritores): spec próprio, depois deste.
