# Usabilidade visível (tudo por clique, atalhos continuam) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** A writer who never learns a shortcut can reach every important action with the mouse. Shortcuts and the command palette stay exactly as they are; buttons show their shortcut in the tooltip so the shortcut is learned by use. Text size (the chapter text) and interface size become adjustable.

**Why:** the beta tester did not like an app driven by shortcuts and the command palette. Inventory of today (shortcut/palette-only, no visible control): focus mode (Ctrl .), chapter notes (Ctrl ;), previous/next chapter (Alt ↑/↓), move chapter (Alt Shift ↑/↓), status (Alt S), text size / text width / daily goal (palette cycle only), book settings (author, separator, frames, cover — palette only), insert image (Ctrl Shift I), insert separator (Ctrl Enter), clear paragraph formatting, library actions (new book, rename, cover, delete, restore samples), the palette and the shortcut help themselves (TopBar shows them as non-clickable `Hint` text).

**Design rules (UI/UX Pro Max, applied to this app):**
- Every important action has a visible control with an **icon + text label** (or a text label alone); icon-only buttons are allowed only in dense toolbars and must have `aria-label` + `title`.
- Tooltips (`title`) read `"Ação (Atalho)"`, e.g. `"Modo foco (Ctrl .)"`; context-menu items show the shortcut right-aligned, muted.
- Click targets ≥ 32×32 px on desktop (pad the hit area if the glyph is small); ≥ 8 px between targets; `cursor: pointer`; visible `:focus-visible` ring; hover/pressed states; transitions 150–200 ms, none under `prefers-reduced-motion`.
- Text contrast ≥ 4.5:1 in both themes (check the dark theme separately).
- Icons: one consistent inline-SVG set in `src/components/ui/icons.tsx` (24×24 viewBox, `stroke="currentColor"`, stroke-width 1.75, round caps/joins, no fill; Lucide-style shapes drawn by hand). No emoji as icons. No new npm dependency.
- Keep the current visual identity (colors, fonts, `.ui` mono chrome); these are additions, not a restyle.
- Nothing shortcut-related is removed. Palette commands stay; new actions also get palette entries where they fit.

## Global Constraints

- Comments in English; UI text in Portuguese. No god files: one component/module per subject. Data/processing in Rust (`CLAUDE.md`).
- Every task ends with a commit; messages have **no** `Co-Authored-By` or any attribution. Stage explicit paths.
- Commands: `cargo test --manifest-path src-tauri/Cargo.toml`; `bun run test`; `./node_modules/.bin/tsc --noEmit -p .`; `bun run build`.
- Prefs live in Rust (`model/prefs.rs`) with serde defaults; old prefs files must still load.
- Text size: `textPx` 14–32 (step 2), default derived from the old `font` (0→18, 1→20, 2→22) when `textPx` is absent. Interface size: `uiScale` 0|1|2 = 100% / 115% / 130%, default 0.
- UI strings verbatim where named below.

---

### Task 1: Icon set, text size and interface size (prefs + application)

**Files:** Create `src/components/ui/icons.tsx`; modify `src-tauri/src/model/prefs.rs`, `src/api/types.ts`, `src/lib/constants.ts`, `src/api/mock/db.ts`, `src/App.tsx`, `src/styles/global.css`, `src/store/actions/prefs.ts`, `src/store/commands/chapter.ts` (the "Tamanho da letra" command), `src/store/keys/global.ts`, `src/data/shortcuts.ts`; a new small module for zoom if needed (e.g. `src/lib/uiZoom.ts`); `src-tauri/capabilities/*.json` only if a webview-zoom permission is needed.

**Requirements:**
- `icons.tsx`: named components `IconSearch, IconKeyboard, IconSettings, IconSun, IconMoon, IconFocus, IconNotes, IconChevronLeft, IconChevronRight, IconChevronUp, IconChevronDown, IconArrowUp, IconArrowDown, IconMore (horizontal ⋯), IconPlus, IconImage, IconSeparator, IconEraser, IconMinus, IconClose, IconBook, IconTrash, IconPencil`, each `(props: { size?: number })`, default 16, `aria-hidden="true"`. Only the ones used by later tasks are needed; keep them tiny.
- Rust prefs: add `text_px: u8` (json `textPx`) and `ui_scale: u8` (json `uiScale`). `textPx` clamped to 14..=32 and rounded to an even number; when absent in the stored file, derive from `font` (0→18, 1→20, 2→22). `uiScale` clamped to 0..=2, default 0. `PrefsPatch` gets both. Keep `font` readable for old files (it may stay in the struct; the app stops using it). Tests: defaults, derivation from old `font`, clamps, camelCase serialization.
- Front: `Prefs.textPx: number`, `Prefs.uiScale: 0|1|2`; `DEFAULT_PREFS` and the mock get `textPx: 20, uiScale: 0`. Constants `TEXT_PX_MIN = 14`, `TEXT_PX_MAX = 32`, `TEXT_PX_STEP = 2`, `UI_SCALES = [1, 1.15, 1.3]`, `UI_SCALE_LABEL = ["Normal", "Grande", "Maior"]`.
- Application: the chapter/area body text (`.ed-body`) uses `textPx`; the chapter title keeps its proportion (scale it by `textPx / 20`). Replace the `f0/f1/f2` classes with a CSS variable set on `.app`. Interface size scales the **whole** interface uniformly: use the Tauri webview zoom (`getCurrentWebview().setZoom`) when running in Tauri, and CSS `zoom` on the root in the browser (`bun run dev`). The chapter text must end up at `textPx` on screen regardless of the interface size (divide the text variable by the zoom factor). Verify pointer-based drag (tree drag, card drag) still hits the right targets under zoom; if CSS zoom breaks coordinates in the browser only, note it — Tauri is what ships.
- Actions in `store/actions/prefs.ts` (or a new `store/actions/textSize.ts` if prefs.ts would mix subjects): `textBigger()`, `textSmaller()`, `textReset()` (→ 20), `setUiScale(n)`.
- Shortcuts (added, nothing removed): `Ctrl =` / `Ctrl +` bigger text, `Ctrl -` smaller, `Ctrl 0` reset. Listed in `src/data/shortcuts.ts` (help panel). Palette: replace the cycling "Tamanho da letra: X" command with "Aumentar texto" (Ctrl +), "Diminuir texto" (Ctrl −), and add "Tamanho da interface: X" (cycles). Keep "Largura do texto".
- Tests: Rust prefs tests; front unit tests for the actions (clamp at 14/32, reset) and for the key handling.

### Task 2: Ajustes panel

**Files:** Create `src/components/panels/SettingsPanel.tsx` (+ small subcomponents in `src/components/settings/` if it grows); modify the panel union/state (`state.panel`) and `openPanel`, `App.tsx` panel mounting, `src/styles/` (a `settings.css` imported from `global.css`), palette (`Ajustes…` command, common), and add `Ctrl ,` to open it (listed in shortcuts help).

**Requirements:**
- Right drawer like `NotesPanel` (same scrim/close behaviour, Esc closes, focus moves into the panel on open and back on close). Title "Ajustes". Close button "Fechar" (icon + `aria-label`).
- Section "Aparência":
  - "Tema": segmented control "Claro" / "Escuro".
  - "Tamanho do texto": `A−` button, the value (e.g. "20 px"), `A+` button, "Padrão" link-button (reset); a one-line preview in the chapter font ("Era uma vez…") at the chosen size.
  - "Tamanho da interface": segmented "Normal" / "Grande" / "Maior".
  - "Largura do texto": segmented "Estreita" / "Média" / "Larga".
- Section "Escrita": "Meta diária": segmented 1000 / 2000 / 3000 / 5000 palavras (the existing goal values) — reuse the existing goal pref.
- Segmented controls are one reusable component (`src/components/ui/Segmented.tsx`), `role="radiogroup"` with `role="radio"` buttons and arrow-key support.
- The panel works in the library and in a book. Changes apply live and save through `updatePrefs`.
- `GoalProgress` in the bottom bar becomes a button that opens Ajustes (tooltip "Meta diária — mudar em Ajustes").
- Tests: DOM test that the panel renders the sections and that clicking A+ / a segment updates `state.prefs`.

### Task 3: Top bar and help made clickable

**Files:** `src/components/chrome/TopBar.tsx`, a new `src/components/chrome/TopActions.tsx` (the right-side buttons), `ThemeToggle.tsx` (keep), `src/styles/` as needed, `src/components/panels/HelpPanel.tsx`.

**Requirements:**
- Replace the two `Hint` texts with real buttons, each icon + label: "Comandos" (opens the palette; tooltip "Comandos (Ctrl K)"), "Atalhos" (opens the help panel; tooltip "Atalhos (Ctrl /)"), "Ajustes" (opens Ajustes; tooltip "Ajustes (Ctrl ,)"). Theme toggle stays. The buttons must not be window-drag regions (clicks must work in Tauri) and must fit the 64 px bar; on narrow windows (< 900 px) labels collapse to icons (keep `aria-label`).
- HelpPanel: each shortcut row whose action can run from the panel becomes clickable (runs the action and closes the panel) — at least the global ones; rows that only make sense in a focused widget stay text. Add a line at the top: "Tudo aqui também tem botão ou menu; os atalhos são opcionais."
- Tests: DOM test that the three buttons open the right panels.

### Task 4: Chapter bar, focus-mode exit and format bar additions

**Files:** Create `src/components/editor/ChapterBar.tsx` (the row that today holds `ChapterLabel`); modify `Editor.tsx`, `ChapterLabel.tsx` (reuse inside), `FormatBar.tsx`, the area text view (`src/components/workspace/TextView.tsx` or equivalent) for notes/focus, `src/styles/`.

**Requirements:**
- Chapter bar (above the format bar, same column width), left to right:
  - "‹ Anterior" / "Próximo ›" (previous/next chapter; disabled with reduced opacity + `disabled` when there is none; tooltips with Alt ↑ / Alt ↓).
  - Status: a button showing the current status dot + label (e.g. "● Rascunho"); click opens a menu (the existing `ContextMenu`) with the three statuses to pick directly (the current one checked) plus "Mover para cima" / "Mover para baixo" (Alt Shift ↑/↓) — or put the move items in a separate "⋯" menu; your call, keep it discoverable.
  - Right side: "Notas" (icon + label, pressed state when the notes drawer is open, tooltip "Notas (Ctrl ;)") and "Foco" (icon + label, tooltip "Modo foco (Ctrl .)").
- Focus mode: a small "Sair do foco" button (icon + label) fixed at the top-right of the writing area, shown on mouse move / keyboard focus and faded after ~2 s of no movement (always visible under `prefers-reduced-motion`, just static); Esc keeps working.
- Format bar: add "Imagem" (insert image, Ctrl Shift I), "Separador" (Ctrl Enter), and "Limpar" (clear paragraph formatting) — icon buttons with `aria-label` + tooltip; keep the selection like the existing buttons.
- Area texts (TextView): offer "Notas" and "Foco" the same way where those actions apply.
- Everything hidden in focus mode except the exit button (as today the chrome fades).
- Tests: DOM tests for next/previous disabled state, status menu sets the status, Foco toggles focus mode and the exit button leaves it.

### Task 5: Library and tree actions by click; menus show shortcuts

**Files:** `src/components/ui/ContextMenu.tsx` (optional `hint` per item), `src/components/library/{LibraryHeader,BookTile,Library}.tsx`, a new `src/components/library/bookMenu.ts`, `src/components/workspace/TreeRow.tsx`, `src/components/workspace/treeMenu.ts`, `src/components/board/boardMenu.ts` (hints only), `src/styles/`.

**Requirements:**
- `MenuItem` gets `hint?: string` rendered right-aligned and muted; fill hints wherever a shortcut exists (tree: F2, Del, N, Shift N; board: Del; book: R, C, Shift C, Del).
- Library header: a primary button "+ Nova obra" (same action as N) next to "Importar do Scrivener…". An overflow "⋯" button with "Restaurar obras de exemplo".
- Each book tile: a "⋯" button (visible on hover and on keyboard focus/selection, always present in the DOM and reachable by Tab) and right-click, both opening the same menu: "Abrir", "Renomear" (R), "Trocar capa…" (C), "Remover capa" (Shift C, only when there is one), "Excluir" (Del, danger, with the existing confirmation).
- Tree rows: a "⋯" button at the row's right end (visible on hover/selection, reachable) opening the existing row menu. Chapter menus get "Mover para cima" / "Mover para baixo" (Alt Shift ↑/↓).
- The empty library state (if any) offers "+ Nova obra" and "Importar do Scrivener…" as buttons.
- Tests: menu builders return the items with hints; DOM test that the tile "⋯" opens the menu.

### Task 6: Obra settings in Ajustes

**Files:** `src/components/panels/SettingsPanel.tsx` (or `src/components/settings/BookSettings.tsx`), reuse the actions behind `bookSettingsCommands` (`src/store/commands/chapter.ts`) — move shared logic into `store/actions/` if the commands hold it inline.

**Requirements:**
- Section "Obra" shown only with a book open: "Autor" (text input, saved on blur/Enter), "Capa" (thumbnail + "Escolher…" / "Remover"), "Separador de cena" (current text or image + "Mudar texto…" / "Escolher imagem…" / "Remover imagem"), "Moldura superior" and "Moldura inferior" (thumbnail or "Nenhuma" + "Escolher…" / "Remover"). Same behaviour and Rust calls as the palette commands, which stay.
- Tests: DOM test that the section appears only with a book and that editing the author calls the same action as the palette.
