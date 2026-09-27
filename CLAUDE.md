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

## Release e updater

- CI (`.github/workflows/ci.yml`): typecheck, testes e build a cada push no `master` e em PRs.
- Release (`.github/workflows/release.yml`): tag `vX.Y.Z` gera instaladores assinados (Windows, Linux, macOS arm/intel)
  e publica a release com `latest.json`, que o updater do app lê.
- Para lançar: `bun run bump X.Y.Z`, commit, `git tag -a vX.Y.Z -m vX.Y.Z && git push --follow-tags`
  (tag anotada: `--follow-tags` ignora tags simples; para uma tag simples use `git push origin vX.Y.Z`).
- Secrets do repositório: `TAURI_SIGNING_PRIVATE_KEY` (conteúdo de `~/.tauri/scribalis.key`) e
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. A chave privada nunca entra no repositório; perdê-la impede novas atualizações.
