/**
 * Cómo se rotula el eje X cuando el ancho aprieta.
 *
 * El orden de las medidas es deliberado, y es el de la sesión: **primero bajar
 * la densidad de marcas, luego rotar, luego abreviar, y superponer nunca.** Dos
 * etiquetas encimadas no son una etiqueta pequeña: son cero etiquetas, más la
 * impresión de que el reporte está roto.
 *
 * La diferencia entre los dos ejes no es estética, es de significado:
 *
 * - **Eje de tiempo.** Saltarse un mes no pierde información: el eje es
 *   continuo y quien lee interpola «esta barra está entre marzo y mayo». Así
 *   que aquí sí se baja la densidad.
 * - **Eje de categorías.** Saltarse un modelo deja una barra sin nombre, y una
 *   barra sin nombre no se puede leer. Aquí NUNCA se quitan marcas: se rota y,
 *   si aun así no cabe, se abrevia (el tooltip sigue dando el nombre completo).
 *
 * Funciones puras: reciben el ancho y devuelven qué hacer. Se prueban en node.
 */

/** Ancho que hay que dejarle al eje Y para las cifras compactas ("$1.2M"). */
export const ANCHO_EJE_Y = 60;

/**
 * Ancho de la gráfica al imprimir, en píxeles CSS. Cabe en una hoja carta con
 * los márgenes de `@page` y la escala de impresión de `index.css`.
 *
 * Vive aquí, y no en el componente que dibuja, porque hay dos decisiones que
 * dependen de él: cómo se rotulan los ejes y cuántas categorías caben. En papel
 * el ancho no se mide, se sabe.
 */
export const ANCHO_IMPRESION = 680;

/** Píxeles por categoría por debajo de los cuales el texto horizontal se encima. */
const HOLGADO = 64;

/** Por debajo de esto no alcanza ni rotado: hay que abreviar. */
const APRETADO = 34;

/** Alto que hay que sumarle a la gráfica para alojar etiquetas inclinadas. */
export const ALTO_EJE_INCLINADO = 48;

/**
 * Alto mínimo del área de dibujo. Por debajo de esto la gráfica deja de
 * comunicar una proporción y se vuelve una franja de colores.
 */
export const ALTO_MINIMO = 200;

export interface RotuloEje {
  /** Grados de inclinación. 0 = horizontal. */
  readonly angulo: number;
  /** Alto reservado para las etiquetas del eje. */
  readonly alto: number;
  /** Máximo de caracteres por etiqueta; `null` = sin recortar. */
  readonly maximoCaracteres: number | null;
  /**
   * Separación mínima entre marcas, en px. Solo la usa el eje de tiempo:
   * recharts la respeta saltándose marcas.
   */
  readonly separacionMinima: number;
  /** `true` cuando se pintan TODAS las marcas, pase lo que pase. */
  readonly todasLasMarcas: boolean;
}

/**
 * Márgenes izquierdo y derecho del área de dibujo, sumados. Tienen que
 * coincidir con `MARGEN` en `GraficaLienzo`: son píxeles que el eje Y no ocupa
 * y las barras tampoco.
 */
export const MARGEN_HORIZONTAL = 16;

/**
 * Cuánto ancho tiene de verdad el área de categorías: el total menos el eje Y
 * y menos los márgenes del dibujo. Nunca negativo: con la gráfica aún sin
 * medir, `ancho` llega en 0.
 */
export function anchoUtil(ancho: number): number {
  return Math.max(0, ancho - ANCHO_EJE_Y - MARGEN_HORIZONTAL);
}

export function rotuloEje({
  ancho,
  categorias,
  categorica,
}: {
  /** Ancho total disponible para la gráfica, en px. */
  readonly ancho: number;
  readonly categorias: number;
  readonly categorica: boolean;
}): RotuloEje {
  const porCategoria = categorias === 0 ? HOLGADO : anchoUtil(ancho) / categorias;

  if (!categorica) {
    // Eje de tiempo: bajar densidad es legítimo, y es lo primero que se hace.
    return {
      angulo: 0,
      alto: 30,
      maximoCaracteres: null,
      // Cuanto menos espacio por mes, más separación se le exige a recharts
      // antes de pintar la siguiente marca, y más meses se salta.
      separacionMinima: porCategoria < 36 ? 32 : porCategoria < 56 ? 16 : 8,
      todasLasMarcas: false,
    };
  }

  // Eje de categorías: todas las marcas, siempre. Se ajusta el texto, no el eje.
  if (porCategoria >= HOLGADO) {
    return {
      angulo: 0,
      alto: 30,
      maximoCaracteres: null,
      separacionMinima: 0,
      todasLasMarcas: true,
    };
  }

  return {
    angulo: -30,
    alto: ALTO_EJE_INCLINADO,
    // Inclinada, una etiqueta dispone de más largo del que mide su columna;
    // el corte solo entra cuando ni así alcanza.
    maximoCaracteres: porCategoria < APRETADO ? 8 : porCategoria < 48 ? 12 : null,
    separacionMinima: 0,
    todasLasMarcas: true,
  };
}

/**
 * Recorta una etiqueta conservando su inicio, que es lo que la distingue.
 * El nombre completo sigue disponible en el tooltip.
 */
export function abreviar(texto: string, maximo: number | null): string {
  if (maximo === null || texto.length <= maximo) return texto;
  // Con uno o menos no cabe ni una letra y los puntos suspensivos: el resultado
  // seria MAS largo que el limite, que es justo lo que no puede pasar.
  if (maximo < 2) return "…";
  return `${texto.slice(0, maximo - 1).trimEnd()}…`;
}
