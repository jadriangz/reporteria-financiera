import { type Dataset, norm } from "../schema";

import { type Centavos, type VentaExcluida, divSegura, particionarVentas } from "./base";
import { cobradoPorFolio } from "./cobranza";
import { calcularVenta } from "./venta";

/**
 * Analisis de clientes: concentracion, recurrencia, exposicion crediticia y
 * attach rate.
 *
 * El cliente se agrupa por `norm()`: un mismo nombre llega capturado con
 * espacios y capitalizacion distintos y, sin normalizar, se parte en dos
 * clientes que suman mal la concentracion y la exposicion.
 */

/** Lineas que definen el attach rate, segun el giro del cliente inicial. */
export const LINEA_EQUIPO = "EQUIPO";
export const LINEA_ACCESORIO = "ACCESORIOS";

export interface Cliente {
  readonly clave: string;
  readonly nombre: string;
  readonly operaciones: number;
  readonly ingreso: Centavos;
  readonly utilidadBruta: Centavos;
  readonly cobrado: Centavos;
  /** Saldo pendiente: la exposicion crediticia con este cliente. */
  readonly saldo: Centavos;
  /** Participacion en el ingreso total. null si no hubo ingreso. */
  readonly participacion: number | null;
  /** Lineas normalizadas que le compro. */
  readonly lineas: readonly string[];
  /** Mas de una operacion. */
  readonly recurrente: boolean;
}

export interface AttachRate {
  readonly clientesConEquipo: number;
  readonly clientesConAmbos: number;
  /** clientesConAmbos / clientesConEquipo. null si nadie compro equipo. */
  readonly tasa: number | null;
  /** Nombres de quienes compraron equipo pero no accesorios: la oportunidad. */
  readonly sinAccesorio: readonly string[];
  /**
   * Operaciones de la linea Accesorios en todo el periodo.
   *
   * AUSENCIA DE LINEA NO ES ATTACH BAJO. Un negocio que no vende accesorios da
   * tasa 0 y parece el peor attach rate posible, cuando en realidad la metrica
   * no le aplica. Quien concluya algo de `tasa` debe mirar esto primero.
   */
  readonly operacionesAccesorio: number;
}

export interface Concentracion {
  /** Participacion del cliente mas grande. null si no hubo ingreso. */
  readonly top1: number | null;
  readonly top3: number | null;
  readonly top5: number | null;
  /** Indice Herfindahl: 1 = un solo cliente. null si no hubo ingreso. */
  readonly hhi: number | null;
}

export interface Clientes {
  /** Ordenados por ingreso descendente. */
  readonly detalle: readonly Cliente[];
  readonly concentracion: Concentracion;
  readonly attachRate: AttachRate;
  readonly totalClientes: number;
  readonly recurrentes: number;
  /** Suma de saldos: exposicion crediticia total. */
  readonly exposicionTotal: Centavos;
  readonly excluidas: readonly VentaExcluida[];
}

interface Acumulado {
  nombre: string;
  operaciones: number;
  ingreso: number;
  utilidadBruta: number;
  cobrado: number;
  saldo: number;
  lineas: Set<string>;
}

/** Suma de las participaciones de los `n` clientes mas grandes. */
function acumuladoTop(ordenados: readonly Cliente[], n: number): number | null {
  const tramo = ordenados.slice(0, n);
  if (tramo.length === 0) return null;
  let total = 0;
  for (const c of tramo) {
    if (c.participacion === null) return null;
    total += c.participacion;
  }
  return total;
}

export function calcularClientes(dataset: Dataset): Clientes {
  const { incluidas, excluidas } = particionarVentas(dataset.ventas);
  const cobrado = cobradoPorFolio(dataset);

  const mapa = new Map<string, Acumulado>();
  let ingresoTotal = 0;

  for (const venta of incluidas) {
    const clave = norm(venta.cliente);
    const c = calcularVenta(venta, dataset.parametros);
    const precio = venta.precio_venta ?? 0;
    const cobradoVenta = cobrado.get(venta.folio) ?? 0;

    let a = mapa.get(clave);
    if (a === undefined) {
      a = {
        nombre: venta.cliente.trim(),
        operaciones: 0,
        ingreso: 0,
        utilidadBruta: 0,
        cobrado: 0,
        saldo: 0,
        lineas: new Set<string>(),
      };
      mapa.set(clave, a);
    }

    a.operaciones += 1;
    a.ingreso += precio;
    a.utilidadBruta += c.utilidadBruta;
    a.cobrado += cobradoVenta;
    a.saldo += precio - cobradoVenta;
    a.lineas.add(norm(venta.linea));
    ingresoTotal += precio;
  }

  const detalle: Cliente[] = [...mapa.entries()]
    .map(([clave, a]): Cliente => ({
      clave,
      nombre: a.nombre,
      operaciones: a.operaciones,
      ingreso: a.ingreso,
      utilidadBruta: a.utilidadBruta,
      cobrado: a.cobrado,
      saldo: a.saldo,
      participacion: divSegura(a.ingreso, ingresoTotal),
      lineas: [...a.lineas].sort(),
      recurrente: a.operaciones > 1,
    }))
    .sort((x, y) => y.ingreso - x.ingreso || x.clave.localeCompare(y.clave));

  const hhi = detalle.reduce<number | null>((acc, c) => {
    if (acc === null || c.participacion === null) return null;
    return acc + c.participacion * c.participacion;
  }, 0);

  const conEquipo = detalle.filter((c) => c.lineas.includes(LINEA_EQUIPO));
  const conAmbos = conEquipo.filter((c) => c.lineas.includes(LINEA_ACCESORIO));
  const operacionesAccesorio = incluidas.filter((v) => norm(v.linea) === LINEA_ACCESORIO).length;

  return {
    detalle,
    concentracion: {
      top1: acumuladoTop(detalle, 1),
      top3: acumuladoTop(detalle, 3),
      top5: acumuladoTop(detalle, 5),
      hhi: ingresoTotal === 0 ? null : hhi,
    },
    attachRate: {
      clientesConEquipo: conEquipo.length,
      clientesConAmbos: conAmbos.length,
      tasa: divSegura(conAmbos.length, conEquipo.length),
      sinAccesorio: conEquipo
        .filter((c) => !c.lineas.includes(LINEA_ACCESORIO))
        .map((c) => c.nombre),
      operacionesAccesorio,
    },
    totalClientes: detalle.length,
    recurrentes: detalle.filter((c) => c.recurrente).length,
    exposicionTotal: detalle.reduce((t, c) => t + c.saldo, 0),
    excluidas,
  };
}
