import type { Dataset, Venta } from "../schema";

/**
 * Cimientos del motor de calculo.
 *
 * Todo lo de `src/lib/calc/` son funciones puras: reciben Dataset (mas fecha de
 * corte y parametros donde aplique) y devuelven objetos de resultado. Sin React,
 * sin fetch, sin reloj. En particular NINGUNA funcion llama a `new Date()` por su
 * cuenta: la fecha de corte siempre entra por parametro, o el mismo dataset
 * daria resultados distintos segun el dia en que se abra el reporte.
 */

// --------------------------- Dinero y division ---------------------------

/**
 * Todo importe viaja como entero en centavos. No se redondea a media cadena de
 * operaciones: solo al cerrar una, y solo con esta funcion.
 */
export type Centavos = number;

/** Redondeo a entero de centavos. Unico punto donde un importe deja de ser exacto. */
export function aCentavos(valor: number): Centavos {
  return Math.round(valor);
}

/**
 * Division que devuelve null en vez de NaN o Infinity.
 *
 * Un hueco en un reporte financiero se ve y se explica; un NaN se propaga en
 * silencio y contamina cada total que lo toca.
 */
export function divSegura(numerador: number, denominador: number): number | null {
  if (denominador === 0 || !Number.isFinite(denominador) || !Number.isFinite(numerador)) {
    return null;
  }
  const r = numerador / denominador;
  return Number.isFinite(r) ? r : null;
}

/** Suma de centavos. Existe para no repetir el reduce y para no perder el tipo. */
export function suma(valores: readonly (Centavos | null)[]): Centavos {
  let total = 0;
  for (const v of valores) if (v !== null) total += v;
  return total;
}

// --------------------------- Exclusiones ---------------------------

/** Linea cuyas filas nunca cuentan como venta. Se listan aparte, no se ocultan. */
export const LINEA_EXCLUIDA = "Demo";

export type MotivoExclusion = "demo" | "sin-precio";

export interface VentaExcluida {
  readonly venta: Venta;
  readonly motivo: MotivoExclusion;
  /** Texto listo para la UI: por que esta fila no cuenta como venta. */
  readonly explicacion: string;
}

export interface ParticionVentas {
  /** Ventas que entran en todo calculo de venta. */
  readonly incluidas: readonly Venta[];
  /** Filas apartadas, con su motivo. La UI debe poder mostrarlas. */
  readonly excluidas: readonly VentaExcluida[];
}

const EXPLICACION: Readonly<Record<MotivoExclusion, string>> = {
  demo: `Unidad marcada como "${LINEA_EXCLUIDA}": no es una venta, se lista aparte.`,
  "sin-precio": "Sin precio_venta capturado: no puede valorarse como venta.",
};

/**
 * Separa las ventas computables de las que no lo son.
 *
 * `Demo` tiene prioridad sobre `sin-precio`: una demo sin precio se reporta como
 * demo, que es lo que le importa al usuario.
 */
export function particionarVentas(ventas: readonly Venta[]): ParticionVentas {
  const incluidas: Venta[] = [];
  const excluidas: VentaExcluida[] = [];

  for (const venta of ventas) {
    const motivo: MotivoExclusion | null =
      venta.linea === LINEA_EXCLUIDA ? "demo" : venta.precio_venta === null ? "sin-precio" : null;

    if (motivo === null) {
      incluidas.push(venta);
      continue;
    }
    excluidas.push({ venta, motivo, explicacion: EXPLICACION[motivo] });
  }

  return { incluidas, excluidas };
}

/** Atajo: solo las ventas computables de un dataset. */
export function ventasComputables(dataset: Dataset): readonly Venta[] {
  return particionarVentas(dataset.ventas).incluidas;
}

// --------------------------- Tiempo ---------------------------

/**
 * Clave del grupo "sin fecha".
 *
 * Una fila sin fecha no puede ubicarse en un mes. Meterla en uno arbitrario
 * falsea la estacionalidad y descartarla en silencio le esconde dinero al
 * usuario, asi que tiene su propia categoria explicita en toda agrupacion.
 */
export const SIN_FECHA = "sin-fecha";

/** "2026-01" para una fecha, SIN_FECHA para null. */
export type ClaveMes = string;

export function claveMes(fecha: Date | null): ClaveMes {
  if (fecha === null) return SIN_FECHA;
  const anio = fecha.getUTCFullYear();
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  return `${anio}-${mes}`;
}

export const MILIS_POR_DIA = 86_400_000;

/** Dias enteros entre dos fechas, en UTC. Positivo si `hasta` es posterior. */
export function diasEntre(desde: Date, hasta: Date): number {
  return Math.floor((hasta.getTime() - desde.getTime()) / MILIS_POR_DIA);
}

/** Suma dias a una fecha sin mutarla. */
export function sumarDias(fecha: Date, dias: number): Date {
  return new Date(fecha.getTime() + dias * MILIS_POR_DIA);
}

/**
 * Fecha de corte de hoy, a medianoche UTC. La expone el motor para que la UI la
 * use como valor inicial, pero ninguna funcion de calculo la llama sola: la
 * fecha de corte siempre entra por parametro.
 *
 * "Hoy" es el dia del CALENDARIO DEL USUARIO, no el de UTC: se leen el año, mes
 * y dia locales y se guardan a medianoche UTC, como todas las fechas del
 * motor. Leerlos en UTC corria el corte un dia en las tardes de Mexico (a las
 * 7 pm del 10 de septiembre en UTC ya es 11), y con el el aging completo.
 */
export function hoyUTC(ahora: Date = new Date()): Date {
  return new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()));
}

/** Ordena claves de mes dejando SIN_FECHA siempre al final. */
export function compararClaveMes(a: ClaveMes, b: ClaveMes): number {
  if (a === b) return 0;
  if (a === SIN_FECHA) return 1;
  if (b === SIN_FECHA) return -1;
  return a < b ? -1 : 1;
}

/** Enumera los meses entre dos fechas, inclusive. Vacio si el rango es invalido. */
export function mesesEntre(desde: Date, hasta: Date): ClaveMes[] {
  if (hasta.getTime() < desde.getTime()) return [];
  const out: ClaveMes[] = [];
  const cursor = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), 1));
  const fin = new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), 1));
  while (cursor.getTime() <= fin.getTime()) {
    out.push(claveMes(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}
