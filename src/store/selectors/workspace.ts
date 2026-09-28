import type { AreaNode } from "../../api/types";
import { findNode } from "../../lib/tree";
import { state } from "../state";

/** The node shown in the workspace reading pane, if it still exists. */
export const openAreaNode = (): AreaNode | null => (state.areaOpen ? findNode(state.area, state.areaOpen) : null);

/** The node selected in the workspace tree, if it still exists. */
export const selectedAreaNode = (): AreaNode | null => (state.areaSel ? findNode(state.area, state.areaSel) : null);
