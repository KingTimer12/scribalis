import * as api from "../../api/update";
import { flushAll } from "../saving";
import { setState, state } from "../state";
import { flashError } from "./ui";

/** Startup check; silent on failure (offline, dev build, no release yet). */
export async function checkForUpdate() {
  try {
    setState("update", await api.checkUpdate());
  } catch {
    // Nothing to offer: the app keeps working on the current version.
  }
}

/** Saves everything, then lets Rust download, install and restart. */
export async function installUpdate() {
  if (!state.update || state.updating) return;
  setState("updating", true);
  try {
    await flushAll();
    await api.installUpdate();
  } catch (e) {
    setState("updating", false);
    flashError(e);
  }
}
