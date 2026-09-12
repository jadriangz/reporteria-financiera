import {
  type ValorPreferencia,
  claveDe,
  guardarPreferencia,
  leerPreferencia,
} from "../preferencias";

/**
 * Tema de la interfaz: claro, oscuro o el del sistema.
 *
 * DOS CONCEPTOS DISTINTOS, y confundirlos es de donde salen los errores:
 *
 * - `Tema` es la PREFERENCIA del usuario. Puede ser "sistema", que no es un
 *   color, es una delegación.
 * - `TemaResuelto` es lo que de verdad se pinta. Nunca es "sistema".
 *
 * El atributo `data-tema` del `<html>` lleva SIEMPRE el resuelto: así el CSS no
 * tiene que saber nada de `prefers-color-scheme` ni duplicar cada bloque. El
 * seguimiento en vivo del sistema es trabajo de `observarSistema`.
 */

export type Tema = ValorPreferencia<"tema">;
export type TemaResuelto = "claro" | "oscuro";

export const TEMAS: readonly Tema[] = ["claro", "oscuro", "sistema"];

/** Cómo se nombra cada opción en la interfaz. */
export const ETIQUETA_TEMA: Readonly<Record<Tema, string>> = {
  claro: "Claro",
  oscuro: "Oscuro",
  sistema: "Sistema",
};

/**
 * El reporte impreso SIEMPRE sale en claro, cualquiera que sea el tema en
 * pantalla. Un PDF con fondo negro es indefendible: no se lee en papel y
 * desperdicia tóner. `VistaImpresion` marca su raíz con este valor y los tokens
 * claros vuelven a declararse ahí dentro (ver `index.css`).
 */
export const TEMA_IMPRESION: TemaResuelto = "claro";

/** El atributo que el CSS observa. Un solo lugar decide cómo se llama. */
export const ATRIBUTO_TEMA = "data-tema";

/** Los props de un elemento que fija el tema de su subárbol. */
export function atributosTema(tema: TemaResuelto): Readonly<Record<string, string>> {
  return { [ATRIBUTO_TEMA]: tema };
}

/** La clave de `localStorage` donde vive la preferencia de tema. */
export const CLAVE_TEMA = claveDe("tema");

/**
 * La preferencia a lo que se pinta.
 *
 * Lo que el sistema prefiere se recibe por parámetro en vez de consultarse
 * aquí para que la función sea pura y se pueda probar en node, donde no hay
 * `matchMedia`. Es la misma razón por la que el motor de cálculo recibe la
 * fecha de corte en vez de llamar a `new Date()`.
 */
export function resolverTema(tema: Tema, sistemaPrefiereOscuro: boolean): TemaResuelto {
  if (tema === "sistema") return sistemaPrefiereOscuro ? "oscuro" : "claro";
  return tema;
}

/** La consulta que decide el tema del sistema. Una sola fuente de verdad. */
export const CONSULTA_OSCURO = "(prefers-color-scheme: dark)";

/** ¿El sistema pide oscuro? `false` donde no hay `matchMedia`. */
export function prefiereOscuroSistema(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(CONSULTA_OSCURO).matches;
}

export function leerTema(): Tema {
  return leerPreferencia("tema");
}

export function guardarTema(tema: Tema): void {
  guardarPreferencia("tema", tema);
}

/**
 * Escribe el tema resuelto en el `<html>`.
 *
 * Además fija `color-scheme`, que es lo que hace que los controles nativos
 * —el selector de fecha de la barra superior, los `select`, las barras de
 * desplazamiento— se pinten oscuros. Sin eso queda un calendario blanco
 * cegador sobre un reporte oscuro.
 */
export function aplicarTema(resuelto: TemaResuelto, raiz?: HTMLElement): void {
  const el = raiz ?? (typeof document === "undefined" ? null : document.documentElement);
  if (el === null) return;
  el.setAttribute(ATRIBUTO_TEMA, resuelto);
  el.style.colorScheme = resuelto === "oscuro" ? "dark" : "light";
}

/**
 * Avisa cuando el sistema cambia de claro a oscuro, EN VIVO.
 *
 * Con "sistema" elegido, el usuario espera que la aplicación cambie cuando su
 * sistema operativo cambia —al anochecer, con un horario programado— sin tener
 * que recargar. Leer la preferencia solo al arrancar deja la pantalla en el
 * tema equivocado el resto del día.
 *
 * Devuelve la función para dejar de escuchar.
 */
export function observarSistema(alCambiar: (prefiereOscuro: boolean) => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined;
  }
  const consulta = window.matchMedia(CONSULTA_OSCURO);
  const manejar = (e: MediaQueryListEvent) => {
    alCambiar(e.matches);
  };
  consulta.addEventListener("change", manejar);
  return () => {
    consulta.removeEventListener("change", manejar);
  };
}
