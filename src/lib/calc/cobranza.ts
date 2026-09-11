import type { Dataset, Venta } from "../schema";

import {
  type Centavos,
  type VentaExcluida,
  diasEntre,
  divSegura,
  particionarVentas,
  sumarDias,
} from "./base";

/**
 * Cartera: cobrado por folio, saldo, antiguedad por buckets, provision y DSO.
 *
 * La fecha de corte SIEMPRE entra por parametro. Es lo que hace reproducible el
 * reporte: el mismo archivo con el mismo corte da siempre el mismo aging.
 */

/** Buckets de CLAUDE.md, mas el propio de las ventas que no pueden fecharse. */
export const BUCKETS = ["0-30", "31-60", "61-90", "91-180", "+180"] as const;
export type Bucket = (typeof BUCKETS)[number];

/**
 * Una venta sin fecha no tiene antiguedad: no se sabe cuando empezo a correr.
 * Mandarla al bucket 0-30 la haria parecer cartera fresca, que es justo la
 * lectura mas peligrosa. Va a su propia categoria.
 */
export const BUCKET_SIN_FECHA = "sin-fecha";

export type ClaveBucket = Bucket | typeof BUCKET_SIN_FECHA;

/** Todos los buckets, en orden de presentacion. Incluye el de sin fecha. */
export const CLAVES_BUCKET: readonly ClaveBucket[] = [...BUCKETS, BUCKET_SIN_FECHA];

/** Base sobre la que se midio la antiguedad de una venta. */
export type BaseAntiguedad = "vencido" | "antiguedad" | "sin-fecha";

export interface SaldoVenta {
  readonly folio: string;
  readonly cliente: string;
  readonly fecha: Date | null;
  readonly precioVenta: Centavos;
  readonly cobrado: Centavos;
  readonly saldo: Centavos;
  /** Dias usados para el bucket. null si la venta no tiene fecha. */
  readonly dias: number | null;
  /**
   * Si hay `dias_credito` se mide `dias_vencido`; si no, `dias_antiguedad`.
   * Se documenta cual se uso porque cambia por completo la lectura del aging.
   */
  readonly base: BaseAntiguedad;
  readonly bucket: ClaveBucket;
}

export interface Aging {
  /** Saldo por bucket. Todos los buckets existen aunque valgan 0. */
  readonly porBucket: Readonly<Record<ClaveBucket, Centavos>>;
  readonly saldoTotal: Centavos;
  /** Proporcion de la cartera en cada bucket. null si no hay cartera. */
  readonly participacion: Readonly<Record<ClaveBucket, number | null>>;
}

export interface Cartera {
  readonly detalle: readonly SaldoVenta[];
  readonly aging: Aging;
  readonly cobradoTotal: Centavos;
  readonly ventaTotal: Centavos;
  readonly saldoTotal: Centavos;
  readonly provision: Centavos;
  readonly dso: number | null;
  readonly excluidas: readonly VentaExcluida[];
  readonly fechaCorte: Date;
}

export interface OpcionesCartera {
  readonly fechaCorte: Date;
}

/** Suma de cobranza.monto por folio de venta. */
export function cobradoPorFolio(dataset: Dataset): ReadonlyMap<string, Centavos> {
  const out = new Map<string, Centavos>();
  for (const abono of dataset.cobranza) {
    const monto = abono.monto ?? 0;
    out.set(abono.folio_venta, (out.get(abono.folio_venta) ?? 0) + monto);
  }
  return out;
}

/** Clasifica un numero de dias en su bucket. Negativo = aun no vence. */
export function bucketDe(dias: number): Bucket {
  if (dias <= 30) return "0-30";
  if (dias <= 60) return "31-60";
  if (dias <= 90) return "61-90";
  if (dias <= 180) return "91-180";
  return "+180";
}

/**
 * Dias de antiguedad de una venta al corte.
 *
 *   con dias_credito: dias_vencido    = corte - (fecha_venta + dias_credito)
 *   sin dias_credito: dias_antiguedad = corte - fecha_venta
 */
export function diasDeVenta(
  venta: Venta,
  fechaCorte: Date,
): { dias: number | null; base: BaseAntiguedad } {
  if (venta.fecha === null) return { dias: null, base: "sin-fecha" };
  if (venta.dias_credito === null || !Number.isFinite(venta.dias_credito)) {
    return { dias: diasEntre(venta.fecha, fechaCorte), base: "antiguedad" };
  }
  const vencimiento = sumarDias(venta.fecha, venta.dias_credito);
  return { dias: diasEntre(vencimiento, fechaCorte), base: "vencido" };
}

function bucketsEnCero(): Record<ClaveBucket, Centavos> {
  const out = {} as Record<ClaveBucket, Centavos>;
  for (const b of BUCKETS) out[b] = 0;
  out[BUCKET_SIN_FECHA] = 0;
  return out;
}

/**
 * Cartera completa al corte indicado.
 *
 * Solo entran las ventas computables: una Demo no genera cartera. Al aging
 * entra TODO saldo distinto de cero, incluido el negativo de una venta
 * sobrecobrada: si se descartara, la suma de los buckets dejaria de ser el
 * saldo total y el aging diria tener mas cartera de la que hay. Una venta
 * exactamente pagada aporta cero y no mueve nada.
 */
export function calcularCartera(dataset: Dataset, opciones: OpcionesCartera): Cartera {
  const { incluidas, excluidas } = particionarVentas(dataset.ventas);
  const cobrado = cobradoPorFolio(dataset);

  const detalle: SaldoVenta[] = [];
  const porBucket = bucketsEnCero();
  let ventaTotal = 0;
  let cobradoTotal = 0;
  let saldoTotal = 0;

  for (const venta of incluidas) {
    const precioVenta = venta.precio_venta ?? 0;
    const cobradoVenta = cobrado.get(venta.folio) ?? 0;
    const saldo = precioVenta - cobradoVenta;
    const { dias, base } = diasDeVenta(venta, opciones.fechaCorte);
    const bucket: ClaveBucket = dias === null ? BUCKET_SIN_FECHA : bucketDe(dias);

    detalle.push({
      folio: venta.folio,
      cliente: venta.cliente,
      fecha: venta.fecha,
      precioVenta,
      cobrado: cobradoVenta,
      saldo,
      dias,
      base,
      bucket,
    });

    ventaTotal += precioVenta;
    cobradoTotal += cobradoVenta;
    saldoTotal += saldo;
    if (saldo !== 0) porBucket[bucket] += saldo;
  }

  const participacion = {} as Record<ClaveBucket, number | null>;
  for (const b of CLAVES_BUCKET) {
    participacion[b] = divSegura(porBucket[b], saldoTotal);
  }

  return {
    detalle,
    aging: { porBucket, saldoTotal, participacion },
    cobradoTotal,
    ventaTotal,
    saldoTotal,
    provision: calcularProvision(porBucket, dataset),
    dso: calcularDSO(dataset, saldoTotal, ventaTotal),
    excluidas,
    fechaCorte: opciones.fechaCorte,
  };
}

/**
 * provision = saldo_91_180 * provision_91_180 + saldo_mas_180 * provision_mas_180
 *
 * Las tasas salen de la hoja de parametros. Los buckets mas frescos no provisionan.
 */
export function calcularProvision(
  porBucket: Readonly<Record<ClaveBucket, Centavos>>,
  dataset: Dataset,
): Centavos {
  const { provision_91_180, provision_mas_180 } = dataset.parametros;
  return Math.round(porBucket["91-180"] * provision_91_180 + porBucket["+180"] * provision_mas_180);
}

/**
 * DSO = (saldo_promedio / venta_periodo) * dias_periodo
 *
 * Decisiones que la formula no fija y que aqui se resuelven explicitamente:
 *
 * - `saldo_promedio`: con un solo corte no hay serie historica que promediar,
 *   asi que se usa el saldo al corte. Cuando exista histórico entre cortes (v2)
 *   este es el punto a cambiar.
 * - `dias_periodo`: los dias que cubre `parametros.periodo_inicio/fin`, ambos
 *   inclusive. Si no vienen capturados, el rango entre la primera y la ultima
 *   fecha de venta.
 * - `venta_periodo`: la venta total computable.
 *
 * Devuelve null si no hay venta o no puede determinarse el periodo.
 */
export function calcularDSO(
  dataset: Dataset,
  saldoTotal: Centavos,
  ventaPeriodo: Centavos,
): number | null {
  const dias = diasDelPeriodo(dataset);
  if (dias === null || dias <= 0) return null;
  const ratio = divSegura(saldoTotal, ventaPeriodo);
  return ratio === null ? null : ratio * dias;
}

/** Dias que cubre el periodo analizado, ambos extremos inclusive. */
export function diasDelPeriodo(dataset: Dataset): number | null {
  const { periodo_inicio, periodo_fin } = dataset.parametros;
  if (periodo_inicio !== null && periodo_fin !== null) {
    const d = diasEntre(periodo_inicio, periodo_fin) + 1;
    return d > 0 ? d : null;
  }

  const fechas = particionarVentas(dataset.ventas)
    .incluidas.map((v) => v.fecha)
    .filter((f): f is Date => f !== null)
    .map((f) => f.getTime());

  if (fechas.length === 0) return null;
  return diasEntre(new Date(Math.min(...fechas)), new Date(Math.max(...fechas))) + 1;
}
