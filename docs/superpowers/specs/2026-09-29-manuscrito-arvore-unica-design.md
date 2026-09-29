# Árvore única: Manuscrito dentro da Área de Trabalho

Data: 2026-09-29
Status: aguardando revisão
Depende de: nada (a Nuvem já está no `master` e continua funcionando; ver "Nuvem").

## Objetivo

Com a Área de Trabalho, o Scribalis passou a ser sobre estruturar histórias, não só sobre escrever capítulos
em fila. Hoje a obra tem duas abas (Capítulos e Área de Trabalho), e isso divide o mesmo trabalho em dois
lugares. Este spec junta tudo numa árvore só, no estilo do Scrivener: uma pasta fixa **Manuscrito** guarda os
capítulos, e o resto da árvore guarda pesquisa, fichas, mapas e rascunhos.

### Requisitos do usuário

- **Só a Área de Trabalho.** A aba Capítulos sai; tudo fica num lugar só.
- **Moldura e separador continuam** (imagens de cabeçalho/rodapé e separador de cena por obra).
- **Capítulos numa pasta Manuscrito**, fixa no topo da árvore. Textos dentro dela são capítulos; fora dela são
  textos livres.
- **Árvore numa barra lateral recolhível**, aberta por padrão, visível na tela de escrita.
- **Compartilhar um capítulo continua**, pelo botão direito no capítulo, "Compartilhar".
- **Botão de tema** visível: um sol/lua que troca entre claro e escuro com um clique, sem passar pela paleta.

### Fora de escopo

- **Descoberta sem atalhos** (crítica de que tudo depende de comandos). Vira um spec próprio, logo depois
  deste; aqui só entra o que a nova tela já pede (botão "+ Novo", menus de contexto, botão de recolher) e o
  botão de tema.
- **Imagens do Scrivener dentro do texto** (`\pict` ignorado em `scrivener/rtf.rs`). É um bug separado,
  corrigido fora deste spec.
- Compilar/exportar o manuscrito inteiro num arquivo.
- Moldura ou separador em textos fora do Manuscrito.

## Modelo

### Árvore (`area/area.json`, versão 2)

A árvore passa a ser a única fonte da estrutura da obra.

- Novo tipo de nó `chapter`, além de `folder`, `text`, `image` e `file`.
  - Campos: `id`, `title`, `notes`, `file` (caminho relativo à pasta da obra, em `capitulos/`), `status`
    (`rascunho` | `revisao` | `pronto`), `words`. Campos desconhecidos continuam preservados (`extra`).
- Novo nó raiz `manuscript`: sempre o primeiro item de `items`, título "Manuscrito", com filhos.
  - Não pode ser excluído, renomeado, movido nem ter irmão antes dele.
  - Aceita como filhos só `chapter` e `folder`. Pastas dentro dele (ex.: "Parte 1") aceitam o mesmo.
- Fora do Manuscrito, as regras de hoje valem sem mudança.

**Ordem dos capítulos:** percurso em profundidade do Manuscrito. Pastas só agrupam; a numeração é contínua
(Cap. 1, 2, 3… atravessando as partes).

### Mover entre Manuscrito e o resto

- Arrastar (ou "Mover para…") um texto para dentro do Manuscrito converte o nó em `chapter`: o arquivo vai
  para `capitulos/`, status `rascunho`, contagem calculada.
- Arrastar um capítulo para fora converte em `text`: o arquivo vai para `area/arquivos/`, conteúdo e notas
  intactos, status e contagem descartados.
- Imagens e anexos não entram no Manuscrito (o drop é recusado, com aviso na barra de status).
- O id do nó não muda na conversão.

### `metadata.json`

- Fica só com o que é da obra: título, autor, capa, `separator`, `header`, `footer`, meta diária e demais
  campos de hoje.
- `chapters` deixa de ser escrito a partir da versão 2 (campo legado; lido só pela migração).
- `cur` (índice do capítulo aberto) vira `open` (id do último nó aberto). A migração converte.

### O que continua sendo só de capítulo

Moldura, separador (`Ctrl Enter`), status (`Alt S`), contagem de palavras e total da obra, meta diária,
`Enter Enter Enter` (divide e cria o próximo capítulo logo depois, na mesma pasta), `Alt ↑ ↓` (capítulo
anterior/seguinte na ordem do Manuscrito), copiar capítulo para publicar, link público de capítulo.

Textos livres usam o mesmo editor, sem moldura, sem separador e sem `Enter ×3`.

## Migração

Roda no Rust, ao abrir uma obra cuja árvore esteja na versão 1 (ou que não tenha `area/`). É automática,
silenciosa e sem perda.

1. Copia `metadata.json` para `metadata.antes-da-migracao.json` (se ainda não existir).
2. Cria o nó `manuscript` e, dentro dele, um `chapter` para cada item de `metadata.chapters`, na mesma ordem,
   com o mesmo `id`, `title`, `notes`, `status`, `words` e `file`. Nenhum arquivo é movido.
3. Os itens atuais da área de trabalho ficam depois do Manuscrito, sem mudança.
4. `cur` vira `open` com o id do capítulo correspondente.
5. Grava `area.json` (versão 2) e depois `metadata.json` (sem `chapters`), ambos com escrita atômica.

Se a migração falhar no meio, a obra abre com um erro claro e os arquivos originais continuam válidos (o passo
5 só grava depois que tudo foi montado em memória). Uma obra já migrada nunca é migrada de novo.

Obras novas (criar obra, obras de exemplo) já nascem na versão 2 com um Manuscrito contendo "Capítulo 1".

## Tela da obra

```
┌────────────────┬──────────────────────────────────┬───────────┐
│ ▾ Manuscrito   │           [moldura]              │  Notas    │
│   ▾ Parte 1    │  Capítulo 2                      │ (gaveta   │
│     • Cap. 1 ✓ │                                  │  direita, │
│     • Cap. 2 ✎ │  texto do capítulo...            │  opcional)│
│ ▾ Personagens  │            * * *                 │           │
│     Ana        │  mais texto...                   │           │
│ ▸ Pesquisa     │           [moldura]              │           │
│ [+ Novo]  [«]  │                                  │           │
└────────────────┴──────────────────────────────────┴───────────┘
```

- **Sem abas.** Saem as abas Capítulos/Área de Trabalho e os atalhos `Ctrl 1`/`Ctrl 2`.
- **Barra lateral à esquerda** com a árvore, aberta por padrão. Botão « na própria barra e `Ctrl E` recolhem
  e reabrem; a escolha fica salva por obra (estado de tela nas preferências, no Rust).
- **"+ Novo"** no pé da barra: Capítulo, Texto, Pasta, Imagem/Arquivo. Cria dentro da pasta selecionada;
  "Capítulo" só aparece quando a seleção está no Manuscrito, e "Texto" só fora dele.
- **Linha de capítulo** mostra o título, um ponto de status (rascunho/revisão/pronto) e a contagem de palavras.
  O Manuscrito mostra o total da obra.
- **Editor** ocupa o resto. Capítulo: moldura, separador, título. Texto livre: mesmo editor, sem os extras.
  Imagem e anexo: como hoje.
- **Notas** continuam na gaveta direita (`Ctrl ;`), para capítulos e textos.
- **Modo foco** (`Ctrl .`) esconde a barra lateral e as barras de cima e de baixo.
- Ao abrir a obra, abre o nó `open`; se não existir, o primeiro capítulo.

### Botão de tema

- Botão na barra de cima, visível na biblioteca e na tela da obra (some no modo foco, junto com a barra).
- Mostra uma lua no tema claro e um sol no tema escuro; um clique troca o tema e o ícone. Dica ao passar o
  mouse: "Tema escuro" / "Tema claro" com o atalho `Ctrl J`.
- Usa a mesma preferência de tema de hoje (salva no Rust); `Ctrl J` e a paleta continuam funcionando.
- Ícones em SVG inline, sem biblioteca nova; troca com uma transição curta, respeitando
  `prefers-reduced-motion`.

### Menu de contexto (botão direito)

| Item | Opções |
|---|---|
| Manuscrito | Novo capítulo, Nova pasta |
| Pasta no Manuscrito | Novo capítulo, Nova pasta, Renomear, Excluir |
| Capítulo | Renomear, Status ›, Compartilhar, Copiar para publicar, Mover para fora do Manuscrito, Excluir |
| Pasta fora | Novo ›, Renomear, Compartilhar, Excluir |
| Texto, imagem, anexo | Renomear, Compartilhar (texto), Mover para o Manuscrito (texto), Excluir |

"Compartilhar" abre o painel Nuvem já na criação de link para aquele nó. Excluir mantém a confirmação dupla de
hoje. Excluir uma pasta do Manuscrito com capítulos pede confirmação dizendo quantos capítulos vão junto.

### O que sai

- Aba Capítulos e o índice de capítulos em gaveta (`ChapterIndex`). A barra lateral substitui os dois.
- "Enviar capítulo para a área de trabalho" (vira arrastar ou "Mover para fora do Manuscrito").
- Código de lista de capítulos no front que só servia à aba.

A paleta (`Ctrl K`) e a ajuda (`Ctrl /`) são atualizadas: saem as ações das abas, entram "Novo capítulo",
"Nova pasta", "Recolher barra lateral", "Mover para o Manuscrito".

## Nuvem

- Links públicos de capítulo continuam com o mesmo `nodeId` (o id do capítulo não muda na migração).
- Comentários de visitantes entram nas notas do nó, capítulo ou texto, como hoje.
- Backup é por arquivo, então não muda. A primeira migração gera um backup novo porque `area.json` e
  `metadata.json` mudaram.
- A restauração de um snapshot antigo (versão 1) passa pela migração ao abrir a obra.

## Importação do Scrivener

- O que o usuário marca como capítulo vai para o Manuscrito, na ordem do binder. O Draft do Scrivener vira o
  conteúdo do Manuscrito. O resto vai para a árvore como hoje.
- "Importar dentro de uma obra aberta" acrescenta os capítulos ao fim do Manuscrito.

## Arquitetura

- **Rust** faz tudo que é dado: tipos de nó, regras do Manuscrito (o que aceita, o que não pode ser movido),
  conversão capítulo ⇄ texto (mover arquivo, calcular contagem), ordem dos capítulos, próximo/anterior,
  migração, total de palavras.
  - `model/workspace.rs`: novos tipos e regras puras.
  - `ops/manuscript.rs` (novo): ordem, conversões, criar capítulo depois de outro.
  - `storage/migrate.rs` (novo): migração v1 → v2.
  - `ops/chapter.rs` passa a localizar capítulos pela árvore, não por `metadata.chapters`.
- **Front** guarda só a seleção, o nó aberto e o estado da barra lateral. A árvore vem pronta do Rust.
  - `components/workspace/` vira a tela da obra; `ChapterIndex.tsx` e a troca de abas saem.
  - Menus por tipo em `treeMenu.ts`.

## Erros

- Operação proibida no Manuscrito (excluir, renomear, mover, soltar imagem dentro): recusada no Rust com
  mensagem em português, mostrada na barra de status.
- Falha na migração: a obra não abre, mensagem "Não foi possível atualizar esta obra para o novo formato. Nada
  foi alterado." e o erro técnico no log.
- Arquivo de capítulo ausente: o nó aparece na árvore com aviso, como hoje com itens sem arquivo.

## Testes

- **Rust:** migração (ordem, ids, notas, status, `cur` → `open`, cópia de segurança, idempotência, obra sem
  `area/`, campos desconhecidos preservados, falha antes de gravar); regras do Manuscrito; conversão
  capítulo ⇄ texto (arquivo movido, id mantido); ordem em profundidade com partes; próximo/anterior;
  `Enter ×3` cria na pasta certa; importação do Scrivener para o Manuscrito.
- **Front (vitest, mock):** barra lateral recolhe e lembra; "+ Novo" mostra as opções certas por seleção;
  menu de contexto por tipo; arrastar para dentro e para fora do Manuscrito; sem aba Capítulos; botão de
  tema troca o tema e o ícone (lua ⇄ sol) e salva a preferência.
- **Manual:** abrir uma obra antiga (migra, backup de `metadata.json` existe, links de capítulo continuam
  recebendo comentários); criar obra nova; foco; Scrivener.

## Documentação

README: "Organização dos capítulos" e "Área de trabalho" viram uma seção só, "Manuscrito e área de trabalho";
a árvore de "Onde ficam os dados" mostra `area.json` com o Manuscrito e `metadata.json` sem a lista de
capítulos; atalhos atualizados.
