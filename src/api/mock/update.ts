import type { UpdateInfo } from "../types";

/** The browser build never updates itself. */
export const update = {
  update_check: (): UpdateInfo | null => null,
  update_install: (): void => {
    throw "Atualização só funciona no app desktop";
  },
};
