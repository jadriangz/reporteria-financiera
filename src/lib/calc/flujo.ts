import type { Dataset } from "../schema";

import {
  type Centavos,
  type ClaveMes,
  SIN_FECHA,
  type VentaExcluida,
  claveMes,
  compararClaveMes,
  divSegura,
  particionarVentas,
} from "./base";

/**
 * Flujo: facturado contra cobrado, mes a mes.
 *
 * Son dos calendarios distintos y no hay que confundirlos: lo facturado se
 * fecha por `ventas.fecha`, lo cobrado por `cobranza.fecha_pago`. Un abono sin
 * fecha de pago no puede atribuirse a ningun mes.
 */

export interface MesFlujo {
  readonly mes: ClaveMes;
  readonly facturado: Centavos;
  readonly cobrado: Centavos;
  /** facturado - cobrado en el mes. Positivo = se factura mas de lo que entra. */
  readonly brecha: Centavos;
  /** cobrado / facturado del mes. null si no se facturo nada ese mes. */
  readonly cobertura: number | null;
  readonly operaciones: number;
}

export interface Flujo {
  /** Ordenados por mes; SIN_FECHA al final. Incluye meses sin actividad. */
  readonly meses: readonly MesFlujo[];
  readonly facturadoTotal: Centavos;
  readonly cobradoTotal: Centavos;
  /** Meses del rango facturado en los que no hubo ninguna venta. */
  readonly mesesSinVenta: readonly ClaveMes[];
  readonly excluidas: readonly VentaExcluida[];
}

interface Acumulado {
  facturado: number;
  cobrado: number;
  operaciones: number;
}

/**
 * Facturado contra cobrado por mes.
 *
 * Los meses intermedios sin actividad se emiten en cero: si se omiten, una
 * grafica de estacionalidad dibuja una linea continua donde hubo un hueco de
 * tres meses sin vender.
 */
export function calcularFlujo(dataset: Dataset): Flujo {
  const { incluidas, excluidas } = particionarVentas(dataset.ventas);
  const mapa = new Map<ClaveMes, Acumulado>();

  const bucket = (clave: ClaveMes): Acumulado => {
    const existente = mapa.get(clave);
    if (existente !== undefined) return existente;
    const nuevo: Acumulado = { facturado: 0, cobrado: 0, operaciones: 0 };
    mapa.set(clave, nuevo);
    return nuevo;
  };

  const foliosComputables = new Set(incluidas.map((v) => v.folio));

  let facturadoTotal = 0;
  for (const venta of incluidas) {
    const precio = venta.precio_venta ?? 0;
    const b = bucket(claveMes(venta.fecha));
    b.facturado += precio;
    b.operaciones += 1;
    facturadoTotal += precio;
  }

  let cobradoTotal = 0;
  for (const abono of dataset.cobranza) {
    // Un abono contra una Demo no es flujo de venta: sigue la misma exclusion.
    if (!foliosComputables.has(abono.folio_venta)) continue;
    const monto = abono.monto ?? 0;
    bucket(claveMes(abono.fecha_pago)).cobrado += monto;
    cobradoTotal += monto;
  }

  rellenarMesesIntermedios(mapa, bucket);

  const meses = [...mapa.entries()]
    .map(([mes, a]): MesFlujo => ({
      mes,
      facturado: a.facturado,
      cobrado: a.cobrado,
      brecha: a.facturado - a.cobrado,
      cobertura: divSegura(a.cobrado, a.facturado),
      operaciones: a.operaciones,
    }))
    .sort((a, b) => compararClaveMes(a.mes, b.mes));

  return {
    meses,
    facturadoTotal,
    cobradoTotal,
    mesesSinVenta: meses.filter((m) => m.mes !== SIN_FECHA && m.operaciones === 0).map((m) => m.mes),
    excluidas,
  };
}

/** Crea en cero los meses del rango que no aparecieron en los datos. */
function rellenarMesesIntermedios(
  mapa: ReadonlyMap<ClaveMes, Acumulado>,
  bucket: (clave: ClaveMes) => Acumulado,
): void {
  const fechados = [...mapa.keys()].filter((m) => m !== SIN_FECHA).sort();
  const primero = fechados[0];
  const ultimo = fechados[fechados.length - 1];
  if (primero === undefined || ultimo === undefined) return;

  const [anioIni, mesIni] = primero.split("-").map(Number);
  const [anioFin, mesFin] = ultimo.split("-").map(Number);
  if (anioIni === undefined || mesIni === undefined) return;
  if (anioFin === undefined || mesFin === undefined) return;

  const cursor = new Date(Date.UTC(anioIni, mesIni - 1, 1));
  const fin = new Date(Date.UTC(anioFin, mesFin - 1, 1));
  while (cursor.getTime() <= fin.getTime()) {
    bucket(claveMes(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
}
