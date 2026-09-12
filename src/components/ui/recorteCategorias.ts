import { porcentaje } from "../../lib/format";

import type { PuntoCategoria } from "./datosGrafica";

/**
 * Qué hacer cuando en un eje de categorías ya no caben barras legibles.
 *
 * Es el problema que `rotuloEje` NO resuelve. Ese módulo se ocupa de que las
 * ETIQUETAS quepan; puede rotarlas y abreviarlas hasta que entren. Las BARRAS
 * no se pueden rotar ni abreviar: con doce modelos y dos series en 296 px cada
 * barra mide diez píxeles, los rótulos se leen perfectamente y aun así la
 * gráfica no dice nada, porque comparar dos franjas de diez píxeles no es
 * comparar.
 *
 * La salida es recortar a las principales y DECLARAR lo que quedó fuera. El
 * criterio es el ancho disponible por barra, no un número fijo de categorías ni
 * un umbral de pantalla: la misma gráfica puede estar en media pantalla de
 * escritorio o en un teléfono, y lo que manda es el espacio que tiene.
 *
 * POR QUÉ NO HAY UNA BARRA "OTROS". Se consideró y se descartó por tres razones:
 *
 * 1. **No es comparable con las demás.** Cada barra es un modelo; "Otros" sería
 *    la suma de varios. Su altura no dice "este modelo vende más", dice "hay
 *    muchos de estos", y las dos cosas se leen igual en el mismo eje. Es una
 *    comparación falsa presentada como verdadera.
 * 2. **Suele ser la barra más alta y aplasta al resto.** Justo lo contrario de
 *    lo que se buscaba al recortar: que las principales se vean.
 * 3. **No tiene nombre.** El eje es de categorías y cada marca identifica un
 *    producto; "Otros" no identifica nada, y en el tooltip tampoco.
 *
 * La nota, en cambio, dice CUÁNTOS quedaron fuera y QUÉ PROPORCIÓN representan.
 * Con eso el lector sabe si lo que no ve importa —"5 modelos más, 3% del
 * ingreso" se puede ignorar; "5 modelos más, 40% del ingreso" no— sin que la
 * gráfica mienta sobre la forma de los datos.
 *
 * Funciones puras: reciben ancho y puntos, devuelven qué mostrar. Se prueban en
 * node, igual que `rotuloEje`.
 */

/**
 * Ancho mínimo de UNA barra, en píxeles.
 *
 * Por debajo de esto una barra deja de leerse como una cantidad y se lee como
 * una raya: se distingue que está, no cuánto mide, y dos rayas contiguas se
 * funden en un solo trazo con la separación de 2 px que usa la gráfica.
 *
 * El número está MEDIDO, no supuesto: a 768 px los doce modelos del archivo de
 * demostración dan barras de 14 px y se comparan sin esfuerzo; a 360 px daban
 * 10 px y es el caso que motivó todo esto. Trece es el umbral que admite el
 * primero y rechaza el segundo.
 */
export const ANCHO_MINIMO_BARRA = 13;

/** Separación entre las barras de una misma categoría. Igual que `barGap`. */
export const SEPARACION_BARRAS = 2;

/**
 * `barCategoryGap` de la gráfica: el hueco a CADA LADO del grupo de barras
 * dentro de su categoría. Se descuenta dos veces, no una —es lo que la primera
 * versión de este cálculo tenía mal: predecía barras de 14 px donde el
 * navegador dibujaba 10, porque suponía un solo hueco por categoría—.
 *
 * Si se cambia en `GraficaLienzo`, se cambia aquí, o la cuenta de cuántas caben
 * deja de corresponder con lo que se dibuja.
 */
export const HUECO_ENTRE_CATEGORIAS = 0.22;

/**
 * Ancho mínimo que necesita una categoría completa: sus barras, la separación
 * entre ellas y los dos huecos que la separan de sus vecinas.
 */
export function anchoMinimoCategoria(series: number): number {
  const barras = Math.max(1, series);
  const contenido = barras * ANCHO_MINIMO_BARRA + (barras - 1) * SEPARACION_BARRAS;
  return Math.ceil(contenido / (1 - 2 * HUECO_ENTRE_CATEGORIAS));
}

/**
 * Cuántas categorías caben legibles en el ancho dado.
 *
 * Nunca menos de una: una gráfica con cero barras no es una gráfica más honesta,
 * es un hueco. Si ni una cabe, se dibuja esa y la nota dice todo lo demás.
 */
export function categoriasQueCaben(anchoDisponible: number, series: number): number {
  if (anchoDisponible <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(1, Math.floor(anchoDisponible / anchoMinimoCategoria(series)));
}

export interface Recorte {
  readonly visibles: readonly PuntoCategoria[];
  /** Cuántas categorías quedaron fuera. 0 = cabía todo. */
  readonly omitidas: number;
  /**
   * Proporción de la magnitud total que se quedó fuera. `null` cuando el total
   * es cero: sin total no hay proporción, y un 0% sería una afirmación distinta
   * de "no se puede calcular".
   */
  readonly proporcionOmitida: number | null;
}

export interface OpcionesRecorte {
  /** Ancho disponible para las categorías, ya sin el eje Y. */
  readonly anchoDisponible: number;
  /** Cuántas series se dibujan por categoría. */
  readonly series: number;
  /** Clave de la serie por la que se ordena y se mide lo omitido. */
  readonly clave: string;
  /**
   * `true` deja pasar todo sin recortar. Lo usa la impresión: el papel es de
   * ancho fijo y conocido, y un reporte impreso no debe depender del ancho que
   * tuviera la ventana al momento de imprimir.
   */
  readonly sinRecorte?: boolean;
}

/** Suma los valores de una clave, ignorando huecos. */
function sumar(puntos: readonly PuntoCategoria[], clave: string): number {
  let total = 0;
  for (const p of puntos) {
    const v = p.valores[clave];
    if (typeof v === "number" && Number.isFinite(v)) total += v;
  }
  return total;
}

/**
 * Recorta a las categorías que caben, en el orden en que llegan.
 *
 * NO reordena: los puntos llegan ya ordenados por la magnitud que importa —de
 * mayor a menor ingreso, en el caso de producto— y reordenar aquí escondería
 * ese contrato dentro de una función de presentación.
 */
export function recortarCategorias(
  puntos: readonly PuntoCategoria[],
  { anchoDisponible, series, clave, sinRecorte = false }: OpcionesRecorte,
): Recorte {
  const caben = sinRecorte
    ? Number.POSITIVE_INFINITY
    : categoriasQueCaben(anchoDisponible, series);

  if (caben >= puntos.length) {
    return { visibles: puntos, omitidas: 0, proporcionOmitida: null };
  }

  const visibles = puntos.slice(0, caben);
  const fuera = puntos.slice(caben);
  const total = sumar(puntos, clave);

  return {
    visibles,
    omitidas: fuera.length,
    proporcionOmitida: total === 0 ? null : sumar(fuera, clave) / total,
  };
}

export interface NombresRecorte {
  /** Cómo se llama una categoría: ["modelo", "modelos"]. */
  readonly unidad: readonly [string, string];
  /** La magnitud que ordena y que se mide: "ingreso". */
  readonly magnitud: string;
  /** Dónde está el resto: "en la tabla". */
  readonly dondeVerElResto: string;
}

/**
 * La nota al pie de la gráfica. `null` cuando no se recortó nada: una nota que
 * dice "no falta nada" es ruido.
 *
 * Siempre lleva las dos cifras: cuántas quedaron fuera y qué proporción pesan.
 * Sin la proporción el lector no puede saber si lo que no ve importa, que es la
 * única pregunta que esa nota tiene que contestar.
 */
export function textoRecorte(recorte: Recorte, nombres: NombresRecorte): string | null {
  if (recorte.omitidas === 0) return null;

  const [singular, plural] = nombres.unidad;
  const { magnitud, dondeVerElResto } = nombres;

  const mostrados = recorte.visibles.length;
  const cabecera =
    mostrados === 1
      ? `Se muestra el ${singular} de mayor ${magnitud}`
      : `Se muestran los ${mostrados} ${plural} de mayor ${magnitud}`;

  const queda = recorte.omitidas === 1 ? "Queda fuera" : "Quedan fuera";
  const cuantas = recorte.omitidas === 1 ? `1 ${singular} más` : `${recorte.omitidas} ${plural} más`;
  // Sin total no hay proporción, y callarla es preferible a inventar un 0%.
  const peso =
    recorte.proporcionOmitida === null
      ? ""
      : `, ${porcentaje(recorte.proporcionOmitida, 0)} del ${magnitud}`;

  return `${cabecera}. ${queda} ${cuantas}${peso}, ${dondeVerElResto}.`;
}
