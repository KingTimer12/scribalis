import { promptFor } from "../commands/prompt";
import { setSeparatorText } from "./book";
import { clearBookImage, pickBookImage } from "./images";
import { refreshLibrary } from "./library";
import { state } from "../state";

/**
 * Shared behind the palette's "Separador: texto" command and the book drawer's "Mudar texto…"
 * button: same prompt flow, same initial value.
 */
export function changeSeparatorText() {
  const sep = state.book?.separator;
  promptFor("Separador", sep?.type === "text" ? sep.text : "* * *", setSeparatorText);
}

/**
 * Cover of the open book. Same Rust call as `pickBookImage`/`clearBookImage` for any other slot,
 * but also refreshes the library listing, since the cover shows there too.
 */
export async function changeBookCover() {
  await pickBookImage("cover");
  await refreshLibrary();
}

export async function removeBookCover() {
  await clearBookImage("cover");
  await refreshLibrary();
}
