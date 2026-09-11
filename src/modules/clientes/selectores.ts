import type { Tono } from "../../components/ui/primitivas";
import {
  type Cartera,
  type Centavos,
  type ClaveBucket,
  type Cliente,
  type Clientes,
  LINEA_ACCESORIO,
  type Producto,
  type SaldoVenta,
  divSegura,
} from "../../lib/calc";
import { type Dataset, norm } from "../../lib/schema";
import { exposicionPorCliente, tonoDeBucket } from "../cobranza/selectores";

/**
 * Logica de PRESENTACION del modulo de clientes.
 *
 * Ingreso y saldo son cosas distintas y aqui se tratan asi: el ingreso ordena
 * la tabla (quien pesa mas en el negocio) y el saldo solo colorea SU celda
 * segun lo viejo que este (quien preocupa). El mejor cliente puede tener una
 * venta reciente a credito y eso no es un riesgo; pintar su fila de rojo seria
 * un error de lectura grave.
 */

// --------------------------- Tabla de concentracion ---------------------------

export interface FilaCliente extends Cliente {
  /**
   * Tramo de antiguedad mas viejo en el que el cliente debe. null si no debe
   * nada, o si no hay hoja de cobranza contra la cual medirlo.
   */
  readonly tramo: ClaveBucket | null;
  /** Tono de la celda del saldo, y de nada mas. */
  readonly tonoSaldo: Tono;
}

/**
 * Tono de la celda del saldo.
 *
 * - Sin saldo: neutro. Un cliente al corriente no se colorea.
 * - Saldo negativo (se cobro de mas): advertencia, porque es un error de
 *   captura o un anticipo que hay que aclarar.
 * - Con saldo: el tono del tramo mas viejo, el mismo criterio que Cobranza.
 *   Una venta reciente a credito queda neutra; solo +180 es riesgo.
 * - Sin hoja de cobranza: neutro. Sin abonos capturados, "saldo" es la venta
 *   completa y colorearla por antiguedad acusaria a todos.
 */
export function tonoDeSaldo(saldo: Centavos, tramo: ClaveBucket | null, conCobranza: boolean): Tono {
  if (!conCobranza || saldo === 0) return "neutro";
  if (saldo < 0) return "advertencia";
  return tramo === null ? "neutro" : tonoDeBucket(tramo);
}

/**
 * Los clientes del motor, en su orden (ingreso descendente), con el tramo y
 * el tono del saldo. El tramo viene de `exposicionPorCliente` de Cobranza, que
 * agrupa con la misma clave normalizada que el motor.
 */
export function filasClientes(
  clientes: Clientes,
  cartera: Cartera,
  conCobranza: boolean,
): readonly FilaCliente[] {
  const tramos = new Map(exposicionPorCliente(cartera).map((e) => [e.clave, e.bucketMasAntiguo]));
  return clientes.detalle.map((c): FilaCliente => {
    const tramo = conCobranza ? (tramos.get(c.clave) ?? null) : null;
    return Object.assign({ tramo, tonoSaldo: tonoDeSaldo(c.saldo, tramo, conCobranza) }, c);
  });
}

// --------------------------- Operaciones de un cliente ---------------------------

export interface OperacionCliente extends SaldoVenta {
  readonly linea: string | null;
  readonly modelo: string | null;
  readonly tonoSaldo: Tono;
}

/**
 * Las ventas computables de un cliente, en orden cronologico (sin fecha al
 * final), con linea y modelo unidos desde el dataset.
 *
 * Salen de `cartera.detalle`, que ya trae la Demo excluida y el saldo del
 * motor: la suma de estas operaciones reproduce el ingreso y el saldo del
 * cliente, y la prueba lo exige.
 */
export function operacionesDe(
  clave: string,
  cartera: Cartera,
  dataset: Dataset | null,
  conCobranza: boolean,
): readonly OperacionCliente[] {
  const venta = new Map((dataset?.ventas ?? []).map((v) => [v.folio, v]));
  return cartera.detalle
    .filter((s) => norm(s.cliente) === clave)
    .map(
      (s): OperacionCliente =>
        Object.assign(
          {
            linea: venta.get(s.folio)?.linea ?? null,
            modelo: venta.get(s.folio)?.modelo ?? null,
            tonoSaldo: tonoDeSaldo(s.saldo, s.saldo > 0 ? s.bucket : null, conCobranza),
          },
          s,
        ),
    )
    .sort((a, b) => {
      if (a.fecha === null && b.fecha === null) return a.folio.localeCompare(b.folio);
      if (a.fecha === null) return 1;
      if (b.fecha === null) return -1;
      return a.fecha.getTime() - b.fecha.getTime() || a.folio.localeCompare(b.folio);
    });
}

// --------------------------- Venta cruzada ---------------------------

export interface VentaCruzada {
  readonly compradoresEquipo: number;
  readonly conAccesorio: number;
  /** conAccesorio / compradoresEquipo. null si nadie compro equipo. */
  readonly attachRate: number | null;
  readonly ingresoAccesorios: Centavos;
  /** Ingreso por accesorios sobre el ingreso total. null sin ingreso. */
  readonly pctIngreso: number | null;
  readonly sinAccesorio: readonly string[];
  /**
   * ¿El negocio vendio algun accesorio en el periodo?
   *
   * Sin una sola operacion de esa linea el attach rate vale 0 y se leeria como
   * el peor desempeno posible, cuando la metrica simplemente no aplica. La
   * vista lo dice asi en vez de pintar un 0% en ambar.
   */
  readonly hayAccesorios: boolean;
}

/**
 * Las cifras de venta cruzada, tomadas del motor: el attach rate de
 * `clientes.ts` y el ingreso de la linea de accesorios de `producto.ts`. Sin
 * esa linea en el archivo el ingreso es cero, que es cierto, no un hueco.
 */
export function ventaCruzada(clientes: Clientes, producto: Producto, ventaTotal: Centavos): VentaCruzada {
  const accesorios = producto.porLinea.find((l) => l.clave === LINEA_ACCESORIO);
  const ingresoAccesorios = accesorios?.ingreso ?? 0;
  return {
    compradoresEquipo: clientes.attachRate.clientesConEquipo,
    conAccesorio: clientes.attachRate.clientesConAmbos,
    attachRate: clientes.attachRate.tasa,
    ingresoAccesorios,
    pctIngreso: divSegura(ingresoAccesorios, ventaTotal),
    sinAccesorio: clientes.attachRate.sinAccesorio,
    hayAccesorios: clientes.attachRate.operacionesAccesorio > 0,
  };
}
