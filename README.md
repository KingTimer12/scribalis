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
  e parágrafos, e você escolhe o que vira capítulo e o que vai para a área de trabalho.
- **Teclado primeiro.** Quase tudo tem atalho, e a paleta de comandos acha qualquer ação ou trecho de texto.

## Features

### Biblioteca de obras

- Grade de obras com capa, título, autor e progresso.
- Criar, renomear, buscar e excluir obras pelo teclado (`N`, `R`, `/`, `Del Del`).
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
- Modo foco (`Ctrl .`), tema claro e escuro (`Ctrl J`), largura do texto e tamanho da letra ajustáveis.

### Organização dos capítulos

- Índice de capítulos (`Ctrl E`) com reordenação (`Alt Shift ↑ ↓`) e exclusão.
- Status por capítulo: rascunho, revisão, pronto (`Alt S`).
- Notas por capítulo (`Ctrl ;`), fora do texto.
- Navegação rápida entre capítulos (`Alt ↑ ↓`).
- Contagem de palavras por capítulo e total da obra.

### Meta diária

- Meta de palavras por dia configurável, com barra de progresso sempre visível.

### Área de trabalho

Uma segunda aba dentro de cada obra (`Ctrl 2`) para tudo que não é capítulo: pesquisa, fichas de
personagens, mapas, rascunhos soltos.

- Árvore livre de pastas, textos, imagens e anexos.
- Criar, renomear, mover (arrastar ou teclado) e excluir, com menu de contexto.
- Textos usam o mesmo editor dos capítulos; imagens aparecem no app; PDFs e outros arquivos abrem no programa
  padrão do sistema.
- Um capítulo pode ser enviado para a área de trabalho em vez de apagado.

### Importação do Scrivener

- Lê projetos `.scriv` do Scrivener 2 e 3: estrutura do binder, textos em RTF, sinopses, notas e mídia.
- Mantém negrito, itálico, alinhamento e espaçamento de parágrafo.
- Tela de importação onde você escolhe, item por item, o que vira capítulo; o resto vai para a área de
  trabalho.
- Importa como obra nova (na biblioteca) ou dentro de uma obra já aberta.

### Busca e comandos

- `Ctrl K` abre a paleta: busca no texto de todos os capítulos da obra, nas obras e em todas as ações do app.
- `Ctrl /` mostra todos os atalhos.

### Atualização automática

- O app avisa quando há versão nova e instala com um clique. Os pacotes são assinados.

## Diferenças em relação a outras ferramentas

| | Scribalis | Scrivener | Word / Google Docs |
|---|---|---|---|
| Feito para | Capítulos em série | Manuscritos longos em geral | Documentos em geral |
| Formato dos arquivos | Pastas com Markdown e JSON | Pacote `.scriv` com RTF | `.docx` / nuvem |
| Abre os arquivos sem o app | Sim, qualquer editor de texto | Difícil | Precisa de app compatível |
| Offline e sem conta | Sim | Sim | Docs precisa de conta |
| Status e notas por capítulo | Sim | Sim | Não |
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
    metadata.json      título, autor, capa, ordem, status e notas dos capítulos
    capitulos/         um arquivo .md por capítulo
    imagens/           capa, molduras, separador e imagens dos capítulos
    area/
      area.json        árvore da área de trabalho
      arquivos/        textos, imagens e anexos da área de trabalho
```

Renomear uma obra no app não renomeia a pasta. Campos desconhecidos no `metadata.json` são preservados, então
editar à mão ou com outras ferramentas não perde dados.

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
  leitura de RTF e do binder do Scrivener, imagens, contagem de palavras, busca e preferências. Um módulo por
  assunto (`storage`, `markdown`, `model`, `ops`, `scrivener`, `commands`…).
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
