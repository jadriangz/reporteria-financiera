import type { ReactNode } from "react";

import type { Tono } from "./primitivas";

/**
 * Tipos y logica pura de las tablas.
 *
 * Vive fuera de los `.tsx` por dos razones: mantiene los archivos de componente
 * exportando solo componentes (lo que conserva el fast refresh), y deja el
 * comparador y el ordenamiento en un modulo que se puede probar en node sin
 * renderizar nada.
 */

export type Alineacion = "izquierda" | "derecha";

export type Enfasis = "normal" | "subtotal" | "total";

/** Valor por el que se ordena una columna. `null` siempre queda al final. */
export type ValorOrden = string | number | null;

export interface ColumnaTabla<T> {
  readonly clave: string;
  readonly encabezado: string;
  /** Las columnas numericas van a la derecha y con numeros tabulares. */
  readonly alineacion?: Alineacion;
  /** Contenido de la celda, ya formateado. */
  readonly celda: (fila: T) => ReactNode;
  /** Si se omite, la columna no es ordenable. */
  readonly ordenar?: (fila: T) => ValorOrden;
  /** Ancho fijo opcional, p. ej. "8rem". */
  readonly ancho?: string;
  /** Aclaracion que aparece al pasar el cursor por el encabezado. */
  readonly titulo?: string;
}

export interface FilaTabla<T> {
  readonly id: string;
  readonly datos: T;
  /** Colorea la fila completa. Para marcar riesgo, por ejemplo. */
  readonly tono?: Tono;
  readonly enfasis?: Enfasis;
}

export interface OrdenTabla {
  readonly clave: string;
  readonly direccion: "asc" | "desc";
}

/**
 * Que hace una tabla cuando no cabe a lo ancho.
 *
 * NO ES "apilar en movil". Un reporte financiero se lee comparando cifras entre
 * si, y apilar una tabla de operaciones en tarjetas destruye justo eso: deja de
 * poder recorrerse una columna de importes hacia abajo. Por eso hay dos
 * estrategias distintas y cada modulo elige, en vez de una regla automatica.
 *
 * - `"tarjetas"`: para tablas de RESUMEN —pocas columnas, un renglon por
 *   concepto, sin comparacion entre renglones—. La cascada del estado de
 *   resultados y los escenarios de provision se leen concepto por concepto, asi
 *   que en poco ancho cada renglon se vuelve una tarjeta etiqueta/valor y no se
 *   pierde nada.
 * - `"scroll"`: para tablas de DETALLE —muchas columnas, un renglon por
 *   operacion—. Aqui la comparacion ES el contenido: se conserva la tabla, se
 *   desplaza a lo ancho y se fija la primera columna para no perder de vista de
 *   que fila se esta leyendo.
 *
 * El valor por omision es `"scroll"` porque conservar la tabla nunca pierde
 * informacion; lo que se pierde es comodidad.
 */
export type EstrategiaEstrecha = "scroll" | "tarjetas";

/** Fondo de la fila segun su tono. */
export const TONO_FILA: Readonly<Record<Tono, string>> = {
  neutro: "",
  positivo: "bg-emerald-50/60",
  riesgo: "bg-red-50/70",
  advertencia: "bg-amber-50/60",
  tenue: "text-slate-500",
};

/**
 * El mismo tono, SIN transparencia.
 *
 * Es para la columna fija de las tablas con desplazamiento horizontal: por
 * detras de esa celda pasa el resto de la tabla, y un fondo al 70% dejaria ver
 * las cifras de otras columnas corriendo por debajo del nombre del cliente.
 */
export const TONO_FILA_OPACO: Readonly<Record<Tono, string>> = {
  neutro: "bg-superficie",
  positivo: "bg-emerald-50",
  riesgo: "bg-red-50",
  advertencia: "bg-amber-50",
  tenue: "bg-superficie",
};

/** Color del texto de la fila segun su tono. */
export const TONO_TEXTO: Readonly<Record<Tono, string>> = {
  neutro: "text-slate-800",
  positivo: "text-positivo",
  riesgo: "text-riesgo",
  advertencia: "text-advertencia",
  tenue: "text-slate-500",
};

/**
 * Comparador de la tabla.
 *
 * Los huecos van al final sin importar la direccion: un dato que falta no es
 * "el mas pequeno", y ponerlo primero al ordenar descendente confunde al lector
 * que esperaba ver ahi el valor mas alto.
 */
export function compararValores(a: ValorOrden, b: ValorOrden, signo: number): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * signo;
  return String(a).localeCompare(String(b), "es-MX") * signo;
}

/** Aplica un orden a las filas sin mutar la entrada. */
export function ordenarFilas<T>(
  filas: readonly FilaTabla<T>[],
  columnas: readonly ColumnaTabla<T>[],
  orden: OrdenTabla | null,
): readonly FilaTabla<T>[] {
  if (orden === null) return filas;
  const columna = columnas.find((c) => c.clave === orden.clave);
  const extraer = columna?.ordenar;
  if (extraer === undefined) return filas;
  const signo = orden.direccion === "asc" ? 1 : -1;
  return [...filas].sort((a, b) => compararValores(extraer(a.datos), extraer(b.datos), signo));
}

/** Alterna la direccion si ya se ordenaba por esa columna; si no, arranca descendente. */
export function siguienteOrden(actual: OrdenTabla | null, clave: string): OrdenTabla {
  if (actual?.clave !== clave) return { clave, direccion: "desc" };
  return { clave, direccion: actual.direccion === "asc" ? "desc" : "asc" };
}
