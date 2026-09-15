/**
 * Cómo se rotula el eje X cuando el ancho aprieta.
 *
 * El orden de las medidas es deliberado: **primero bajar la densidad de marcas,
 * luego rotar, luego abreviar, y superponer nunca.** Dos etiquetas encimadas no
 * son una etiqueta pequeña: son cero etiquetas, más la impresión de que el
 * reporte está roto.
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
 * EL LARGO DEL RÓTULO MANDA, no solo el espacio por categoría. Hasta la 1.1.4 la
 * decisión salía de los píxeles por categoría —horizontal desde 64, abreviar por
 * debajo de 34— y los rótulos girados tenían un alto fijo de 48 px. Con los doce
 * modelos del demo a 1024 px tocaban 73 px por modelo y quedaban horizontales,
 * pero «Curso piloto certificado» mide 113 px: se encimaban. Girado, ese mismo
 * rótulo necesita 66 px de alto en pantalla y 54 en papel, y se cortaba contra los
 * 48 fijos. Ahora cada paso se decide con el ancho MEDIDO de los rótulos
 * (`medirTexto.ts`, con la tipografía real), y el alto sale del rótulo más largo
 * tal como se va a dibujar (`altoEje`).
 *
 * Funciones puras: reciben anchos ya medidos y devuelven qué hacer. No miden:
 * se prueban en node con números.
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

/** Tamaño de letra de los rótulos del eje. El cálculo y el dibujo usan el mismo. */
export const TAMANO_ROTULO_PANTALLA = 11;
export const TAMANO_ROTULO_IMPRESION = 9;

/** Alto del eje con los rótulos horizontales. Es el alto base de toda gráfica. */
export const ALTO_EJE_HORIZONTAL = 30;

/**
 * Alto máximo que puede ocupar el eje con los rótulos girados. Por encima de
 * esto se abrevia en vez de seguir creciendo: un eje más alto que eso se come la
 * gráfica que rotula.
 *
 * Calibrado el 2026-09-14 midiendo la gráfica pintada en Chrome, con la pestaña
 * visible. Con el rótulo más largo del demo («Curso piloto certificado», 113 px a
 * 11 px), a 1440, 1024 y 768 px, el eje reserva 77 px y el punto más bajo del
 * rótulo queda a 73.9 px de la línea del eje: cabe completo, sin abreviar.
 */
export const ALTO_EJE_MAXIMO = 80;

/** Grados de inclinación de los rótulos girados. */
export const ANGULO_GIRO = -30;

/** Aire mínimo entre dos rótulos horizontales contiguos, en px. */
const AIRE_HORIZONTAL = 8;

/**
 * Aire entre dos rótulos girados contiguos, medido en perpendicular. Girados no
 * se enciman mientras cada categoría mida al menos `tamaño / sen(30°) + aire`.
 * `rotuloEje` no lo comprueba porque el recorte de categorías ya lo garantiza: la
 * categoría más angosta que deja pasar (`anchoMinimoCategoria(1)`, 24 px) cabe
 * justo con letra de pantalla. Una prueba fija ese acoplamiento.
 */
export const AIRE_DIAGONAL = 2;

/**
 * Lo que el rótulo girado ocupa bajo el eje además de su diagonal
 * (ancho × sen 30° + tamaño × cos 30°), en px.
 *
 * Medido el 2026-09-14 en la gráfica pintada: 4 px de hueco entre la línea del
 * eje y el texto, y unos 3.8 px más de la caja del texto girado respecto de la
 * cuenta geométrica. Hacían falta 7.8 px; con 10 quedan 2.2 px de aire. La
 * medición con canvas y el ancho que dibuja el SVG coincidieron hasta 0.02 px.
 */
export const MARGEN_ROTULO_GIRADO = 10;

/**
 * Alto mínimo del área de dibujo. Por debajo de esto la gráfica deja de
 * comunicar una proporción y se vuelve una franja de colores.
 */
export const ALTO_MINIMO = 200;

/**
 * Márgenes izquierdo y derecho del área de dibujo, sumados. Tienen que
 * coincidir con `MARGEN` en `GraficaLienzo`: son píxeles que el eje Y no ocupa
 * y las barras tampoco.
 */
export const MARGEN_HORIZONTAL = 16;

/** Margen izquierdo del área de dibujo. `GraficaLienzo` lo usa tal cual. */
export const MARGEN_IZQUIERDO = 4;

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

/** Una etiqueta del eje con su ancho medido, en px, al tamaño de letra del eje. */
export interface RotuloMedido {
  readonly texto: string;
  readonly ancho: number;
}

/**
 * Cuánto ancho tiene de verdad el área de categorías: el total menos el eje Y
 * y menos los márgenes del dibujo. Nunca negativo: con la gráfica aún sin
 * medir, `ancho` llega en 0.
 */
export function anchoUtil(ancho: number): number {
  return Math.max(0, ancho - ANCHO_EJE_Y - MARGEN_HORIZONTAL);
}

const radianes = (grados: number): number => (Math.abs(grados) * Math.PI) / 180;

/**
 * Alto que ocupa el eje con el rótulo más ancho que se va a dibujar.
 *
 * Horizontal, el alto base. Girado, lo que baja el rótulo en diagonal más el
 * alto de la propia letra y el margen de la marca. Quien llama le pasa el ancho
 * del rótulo más largo YA abreviado: el alto sale de lo que se dibuja.
 */
export function altoEje(angulo: number, anchoMayor: number, tamanoLetra: number): number {
  if (angulo === 0) return ALTO_EJE_HORIZONTAL;
  const r = radianes(angulo);
  const necesario = anchoMayor * Math.sin(r) + tamanoLetra * Math.cos(r) + MARGEN_ROTULO_GIRADO;
  return Math.max(ALTO_EJE_HORIZONTAL, Math.ceil(necesario));
}

/**
 * Ancho de una etiqueta abreviada a `maximo` caracteres, estimado en proporción a
 * su ancho medido completo: los puntos suspensivos cuentan como un carácter. Solo
 * sirve para DECIDIR cuánto abreviar; el alto final se calcula con lo medido.
 */
function anchoAbreviado(rotulo: RotuloMedido, maximo: number): number {
  const largo = rotulo.texto.length;
  if (largo <= maximo || largo === 0) return rotulo.ancho;
  return (rotulo.ancho * maximo) / largo;
}

export function rotuloEje({
  ancho,
  categorica,
  rotulos,
  tamanoLetra,
}: {
  /** Ancho total disponible para la gráfica, en px. */
  readonly ancho: number;
  readonly categorica: boolean;
  /** Las etiquetas del eje, en orden, con su ancho medido. */
  readonly rotulos: readonly RotuloMedido[];
  /** Tamaño de letra al que se midieron y al que se van a dibujar. */
  readonly tamanoLetra: number;
}): RotuloEje {
  const categorias = rotulos.length;
  const porCategoria = categorias === 0 ? Number.POSITIVE_INFINITY : anchoUtil(ancho) / categorias;
  const horizontal = {
    angulo: 0,
    alto: ALTO_EJE_HORIZONTAL,
    maximoCaracteres: null,
    separacionMinima: 0,
    todasLasMarcas: true,
  } as const;

  if (!categorica) {
    // Eje de tiempo: bajar densidad es legítimo, y es lo primero que se hace.
    return {
      ...horizontal,
      // Cuanto menos espacio por mes, más separación se le exige a recharts
      // antes de pintar la siguiente marca, y más meses se salta.
      separacionMinima: porCategoria < 36 ? 32 : porCategoria < 56 ? 16 : 8,
      todasLasMarcas: false,
    };
  }

  // Eje de categorías: todas las marcas, siempre. Se ajusta el texto, no el eje.
  if (categorias === 0) return horizontal;
  const mayor = Math.max(...rotulos.map((r) => r.ancho));

  // 1. Horizontal: el rótulo más ancho, con aire, cabe en su columna.
  if (mayor + AIRE_HORIZONTAL <= porCategoria) return horizontal;

  // 2. Girado. Cada rótulo tiene dos límites de ancho:
  //    - el alto máximo del eje, que acota lo que puede bajar en diagonal;
  //    - el borde izquierdo: con `textAnchor="end"`, el rótulo crece hacia la
  //      izquierda desde su marca, y el primero solo tiene el eje Y y media
  //      categoría antes de salirse de la gráfica.
  const r = radianes(ANGULO_GIRO);
  const porAlto = (ALTO_EJE_MAXIMO - MARGEN_ROTULO_GIRADO - tamanoLetra * Math.cos(r)) / Math.sin(r);
  const limite = (i: number): number =>
    Math.min(porAlto, (ANCHO_EJE_Y + MARGEN_IZQUIERDO + (i + 0.5) * porCategoria) / Math.cos(r));

  if (rotulos.every((rotulo, i) => rotulo.ancho <= limite(i))) {
    return {
      ...horizontal,
      angulo: ANGULO_GIRO,
      alto: altoEje(ANGULO_GIRO, mayor, tamanoLetra),
    };
  }

  // 3. Abreviado: el máximo de caracteres con el que TODOS caben en su límite.
  const masLargo = Math.max(...rotulos.map((rotulo) => rotulo.texto.length));
  let maximo = 2;
  for (let m = masLargo; m >= 2; m -= 1) {
    if (rotulos.every((rotulo, i) => anchoAbreviado(rotulo, m) <= limite(i))) {
      maximo = m;
      break;
    }
  }
  const mayorAbreviado = Math.max(...rotulos.map((rotulo) => anchoAbreviado(rotulo, maximo)));
  return {
    ...horizontal,
    angulo: ANGULO_GIRO,
    alto: altoEje(ANGULO_GIRO, mayorAbreviado, tamanoLetra),
    maximoCaracteres: maximo,
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
