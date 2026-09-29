import * as api from "../../api/cloud";
import type { CloudStatus, ShareInput } from "../../api/types";
import { areaTree } from "../../api/workspace";
import { askConfirm } from "../confirm";
import { flushAll } from "../saving";
import { setState, state } from "../state";
import { flash, flashError } from "./ui";

export async function loadCloud() {
  try {
    setState("cloud", await api.cloudOverview());
  } catch (e) {
    flashError(e);
  }
}

export async function setApiUrl(url: string) {
  try {
    setState("cloud", await api.cloudSetApiUrl(url));
    flash("Endereço da nuvem salvo");
  } catch (e) {
    flashError(e);
  }
}

export async function activateCloud(label: string) {
  try {
    setState("cloud", await api.cloudActivate(label || "Meu computador"));
    flash("Nuvem ativada");
  } catch (e) {
    flashError(e);
  }
}

export async function connectCloud(secret: string) {
  try {
    setState("cloud", await api.cloudConnect(secret));
    flash("Conectado ao cofre");
    await syncCloudBadges();
  } catch (e) {
    flashError(e);
  }
}

export async function deleteVault() {
  try {
    setState("cloud", await api.cloudDeleteVault());
    setState("library", (list) => list.map((b) => ({ ...b, cloud: false })));
    flash("Cofre apagado");
  } catch (e) {
    flashError(e);
  }
}

/** Refreshes the "Nuvem" badges from the server; silent offline. */
export async function syncCloudBadges() {
  if (!state.cloud?.connected) return;
  try {
    const remote = await api.cloudRemoteBooks();
    const inVault = new Set(remote.filter((b) => b.latestAt).map((b) => b.id));
    setState("library", (list) => list.map((b) => ({ ...b, cloud: inVault.has(b.id) })));
  } catch {
    // offline: the badges keep the local cache
  }
}

export async function loadBookCloud(bookId: string) {
  try {
    const view = await api.cloudBookState(bookId);
    if (state.book?.id === bookId) setState("cloudBook", view);
    return view;
  } catch {
    return null;
  }
}

export async function setBookBackup(enabled: boolean) {
  const id = state.book?.id;
  if (!id) return;
  try {
    await flushAll();
    setState("cloudBook", await api.cloudSetEnabled(id, enabled));
    flash(enabled ? "Backup ligado" : "Backup desligado");
  } catch (e) {
    flashError(e);
    void loadBookCloud(id);
  }
}

export async function backupNow() {
  const id = state.book?.id;
  if (!id) return;
  try {
    await flushAll();
    setState("cloudBook", await api.cloudBackup(id, true));
    flash("Backup feito");
  } catch (e) {
    flashError(e);
  }
}

/** Automatic backup when leaving a book; errors show up in the bottom bar status, not as toasts. */
export function backupAuto(bookId: string) {
  void api.cloudBackup(bookId, false).catch(() => {});
}

export async function backupOnClose() {
  await api.cloudBackupOnClose().catch(() => {});
}

export async function forgetBook() {
  const id = state.book?.id;
  if (!id) return;
  try {
    setState("cloudBook", await api.cloudForgetBook(id));
    setState("library", (list) => list.map((b) => (b.id === id ? { ...b, cloud: false } : b)));
    flash("Obra apagada da nuvem");
  } catch (e) {
    flashError(e);
  }
}

/** Replaces the open book with a backup, then reopens it. */
export async function restoreSnapshot(snapshotId: string) {
  const id = state.book?.id;
  if (!id) return;
  try {
    await flushAll();
    flash("Restaurando…");
    await api.cloudRestore(id, snapshotId);
    const { openBook } = await import("./library");
    await openBook(id);
    flash("Backup restaurado");
  } catch (e) {
    flashError(e);
  }
}

export async function downloadBook(bookId: string) {
  try {
    const summary = await api.cloudDownload(bookId);
    setState("library", (list) => [summary, ...list.filter((b) => b.id !== bookId)]);
    flash("Obra baixada");
  } catch (e) {
    flashError(e);
  }
}

export async function createShare(input: ShareInput) {
  try {
    await flushAll();
    const share = await api.cloudShareCreate(input);
    await navigator.clipboard.writeText(share.url);
    setState("shareDraft", null);
    void loadBookCloud(input.bookId);
    flash("Link copiado");
    return share;
  } catch (e) {
    flashError(e);
    return null;
  }
}

/** Pulls visitors' comments into the notes. `quiet`: no toast when there is nothing new or no network. */
export async function fetchComments(quiet: boolean) {
  const id = state.book?.id;
  if (!id) return;
  try {
    await flushAll();
    const added = await api.cloudFetchComments(id, -new Date().getTimezoneOffset());
    if (added > 0) {
      await reloadNotes(id);
      flash(added === 1 ? "1 comentário adicionado às notas" : `${added} comentários adicionados às notas`);
    } else if (!quiet) {
      flash("Nenhum comentário novo");
    }
    void loadBookCloud(id);
  } catch (e) {
    if (!quiet) flashError(e);
  }
}

/** Copies fresh notes (chapters and other nodes alike) into the open book's tree. */
async function reloadNotes(bookId: string) {
  await flushAll();
  const items = await areaTree(bookId);
  if (state.book?.id === bookId) setState("area", items);
}

export function applyCloudStatus(s: CloudStatus) {
  setState("cloudStatus", s);
  if (s.lastBackupAt) setState("library", (list) => list.map((b) => (b.id === s.bookId ? { ...b, cloud: true } : b)));
  if (state.book?.id === s.bookId && state.cloudBook) setState("cloudBook", "lastBackupAt", s.lastBackupAt);
}

/** "Apagar cofre" behind a confirmation dialog. */
export async function confirmDeleteVault() {
  const ok = await askConfirm({
    title: "Apagar o cofre?",
    message: "Todas as obras e links do servidor serão apagados. Não dá para desfazer.",
    confirmLabel: "Apagar",
    danger: true,
  });
  if (ok) await deleteVault();
}

/** "Apagar da nuvem" behind a confirmation dialog; the local book stays. */
export async function confirmForgetBook() {
  const ok = await askConfirm({
    title: "Apagar a obra da nuvem?",
    message: "As cópias e os links dela no servidor serão apagados. A obra continua neste computador.",
    confirmLabel: "Apagar",
    danger: true,
  });
  if (ok) await forgetBook();
}

/** "Restaurar" behind a confirmation dialog. */
export async function confirmRestoreSnapshot(snapshotId: string) {
  const ok = await askConfirm({
    title: "Restaurar esta cópia?",
    message: "A obra atual será substituída por esta cópia.",
    confirmLabel: "Restaurar",
    danger: true,
  });
  if (ok) await restoreSnapshot(snapshotId);
}
