import { type Dataset, type Parametros, type Venta, norm } from "../schema";

import { type Centavos, type VentaExcluida, divSegura, particionarVentas } from "./base";
import { calcularVenta } from "./venta";

/**
 * Rendimiento por producto: unidades, ingreso, utilidad y margen, agrupado por
 * linea y por modelo.
 *
 * Se agrupa SIEMPRE por la clave normalizada con `norm()`. Sin eso "T70p" y
 * "T70P" se reportan como dos modelos distintos y el reporte se duplica.
 */

export interface GrupoProducto {
  /** Clave normalizada con la que se agrupo (mayusculas, sin espacios sobrantes). */
  readonly clave: string;
  /** Como aparecio la primera vez en el archivo, para mostrarlo tal cual. */
  readonly etiqueta: string;
  /** Numero de operaciones. La plantilla no captura cantidad por fila. */
  readonly unidades: number;
  readonly ingreso: Centavos;
  readonly costo: Centavos;
  readonly utilidadBruta: Centavos;
  readonly comision: Centavos;
  readonly utilidadContribucion: Centavos;
  /** utilidad_bruta / ingreso. null si el grupo no vendio nada. */
  readonly margenPct: number | null;
  /** Participacion del grupo en el ingreso total. null si no hubo ingreso. */
  readonly participacion: number | null;
}

/** Una linea con los modelos que se vendieron dentro de ella. */
export interface LineaProducto extends GrupoProducto {
  /**
   * Modelos de ESTA linea, ordenados por ingreso. Su `participacion` es sobre
   * el ingreso TOTAL, no sobre el de la linea: es la columna "% del ingreso"
   * del reporte y debe poder sumarse entre lineas.
   */
  readonly modelos: readonly GrupoProducto[];
}

export interface Producto {
  readonly porLinea: readonly GrupoProducto[];
  readonly porModelo: readonly GrupoProducto[];
  /**
   * Linea -> modelo, en el orden de `porLinea`. Cada linea es el subtotal de
   * sus modelos: la suma de los modelos reproduce la linea campo por campo.
   */
  readonly detalle: readonly LineaProducto[];
  readonly excluidas: readonly VentaExcluida[];
}

interface Acumulado {
  etiqueta: string;
  unidades: number;
  ingreso: number;
  costo: number;
  utilidadBruta: number;
  comision: number;
  utilidadContribucion: number;
}

/**
 * Agrupa ventas YA computables bajo la clave que devuelva `claveDe`.
 *
 * `ingresoTotal` entra por parametro para que la participacion se mida siempre
 * contra el ingreso de todo el periodo, aunque se agrupe un subconjunto (los
 * modelos de una sola linea).
 */
function agrupar(
  ventas: readonly Venta[],
  parametros: Parametros,
  ingresoTotal: Centavos,
  claveDe: (venta: Venta) => { clave: string; etiqueta: string },
): GrupoProducto[] {
  const mapa = new Map<string, Acumulado>();

  for (const venta of ventas) {
    const { clave, etiqueta } = claveDe(venta);
    const c = calcularVenta(venta, parametros);
    const precio = venta.precio_venta ?? 0;

    let g = mapa.get(clave);
    if (g === undefined) {
      g = {
        etiqueta,
        unidades: 0,
        ingreso: 0,
        costo: 0,
        utilidadBruta: 0,
        comision: 0,
        utilidadContribucion: 0,
      };
      mapa.set(clave, g);
    }

    g.unidades += 1;
    g.ingreso += precio;
    g.costo += venta.costo_unitario ?? 0;
    g.utilidadBruta += c.utilidadBruta;
    g.comision += c.comisionMonto;
    g.utilidadContribucion += c.utilidadContribucion;
  }

  return [...mapa.entries()]
    .map(([clave, g]): GrupoProducto => ({
      clave,
      etiqueta: g.etiqueta,
      unidades: g.unidades,
      ingreso: g.ingreso,
      costo: g.costo,
      utilidadBruta: g.utilidadBruta,
      comision: g.comision,
      utilidadContribucion: g.utilidadContribucion,
      margenPct: divSegura(g.utilidadBruta, g.ingreso),
      participacion: divSegura(g.ingreso, ingresoTotal),
    }))
    .sort((a, b) => b.ingreso - a.ingreso || a.clave.localeCompare(b.clave));
}

const porLineaDe = (v: Venta) => ({ clave: norm(v.linea), etiqueta: v.linea });
const porModeloDe = (v: Venta) => ({ clave: norm(v.modelo), etiqueta: v.modelo.trim() });

export function calcularProducto(dataset: Dataset): Producto {
  const { incluidas, excluidas } = particionarVentas(dataset.ventas);
  const { parametros } = dataset;

  let ingresoTotal = 0;
  for (const venta of incluidas) ingresoTotal += venta.precio_venta ?? 0;

  const porLinea = agrupar(incluidas, parametros, ingresoTotal, porLineaDe);

  // Cada linea se arma con SUS ventas; asi un modelo que existiera en dos
  // lineas aparece en ambas, cada vez con lo que vendio en esa linea.
  const detalle = porLinea.map(
    (linea): LineaProducto =>
      Object.assign(
        {
          modelos: agrupar(
            incluidas.filter((v) => norm(v.linea) === linea.clave),
            parametros,
            ingresoTotal,
            porModeloDe,
          ),
        },
        linea,
      ),
  );

  return {
    porLinea,
    porModelo: agrupar(incluidas, parametros, ingresoTotal, porModeloDe),
    detalle,
    excluidas,
  };
}
