import type { PuntoCategoria, SerieGrafica } from "../../components/ui/datosGrafica";
import type { Enfasis } from "../../components/ui/tabla";
import {
  type Cascada,
  type Centavos,
  type GrupoProducto,
  type Producto,
  divSegura,
} from "../../lib/calc";

/**
 * Logica de PRESENTACION de Rendimiento por producto.
 *
 * El motor (`producto.ts`) ya agrupo linea -> modelo y garantiza que los
 * modelos suman su linea. Aqui solo se aplana eso en renglones de tabla con
 * su subtotal y se eligen los puntos de la grafica. No se suma dinero: los
 * subtotales son los grupos de linea del motor, no una suma hecha aqui.
 */

// --------------------------- Tabla ---------------------------

export interface FilaProducto {
  readonly id: string;
  readonly nivel: "modelo" | "subtotal";
  readonly linea: string;
  /** null en el subtotal: el renglon es de toda la linea. */
  readonly modelo: string | null;
  readonly unidades: number;
  readonly ingreso: Centavos;
  readonly costo: Centavos;
  readonly utilidadBruta: Centavos;
  readonly margenPct: number | null;
  /** Participacion en el ingreso total del periodo. */
  readonly participacion: number | null;
  readonly enfasis: Enfasis;
}

function fila(
  id: string,
  nivel: FilaProducto["nivel"],
  linea: string,
  modelo: string | null,
  g: GrupoProducto,
): FilaProducto {
  return {
    id,
    nivel,
    linea,
    modelo,
    unidades: g.unidades,
    ingreso: g.ingreso,
    costo: g.costo,
    utilidadBruta: g.utilidadBruta,
    margenPct: g.margenPct,
    participacion: g.participacion,
    enfasis: nivel === "subtotal" ? "subtotal" : "normal",
  };
}

/**
 * Cada linea: sus modelos por ingreso descendente y, al cierre, su subtotal.
 *
 * El subtotal ES el grupo de linea del motor. Si se armara sumando los
 * renglones de arriba, un error al agrupar quedaria escondido porque ambos
 * lados saldrian de la misma suma; asi la prueba puede compararlos.
 */
export function filasProducto(producto: Producto): readonly FilaProducto[] {
  return producto.detalle.flatMap((linea): FilaProducto[] => [
    ...linea.modelos.map((m) => fila(`${linea.clave}|${m.clave}`, "modelo", linea.etiqueta, m.etiqueta, m)),
    fila(`${linea.clave}|subtotal`, "subtotal", `Subtotal ${linea.etiqueta}`, null, linea),
  ]);
}

/**
 * Fila de total: la cascada del periodo del motor, no una suma de subtotales.
 * Unidades = operaciones: la plantilla no captura cantidad por fila.
 */
export function totalProducto(total: Cascada): FilaProducto {
  return {
    id: "total",
    nivel: "subtotal",
    linea: "Total",
    modelo: null,
    unidades: total.operaciones,
    ingreso: total.ventaTotal,
    costo: total.costoTotal,
    utilidadBruta: total.utilidadBruta,
    margenPct: total.margenPct,
    participacion: divSegura(total.ventaTotal, total.ventaTotal),
    enfasis: "total",
  };
}

// --------------------------- Grafica ---------------------------

/**
 * Como se nombra el recorte de la grafica de modelos. Vive junto a las series
 * para que el Resumen y el modulo de Producto digan exactamente lo mismo: la
 * unica diferencia entre los dos es donde esta el resto.
 */
export const RECORTE_MODELOS = {
  por: "ingreso",
  unidad: ["modelo", "modelos"],
  magnitud: "ingreso",
} as const;

export const SERIES_PRODUCTO: readonly SerieGrafica[] = [
  { clave: "ingreso", etiqueta: "Ingreso", color: "marino" },
  { clave: "utilidad", etiqueta: "Utilidad bruta", color: "positivo" },
];

/**
 * Ingreso y utilidad bruta por modelo, de mayor a menor ingreso.
 *
 * Devuelve TODOS los modelos. Cuantos caben legibles en el eje no lo sabe este
 * archivo: depende del ancho que tenga la grafica alli donde se pinte, y eso
 * solo se sabe midiendo. El recorte, y la nota que declara lo omitido, los hace
 * `Grafica` con `recorteCategorias`. Aqui solo se garantiza el ORDEN, que es lo
 * que vuelve correcto ese recorte: quedarse con los primeros es quedarse con
 * los de mayor ingreso.
 */
export function puntosProducto(producto: Producto): readonly PuntoCategoria[] {
  return producto.porModelo.map((m) => ({
    categoria: m.etiqueta,
    valores: { ingreso: m.ingreso, utilidad: m.utilidadBruta },
  }));
}
