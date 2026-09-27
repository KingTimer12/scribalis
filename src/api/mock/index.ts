import { book } from "./book";
import { chapter } from "./chapter";
import { library } from "./library";
import { prefs } from "./prefs";

type Handler = (args: never) => unknown;
const handlers: Record<string, Handler> = { ...library, ...book, ...chapter, ...prefs };

/** In-memory stand-in for the Rust commands, for `bun run dev` and tests. */
export async function mockInvoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const h = handlers[cmd];
  if (!h) throw `Comando desconhecido: ${cmd}`;
  return structuredClone(h(args as never)) as T;
}
