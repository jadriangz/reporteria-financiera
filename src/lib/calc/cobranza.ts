import type { Dataset, Venta } from "../schema";

import {
  type Centavos,
  type VentaExcluida,
  agruparFolios,
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
 *
 * DOS NIVELES (v1.2.0). El cobro y el saldo son del FOLIO: un abono apunta a un
 * folio, no a una partida. Lo que queda pendiente se reparte entre sus PARTIDAS
 * en orden de entrega —lo que queda sin pagar es lo ultimo entregado— y cada
 * pendiente envejece con la fecha de su partida. Por eso el saldo de un folio
 * puede caer en dos tramos, y la suma de los tramos sigue siendo el saldo total.
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

/** Una partida de un folio, con lo que le toco de los pagos y lo que le queda pendiente. */
export interface SaldoPartida {
  readonly linea: string;
  readonly modelo: string;
  /** Fecha de entrega de la partida. null si no se capturo. */
  readonly fecha: Date | null;
  readonly precioVenta: Centavos;
  /** Lo que se le aplico de los pagos del folio. */
  readonly aplicado: Centavos;
  /** precioVenta - aplicado. Negativo solo en la partida que carga un sobrecobro. */
  readonly saldo: Centavos;
  /** Dias usados para el bucket. null si la partida no tiene fecha. */
  readonly dias: number | null;
  readonly base: BaseAntiguedad;
  readonly bucket: ClaveBucket;
}

/** Lo que un folio tiene pendiente en un tramo de antiguedad. */
export interface TramoFolio {
  readonly bucket: ClaveBucket;
  /** Suma de los pendientes de sus partidas en este tramo. Nunca cero. */
  readonly saldo: Centavos;
  /** Los dias de la partida mas antigua del tramo. null en "sin fecha". */
  readonly dias: number | null;
}

/**
 * Un folio en la cartera. Una fila por operacion, no por partida.
 *
 * `precioVenta`, `cobrado` y `saldo` son del folio. `fecha`, `dias`, `base` y
 * `bucket` son los de su PENDIENTE MAS ANTIGUO: la partida con saldo que lleva
 * mas dias. Es un resumen para listar el folio en un renglon, y es exacto cuando
 * el folio tiene una sola partida. Cuando lo pendiente abarca entregas de fechas
 * distintas, el reparto real por tramo esta en `tramos`, que suma lo mismo que
 * `saldo` y es lo que hay que mostrar para que la tabla y el aging digan lo
 * mismo del mismo dinero.
 */
export interface SaldoVenta {
  readonly folio: string;
  readonly cliente: string;
  readonly fecha: Date | null;
  readonly precioVenta: Centavos;
  readonly cobrado: Centavos;
  readonly saldo: Centavos;
  /** Dias usados para el bucket. null si la partida de referencia no tiene fecha. */
  readonly dias: number | null;
  /**
   * Si hay `dias_credito` se mide `dias_vencido`; si no, `dias_antiguedad`.
   * Se documenta cual se uso porque cambia por completo la lectura del aging.
   */
  readonly base: BaseAntiguedad;
  readonly bucket: ClaveBucket;
  /** Las partidas computables del folio, en el orden del archivo. Nunca vacio. */
  readonly partidas: readonly SaldoPartida[];
  /**
   * El saldo del folio repartido por tramo, del mas antiguo al mas fresco y
   * "sin fecha" al final. Solo tramos con pendiente: vacio si el folio no debe
   * nada. Su suma es `saldo`, y sumado entre folios es `aging.porBucket`.
   */
  readonly tramos: readonly TramoFolio[];
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
 * Dias de antiguedad de una partida al corte. Su fecha es la de entrega, y los
 * dias de credito son los de su folio, que ya trae resueltos.
 *
 *   con dias_credito: dias_vencido    = corte - (fecha + dias_credito)
 *   sin dias_credito: dias_antiguedad = corte - fecha
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
 * Orden de entrega de las partidas de un folio, como indices sobre la lista.
 *
 * La mas antigua primero. Dos partidas con la misma fecha conservan el orden de
 * las filas. Una partida sin fecha no se puede ordenar: va al final, tambien en
 * el orden de las filas.
 */
export function ordenDeEntrega(partidas: readonly Venta[]): readonly number[] {
  const tiempo = (i: number): number => partidas[i]?.fecha?.getTime() ?? Number.POSITIVE_INFINITY;
  return partidas.map((_, i) => i).sort((a, b) => tiempo(a) - tiempo(b) || a - b);
}

/**
 * Reparte lo cobrado de un folio entre sus partidas, en orden de entrega.
 *
 * Cada partida se cubre hasta su precio antes de pasar a la siguiente, asi que
 * lo que queda sin pagar es lo ultimo entregado. Devuelve lo aplicado a cada
 * partida, en el orden de la lista recibida; la suma es exactamente `cobrado`.
 *
 * Si sobra —un sobrecobro— el exceso se carga a la ULTIMA PARTIDA CON FECHA, que
 * queda con saldo negativo en su tramo. Solo si ninguna tiene fecha va a la
 * ultima de la lista. Mandarlo a una partida sin fecha habiendo otras fechadas
 * pondria un saldo a favor en el tramo "sin fecha", que no dice nada de cuando
 * se pago de mas. Lo mismo vale para un cobrado negativo (una nota de credito
 * sin abonos que la compensen): el folio debe mas que su precio, y ese extra se
 * carga al mismo lugar.
 */
export function aplicarPagos(partidas: readonly Venta[], cobrado: Centavos): readonly Centavos[] {
  const aplicado: Centavos[] = partidas.map(() => 0);
  const orden = ordenDeEntrega(partidas);
  let resto = cobrado;
  let ultimaFechada: number | null = null;
  for (const i of orden) {
    const partida = partidas[i];
    if (partida === undefined) continue;
    if (partida.fecha !== null) ultimaFechada = i;
    const cubre = Math.min(Math.max(resto, 0), Math.max(partida.precio_venta ?? 0, 0));
    aplicado[i] = cubre;
    resto -= cubre;
  }
  const destino = ultimaFechada ?? orden[orden.length - 1];
  if (resto !== 0 && destino !== undefined) aplicado[destino] = (aplicado[destino] ?? 0) + resto;
  return aplicado;
}

/**
 * La partida que resume al folio en un renglon: su pendiente mas antiguo.
 *
 * Entre las partidas con saldo, la fechada que lleva mas dias; si lo pendiente
 * esta solo en partidas sin fecha, la primera de ellas. Un folio sin nada
 * pendiente se resume con su primera entrega.
 */
function partidaDeReferencia(partidas: readonly SaldoPartida[], orden: readonly number[]): SaldoPartida | undefined {
  let referencia: SaldoPartida | undefined;
  for (const i of orden) {
    const p = partidas[i];
    if (p === undefined || p.saldo === 0) continue;
    if (referencia === undefined) referencia = p;
    else if (p.dias !== null && (referencia.dias === null || p.dias > referencia.dias)) referencia = p;
  }
  const primera = orden[0];
  return referencia ?? (primera === undefined ? undefined : partidas[primera]);
}

/** Del tramo mas antiguo al mas fresco; "sin fecha" al final, porque no compite en la escala. */
const ORDEN_TRAMOS: readonly ClaveBucket[] = ["+180", "91-180", "61-90", "31-60", "0-30", BUCKET_SIN_FECHA];

/** Suma los pendientes de las partidas de un folio por tramo. Es la unica cuenta de este reparto. */
export function tramosDeFolio(partidas: readonly SaldoPartida[]): readonly TramoFolio[] {
  const tramos: TramoFolio[] = [];
  for (const bucket of ORDEN_TRAMOS) {
    let saldo = 0;
    let dias: number | null = null;
    for (const p of partidas) {
      if (p.bucket !== bucket || p.saldo === 0) continue;
      saldo += p.saldo;
      if (p.dias !== null && (dias === null || p.dias > dias)) dias = p.dias;
    }
    if (saldo !== 0) tramos.push({ bucket, saldo, dias });
  }
  return tramos;
}

/**
 * Cartera completa al corte indicado.
 *
 * Solo entran las partidas computables: una Demo no genera cartera, y en un
 * folio que mezcla Demo y ventas los pagos se aplican a las que cuentan. Al
 * aging entra TODO pendiente distinto de cero, incluido el negativo de un folio
 * sobrecobrado: si se descartara, la suma de los buckets dejaria de ser el
 * saldo total y el aging diria tener mas cartera de la que hay. Una partida
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

  for (const { folio, partidas } of agruparFolios(incluidas)) {
    const cobradoFolio = cobrado.get(folio) ?? 0;
    const aplicado = aplicarPagos(partidas, cobradoFolio);

    let precioFolio = 0;
    const saldos = partidas.map((partida, i): SaldoPartida => {
      const precioVenta = partida.precio_venta ?? 0;
      const aplicadoPartida = aplicado[i] ?? 0;
      const { dias, base } = diasDeVenta(partida, opciones.fechaCorte);
      const bucket: ClaveBucket = dias === null ? BUCKET_SIN_FECHA : bucketDe(dias);
      const saldo = precioVenta - aplicadoPartida;
      precioFolio += precioVenta;
      if (saldo !== 0) porBucket[bucket] += saldo;
      return {
        linea: partida.linea,
        modelo: partida.modelo,
        fecha: partida.fecha,
        precioVenta,
        aplicado: aplicadoPartida,
        saldo,
        dias,
        base,
        bucket,
      };
    });

    const referencia = partidaDeReferencia(saldos, ordenDeEntrega(partidas));
    const cabecera = partidas[0];
    if (referencia === undefined || cabecera === undefined) continue;

    const saldo = precioFolio - cobradoFolio;
    detalle.push({
      folio,
      cliente: cabecera.cliente,
      fecha: referencia.fecha,
      precioVenta: precioFolio,
      cobrado: cobradoFolio,
      saldo,
      dias: referencia.dias,
      base: referencia.base,
      bucket: referencia.bucket,
      partidas: saldos,
      tramos: tramosDeFolio(saldos),
    });

    ventaTotal += precioFolio;
    cobradoTotal += cobradoFolio;
    saldoTotal += saldo;
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
