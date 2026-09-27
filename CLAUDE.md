# Scribalis — regras do projeto

Editor de webnovel desktop: Tauri 2 (Rust) + SolidJS + Tailwind v4, gerenciado com bun.

## Regras de código

- **Comentários sempre em inglês**, em qualquer linguagem (TS, Rust, CSS). Textos de interface continuam em português.
- **Nada de classes/arquivos Deus.** Cada arquivo tem uma responsabilidade clara. Se um arquivo começa a juntar
  assuntos diferentes (ex.: ações de dados + handlers de teclado + helpers de formatação), divida antes de crescer.
  Vale para módulos Rust também: um `mod` por assunto.
- **Dados e processamento de dados ficam no Rust** (disco, parsing, imagens, contagens, busca). O webview guarda só
  estado de tela e o capítulo aberto. Objetivo: pouca RAM no webview e no Rust.

## Git

- Todo pedido de mudança termina com um commit.
- Mensagens de commit **sem** linha `Co-Authored-By` ou qualquer atribuição.

## Comandos

- `bun run dev`: front no navegador (porta 1420)
- `bun run tauri dev`: app desktop
- `bun run build`: build do front
- Typecheck: `./node_modules/.bin/tsc.exe --noEmit -p .`
