import { create } from "zustand";

import {
  type Tema,
  type TemaResuelto,
  aplicarTema,
  guardarTema,
  leerTema,
  observarSistema,
  prefiereOscuroSistema,
  resolverTema,
} from "../lib/tema";

/**
 * El tema vive en su PROPIO store, aparte de `useAppStore`.
 *
 * No es una separación cosmética: `useAppStore.limpiar()` borra dataset,
 * hallazgos, cálculos y capturas para dejar la app como recién abierta. El tema
 * no es parte de eso —nadie espera que descartar un archivo le cambie los
 * colores— y tenerlo en el mismo store sería cuestión de tiempo para que un
 * `limpiar` lo arrastrara. Fronteras de estado según su ciclo de vida, no según
 * dónde se pintan.
 */

interface EstadoTema {
  /** La preferencia del usuario. Puede ser "sistema". */
  readonly tema: Tema;
  /** Lo que de verdad se pinta. Nunca es "sistema". */
  readonly resuelto: TemaResuelto;
  /** Cambia la preferencia, la persiste y la aplica al documento. */
  readonly elegirTema: (tema: Tema) => void;
  /**
   * Reacciona a que el SISTEMA cambió de claro a oscuro. Solo mueve algo si la
   * preferencia es "sistema"; con un tema fijo elegido, el sistema no manda.
   */
  readonly sistemaCambio: (prefiereOscuro: boolean) => void;
}

const inicial = leerTema();

export const useTema = create<EstadoTema>((set, get) => ({
  tema: inicial,
  resuelto: resolverTema(inicial, prefiereOscuroSistema()),

  elegirTema: (tema) => {
    const resuelto = resolverTema(tema, prefiereOscuroSistema());
    guardarTema(tema);
    aplicarTema(resuelto);
    set({ tema, resuelto });
  },

  sistemaCambio: (prefiereOscuro) => {
    if (get().tema !== "sistema") return;
    const resuelto = resolverTema("sistema", prefiereOscuro);
    if (resuelto === get().resuelto) return;
    aplicarTema(resuelto);
    set({ resuelto });
  },
}));

/**
 * Engancha la aplicación al tema del sistema, una sola vez al arrancar.
 *
 * Se llama desde `main.tsx`, no desde un componente: si viviera en un `useEffect`
 * y ese componente se desmontara, la aplicación dejaría de seguir al sistema sin
 * que nada lo delatara.
 *
 * El `aplicarTema` inicial es redundante con el script de `index.html` —que ya
 * fijó el atributo antes de que React montara— y aun así se hace: el script es
 * una optimización contra el destello, no la fuente de verdad.
 */
export function engancharTemaDelSistema(): () => void {
  aplicarTema(useTema.getState().resuelto);
  return observarSistema((prefiereOscuro) => {
    useTema.getState().sistemaCambio(prefiereOscuro);
  });
}
