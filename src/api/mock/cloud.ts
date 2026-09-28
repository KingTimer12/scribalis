import type { BookCloudView, CloudOverview, Share, ShareInput, Snapshot } from "../types";
import { cloudDb, findBook, mockId, toBookMeta, toSummary } from "./db";

const DEFAULT_URL = "https://kingtimer12.dev/api/scribalis/v1";

const overview = (): CloudOverview => ({ apiUrl: cloudDb.apiUrl, defaultApiUrl: DEFAULT_URL, connected: cloudDb.connected });

const bookState = (bookId: string): BookCloudView => {
  const b = cloudDb.books[bookId];
  return { enabled: !!b?.enabled, lastBackupAt: b?.lastBackupAt ?? null, paused: null };
};

function snapshot(bookId: string) {
  const b = (cloudDb.books[bookId] ??= { enabled: true, lastBackupAt: null, snapshots: [] });
  const s: Snapshot = { id: mockId(), createdAt: Date.now(), note: null, fileCount: 3, totalSize: 1000 };
  b.snapshots = [s, ...b.snapshots].slice(0, 3);
  b.lastBackupAt = s.createdAt;
}

function needVault() {
  if (!cloudDb.connected) throw "A nuvem ainda não foi ativada neste computador.";
}

/** Browser stand-in: a vault that lives in memory. Restore keeps the book as is. */
export const cloud = {
  cloud_overview: overview,
  cloud_set_api_url: ({ url }: { url: string }) => {
    if (!/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)/.test(url.trim())) throw "Endereço inválido. Use https://…";
    cloudDb.apiUrl = url.trim().replace(/\/+$/, "");
    return overview();
  },
  cloud_activate: () => {
    cloudDb.connected = true;
    return overview();
  },
  cloud_connect: ({ secret }: { secret: string }) => {
    if (!secret.trim().startsWith("scb_")) throw "Código inválido. Ele começa com scb_.";
    cloudDb.connected = true;
    return overview();
  },
  cloud_vault_info: () => {
    needVault();
    return { id: "vlt_mock", keyId: "key_mock", createdAt: Date.now(), books: Object.keys(cloudDb.books).length, usage: { bytes: 1_200_000, quota: 1_073_741_824 } };
  },
  cloud_keys: () => [{ id: "key_mock", label: "Este computador", createdAt: Date.now(), lastUsedAt: Date.now(), current: true }],
  cloud_add_key: ({ label }: { label: string }) => ({ id: mockId(), label, secret: "scb_mockmockmock" }),
  cloud_revoke_key: () => cloud.cloud_keys(),
  cloud_delete_vault: () => {
    cloudDb.connected = false;
    cloudDb.books = {};
    cloudDb.shares = [];
    return overview();
  },
  cloud_remote_books: () => {
    needVault();
    return Object.entries(cloudDb.books)
      .filter(([, b]) => b.lastBackupAt)
      .map(([id, b]) => ({ id, title: findBook(id).title, snapshots: b.snapshots.length, latestAt: b.lastBackupAt, openComments: 0, local: true }));
  },
  cloud_book_state: ({ bookId }: { bookId: string }) => bookState(bookId),
  cloud_set_enabled: ({ bookId, enabled }: { bookId: string; enabled: boolean }) => {
    needVault();
    (cloudDb.books[bookId] ??= { enabled, lastBackupAt: null, snapshots: [] }).enabled = enabled;
    if (enabled) snapshot(bookId);
    return bookState(bookId);
  },
  cloud_backup: ({ bookId, manual }: { bookId: string; manual: boolean }) => {
    if (!cloudDb.books[bookId]?.enabled) {
      if (manual) throw "Ative o backup desta obra primeiro.";
      return bookState(bookId);
    }
    snapshot(bookId);
    return bookState(bookId);
  },
  cloud_snapshots: ({ bookId }: { bookId: string }) => cloudDb.books[bookId]?.snapshots ?? [],
  cloud_forget_book: ({ bookId }: { bookId: string }) => {
    delete cloudDb.books[bookId];
    return bookState(bookId);
  },
  cloud_backup_on_close: () => undefined,
  cloud_restore: ({ bookId }: { bookId: string }) => toBookMeta(findBook(bookId)),
  cloud_download: ({ bookId }: { bookId: string }) => toSummary(findBook(bookId)),
  cloud_shares: ({ bookId }: { bookId: string }) => cloudDb.shares.filter((s) => s.bookId === bookId),
  cloud_share_create: ({ input }: { input: ShareInput }) => {
    needVault();
    (cloudDb.books[input.bookId] ??= { enabled: true, lastBackupAt: null, snapshots: [] }).enabled = true;
    snapshot(input.bookId);
    const share: Share = {
      id: mockId(), url: "https://kingtimer12.dev/scribalis/s/" + mockId(), bookId: input.bookId, kind: input.kind,
      target: input.target, snapshotId: input.freeze ? cloudDb.books[input.bookId].snapshots[0].id : null,
      follow: !input.freeze, includeNotes: input.includeNotes, allowComments: input.allowComments,
      createdAt: Date.now(), expiresAt: input.expiresInDays ? Date.now() + input.expiresInDays * 86_400_000 : null, views: 0,
    };
    cloudDb.shares.unshift(share);
    return share;
  },
  cloud_share_change: ({ id, change }: { id: string; change: Partial<Share> & { clearExpiry?: boolean; expiresInDays?: number } }) => {
    const s = cloudDb.shares.find((x) => x.id === id);
    if (!s) throw "Link não encontrado";
    if (change.includeNotes !== undefined) s.includeNotes = change.includeNotes;
    if (change.allowComments !== undefined) s.allowComments = change.allowComments;
    if (change.clearExpiry) s.expiresAt = null;
    if (change.expiresInDays) s.expiresAt = Date.now() + change.expiresInDays * 86_400_000;
    return s;
  },
  cloud_share_revoke: ({ id }: { id: string }) => {
    cloudDb.shares = cloudDb.shares.filter((s) => s.id !== id);
  },
  cloud_fetch_comments: ({ bookId }: { bookId: string }) => {
    const waiting = cloudDb.comments[bookId] ?? [];
    const book = findBook(bookId);
    for (const [nodeId, text] of waiting) {
      const c = book.chapters.find((x) => x.id === nodeId);
      if (c) c.notes = (c.notes.trim() ? c.notes.trim() + "\n\n" : "") + "— Visitante · " + text;
    }
    cloudDb.comments[bookId] = [];
    return waiting.length;
  },
};
