import { onCoverFile, registerCoverInput } from "../../store/library";

/** Hidden file picker, opened by the C key / "Capa" command. */
export function CoverFileInput() {
  return (
    <input
      type="file"
      accept="image/*"
      aria-label="Imagem da capa"
      tabIndex={-1}
      ref={registerCoverInput}
      onChange={(e) => {
        const file = e.currentTarget.files?.[0];
        e.currentTarget.value = "";
        onCoverFile(file);
      }}
      class="pointer-events-none absolute -left-[9999px] h-px w-px opacity-0"
    />
  );
}
