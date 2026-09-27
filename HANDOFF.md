# Editor de Webnovel — especificação para implementação

Protótipo de referência: `prototipo/Main.dc.html` (biblioteca + editor) e `prototipo/Atalhos.dc.html` (mapa de atalhos).
Os arquivos `.dc.html` são componentes de um canvas de design: o HTML dentro de `<x-dc>` é a marcação (com `{{holes}}`, `<sc-if>`, `<sc-for>`), e a classe `Component` no `<script type="text/x-dc">` contém TODA a lógica (estado, atalhos, handlers). Use-os como fonte da verdade para layout, estilos (CSS no `<helmet>`) e comportamento — não como código para copiar literalmente.

## Princípios
- Interface limpa e minimalista; nenhum botão visível no editor. Tudo pelo teclado.
- Tipografia: Literata (texto) + IBM Plex Mono (detalhes de interface). Tema claro (papel) e escuro.
- Cores (variáveis CSS em `.app` / `.app.dark` no protótipo).

## Telas
1. **Biblioteca ("Suas obras")** — grade de capas 2:3, 6 por linha, ordenadas pela última edição.
   - Capa sem imagem: primeira letra do título, grande, sobre uma cor derivada do id da obra (6 tons, com variante escura).
   - Capa com imagem: recortada para 400×600 (cover) e salva como JPEG.
   - Abaixo da capa: título, `N cap. · N pal. · N prontos`, `editada há …`.
2. **Editor** — coluna central: rótulo "Capítulo NN · status", título do capítulo, texto. Barra superior: `Obras / nome da obra`; barra inferior: palavras do capítulo, total da obra, meta diária com barra de progresso.
3. **Painéis**: paleta de comandos, índice de capítulos (gaveta à esquerda), notas do capítulo (à direita), ajuda de atalhos.

## Atalhos
| Onde | Tecla | Ação |
|---|---|---|
| Texto | Enter ×3 seguidos | Novo capítulo; o texto após o cursor vai para ele. Após o 2º Enter aparece um aviso. |
| Texto | Shift+Enter | Quebra de linha que não conta para a sequência |
| Título | Enter / ↓ | Vai para o texto |
| Texto | ↑ na posição 0 | Volta ao título |
| Global | Ctrl K | Paleta de comandos (busca comandos, capítulos e outras obras) |
| Editor | Ctrl O | Voltar à biblioteca |
| Editor | Ctrl E | Índice de capítulos (↑↓ navega, Enter abre, Alt ↑↓ reordena) |
| Editor | Ctrl ; | Notas do capítulo |
| Editor | Alt ↑ / ↓ | Capítulo anterior / próximo |
| Editor | Alt Shift ↑ / ↓ | Mover capítulo |
| Editor | Alt S | Status: rascunho → revisão → pronto |
| Editor | Ctrl . | Modo foco (esconde as barras) |
| Global | Ctrl J | Tema claro/escuro |
| Global | Ctrl / | Ajuda |
| Global | Esc | Fecha painéis e volta ao foco principal |
| Biblioteca | ← → ↑ ↓ / Enter | Escolher / abrir obra |
| Biblioteca | N | Nova obra (nome inline; Enter cria e abre no título do cap. 01) |
| Biblioteca | R | Renomear |
| Biblioteca | C / Shift C | Escolher imagem de capa / remover (volta a letra) |
| Biblioteca | Del ×2 | Excluir (confirmação) |
| Biblioteca | / | Buscar obra |

Paleta (extras): copiar capítulo, meta diária (1k/2k/3k/5k), largura do texto (3), tamanho da letra (3), excluir capítulo (confirmação), restaurar exemplos.

## Modelo de dados
```ts
type Status = 'rascunho' | 'revisao' | 'pronto';
interface Chapter { id: string; title: string; body: string; notes: string; status: Status }
interface Book { id: string; title: string; cover: string | null; cur: number; updatedAt: number; chapters: Chapter[] }
interface Prefs { theme: 'light' | 'dark'; goal: number; width: 0 | 1 | 2; font: 0 | 1 | 2 }
```
Meta diária = palavras totais de todas as obras agora − total no início da sessão/dia.

## O que falta decidir na implementação real
- Persistência (o protótipo usa localStorage; num app real: arquivos locais/SQLite ou backend).
- Plataforma (web, desktop com Tauri, etc.) e stack.
- Exportação/publicação de capítulos, volumes, fichas de personagens.
