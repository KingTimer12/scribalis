import { session, state } from "../../store/state";
import { SrLabel } from "../ui/SrLabel";
import { CoverArt } from "./CoverArt";
import { RenameInput } from "./RenameInput";

/** Capa provisória enquanto a obra nova recebe um nome. */
export function NewBookTile() {
  return (
    <div class="tile sel">
      <div class="cover-btn">
        <CoverArt id={session.newId} title={state.renameVal} />
      </div>
      <SrLabel for="new-work">Nome da nova obra</SrLabel>
      <RenameInput id="new-work" label="Nome da nova obra" placeholder="Nome da obra" />
      <div class="ui">Enter cria · Esc cancela</div>
    </div>
  );
}
