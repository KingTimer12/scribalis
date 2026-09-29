# Quadro de cortiça e index cards

## Por quê

Quem vem do Scrivener organiza a história no Quadro de cortiça: cada documento vira um *index card* com o título e
uma sinopse curta, e os cartões de uma pasta ficam lado a lado para ler a estrutura de relance e reordenar. Hoje o
Scribalis não tem sinopse nem quadro, e o import do Scrivener cola a sinopse dentro das notas, onde ela se perde.

Este spec adiciona:

1. um campo **Sinopse** em todo item da árvore;
2. o import do Scrivener levando a sinopse de cada item para esse campo;
3. o **Quadro de cortiça**: abrir uma pasta ou o Manuscrito mostra os filhos como index cards.

## Dados (Rust)

- `Node` ganha `synopsis: String` com `#[serde(default, skip_serializing_if = "String::is_empty")]`. É aditivo: livros
  v2 continuam v2, sem migração. Livros antigos simplesmente não têm sinopse.
- `AreaNode` no front ganha `synopsis?: string`.
- Novo comando `workspace_set_synopsis(book_id, id, synopsis) -> Vec<Node>`, no mesmo molde de `workspace_set_notes`
  (grava `area.json`, marca o livro como editado). Vale para qualquer tipo, inclusive o Manuscrito. Limite: 2000
  caracteres; acima disso o Rust corta e o front impede de digitar mais (`maxlength`).
- Sinopse não entra em `metadata.chapters` (espelho) nem muda o servidor; vai para a nuvem dentro de `area.json`,
  como o resto da árvore.

## Import do Scrivener

- `Project::notes(key)` deixa de incluir a sinopse. Novo `Project::synopsis(key)` lê `synopsis.txt` (Scrivener 3,
  `Files/Data/<UUID>/synopsis.txt`) ou `<id>_synopsis.txt` (Scrivener 2), texto puro, `trim`.
- Todo nó importado (capítulo, texto, pasta, imagem, arquivo) recebe a sinopse do seu item.
- Um capítulo formado por vários itens (pasta do Scrivener com filhos, `gather`) recebe só a sinopse do item de topo;
  as sinopses dos filhos entram nas notas do capítulo, precedidas pelo título do filho (`Título: sinopse`), para não
  se perderem.
- Livros já importados antes desta mudança ficam como estão (sinopse dentro das notas). Não há tentativa de separar.

## Quadro de cortiça (tela)

### Quando aparece

- Clicar (ou Enter) numa **pasta** ou no **Manuscrito** na árvore abre o quadro dela no painel principal. Hoje esse
  clique só seleciona e o painel mostra o estado vazio.
- O quadro é um nó aberto como os outros: fica em `areaOpen`, é lembrado ao reabrir o livro, e o título da pasta
  aparece no topo do quadro.

### Index card

- Grade responsiva de cartões (largura mínima ~220px, proporção de ficha 5×3), um por filho direto, na ordem da árvore.
- Cada cartão mostra:
  - ícone do tipo e título; capítulos sem título aparecem como "Capítulo N" (numeração contínua do Manuscrito);
  - a sinopse, editável direto no cartão (textarea sem borda). Salva com debounce ao digitar e na saída do campo;
    entra no `flushAll` para não perder texto ao fechar a janela ou trocar de nó;
  - rodapé: para capítulos, bolinha de status (cor de Rascunho/Revisão/Pronto) e contagem de palavras; para pastas,
    "N itens"; imagens mostram miniatura no lugar da sinopse vazia.
- Sinopse vazia mostra o placeholder "Escreva uma sinopse…".
- Cartão com arquivo faltando (`missing`) mostra o mesmo aviso da árvore ("Arquivo não encontrado").

### Interação

- Clique no cartão: seleciona. Duplo clique ou Enter: abre o item (texto/capítulo no editor, pasta no quadro dela,
  imagem/arquivo na visão atual).
- Clique na sinopse: edita. Esc sai da edição e volta o foco ao cartão.
- Setas movem a seleção entre cartões (esquerda/direita, cima/baixo pela grade). Esc com cartão selecionado volta o
  foco à árvore.
- Arrastar um cartão e soltar entre outros reordena dentro da mesma pasta, pelo comando de mover que já existe
  (`workspace_move` com o mesmo pai). Mover para outra pasta continua sendo pela árvore. Com `prefers-reduced-motion`,
  sem animação de reordenação.
- Clique direito no cartão abre o mesmo menu de contexto da árvore para aquele item.
- Botão "+ Novo" no topo do quadro, com as mesmas regras da árvore (Capítulo/Pasta dentro do Manuscrito, Texto/Pasta
  fora). Pasta vazia mostra "Pasta vazia" e esse botão.
- Modo foco não se aplica ao quadro (não há texto sendo escrito).

### Sinopse no painel de notas

- O painel de notas (Ctrl ;) de capítulos e textos ganha um campo "Sinopse" acima das notas, com o mesmo limite e o
  mesmo salvamento. É o mesmo campo do cartão: editar num lugar aparece no outro.

## Arquivos (orientação)

- Rust: `model/workspace.rs` (campo), `ops/workspace.rs` (set_synopsis), `commands/workspace.rs` + `lib.rs`
  (comando), `scrivener/project.rs` e `scrivener/import.rs` (import).
- Front: `api/` (+ mock), `store/actions/synopsis.ts` (salvar com debounce + flusher), `components/corkboard/`
  (`Corkboard.tsx`, `IndexCard.tsx`, `cardDrag.ts`), `NodeView.tsx` (abre o quadro para pasta/Manuscrito),
  `NotesPanel.tsx` (campo Sinopse), CSS do quadro em arquivo próprio ou seção própria.

## Testes

- Rust: serde sem sinopse lê vazio e não escreve o campo; `set_synopsis` grava e corta em 2000; import Scrivener 2 e 3
  põe a sinopse em `synopsis` e não em `notes`; capítulo composto leva a sinopse do topo e as dos filhos nas notas.
- Front: abrir pasta mostra quadro com os filhos na ordem; editar sinopse salva e entra no flush; soltar cartão chama
  mover com o mesmo pai e índice certo; setas/Enter/Esc; capítulo sem título aparece como "Capítulo N".

## Fora do escopo

- Cores de label do Scrivener e o campo Status do Scrivener.
- Posicionar cartões livremente (modo "freeform" do Scrivener).
- Imprimir ou exportar os cartões.
- Separar a sinopse das notas em livros importados antes desta mudança.
