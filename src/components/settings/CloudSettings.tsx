import { onMount } from "solid-js";
import { loadCloud } from "../../store/actions/cloud";
import { VaultSection } from "../cloud/VaultSection";

/** Configurações › Nuvem: the vault shared by every book (address, computers, books only on the server). */
export function CloudSettings() {
  onMount(() => void loadCloud());
  return (
    <section class="set-sec cloud-settings">
      <VaultSection />
      <p class="cloud-warn">
        Obras criptografadas são comprimidas e trancadas com a chave do cofre antes de sair do computador: o servidor guarda
        só embaralhado. Obras com links públicos vão abertas, porque o servidor precisa ler o texto para mostrar a página.
      </p>
    </section>
  );
}
