/**
 * La paleta que necesitan las gráficas, resuelta contra el tema activo.
 *
 * POR QUÉ RESOLVER Y NO PASAR `var(--color-marino)` A RECHARTS.
 *
 * Recharts pinta el color como ATRIBUTO de presentación del SVG
 * (`<rect fill="…">`, `<path stroke="…">`), no como estilo CSS. Los navegadores
 * de hoy aceptan `var()` ahí, pero es un terreno con historia: basta un motor
 * que no lo resuelva para que las barras salgan negras y el reporte no diga
 * nada. Resolviendo a un hexadecimal se entrega al SVG un color que ningún
 * navegador puede interpretar mal.
 *
 * DE DÓNDE SE LEE, que es la parte que se puede equivocar fácil. El valor se
 * resuelve contra el ELEMENTO DE LA GRÁFICA, no contra `<html>`. La vista
 * imprimible vive dentro de un subárbol marcado `data-tema="claro"` aunque la
 * pantalla esté en oscuro: leyendo desde `<html>` el PDF saldría con los
 * colores del tema oscuro sobre papel blanco. Leyendo desde la propia figura,
 * cada gráfica hereda el tema de donde está.
 *
 * El respaldo sigue siendo `var(…)`: si por lo que sea no se pudo resolver
 * —el elemento aún no está en el documento, un entorno sin `getComputedStyle`—
 * la gráfica se pinta igual con lo que el navegador sepa hacer, en vez de
 * quedarse sin color.
 */

/**
 * Qué token del tema usa cada parte de una gráfica.
 *
 * Todo lo que tiene color en una gráfica está aquí: series, ejes, rejilla,
 * rótulos y el cursor del tooltip. Si algo se pinta con un valor que no salga
 * de esta tabla, ese algo no cambia al cambiar de tema, y es exactamente el
 * defecto que esta tabla existe para impedir.
 */
export const TOKENS_GRAFICA = {
  marino: "--color-marino",
  positivo: "--color-positivo",
  riesgo: "--color-riesgo",
  advertencia: "--color-advertencia",
  /** Serie sin protagonismo. `slate-500` y no `slate-400`: tiene que leerse. */
  tenue: "--color-slate-500",
  /** Línea del eje X y cursor de la gráfica de líneas. */
  eje: "--color-slate-300",
  /** Rejilla horizontal. */
  rejilla: "--color-slate-200",
  /** Números y etiquetas de los ejes. */
  rotulo: "--color-slate-500",
  /** Banda que resalta la columna bajo el puntero. */
  cursor: "--color-slate-100",
} as const;

export type ClaveGrafica = keyof typeof TOKENS_GRAFICA;

export type PaletaGrafica = Readonly<Record<ClaveGrafica, string>>;

const CLAVES = Object.keys(TOKENS_GRAFICA) as ClaveGrafica[];

/** La paleta sin resolver. Valor inicial y respaldo. */
export const PALETA_VAR: PaletaGrafica = Object.freeze(
  Object.fromEntries(CLAVES.map((c) => [c, `var(${TOKENS_GRAFICA[c]})`])),
) as PaletaGrafica;

/** ¿El valor leído sirve como color? Una variable sin definir devuelve "". */
function utilizable(valor: string | null | undefined): valor is string {
  return typeof valor === "string" && valor.trim() !== "";
}

/**
 * Resuelve la paleta con el lector que se le pase.
 *
 * Recibe el lector en vez de llamar a `getComputedStyle` para poder probarla en
 * node sin DOM, igual que el motor recibe la fecha de corte en vez de leer el
 * reloj. Cualquier token que no se pueda leer conserva su `var(…)`.
 */
export function resolverPaleta(
  leer: (variable: string) => string | null | undefined,
): PaletaGrafica {
  return Object.fromEntries(
    CLAVES.map((clave) => {
      const valor = leer(TOKENS_GRAFICA[clave]);
      return [clave, utilizable(valor) ? valor.trim() : PALETA_VAR[clave]];
    }),
  ) as PaletaGrafica;
}

/** ¿Dos paletas tienen exactamente los mismos colores? */
export function mismaPaleta(a: PaletaGrafica, b: PaletaGrafica): boolean {
  return CLAVES.every((clave) => a[clave] === b[clave]);
}

/**
 * Lector de custom properties de un elemento concreto.
 *
 * `getComputedStyle` resuelve las propiedades personalizadas heredadas aunque
 * el elemento esté oculto con `display: none`, que es justo el caso de la vista
 * imprimible en pantalla.
 */
export function paletaDelElemento(elemento: Element | null): PaletaGrafica {
  if (elemento === null || typeof getComputedStyle !== "function") return PALETA_VAR;
  const estilo = getComputedStyle(elemento);
  return resolverPaleta((variable) => estilo.getPropertyValue(variable));
}
