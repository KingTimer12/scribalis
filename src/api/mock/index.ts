import { book } from "./book";
import { chapter } from "./chapter";
import { library } from "./library";
import { prefs } from "./prefs";
import { update } from "./update";
import { workspace } from "./workspace";

type Handler = (args: never) => unknown;
const handlers: Record<string, Handler> = { ...library, ...book, ...chapter, ...prefs, ...update, ...workspace };

/** `?mockDelay=150` in the dev URL makes every call slow, to exercise IPC races (e2e). */
const delay = typeof location === "undefined" ? 0 : Number(new URLSearchParams(location.search).get("mockDelay")) || 0;

/** In-memory stand-in for the Rust commands, for `bun run dev` and tests. */
export async function mockInvoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const h = handlers[cmd];
  if (!h) throw `Comando desconhecido: ${cmd}`;
  if (delay) await new Promise((r) => setTimeout(r, delay));
  return structuredClone(h(args as never)) as T;
}
