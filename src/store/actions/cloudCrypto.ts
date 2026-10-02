import * as api from "../../api/cloud";
import { askConfirm } from "../confirm";
import { flushAll } from "../saving";
import { setState, state } from "../state";
import { flash, flashError } from "./ui";
import { loadBookCloud } from "./cloud";

/**
 * Switches the open book between encrypted (the default: compressed and sealed with the vault key) and
 * open (readable by the server, which public links need). Both directions ask first.
 */
export async function setBookEncrypted(encrypted: boolean): Promise<boolean> {
  const id = state.book?.id;
  if (!id) return false;
  const ok = await askConfirm(
    encrypted
      ? {
          title: "Criptografar esta obra?",
          message: "Os próximos backups saem comprimidos e trancados com a chave do cofre. Links públicos desta obra deixam de mostrar o texto novo.",
          confirmLabel: "Criptografar",
        }
      : {
          title: "Deixar esta obra aberta?",
          message: "Os backups vão sem criptografia nem compressão, para o servidor montar os links públicos. Quem administra o servidor consegue ler a obra.",
          confirmLabel: "Deixar aberta",
          danger: true,
        },
  );
  if (!ok) return false;
  try {
    await flushAll();
    setState("cloudBook", await api.cloudSetEncrypted(id, encrypted));
    flash(encrypted ? "Obra criptografada na nuvem" : "Obra aberta na nuvem");
    return true;
  } catch (e) {
    flashError(e);
    void loadBookCloud(id);
    return false;
  }
}

/** "Trazer chave": takes the encryption key from a code made on another computer. */
export async function importCryptKey(code: string): Promise<boolean> {
  if (!code.trim()) return false;
  if (state.cloud?.hasCryptKey) {
    const ok = await askConfirm({
      title: "Trocar a chave de criptografia?",
      message: "Backups que este computador já criptografou com a chave atual só abrem com ela. Use a chave do computador que fez a maioria dos backups.",
      confirmLabel: "Trocar",
      danger: true,
    });
    if (!ok) return false;
  }
  try {
    setState("cloud", await api.cloudImportCryptKey(code));
    flash("Chave de criptografia guardada");
    return true;
  } catch (e) {
    flashError(e);
    return false;
  }
}
