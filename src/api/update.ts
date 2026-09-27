import { call } from "./invoke";
import type { UpdateInfo } from "./types";

export const checkUpdate = () => call<UpdateInfo | null>("update_check");
export const installUpdate = () => call<void>("update_install");
