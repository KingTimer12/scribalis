# Scribalis

Editor desktop para quem escreve webnovel. Feito para escrever capítulo atrás de capítulo, sem distração,
com os arquivos da obra guardados em pastas comuns no seu computador.

Roda em Windows, macOS (Apple Silicon e Intel) e Linux, e se atualiza sozinho.

## Por que usar

Webnovel tem um ritmo próprio: centenas de capítulos, publicação frequente, meta diária de palavras, anotações
de mundo e personagens que crescem junto com a história. Editores de texto genéricos tratam tudo como um
documento só; ferramentas como o Scrivener são poderosas, mas pesadas e cheias de opções que atrapalham quem
só quer escrever o próximo capítulo.

O Scribalis fica no meio: tem a organização de um gerenciador de manuscrito e a leveza de um editor de texto.

- **Escrever é o centro.** Abriu a obra, está no capítulo onde parou. `Enter` três vezes fecha o capítulo e
  abre o próximo. O resto fica a um `Ctrl K` de distância.
- **Seus arquivos são seus.** Cada obra é uma pasta em `Documentos/Scribalis`, com capítulos em Markdown e um
  `metadata.json` legível. Dá para fazer backup, sincronizar com Dropbox/Drive, versionar com git ou abrir os
  capítulos em outro editor. Sem conta, sem nuvem, sem formato fechado.
- **Leve.** Tauri + Rust em vez de Electron: instalador pequeno e pouca memória. O texto dos capítulos que não
  estão abertos nunca fica carregado na interface.
- **Funciona offline**, sempre.
- **Vem do Scrivener sem perder o trabalho.** Importa projetos `.scriv` (Scrivener 2 e 3) com negrito, itálico
  e parágrafos, e você escolhe o que vira capítulo e o que vai para a árvore.
- **Teclado primeiro, mouse também.** Quase tudo tem atalho, e a paleta de comandos acha qualquer ação ou
  trecho de texto. As ações principais também têm botão visível, e os menus mostram o atalho de cada item.
- **O mundo da história junto do texto.** Fichas de personagens, lugares e habilidades com campos que você
  define, mencionadas no capítulo com `@` e ligadas entre textos com `[[`.

## Features

### Biblioteca de obras

- Grade de obras com capa, título, autor e progresso.
- Criar, renomear, buscar e excluir obras pelo teclado (`N`, `R`, `/`, `Del`) ou pelo botão **+ Nova obra** e
  o menu `…` de cada obra. Excluir sempre pede confirmação.
- Capa a partir de qualquer imagem (PNG, JPG, WebP), recortada automaticamente para 400×600.
- Obras de exemplo para explorar o app na primeira abertura.

### Editor de capítulos

- Editor rico com negrito, itálico, alinhamento (esquerda, centro, direita, justificado) e espaçamento de
  parágrafo.
- **Novo capítulo no cursor:** `Enter Enter Enter` divide o capítulo ali mesmo.
- **Separador de cena** configurável por obra: texto (padrão `* * *`) ou imagem, inserido com `Ctrl Enter`.
- **Moldura superior e inferior** (imagens de cabeçalho e rodapé) por obra, visíveis no próprio editor.
- Imagens dentro do capítulo, por atalho (`Ctrl Shift I`) ou arrastando para a página.
- Salvamento automático com escrita atômica: um arquivo nunca fica pela metade se o app fechar no meio.
- Copiar o capítulo inteiro para colar na plataforma de publicação.
- Barra de formatação com imagem, separador e "limpar formatação"; barra do capítulo com botões para
  anterior/seguinte, status, notas e modo foco.
- Modo foco (`Ctrl .`, esconde a árvore e as barras; `Esc` ou o botão "Sair do foco" voltam), tema claro e
  escuro (botão de sol/lua na barra de cima ou `Ctrl J`).
- Tamanho do texto de 14 a 32 px (`Ctrl +`, `Ctrl -`, `Ctrl 0`), tamanho da interface e largura do texto
  ajustáveis, independentes entre si.
- **Links entre textos** no estilo Obsidian: `[[` lista capítulos, textos e pastas; o que vem depois de `|`
  vira o texto do link. Clicar abre o item; passar o mouse mostra um cartão.
- **Menções a fichas:** `@` sugere personagens, lugares e habilidades. A menção mostra sempre o nome atual da
  ficha e, ao passar o mouse, os campos dela com um botão "Abrir ficha".

### Manuscrito e área de trabalho

Cada obra é uma árvore só, numa barra lateral ao lado do texto (aberta por padrão; `«` ou `Ctrl E`
recolhem e reabrem, e a escolha fica salva por obra).

- **Manuscrito** guarda os capítulos. Pastas dentro dele (ex.: "Parte 1") só agrupam: a numeração continua
  de uma parte para a outra. Ele pode ser renomeado e movido para a raiz ou para dentro de pastas; os
  capítulos continuam capítulos, e a pasta que o contém não pode ser excluída.
- O resto da árvore guarda pesquisa, fichas de personagens, mapas e rascunhos: pastas, textos livres,
  imagens e anexos.
- Arrastar um texto para dentro do Manuscrito (ou "Mover para o Manuscrito") o torna capítulo; arrastar um
  capítulo para fora o torna texto, com o conteúdo e as notas. Imagens e anexos não entram no Manuscrito.
- **+ Novo** no pé da barra cria capítulo (no Manuscrito), texto, pasta, imagem ou arquivo na pasta
  selecionada. Botão direito abre o menu de cada item (renomear, status, compartilhar, copiar para publicar,
  mover, excluir).
- Cada capítulo mostra status (rascunho, revisão, pronto — `Alt S`) e palavras; o Manuscrito mostra o total
  da obra.
- **Subdocumentos:** capítulos e textos podem ter filhos, em qualquer profundidade ("Novo subdocumento" no
  menu, ou arrastar um item para dentro de um documento).
- **Quadro de cortiça** no estilo do Scrivener: abrir uma pasta ou o Manuscrito mostra os filhos como fichas
  de índice com título e sinopse, editáveis ali mesmo e reordenáveis por arrasto ou teclado. Um documento com
  subdocumentos ganha as abas Editor | Quadro. Sem sinopse, a ficha mostra o começo do texto.
- Notas e sinopse por capítulo ou texto (`Ctrl ;`), fora do texto.
- Capítulo anterior / seguinte na ordem do Manuscrito (`Alt ↑ ↓`); mover o capítulo dentro da pasta
  (`Alt Shift ↑ ↓`).
- Textos livres usam o mesmo editor, sem moldura, separador nem `Enter ×3`; imagens aparecem no app; PDFs e
  outros arquivos abrem no programa padrão do sistema.
- Obras antigas são convertidas sozinhas ao abrir: os capítulos entram no Manuscrito na mesma ordem e uma
  cópia do `metadata.json` original fica em `metadata.antes-da-migracao.json`.

### Fichas

- Aba **Escrita | Fichas** em cada obra (`Ctrl Shift F`), com fichas de personagens, lugares e habilidades.
- Cada tipo segue um **molde** editável: campos de texto curto, texto longo, lista de opções, sim/não,
  referência a outras fichas (uma ou várias) e etiquetas (sugere as já usadas, sem repetir).
- Mudar o molde ajusta todas as fichas, e o app pergunta antes de descartar valores preenchidos. Excluir uma
  ficha remove as referências a ela.

### Meta diária

- Meta de palavras por dia com qualquer valor (`1600`, `1.600`, `1.5k`, `2 mil`), barra de progresso sempre
  visível; clicar nela abre os ajustes.

### Configurações

- **Configurações** (`Ctrl ,` ou a engrenagem ao lado do tema), com Aparência, Escrita e Nuvem.
- O que é de uma obra só (autor, capa, molduras, separador, backup e links) fica no painel **Obra**
  (`Ctrl Shift S`).

### Importação do Scrivener

- Lê projetos `.scriv` do Scrivener 2 e 3: estrutura do binder, textos em RTF, sinopses, notas e mídia.
- Itens dentro de um capítulo viram subcapítulos, cada um com seu texto, notas e sinopse; textos com filhos
  continuam documentos com subdocumentos.
- Se todos os capítulos escolhidos estão numa mesma pasta do binder, essa pasta vira o Manuscrito no mesmo
  lugar, com nome, notas e sinopse.
- Mantém negrito, itálico, alinhamento e espaçamento de parágrafo.
- Tela de importação onde você escolhe, item por item, o que vira capítulo; os capítulos entram no
  Manuscrito na ordem do binder e o resto vai para a árvore. Dentro de uma obra aberta, os capítulos entram
  no fim do Manuscrito.
- Importa como obra nova (na biblioteca) ou dentro de uma obra já aberta.

### Busca e comandos

- `Ctrl K` abre a paleta: busca no texto de todos os capítulos da obra, nas obras e em todas as ações do app.
- `Ctrl /` mostra todos os atalhos; as ações seguras podem ser executadas clicando na própria linha.

### Atualização automática

- O app avisa quando há versão nova e instala com um clique. Os pacotes são assinados.

### Nuvem (opcional)

- Backup automático das obras que você escolher: ao sair da obra, a cada 10 minutos e ao fechar o app. Só os
  arquivos que mudaram são enviados.
- Até 3 backups por obra; restaurar substitui a obra (o estado atual vira um backup antes).
- **Criptografia de ponta a ponta** (padrão): os arquivos são comprimidos e trancados com XChaCha20-Poly1305
  usando a chave do cofre antes de sair do computador. O servidor só vê o `metadata.json`. Obras com links
  públicos podem ficar abertas.
- Progresso visível ao fechar com backup, restaurar e baixar; se o backup falhar ao fechar, a janela fica
  aberta com "tentar de novo" ou "fechar mesmo assim".
- Leve o cofre para outro computador com um código (que carrega também a chave de criptografia); baixe de lá
  as obras que ainda não estão nele.
- Links públicos de um capítulo (botão direito no capítulo, "Compartilhar") ou de parte da árvore, com
  comentários. Os comentários chegam nas notas do capítulo ou do texto.
- Sem conta: a chave fica no chaveiro do sistema. O cofre fica em Configurações › Nuvem; backup e links de
  cada obra, no painel Obra (`Ctrl Shift S`).
- O endereço da API é configurável. As rotas que um servidor próprio precisa ter estão em
  `docs/superpowers/specs/2026-09-28-nuvem-backup-links-design.md`.
- Obras deixadas sem criptografia podem ser lidas por quem administra o servidor.

## Diferenças em relação a outras ferramentas

| | Scribalis | Scrivener | Word / Google Docs |
|---|---|---|---|
| Feito para | Capítulos em série | Manuscritos longos em geral | Documentos em geral |
| Formato dos arquivos | Pastas com Markdown e JSON | Pacote `.scriv` com RTF | `.docx` / nuvem |
| Abre os arquivos sem o app | Sim, qualquer editor de texto | Difícil | Precisa de app compatível |
| Offline e sem conta | Sim | Sim | Docs precisa de conta |
| Status, notas e sinopse por capítulo | Sim | Sim | Não |
| Quadro de cortiça | Sim | Sim | Não |
| Fichas de personagens e mundo | Sim, com molde editável | Modelos de documento | Não |
| Backup em nuvem criptografado | Sim, opcional | Não | Não |
| Meta diária de palavras | Sim | Sim | Não |
| Novo capítulo sem sair do teclado | `Enter ×3` | Menus | Não se aplica |
| Linux | Sim | Não | Só no navegador |
| Preço | Gratuito, código aberto | Pago | Pago ou com conta |

## Instalação

Baixe o instalador da sua plataforma na página de
[releases](https://github.com/KingTimer12/scribalis/releases/latest):

- **Windows:** `.msi` ou `.exe`
- **macOS:** `.dmg` (Apple Silicon ou Intel)
- **Linux:** `.AppImage`, `.deb` ou `.rpm`

Depois da primeira instalação, as atualizações chegam pelo próprio app.

## Onde ficam os dados

```
~/Documentos/Scribalis/
  minha-obra/
    metadata.json      título, autor, capa, separador, molduras, o último item aberto e uma cópia da
                       lista de capítulos (para a Nuvem e versões antigas; o app lê a árvore)
    capitulos/         um arquivo .md por capítulo
    imagens/           capa, molduras, separador e imagens dos capítulos
    fichas.json        moldes e fichas de personagens, lugares e habilidades
    area/
      area.json        a árvore da obra: o Manuscrito (ordem, status, notas, sinopses e palavras dos capítulos),
                       subdocumentos e o resto
      arquivos/        textos, imagens e anexos fora do Manuscrito
```

Renomear uma obra no app não renomeia a pasta. Campos desconhecidos no `metadata.json` e no `area.json` são
preservados, então editar à mão ou com outras ferramentas não perde dados.

## Desenvolvimento

Pré-requisitos: [bun](https://bun.sh), [Rust](https://rustup.rs) e as
[dependências do Tauri](https://tauri.app/start/prerequisites/) da sua plataforma.

```sh
bun install
bun run tauri dev      # app desktop
bun run dev            # só a interface no navegador (porta 1420), com dados simulados
bun run test           # testes do front (vitest)
cargo test --manifest-path src-tauri/Cargo.toml   # testes do Rust
bun run build          # build do front
```

### Arquitetura

- **Rust (`src-tauri/`)** cuida de todo dado e processamento: disco, parsing e serialização de Markdown,
  leitura de RTF e do binder do Scrivener, imagens, contagem de palavras, busca, fichas, nuvem e criptografia
  dos backups e preferências. Um módulo por
  assunto (`storage`, `markdown`, `model`, `ops`, `scrivener`, `cloud`, `commands`…).
- **SolidJS + TipTap + Tailwind v4 (`src/`)** guardam só estado de tela e o capítulo aberto. `src/api/`
  conversa com o Rust; `src/api/mock/` simula o backend para rodar no navegador e nos testes.

### Release

```sh
bun run bump X.Y.Z
git commit -am "chore: bump version to X.Y.Z"
git tag -a vX.Y.Z -m vX.Y.Z && git push --follow-tags
```

A tag dispara o workflow de release, que gera os instaladores assinados para todas as plataformas e publica o
`latest.json` lido pelo updater.

## Licença

MIT.
