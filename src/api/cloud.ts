import { call } from "./invoke";
import type {
  BookCloudView, BookMeta, BookSummary, CloseReport, CloudOverview, KeyInfo, NewKey, RemoteBookView, Share, ShareChange,
  ShareInput, Snapshot, VaultInfo,
} from "./types";

export const cloudOverview = () => call<CloudOverview>("cloud_overview");
export const cloudSetApiUrl = (url: string) => call<CloudOverview>("cloud_set_api_url", { url });
export const cloudActivate = (label: string) => call<CloudOverview>("cloud_activate", { label });
export const cloudConnect = (secret: string) => call<CloudOverview>("cloud_connect", { secret });
export const cloudVaultInfo = () => call<VaultInfo>("cloud_vault_info");
export const cloudKeys = () => call<KeyInfo[]>("cloud_keys");
export const cloudImportCryptKey = (code: string) => call<CloudOverview>("cloud_import_crypt_key", { code });
export const cloudAddKey = (label: string) => call<NewKey>("cloud_add_key", { label });
export const cloudRevokeKey = (id: string) => call<KeyInfo[]>("cloud_revoke_key", { id });
export const cloudDeleteVault = () => call<CloudOverview>("cloud_delete_vault");
export const cloudRemoteBooks = () => call<RemoteBookView[]>("cloud_remote_books");

export const cloudBookState = (bookId: string) => call<BookCloudView>("cloud_book_state", { bookId });
export const cloudSetEnabled = (bookId: string, enabled: boolean) => call<BookCloudView>("cloud_set_enabled", { bookId, enabled });
export const cloudSetEncrypted = (bookId: string, encrypted: boolean) => call<BookCloudView>("cloud_set_encrypted", { bookId, encrypted });
export const cloudBackup = (bookId: string, manual: boolean) => call<BookCloudView>("cloud_backup", { bookId, manual });
export const cloudSnapshots = (bookId: string) => call<Snapshot[]>("cloud_snapshots", { bookId });
export const cloudForgetBook = (bookId: string) => call<BookCloudView>("cloud_forget_book", { bookId });
/** Backs up every changed book while the window closes; `manual` ("Tentar de novo") skips the pause. */
export const cloudBackupOnClose = (manual: boolean) => call<CloseReport>("cloud_backup_on_close", { manual });
export const cloudRestore = (bookId: string, snapshotId: string) => call<BookMeta>("cloud_restore", { bookId, snapshotId });
export const cloudDownload = (bookId: string) => call<BookSummary>("cloud_download", { bookId });

export const cloudShares = (bookId: string) => call<Share[]>("cloud_shares", { bookId });
export const cloudShareCreate = (input: ShareInput) => call<Share>("cloud_share_create", { input });
export const cloudShareChange = (bookId: string, id: string, change: ShareChange) => call<Share>("cloud_share_change", { bookId, id, change });
export const cloudShareRevoke = (id: string) => call<void>("cloud_share_revoke", { id });
/** Offset: local minus UTC in minutes. */
export const cloudFetchComments = (bookId: string, utcOffsetMin: number) => call<number>("cloud_fetch_comments", { bookId, utcOffsetMin });
