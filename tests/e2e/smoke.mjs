// Smoke test against `bun run dev` (mock backend). Needs a Chromium-based browser:
// set BROWSER_PATH, e.g. "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe".
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const url = process.env.APP_URL ?? "http://localhost:1420/";
const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const label = () => page.locator(".col .cap").innerText();
const body = () => page.locator("#ch-body").innerText();

await page.goto(url);
await page.waitForSelector(".tile");

// new book → title → body
await page.keyboard.press("n");
await page.keyboard.type("Meu Livro");
await page.keyboard.press("Enter");
await page.waitForSelector("#ch-body");
await page.keyboard.type("Primeiro");
await page.keyboard.press("Enter");
await page.keyboard.type("Linha um.");

// Enter ×3 with text after the cursor
await page.keyboard.press("Enter");
await page.keyboard.type("vai junto");
// Let ProseMirror finish patching the DOM for the last typed keystroke before
// sending a native caret-movement key: Home moves the browser's own selection,
// which ProseMirror only re-syncs asynchronously (via a "selectionchange"
// listener); firing it too close to the last keystroke can race that patch
// and get silently swallowed, leaving the caret at the end of the line.
await page.waitForTimeout(100);
await page.keyboard.press("Home");
await page.waitForTimeout(100);
await page.keyboard.press("Enter");
await page.keyboard.press("Enter");
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.querySelector(".col .cap")?.textContent?.includes("02"));
assert.match(await label(), /02/);
assert.equal((await body()).trim(), "vai junto");

// Ctrl Enter inserts a visible separator (focus is on the new chapter's title: Enter goes to the text)
await page.keyboard.press("Enter");
await page.keyboard.press("Control+End");
await page.keyboard.press("Control+Enter");
assert.equal(await page.locator("#ch-body .sep").count(), 1);
assert.equal((await page.locator("#ch-body .sep").innerText()).trim(), "* * *");

// typing then switching before the debounce keeps the text
await page.keyboard.type("depois do separador");
await page.keyboard.press("Alt+ArrowUp");
await page.waitForFunction(() => document.querySelector(".col .cap")?.textContent?.includes("01"));
assert.equal((await body()).trim(), "Linha um.");
await page.keyboard.press("Alt+ArrowDown");
await page.waitForFunction(() => document.querySelector("#ch-body")?.textContent?.includes("depois do separador"));

// separator text via palette prompt updates live
await page.keyboard.press("Control+k");
await page.keyboard.type("separador: texto");
await page.keyboard.press("Enter");
await page.keyboard.press("Control+a");
await page.keyboard.type("~ ~ ~");
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.querySelector("#ch-body .sep")?.textContent === "~ ~ ~");

// chapter search runs through the api
await page.keyboard.press("Control+k");
await page.keyboard.type("linha um");
await page.waitForSelector(".pal-item .pal-kind:text('01')");
await page.keyboard.press("Escape");

// back to library shows the new book first with its word count
await page.keyboard.press("Control+o");
await page.waitForSelector(".tile.sel");
assert.equal(await page.locator(".tile.sel .tile-title").innerText(), "Meu Livro");
assert.match(await page.locator(".tile.sel .ui").first().innerText(), /2 cap\./);

assert.deepEqual(errors, []);
await browser.close();
console.log("e2e ok");
