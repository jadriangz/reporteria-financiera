import type { Parametros, Venta } from "../schema";

import { type Centavos, aCentavos, divSegura } from "./base";

/**
 * Aritmetica de UNA venta, exactamente como la define CLAUDE.md:
 *
 *   utilidad_bruta        = precio_venta - costo_unitario
 *   margen_pct            = utilidad_bruta / precio_venta
 *   comision_monto        = comision_pct * (base === "Utilidad" ? utilidad_bruta : precio_venta)
 *   utilidad_contribucion = utilidad_bruta - comision_monto
 *
 * Vive aparte porque la usan resultados, producto y clientes: una sola
 * definicion, no tres copias que se desincronizan.
 */

/** De donde salio la base de comision que se aplico. */
export type OrigenBaseComision = "fila" | "parametro";

export interface CalculoVenta {
  readonly folio: string;
  readonly utilidadBruta: Centavos;
  readonly margenPct: number | null;
  readonly comisionMonto: Centavos;
  readonly utilidadContribucion: Centavos;
  /** Base efectivamente aplicada, ya resuelto el respaldo por parametros. */
  readonly baseComision: string;
  /** Si la base vino de la fila o del valor por omision de parametros. */
  readonly origenBaseComision: OrigenBaseComision;
}

/** Base que dispara el calculo sobre la utilidad en vez de sobre la venta. */
const BASE_UTILIDAD = "Utilidad";

/** Base que anula la comision por completo, sin importar `comision_pct`. */
const BASE_NO_APLICA = "No aplica";

/**
 * Resuelve la base de comision de una venta.
 *
 * Regla: se toma de la fila; si viene vacia, cae a
 * `parametros.comision_base_default`. El resultado documenta cual se uso, para
 * que el reporte pueda explicar de donde salio cada comision.
 */
export function resolverBaseComision(
  venta: Venta,
  parametros: Parametros,
): { base: string; origen: OrigenBaseComision } {
  const enFila = venta.comision_base?.trim() ?? "";
  if (enFila !== "") return { base: enFila, origen: "fila" };
  return { base: parametros.comision_base_default, origen: "parametro" };
}

/**
 * Calcula una venta. `precio_venta` o `costo_unitario` nulos se tratan como 0
 * para la aritmetica, pero el margen queda en null si no hay precio: dividir
 * entre cero produciria Infinity.
 *
 * La base "No aplica" anula la comision aunque la fila traiga `comision_pct`:
 * decir que la comision no aplica y a la vez cobrarla sobre el precio seria
 * contradictorio. Es el unico caso en que `comision_pct` se ignora.
 */
export function calcularVenta(venta: Venta, parametros: Parametros): CalculoVenta {
  const precio = venta.precio_venta ?? 0;
  const costo = venta.costo_unitario ?? 0;
  const utilidadBruta = precio - costo;

  const { base, origen } = resolverBaseComision(venta, parametros);
  const pct = venta.comision_pct ?? 0;
  const comisionMonto =
    base === BASE_NO_APLICA ? 0 : aCentavos(pct * (base === BASE_UTILIDAD ? utilidadBruta : precio));

  return {
    folio: venta.folio,
    utilidadBruta,
    margenPct: venta.precio_venta === null ? null : divSegura(utilidadBruta, precio),
    comisionMonto,
    utilidadContribucion: utilidadBruta - comisionMonto,
    baseComision: base,
    origenBaseComision: origen,
  };
}
