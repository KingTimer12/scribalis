# Nuvem: cofre, backup, links públicos e comentários nas notas

Data: 2026-09-28
Status: aguardando revisão
Depende de: servidor Scribalis Cloud (API documentada no repositório do kingtimer12.dev), ou um servidor
próprio que implemente as rotas da seção "Rotas que o servidor precisa ter".

## Objetivo

Guardar cópias das obras num servidor, restaurá-las (inclusive em outro computador) e gerar links públicos de
um capítulo ou da área de trabalho. Comentários que os visitantes deixam pelo link entram nas notas do
capítulo ou do item.

### Requisitos do usuário

- **Cofre sem conta:** o app gera uma chave de dispositivo guardada no chaveiro do sistema.
- **Endereço da API configurável.** Padrão `https://kingtimer12.dev/api/scribalis/v1`; quem tiver servidor
  próprio troca. Este documento lista as rotas que esse servidor precisa ter.
- **Backup automático por obra:** cada obra é ativada individualmente. Depois de ativada, o backup roda ao
  sair da obra, ao fechar o app e a cada 10 minutos de edição. Também existe "Fazer backup agora".
- **Restaurar substitui a obra**, depois de confirmação dupla e de um backup automático do estado atual.
- **Baixar do cofre** as obras que não existem neste computador.
- **Links públicos** de um capítulo, da área de trabalho inteira ou de um item/pasta dela.
- **Comentários viram notas:** o app busca os comentários abertos, acrescenta cada conversa ao fim das notas
  do item e marca a conversa como resolvida no servidor.
- **Notas do capítulo num painel lateral direito**, como o índice de capítulos (que fica à esquerda).
- **Selo "Nuvem"** na capa das obras que estão no cofre.
- **Painel Nuvem** com duas partes: geral (cofre) e esta obra (backup, restauração, links).

### Fora de escopo

- Responder, editar ou apagar comentários pelo app. Destacar no editor o trecho de um comentário (âncora).
- Criptografia no cliente. Quem administra o servidor lê as obras. O painel Nuvem avisa isso.
- Sincronização em tempo real ou mescla entre dois computadores editando a mesma obra. Restaurar substitui.
- QR code para levar o cofre a outro computador. Entre dois desktops não há câmera, então basta copiar e colar
  o código.
- Backup das preferências do app.
- Teste automático da camada HTTP (ver "Testes").

## Regra de divisão Rust × webview

| Rust | Webview |
|---|---|
| HTTP, chave no chaveiro, endereço da API | Painel Nuvem, formulários, confirmações |
| Varredura da pasta e SHA-256 | Status exibido ("salvo 14:30", "enviando…") |
| Backup, restauração, troca de pastas | Selo "Nuvem" (dado vem no resumo da obra) |
| Timer de backup automático | Copiar URL do link para a área de transferência |
| Buscar comentários, formatar, gravar nas notas, resolver | Recarregar a obra aberta depois da importação |
| Cache local do estado da nuvem (`cloud.json`) | — |

A chave nunca vai para o webview, com uma exceção: logo depois de gerar uma chave nova para outro
computador, ela é devolvida uma vez para ser mostrada e copiada.

## Arquitetura

### Rust: `src-tauri/src/cloud/`

| Arquivo | Responsabilidade |
|---|---|
| `mod.rs` | Reexporta; `CloudState` |
| `config.rs` | Endereço da API: validação e normalização |
| `keychain.rs` | Chave no chaveiro via `keyring` |
| `client.rs` | Cliente `reqwest`: base URL, Bearer, timeouts, erro JSON para `AppError` |
| `api.rs` | Tipos serde de requests e responses |
| `manifest.rs` | Percorre a pasta da obra e calcula o SHA-256 de cada arquivo em streaming |
| `backup.rs` | Fluxo check → upload do que falta → fechar snapshot |
| `restore.rs` | Baixar para staging, conferir, trocar pastas; baixar obra nova |
| `shares.rs` | Criar, listar, mudar e revogar links |
| `comments.rs` | Buscar, formatar em texto de nota, gravar, resolver |
| `status.rs` | `cloud.json`: estado por servidor e por obra |
| `error.rs` | `CloudError` e a conversão do JSON de erro |
| `scheduler.rs` | Tarefa de fundo do backup automático |

Comandos Tauri em `src-tauri/src/commands/cloud.rs`. Se passar de ~150 linhas, dividir em `cloud_vault.rs`,
`cloud_backup.rs` e `cloud_share.rs`.

**Estado.** `CloudState` é separado de `Library` e gerenciado pelo Tauri: `Mutex` com a chave já lida do
chaveiro (cache em memória), o conteúdo de `cloud.json`, o cache de hashes e o último manifesto enviado de
cada obra. Toda chamada de rede roda **sem** segurar o lock da `Library`: lê o que precisa (pasta da
obra, metadata), solta o lock, faz a rede, pega o lock de novo só para gravar. Um upload lento não trava o
editor.

**Dependências novas:** `reqwest` (features `rustls-tls`, `json`, `stream`; já está na árvore pelo
`tauri-plugin-updater`), `keyring` 3 (`apple-native`, `windows-native`, `sync-secret-service`), `sha2`,
`tokio` com `fs` e `io-util` (já está na árvore pelo Tauri).

### Front

- `src/api/cloud.ts` e `src/api/mock/cloud.ts` (o mock simula os comandos Tauri para rodar no navegador).
- `src/store/actions/cloud.ts`, `src/store/selectors/cloud.ts`.
- `src/components/cloud/`: `CloudPanel.tsx`, `VaultSection.tsx`, `BookCloudSection.tsx`, `SnapshotList.tsx`,
  `ShareList.tsx`, `ShareForm.tsx`, `KeyList.tsx`.
- `src/components/panels/NotesPanel.tsx` vira painel lateral direito.
- `src/components/library/BookTile.tsx` / `CoverArt.tsx`: selo.
- `Panel` ganha `"cloud"`.

## Estado local: `cloud.json`

Arquivo `cloud.json` na pasta de dados do app (`app_data_dir`), gravado com `write_atomic`, **fora** de
`Documentos/Scribalis`, que pode estar num Dropbox.

```json
{
  "apiUrl": "https://kingtimer12.dev/api/scribalis/v1",
  "servers": {
    "https://kingtimer12.dev/api/scribalis/v1": {
      "vaultId": "vlt_…",
      "keyId": "key_…",
      "books": {
        "x1k2…": { "enabled": true, "lastBackupAt": 1790000000000, "lastSnapshotId": "snp_…" }
      },
      "pendingResolve": ["cmt_…"]
    }
  }
}
```

- Tudo que é por cofre fica sob `servers[apiUrl]`. Trocar o endereço troca de cofre, e voltar ao endereço
  antigo volta ao estado antigo.
- `books[id].lastBackupAt` presente significa que a obra está no cofre: é isso que acende o selo, mesmo sem
  internet.
- Ao abrir a biblioteca com internet, o app chama `GET /books` em segundo plano e atualiza `books`: obras
  apagadas no servidor perdem `lastBackupAt`, e backups feitos em outro computador aparecem. Falha de rede
  aqui é silenciosa.
- `pendingResolve`: conversas já copiadas para as notas cuja resolução no servidor ainda não foi confirmada
  (ver "Comentários nas notas").

## Chave e endereço

- **Chaveiro:** serviço `Scribalis`, conta = endereço da API normalizado. Uma chave por servidor.
- **Chaveiro indisponível** (por exemplo Linux sem Secret Service): o cofre não é ativado e aparece a
  mensagem "O chaveiro do sistema não está disponível. Sem ele, o Scribalis não guarda a chave do cofre." Não
  existe alternativa em arquivo.
- **Endereço:** precisa ser `https://`. A exceção é `http://localhost` e `http://127.0.0.1`, para
  desenvolvimento. A chave vai em todo request e não pode trafegar em texto puro. A barra final é removida.
- **Trocar o endereço** pede confirmação ("As obras deste cofre continuam no servidor antigo") e não apaga
  nada, nem a chave antiga.

## Fluxos

### Ativar o cofre

"Ativar a nuvem" chama `POST /vaults { label }`, com `label` igual ao nome do computador. O app grava
`secret` no chaveiro e `vaultId`/`keyId` no `cloud.json`. O `secret` nunca chega ao webview.

### Conectar a um cofre existente (outro computador)

- **No computador que já tem a chave:** "Adicionar computador" chama `POST /vault/keys { label }` e mostra o
  `secret` novo **uma vez**, com botão Copiar e o aviso "Quem tiver este código acessa todas as obras do
  cofre."
- **No computador novo:** "Conectar a um cofre" recebe o código colado. O app valida com `GET /vault` e só
  grava no chaveiro se a resposta for 200.
- **Chaves:** `GET /vault/keys` lista as chaves (a atual marcada como "este computador"). Revogar chama
  `DELETE /vault/keys/:id` com confirmação dupla. A última chave não pode ser apagada (o servidor responde
  `last_key`).

### Backup

Obra com `enabled: true`:

1. **Manifesto** (`manifest.rs`). Percorre a pasta da obra e calcula o SHA-256 de cada arquivo lendo em
   blocos. Caminhos relativos, com `/`. Ignora arquivos e pastas que começam com `.` (`.DS_Store` e as pastas
   de staging) e arquivos `*.tmp` (escrita atômica em andamento). `metadata.json` é obrigatório.
2. **Nada mudou?** Se o conjunto (caminho, hash) for igual ao do último backup, guardado em memória por
   sessão, o app nem chama o servidor.
3. `POST /blobs/check { hashes }`, depois `PUT /blobs/:hash` para cada hash em `missing`, **um por vez**. O
   arquivo sai do disco em stream.
4. `POST /books/:bookId/snapshots { files }`. Se vier `missing_blobs`, envia os hashes listados e tenta fechar
   de novo, uma vez só.
5. Grava `lastBackupAt` e `lastSnapshotId`, e guarda o manifesto enviado como "último".

**Quando roda:**

- **"Mudou?"** é decidido pelo manifesto (passo 2), não por marcações espalhadas pelo código. Um cache de
  hashes por (caminho, tamanho, data de modificação) evita reler arquivos que não mudaram, então montar o
  manifesto de uma obra sem mudanças é quase só um `stat` por arquivo.
- **Ao sair da obra** (voltar à biblioteca ou abrir outra): o front pede um backup automático em segundo
  plano.
- **A cada 10 minutos** (`scheduler.rs`): uma tarefa tokio passa pelas obras ativadas e faz backup das que
  mudaram.
- **Ao fechar o app:** no `CloseRequested`, se houver obra ativada com mudanças, o app tenta o backup com limite de
  10 segundos e fecha de qualquer jeito.
- **Manual:** "Fazer backup agora" roda mesmo sem mudanças; o servidor responde `unchanged` sem gastar cota.
- Nunca roda dois backups da mesma obra ao mesmo tempo. Um pedido novo durante um backup em andamento marca
  "rodar de novo ao terminar".

**Ativar uma obra** faz o primeiro backup na hora. **Desativar** só para os backups automáticos; o que já está
no servidor fica. Para apagar do servidor existe "Apagar da nuvem" (`DELETE /books/:bookId`), com confirmação
dupla e o aviso de que os links dessa obra deixam de funcionar.

### Restaurar (substitui a obra)

No painel "Esta obra", lista dos backups (`GET /books/:bookId`): data, nº de arquivos e tamanho. Clicar em
"Restaurar" arma a confirmação; clicar de novo executa, como o `Del Del`.

1. `GET /books/:bookId/snapshots/:id` para pegar a lista de arquivos.
2. **Baixa tudo para a staging** `Documentos/Scribalis/.restaurando-<bookId>/`, usando `safe_join`, e confere
   o SHA-256 de cada arquivo. Se qualquer arquivo falhar, apaga a staging e para, com a obra intacta.
3. **Backup do estado atual.** Isso acontece **depois** do download, porque o backup novo pode expulsar o mais
   antigo dos 3, e ele pode ser justamente o que está sendo restaurado. Se esse backup falhar (sem internet,
   cota), a restauração para e avisa. Se vier `unchanged`, segue.
4. **Troca as pastas:** fecha a obra na `Library`, renomeia a pasta atual para `.antigo-<bookId>`, renomeia a
   staging para o nome da pasta atual e apaga `.antigo-<bookId>`. Se o segundo rename falhar, desfaz o
   primeiro.
5. `Library::register` com a metadata restaurada, **ajustando a base da meta diária** para a restauração não
   contar como palavras escritas hoje (mesma regra de `forget` e `register`).
6. O front recarrega a obra.

A varredura da biblioteca passa a ignorar pastas que começam com `.`. Se o app morrer no meio, sobra uma
pasta oculta, que é limpa na próxima abertura.

### Baixar obra do cofre

A seção Geral lista as obras de `GET /books` cujo `bookId` não existe localmente. "Baixar" segue os passos 1
e 2 da restauração, depois renomeia a staging para `unique_dir(root, slugify(título))`, mantém o id original,
registra a obra (ela entra na base da meta diária, como qualquer obra nova) e a marca como `enabled`.

### Links públicos

**Onde se cria:**

- **Painel "Esta obra":** "Compartilhar capítulo atual" e "Compartilhar área de trabalho".
- **Área de trabalho:** menu de contexto de um item ou pasta, "Compartilhar…".
- **Paleta:** "Compartilhar capítulo".

**Formulário** (`ShareForm`):

- Comentários: ligados (padrão).
- Incluir notas: desligado (padrão).
- Expira em: nunca (padrão), 1, 7 ou 30 dias.
- Versão: "acompanha os backups" (padrão, `snapshotId: "latest"`) ou "congelar esta versão".

**Ao criar:**

- Se a obra não está ativada, o formulário avisa que ela será ativada (o link precisa de backup).
- O app faz um backup automático antes (sem custo se nada mudou), para o link mostrar o texto atual.
- `POST /shares` e a URL devolvida pelo servidor vai para a área de transferência (mesmo mecanismo do "Copiar
  capítulo") com o aviso "Link copiado".

**Lista** (`ShareList`, filtrada por `bookId` a partir de `GET /shares`):

- Mostra alvo, visualizações, expiração e estado dos comentários.
- Ações: Copiar, Mudar (`PATCH /shares/:id` com os mesmos campos do formulário) e Revogar (`DELETE`, com
  confirmação dupla).

### Comentários nas notas

**Quando:**

- Ao abrir uma obra ativada, em segundo plano.
- Pelo botão "Buscar comentários" no painel de notas e no painel Nuvem.

**Como:**

1. O front descarrega os salvamentos pendentes (notas em debounce) antes de chamar o comando.
2. `GET /books/:bookId/comments?status=open`.
3. Agrupa por conversa: o comentário raiz mais as respostas, por `parentId`, em ordem de `createdAt`. Pula as
   conversas cujo id está em `pendingResolve` (já copiadas).
4. Para cada conversa, acha o destino pelo `nodeId`:
   - **Capítulo:** as notas desse capítulo no `metadata.json`.
   - **Item da área de trabalho:** as notas do nó no `area.json`.
   - **Nenhum dos dois** (item apagado): as notas de um texto `Comentários recebidos` na raiz da área de
     trabalho, criado na primeira vez. O cabeçalho da conversa ganha "(item apagado)".
5. Acrescenta o texto ao fim das notas, separado do que já existia por uma linha em branco:

   ```
   — Mira · 28/09 14:30 · sobre “cheiro de ferrugem”
   Achei confuso aqui, não entendi de onde vem o som.
     ↳ Mira · 28/09 14:41: Ah, agora entendi lendo o próximo parágrafo.
   ```

   - Sem âncora, o trecho "· sobre “…”" some.
   - Trecho com mais de 80 caracteres é cortado com "…".
   - Quebras de linha do corpo são mantidas; nas respostas, cada linha ganha o recuo.
   - Data em hora local.
6. **Grava primeiro, resolve depois.** Grava as notas (escrita atômica, como hoje), adiciona o id da conversa
   a `pendingResolve`, chama `PATCH /books/:bookId/comments/:id { resolved: true }` e, se der 200 ou 404,
   tira o id de `pendingResolve`. Se falhar, o id fica lá, e a próxima busca tenta resolver de novo sem copiar
   outra vez.
7. Devolve quantas conversas entraram. O front mostra "3 comentários adicionados às notas" e recarrega a obra
   se ela estiver aberta. As respostas do próprio autor (`author.kind: "owner"`, feitas por outro cliente)
   entram como respostas normais.

Depois de copiado, o texto é uma nota comum: o usuário edita ou apaga livremente.

## Interface

### Painel de notas à direita

`NotesPanel` deixa de ser o cartão flutuante (`.notes`, de 72px a 72px do topo e do rodapé) e vira uma
gaveta de altura total à direita. Mesma estrutura do `.drawer` do índice: `Scrim`, largura de 340px, `right:
0`, `border-left`, animação `slideR`. Continua abrindo com `Ctrl ;` e fechando com `Esc`.

Conteúdo:

- Cabeçalho "Notas · Capítulo 03".
- Textarea ocupando o resto.
- Com a obra ativada na nuvem, rodapé com "Buscar comentários" e a data da última busca.

As notas de itens da área de trabalho continuam onde estão (`NodeView`).

### Painel Nuvem (`Ctrl Shift S`, paleta "Nuvem")

É uma gaveta à direita, igual à de notas. Sempre mostra a seção Geral; com uma obra aberta, mostra "Esta
obra" no topo.

**Esta obra:**

- Botão de backup ligado/desligado.
- Estado: "Último backup: hoje 14:30", "Enviando 2 arquivos…" ou "Sem conexão, tenta de novo em alguns
  minutos".
- "Fazer backup agora".
- Lista de backups com "Restaurar" (confirmação dupla).
- Links: lista, "Compartilhar capítulo atual" e "Compartilhar área de trabalho".
- "Buscar comentários".
- "Apagar da nuvem" (confirmação dupla).

**Geral:**

- **Sem cofre:** endereço da API, "Ativar a nuvem" e "Conectar a um cofre".
- **Com cofre:** endereço da API, uso (`GET /vault`: "120 MB de 1 GB"), chaves (lista, "Adicionar
  computador", Revogar), obras que só estão no cofre com "Baixar", e "Apagar cofre" (`DELETE /vault`,
  confirmação dupla, com o aviso de que apaga todas as obras e links do servidor).
- Aviso fixo em texto pequeno: "Os arquivos não são criptografados no seu computador. Quem administra o
  servidor consegue lê-los."

A navegação por teclado segue o padrão dos painéis atuais: setas, `Enter` e `Esc`. Os campos de texto param a
propagação das teclas como já fazem.

### Selo "Nuvem"

`BookSummary` ganha `cloud: boolean`, que vem do Rust ao listar as obras (`lastBackupAt` presente em
`cloud.json` para o servidor atual). `CoverArt` mostra um selo pequeno no canto superior direito da capa:
texto "Nuvem" em `font-mono` de 10px, fundo `var(--panel)` e borda `var(--faint)`. Aparece na capa com imagem
e na capa de letra. `aria-label` "Guardada na nuvem".

### Barra inferior

Com a obra aberta e ativada, a `BottomBar` mostra um indicador curto: "nuvem ✓ 14:30", "nuvem ↑" enviando, ou
"nuvem offline". O Rust emite o evento `cloud://status` com `{ bookId, state, lastBackupAt }` quando o estado
muda, e o front só exibe.

## Erros

`cloud/error.rs` define `CloudError { code, message, retry_after, missing }`, montado a partir de
`{ "error": { "code", "message", ... } }`. Erro de rede vira o código interno `network` com a mensagem "Sem
conexão com o servidor da nuvem." Os comandos convertem `CloudError` em `AppError` (a mensagem), que é o que
o webview recebe; o `code` fica no Rust para decidir o comportamento do backup automático.

| Situação | Ação manual (botão) | Backup automático |
|---|---|---|
| Sem rede / timeout | Mostra a mensagem | Silencioso; estado "offline"; tenta no próximo ciclo |
| `401 unauthorized` | "O servidor recusou a chave deste computador." e "Conectar a um cofre" | Para os automáticos na sessão; estado "chave recusada" |
| `rate_limited` | Mostra a mensagem com `retryAfter` | Espera `retryAfter` antes do próximo ciclo |
| `quota_exceeded` | Mostra a mensagem | Para os automáticos na sessão; estado "sem espaço" |
| `too_large` | Mostra a mensagem com o caminho do arquivo | Igual a `quota_exceeded` |
| `missing_blobs` | Reenvia uma vez; se voltar, mostra a mensagem | Igual |
| `expired`, `gone`, `not_found` | Mostra a mensagem e atualiza a lista | — |
| Chaveiro indisponível | Mensagem da seção "Chave e endereço" | — |
| Resposta que não é JSON | "O servidor da nuvem respondeu algo inesperado (HTTP 502)." | Igual a sem rede |

A chave não é apagada automaticamente em caso nenhum.

**Timeouts:** 10 s para conectar; 30 s para requests JSON; uploads e downloads sem limite total, mas com 60 s
de inatividade.

## Rotas que o servidor precisa ter

Um servidor próprio precisa implementar estas rotas com os mesmos corpos e respostas. Os formatos abaixo foram
conferidos no servidor atual (`timerdev/src/server/scribalis/api.ts`). Todas, exceto `POST /vaults`, exigem
`Authorization: Bearer <chave>`. A base é o endereço configurado, por exemplo
`https://meu.servidor/api/scribalis/v1`. Datas são milissegundos desde 1970.

**Formato de erro:** `{ "error": { "code", "message", ...extras } }`. Os extras ficam **dentro** de `error`:
`missing` (em `missing_blobs`), `retryAfter` em segundos (em `rate_limited`), `quota` (em `quota_exceeded`).
Resposta de sucesso sem corpo é `204`.

**Cofre e chaves**

| Rota | Corpo | Resposta |
|---|---|---|
| `POST /vaults` (sem chave) | `{ label? }` | `201 { vault: { id }, key: { id, label, secret } }` |
| `GET /vault` | — | `{ id, keyId, createdAt, books, usage: { bytes, quota }, keepSnapshots }` |
| `DELETE /vault` | — | `204` |
| `GET /vault/keys` | — | `{ keys: [{ id, label, createdAt, lastUsedAt, current }] }` |
| `POST /vault/keys` | `{ label? }` | `201 { key: { id, label, secret } }` |
| `DELETE /vault/keys/:id` | — | `204`; `409 last_key` |

**Arquivos**

| Rota | Corpo | Resposta |
|---|---|---|
| `POST /blobs/check` | `{ hashes: [sha256] }` | `{ missing: [sha256] }` |
| `PUT /blobs/:sha256` | bytes crus | `201 { hash, stored: true }` ou `200 { hash, stored: false }`; `400 hash_mismatch`, `413 too_large`, `507 quota_exceeded` |
| `GET /blobs/:sha256` | — | bytes |

**Obras e backups**

| Rota | Corpo | Resposta |
|---|---|---|
| `GET /books` | — | `{ books: [{ id, title, author, updatedAt, snapshots, openComments, latest: snapshot \| null }] }` |
| `GET /books/:bookId` | — | `{ id, title, author, updatedAt, snapshots: [snapshot] }`, do mais novo ao mais antigo |
| `DELETE /books/:bookId` | — | `204` |
| `POST /books/:bookId/snapshots` | `{ files: [{ path, hash }], note? }` | `201 { snapshot, unchanged: false }` ou `200 { snapshot, unchanged: true }`; `409 missing_blobs` |
| `GET /books/:bookId/snapshots/:id` | — | `{ snapshot, files: [{ path, hash, size }] }` |

`snapshot` = `{ id, createdAt, note, fileCount, totalSize }`. `bookId` segue `^[A-Za-z0-9_-]{1,64}$` (os ids do
app já seguem). O servidor exige `metadata.json` no backup, com `id` igual ao `bookId`.

**Links**

| Rota | Corpo | Resposta |
|---|---|---|
| `POST /shares` | `{ bookId, kind, target?, snapshotId?, includeNotes?, allowComments?, expiresInDays? }` | `201 { share }` |
| `GET /shares` | — | `{ shares: [share] }` |
| `PATCH /shares/:id` | `snapshotId`, `includeNotes`, `allowComments`, `expiresInDays` (`null` tira a expiração) | `{ share }` |
| `DELETE /shares/:id` | — | `204` |

`share` = `{ id, url, bookId, kind, target, snapshotId, follow, includeNotes, allowComments, createdAt,
expiresAt, views }`. O app mostra e copia `url` exatamente como vem; o servidor decide onde a página pública
fica.

**Comentários**

| Rota | Corpo | Resposta |
|---|---|---|
| `GET /books/:bookId/comments?status=open` | — | `{ comments: [comment] }`, conversas inteiras, em ordem de `createdAt` |
| `PATCH /books/:bookId/comments/:id` | `{ resolved: true }` (só no comentário raiz) | `{ comment }` |

`comment` = `{ id, parentId, nodeId, anchor: { exact, prefix, suffix, start, end } | null, body, author: { name,
kind: "guest" | "owner" }, createdAt, updatedAt, resolved, shareId }`.

**Para os links funcionarem**, o servidor também precisa servir a página pública em `url` e as rotas públicas
que ela usa (`/public/shares/:token`, os blobs e os comentários do visitante). O app não chama essas rotas.

## Testes

Sem servidor falso. A camada HTTP (`client.rs` e as chamadas em `backup`, `restore`, `shares` e `comments`)
fica fina e é validada manualmente contra um servidor real (`bun start` local ou o kingtimer12.dev).

**`cargo test`, lógica pura:**

- `config`: aceita `https://`, `http://localhost` e `http://127.0.0.1`; recusa `http://` externo e lixo;
  remove a barra final.
- `manifest`: caminhos relativos com `/`, ignora `.`-arquivos e `*.tmp`, hash correto de um arquivo conhecido,
  falha sem `metadata.json`.
- `client` (só a conversão): JSON de erro vira `CloudError` com `code`, `retry_after` e `missing`; corpo que não é
  JSON vira a mensagem genérica com o status.
- `restore`: troca de pastas em `tempfile`: sucesso, falha no segundo rename desfaz o primeiro, staging com
  hash errado é apagada e a obra fica intacta.
- `comments`: agrupar por conversa, formatação (com e sem âncora, corte em 80 caracteres, recuo das
  respostas com várias linhas), escolha do destino (capítulo, nó, item apagado vai para "Comentários
  recebidos"), pular ids em `pendingResolve`.
- `status`: ler e gravar `cloud.json`, estado separado por servidor, `cloud` no resumo da obra.
- Varredura da biblioteca ignora pastas que começam com `.`.
- Base da meta diária não muda ao restaurar.

**Front (vitest), com o mock:**

- Ações da nuvem: ativar, backup, restaurar com confirmação dupla, criar link copia a URL.
- Selo aparece só com `cloud: true`.
- `NotesPanel` descarrega salvamentos pendentes antes de buscar comentários.

**Manual, contra servidor real:** ativar; backup de uma obra; alterar um capítulo e ver só 1–2 arquivos
enviados; restaurar; baixar em outra pasta raiz; gerar link, abrir no navegador, comentar e buscar os
comentários; revogar link; trocar o endereço.
