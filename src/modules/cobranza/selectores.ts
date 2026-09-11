import type { EstiloSegmento } from "../../components/ui/BarraBuckets";
import type { Tono } from "../../components/ui/primitivas";
import {
  BUCKET_SIN_FECHA,
  CLAVES_BUCKET,
  type Cartera,
  type Centavos,
  type ClaveBucket,
  type SaldoVenta,
  divSegura,
} from "../../lib/calc";
import { type Cobranza, type Dataset, norm } from "../../lib/schema";

/**
 * Logica de PRESENTACION del modulo de cobranza.
 *
 * No calcula dinero: el motor ya lo hizo. Aqui solo se decide como se ordena,
 * como se agrupa para la pantalla y que tono le toca a cada cosa. Todo es puro y
 * se prueba en node, sin renderizar nada.
 */

// --------------------------- Buckets ---------------------------

/** Etiqueta de cada bucket tal como se lee en el reporte. */
export const ETIQUETA_BUCKET: Readonly<Record<ClaveBucket, string>> = {
  "0-30": "0 a 30 días",
  "31-60": "31 a 60 días",
  "61-90": "61 a 90 días",
  "91-180": "91 a 180 días",
  "+180": "Más de 180 días",
  [BUCKET_SIN_FECHA]: "Sin fecha",
};

/**
 * Estilo del segmento por bucket.
 *
 * La escala va de fresco a critico conforme envejece la deuda. `sin-fecha` NO
 * entra en esa escala: no es deuda mas o menos vieja, es deuda que no sabemos
 * clasificar, y pintarla dentro del gradiente sugeriria una antiguedad que no
 * tenemos.
 */
export const ESTILO_BUCKET: Readonly<Record<ClaveBucket, EstiloSegmento>> = {
  "0-30": "fresco",
  "31-60": "vigilar",
  "61-90": "tension",
  "91-180": "riesgo",
  "+180": "critico",
  [BUCKET_SIN_FECHA]: "indefinido",
};

/** Tono de fila por bucket. Solo el tramo critico tine la fila en riesgo. */
export function tonoDeBucket(bucket: ClaveBucket): Tono {
  if (bucket === "+180") return "riesgo";
  if (bucket === BUCKET_SIN_FECHA) return "advertencia";
  if (bucket === "91-180") return "advertencia";
  return "neutro";
}

/**
 * Buckets a mostrar, en orden fijo.
 *
 * `sin-fecha` se incluye SIEMPRE que tenga monto, aunque en el archivo actual
 * valga cero: es un hueco de captura que el usuario debe ver. Los demas se
 * muestran siempre para que la escala no cambie de forma entre cortes.
 */
export function bucketsVisibles(cartera: Cartera): readonly ClaveBucket[] {
  return CLAVES_BUCKET.filter(
    (b) => b !== BUCKET_SIN_FECHA || cartera.aging.porBucket[BUCKET_SIN_FECHA] > 0,
  );
}

// --------------------------- Base de la antiguedad ---------------------------

export type BaseMedicion = "vencimiento" | "antiguedad" | "mixta" | "ninguna";

/**
 * Contra que se esta midiendo la antiguedad de la cartera.
 *
 * Cambia por completo la lectura del aging: 200 dias desde la venta no es lo
 * mismo que 200 dias despues del vencimiento pactado. El usuario tiene que
 * saber cual esta viendo, y en un archivo pueden convivir las dos.
 */
export function baseDeMedicion(cartera: Cartera): BaseMedicion {
  const conSaldo = cartera.detalle.filter((s) => s.saldo > 0 && s.fecha !== null);
  if (conSaldo.length === 0) return "ninguna";
  const vencido = conSaldo.some((s) => s.base === "vencido");
  const antiguedad = conSaldo.some((s) => s.base === "antiguedad");
  if (vencido && antiguedad) return "mixta";
  return vencido ? "vencimiento" : "antiguedad";
}

export const TEXTO_BASE: Readonly<Record<BaseMedicion, string>> = {
  vencimiento:
    "La antigüedad se mide desde el vencimiento pactado: los días mostrados son días VENCIDOS.",
  antiguedad:
    "Ninguna venta con saldo tiene días de crédito capturados, así que la antigüedad se mide desde la fecha de la venta, no desde un vencimiento.",
  mixta:
    "Medición mixta: las ventas con días de crédito se miden desde su vencimiento y el resto desde la fecha de venta. La columna «base» lo indica fila por fila.",
  ninguna: "No hay saldos con fecha que permitan medir antigüedad.",
};

// --------------------------- Saldos pendientes ---------------------------

/**
 * Fila de la tabla de saldos.
 *
 * `SaldoVenta` no trae el modelo porque al motor no le hace falta para calcular
 * cartera. Se une aqui desde el dataset, que es trabajo de presentacion: no se
 * recalcula ningun importe.
 */
export interface FilaSaldo extends SaldoVenta {
  readonly modelo: string | null;
}

/**
 * Filas de la tabla de saldos: solo las que tienen saldo distinto de cero,
 * ordenadas por dias descendente.
 *
 * Un saldo NEGATIVO (mas cobrado que el precio) se conserva y se muestra: es un
 * error de captura o un anticipo, y esconderlo o ponerlo en cero le quita al
 * usuario justo la senal que necesita.
 *
 * Una venta sin fecha entra con `dias: null`, que la tabla pinta como raya.
 */
export function saldosPendientes(
  cartera: Cartera,
  dataset: Dataset | null,
): readonly FilaSaldo[] {
  const modeloDe = new Map<string, string>();
  for (const v of dataset?.ventas ?? []) modeloDe.set(v.folio, v.modelo);

  return cartera.detalle
    .filter((s) => s.saldo !== 0)
    .map((s): FilaSaldo => Object.assign({ modelo: modeloDe.get(s.folio) ?? null }, s))
    .sort((a, b) => {
      // Sin fecha al final: no tienen antiguedad con la que competir.
      if (a.dias === null && b.dias === null) return a.folio.localeCompare(b.folio);
      if (a.dias === null) return 1;
      if (b.dias === null) return -1;
      return b.dias - a.dias || a.folio.localeCompare(b.folio);
    });
}

/** Abonos capturados contra un folio de venta, en orden cronologico. */
export function abonosDe(dataset: Dataset, folio: string): readonly Cobranza[] {
  return dataset.cobranza
    .filter((c) => c.folio_venta === folio)
    .sort((a, b) => {
      if (a.fecha_pago === null && b.fecha_pago === null) return 0;
      if (a.fecha_pago === null) return 1;
      if (b.fecha_pago === null) return -1;
      return a.fecha_pago.getTime() - b.fecha_pago.getTime();
    });
}

/** ¿Ningun abono de esta venta trae fecha? Cambia lo que se muestra en el detalle. */
export function sinFechasDePago(abonos: readonly Cobranza[]): boolean {
  return abonos.length > 0 && abonos.every((a) => a.fecha_pago === null);
}

// --------------------------- Concentracion por cliente ---------------------------

export interface ExposicionCliente {
  readonly clave: string;
  readonly nombre: string;
  readonly operaciones: number;
  readonly venta: Centavos;
  readonly cobrado: Centavos;
  readonly saldo: Centavos;
  /** Participacion en el saldo total. null si no hay cartera. */
  readonly participacion: number | null;
  /** Bucket mas antiguo en el que este cliente tiene saldo. */
  readonly bucketMasAntiguo: ClaveBucket | null;
}

/** Orden de severidad de los buckets, de mas fresco a mas antiguo. */
const SEVERIDAD: readonly ClaveBucket[] = ["0-30", "31-60", "61-90", "91-180", "+180"];

/**
 * Cual de dos buckets es "mas antiguo" para efectos de urgencia de cobro.
 * `sin-fecha` no compite en la escala: solo gana si no hay ningun otro.
 */
function masAntiguo(a: ClaveBucket | null, b: ClaveBucket): ClaveBucket {
  if (a === null) return b;
  if (a === BUCKET_SIN_FECHA) return b === BUCKET_SIN_FECHA ? a : b;
  if (b === BUCKET_SIN_FECHA) return a;
  return SEVERIDAD.indexOf(b) > SEVERIDAD.indexOf(a) ? b : a;
}

/**
 * Exposicion crediticia por cliente, ordenada por saldo descendente.
 *
 * El orden responde "¿a quien le hablo primero?", asi que va por monto expuesto,
 * nunca alfabetico. Se construye desde `cartera.detalle`, que ya trae la Demo
 * excluida y el saldo calculado por el motor.
 */
export function exposicionPorCliente(cartera: Cartera): readonly ExposicionCliente[] {
  const mapa = new Map<string, {
    nombre: string;
    operaciones: number;
    venta: number;
    cobrado: number;
    saldo: number;
    bucket: ClaveBucket | null;
  }>();

  for (const s of cartera.detalle) {
    // La misma clave que usa el motor en `clientes.ts`, para poder cruzarlas.
    const clave = norm(s.cliente);
    let a = mapa.get(clave);
    if (a === undefined) {
      a = { nombre: s.cliente.trim(), operaciones: 0, venta: 0, cobrado: 0, saldo: 0, bucket: null };
      mapa.set(clave, a);
    }
    a.operaciones += 1;
    a.venta += s.precioVenta;
    a.cobrado += s.cobrado;
    a.saldo += s.saldo;
    // El bucket mas antiguo se toma solo de las ventas que siguen debiendo.
    if (s.saldo > 0) a.bucket = masAntiguo(a.bucket, s.bucket);
  }

  return [...mapa.entries()]
    .map(([clave, a]): ExposicionCliente => ({
      clave,
      nombre: a.nombre,
      operaciones: a.operaciones,
      venta: a.venta,
      cobrado: a.cobrado,
      saldo: a.saldo,
      participacion: divSegura(a.saldo, cartera.saldoTotal),
      bucketMasAntiguo: a.bucket,
    }))
    .sort((x, y) => y.saldo - x.saldo || x.nombre.localeCompare(y.nombre, "es-MX"));
}

// --------------------------- Provision ---------------------------

export interface Escenario {
  readonly clave: string;
  readonly nombre: string;
  readonly pct91180: number;
  readonly pctMas180: number;
}

/**
 * Los cuatro escenarios de referencia. FIJOS: no dependen de los parametros.
 *
 * Existen para dar el RANGO de la exposicion, no para reflejar la
 * configuracion: el socio necesita ver cuanto cuesta la cartera vieja desde
 * "nada se pierde" hasta "se pierde todo lo de mas de 180 dias", sin importar
 * que tasas haya decidido aplicar. Lo que el usuario decide aplicar es otra
 * cosa y va en su propia fila (ver `filasEscenarios`).
 *
 * Con el archivo de demostracion dan 0 · $167,500 · $364,500 · $729,000.
 *
 * INVARIANTE: cada escenario tiene tasas mayores o iguales que el anterior en
 * AMBOS tramos. Eso garantiza que la provision nunca baja de un escenario al
 * siguiente, sea cual sea el reparto de la cartera. Una tabla donde el peor
 * caso sale menos malo que el conservador destruye la credibilidad del
 * reporte; por eso Pesimista tambien toca 91-180, y la prueba lo exige.
 */
export const ESCENARIOS: readonly Escenario[] = [
  { clave: "sin", nombre: "Sin provisión", pct91180: 0, pctMas180: 0 },
  { clave: "moderado", nombre: "Moderado", pct91180: 0, pctMas180: 0.25 },
  { clave: "conservador", nombre: "Conservador", pct91180: 0.25, pctMas180: 0.5 },
  { clave: "pesimista", nombre: "Pesimista", pct91180: 0.5, pctMas180: 1 },
];

export interface ResultadoEscenario {
  readonly clave: string;
  readonly nombre: string;
  readonly pct91180: number;
  readonly pctMas180: number;
  readonly provision: Centavos;
  /** Utilidad de contribucion menos la provision. */
  readonly utilidadAjustada: Centavos;
  /** Cuanto se come la provision respecto de la utilidad sin provisionar. */
  readonly variacion: number | null;
}

/**
 * Provision de un escenario: saldo_91_180 * pct + saldo_mas_180 * pct.
 *
 * Reproduce la definicion del motor, pero con tasas arbitrarias para poder
 * simular. El motor sigue siendo la fuente de verdad del escenario vigente.
 */
export function provisionDe(
  porBucket: Readonly<Record<ClaveBucket, Centavos>>,
  pct91180: number,
  pctMas180: number,
): Centavos {
  return Math.round(porBucket["91-180"] * pct91180 + porBucket["+180"] * pctMas180);
}

/**
 * Evalua un escenario contra la utilidad de contribucion del periodo.
 *
 * `variacion` es la proporcion de la utilidad que se llevaria la provision.
 * Devuelve null si no hay utilidad contra la cual comparar: dividir entre cero
 * daria Infinity y un porcentaje infinito en un reporte financiero no significa
 * nada.
 */
export function evaluarEscenario(
  escenario: Escenario,
  porBucket: Readonly<Record<ClaveBucket, Centavos>>,
  utilidadContribucion: Centavos,
): ResultadoEscenario {
  const provision = provisionDe(porBucket, escenario.pct91180, escenario.pctMas180);
  return {
    clave: escenario.clave,
    nombre: escenario.nombre,
    pct91180: escenario.pct91180,
    pctMas180: escenario.pctMas180,
    provision,
    utilidadAjustada: utilidadContribucion - provision,
    variacion: divSegura(-provision, utilidadContribucion),
  };
}

/** Los cuatro escenarios de referencia evaluados, en su orden fijo. */
export function evaluarEscenarios(
  porBucket: Readonly<Record<ClaveBucket, Centavos>>,
  utilidadContribucion: Centavos,
): readonly ResultadoEscenario[] {
  return ESCENARIOS.map((e) => evaluarEscenario(e, porBucket, utilidadContribucion));
}

/** ¿El escenario usa exactamente estas tasas? */
export function mismasTasas(escenario: Escenario, pct91180: number, pctMas180: number): boolean {
  return escenario.pct91180 === pct91180 && escenario.pctMas180 === pctMas180;
}

export interface FilaEscenario extends ResultadoEscenario {
  /** Es la fila de las tasas que el usuario aplica en todo el reporte. */
  readonly aplicada: boolean;
  /**
   * Nombre del escenario de referencia con las mismas tasas, si alguno
   * coincide. Solo en la fila aplicada; null en las de referencia.
   */
  readonly coincideCon: string | null;
}

/**
 * La tabla de escenarios: los cuatro de referencia y, siempre al final, la
 * fila "Tasas aplicadas" con los parametros del store.
 *
 * Las cuatro de referencia nunca cambian. La aplicada si, con cada movimiento
 * de los controles, y por eso va SIEMPRE en el mismo lugar: si se reacomodara
 * por severidad, la fila saltaria de posicion mientras el usuario arrastra el
 * control y no podria seguirla con la vista. Cuando sus tasas coinciden con
 * un escenario de referencia se dice cual, en lugar de esconder la fila.
 */
export function filasEscenarios(
  porBucket: Readonly<Record<ClaveBucket, Centavos>>,
  utilidadContribucion: Centavos,
  pct91180: number,
  pctMas180: number,
): readonly FilaEscenario[] {
  const referencia: FilaEscenario[] = ESCENARIOS.map((e) =>
    Object.assign(evaluarEscenario(e, porBucket, utilidadContribucion), {
      aplicada: false,
      coincideCon: null,
    }),
  );

  const aplicada: FilaEscenario = Object.assign(
    evaluarEscenario(
      { clave: "aplicado", nombre: "Tasas aplicadas", pct91180, pctMas180 },
      porBucket,
      utilidadContribucion,
    ),
    {
      aplicada: true,
      coincideCon: ESCENARIOS.find((e) => mismasTasas(e, pct91180, pctMas180))?.nombre ?? null,
    },
  );

  return [...referencia, aplicada];
}
