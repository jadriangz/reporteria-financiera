import type { Dataset, Gasto } from "../schema";

import {
  type Centavos,
  type ClaveMes,
  type VentaExcluida,
  aCentavos,
  claveMes,
  compararClaveMes,
  divSegura,
  particionarVentas,
} from "./base";
import { type OrigenBaseComision, calcularVenta } from "./venta";

/**
 * Estado de resultados: la cascada venta -> costo -> bruta -> comision -> gastos.
 * Total del periodo y desglose mensual.
 */

/** Redondeo a centavo entero que respeta el null de `divSegura`. */
function redondear(valor: number | null): Centavos | null {
  return valor === null ? null : aCentavos(valor);
}

export interface Cascada {
  readonly ventaTotal: Centavos;
  readonly costoTotal: Centavos;
  readonly utilidadBruta: Centavos;
  /** utilidad_bruta / venta_total. null si no hubo venta. */
  readonly margenPct: number | null;
  readonly comisionTotal: Centavos;
  readonly utilidadContribucion: Centavos;
  readonly gastosFijos: Centavos;
  readonly gastosVariables: Centavos;
  readonly gastosTotal: Centavos;
  readonly resultadoOperativo: Centavos;
  readonly operaciones: number;
  /**
   * venta_total / numero_operaciones, redondeado a centavo entero como todo
   * importe del motor. null si no hubo operaciones.
   */
  readonly ticketPromedio: Centavos | null;
}

export interface CascadaMes extends Cascada {
  /** "2026-01", o SIN_FECHA para las filas que no pueden ubicarse en el tiempo. */
  readonly mes: ClaveMes;
}

/** Que base de comision se aplico a cada venta y de donde salio. */
export interface DetalleComision {
  readonly folio: string;
  readonly base: string;
  readonly origen: OrigenBaseComision;
  readonly monto: Centavos;
}

export interface Resultados {
  readonly total: Cascada;
  /** Ordenados por mes; SIN_FECHA siempre al final. */
  readonly meses: readonly CascadaMes[];
  readonly excluidas: readonly VentaExcluida[];
  readonly comisiones: readonly DetalleComision[];
  /** Punto de equilibrio en centavos de venta. null si el margen no lo permite. */
  readonly puntoEquilibrio: Centavos | null;
}

/** Un gasto es fijo salvo que diga lo contrario. Solo los fijos van al equilibrio. */
function esFijo(gasto: Gasto): boolean {
  return (gasto.tipo?.trim().toLowerCase() ?? "fijo") !== "variable";
}

interface Acumulador {
  ventaTotal: number;
  costoTotal: number;
  utilidadBruta: number;
  comisionTotal: number;
  utilidadContribucion: number;
  gastosFijos: number;
  gastosVariables: number;
  operaciones: number;
}

function nuevoAcumulador(): Acumulador {
  return {
    ventaTotal: 0,
    costoTotal: 0,
    utilidadBruta: 0,
    comisionTotal: 0,
    utilidadContribucion: 0,
    gastosFijos: 0,
    gastosVariables: 0,
    operaciones: 0,
  };
}

function cerrar(a: Acumulador): Cascada {
  const gastosTotal = a.gastosFijos + a.gastosVariables;
  return {
    ventaTotal: a.ventaTotal,
    costoTotal: a.costoTotal,
    utilidadBruta: a.utilidadBruta,
    margenPct: divSegura(a.utilidadBruta, a.ventaTotal),
    comisionTotal: a.comisionTotal,
    utilidadContribucion: a.utilidadContribucion,
    gastosFijos: a.gastosFijos,
    gastosVariables: a.gastosVariables,
    gastosTotal,
    resultadoOperativo: a.utilidadContribucion - gastosTotal,
    operaciones: a.operaciones,
    ticketPromedio: redondear(divSegura(a.ventaTotal, a.operaciones)),
  };
}

/**
 * Punto de equilibrio = gastos_fijos / margen_contribucion_pct.
 *
 * Usa SOLO los gastos fijos, por definicion.
 *
 * Devuelve null en dos casos, y en ambos null significa "no aplica", no "cero":
 *
 * - Margen de contribucion cero o negativo: no hay volumen de venta que alcance
 *   el equilibrio, y un numero negativo aqui no significaria nada.
 * - Sin gastos fijos: el cociente daria 0, y un punto de equilibrio de $0 en el
 *   reporte se lee como "ya lo alcanzaste", que es una afirmacion distinta de
 *   "no hay costos fijos que cubrir".
 */
export function puntoEquilibrio(gastosFijos: Centavos, margenContribucionPct: number | null): Centavos | null {
  if (margenContribucionPct === null || margenContribucionPct <= 0) return null;
  if (gastosFijos <= 0) return null;
  const valor = divSegura(gastosFijos, margenContribucionPct);
  return valor === null ? null : Math.round(valor);
}

/**
 * Cascada completa del estado de resultados.
 *
 * Las ventas con `linea = "Demo"` y las que no tienen precio quedan fuera de
 * todo agregado y se devuelven en `excluidas` con su motivo.
 *
 * Las ventas y los gastos SIN FECHA no pueden entrar en ningun mes: se agrupan
 * en la clave SIN_FECHA, nunca en un mes arbitrario ni en silencio.
 */
export function calcularResultados(dataset: Dataset): Resultados {
  const { incluidas, excluidas } = particionarVentas(dataset.ventas);

  const total = nuevoAcumulador();
  const porMes = new Map<ClaveMes, Acumulador>();
  const comisiones: DetalleComision[] = [];

  const mes = (clave: ClaveMes): Acumulador => {
    const existente = porMes.get(clave);
    if (existente !== undefined) return existente;
    const nuevo = nuevoAcumulador();
    porMes.set(clave, nuevo);
    return nuevo;
  };

  for (const venta of incluidas) {
    const c = calcularVenta(venta, dataset.parametros);
    const precio = venta.precio_venta ?? 0;
    const costo = venta.costo_unitario ?? 0;

    comisiones.push({
      folio: venta.folio,
      base: c.baseComision,
      origen: c.origenBaseComision,
      monto: c.comisionMonto,
    });

    for (const a of [total, mes(claveMes(venta.fecha))]) {
      a.ventaTotal += precio;
      a.costoTotal += costo;
      a.utilidadBruta += c.utilidadBruta;
      a.comisionTotal += c.comisionMonto;
      a.utilidadContribucion += c.utilidadContribucion;
      a.operaciones += 1;
    }
  }

  for (const gasto of dataset.gastos) {
    const monto = gasto.monto ?? 0;
    const campo = esFijo(gasto) ? "gastosFijos" : "gastosVariables";
    total[campo] += monto;
    mes(claveMes(gasto.fecha))[campo] += monto;
  }

  const cascadaTotal = cerrar(total);
  const meses = [...porMes.entries()]
    .map(([clave, a]): CascadaMes => Object.assign({ mes: clave }, cerrar(a)))
    .sort((a, b) => compararClaveMes(a.mes, b.mes));

  return {
    total: cascadaTotal,
    meses,
    excluidas,
    comisiones,
    puntoEquilibrio: puntoEquilibrio(
      cascadaTotal.gastosFijos,
      divSegura(cascadaTotal.utilidadContribucion, cascadaTotal.ventaTotal),
    ),
  };
}
