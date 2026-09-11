import { type ClaveMes, SIN_FECHA, mesesEntre } from "../../lib/calc";

/**
 * Eje temporal mensual que comparten Estado de resultados y Ventas y flujo.
 *
 * Los dos modulos muestran el mismo periodo mes a mes; si cada uno armara sus
 * columnas por su cuenta, uno podria saltarse los meses sin actividad y el otro
 * no, y el lector compararia columnas que no corresponden.
 *
 * Es presentacion pura: ordena y rellena claves de mes, no toca importes.
 */

/**
 * Primer dia del mes, en UTC, a partir de la clave del motor ("2026-07").
 *
 * Devuelve null para el grupo sin fecha: ese grupo no tiene lugar en un eje de
 * tiempo, y convertirlo en una fecha cualquiera lo haria parecer un mes mas.
 */
export function fechaDeMes(clave: ClaveMes): Date | null {
  if (clave === SIN_FECHA) return null;
  const partes = /^(\d{4})-(\d{2})$/.exec(clave);
  if (partes === null) return null;
  const anio = Number(partes[1]);
  const mes = Number(partes[2]);
  if (mes < 1 || mes > 12) return null;
  return new Date(Date.UTC(anio, mes - 1, 1));
}

/**
 * Eje continuo: todos los meses entre el primero y el ultimo fechados, aunque
 * no traigan actividad, y el grupo sin fecha al final si aparece.
 *
 * Los meses vacios se incluyen a proposito. Omitirlos esconde justo lo que el
 * reporte quiere senalar: que hubo meses sin vender.
 */
export function ejeContinuo(claves: readonly ClaveMes[]): ClaveMes[] {
  const fechas = claves
    .map(fechaDeMes)
    .filter((f): f is Date => f !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  const primero = fechas[0];
  const ultimo = fechas[fechas.length - 1];
  const continuos = primero === undefined || ultimo === undefined ? [] : mesesEntre(primero, ultimo);

  return claves.includes(SIN_FECHA) ? [...continuos, SIN_FECHA] : continuos;
}

/** Cuantos meses fechados cubre el eje. El grupo sin fecha no es un mes. */
export function mesesFechados(eje: readonly ClaveMes[]): number {
  return eje.filter((m) => m !== SIN_FECHA).length;
}
