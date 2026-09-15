/**
 * Ancho de las etiquetas del eje, medido con la tipografía real.
 *
 * Cómo se rotula el eje (`rotuloEje`) necesita números exactos. Contar
 * caracteres se equivoca justo por el margen que produce el defecto: «Curso
 * piloto certificado» mide 0.43 veces el tamaño de letra por carácter, y una
 * estimación de 0.6 lo exagera un 40%.
 *
 * Se mide con un canvas, ANTES de dibujar, porque la medida decide cómo se
 * dibuja. `measureText` es síncrono y no depende de que la pestaña esté visible
 * ni de que la vista imprimible esté pintada.
 *
 * Fuera del navegador —las pruebas en node— no hay canvas y se estima con
 * `FACTOR_SIN_LIENZO`. En el navegador esa estimación nunca se usa.
 */

const FACTOR_SIN_LIENZO = 0.6;

let contexto: CanvasRenderingContext2D | null | undefined;

function lienzo(): CanvasRenderingContext2D | null {
  if (contexto === undefined) {
    contexto = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  }
  return contexto;
}

/** La familia tipográfica con la que se pintan los rótulos, que heredan del documento. */
export function familiaDeLetra(): string {
  if (typeof document === "undefined" || document.body === null) return "sans-serif";
  return getComputedStyle(document.body).fontFamily || "sans-serif";
}

/** Ancho en px de cada texto, al tamaño de letra y con la familia dados. */
export function medirRotulos(textos: readonly string[], tamano: number, familia: string): number[] {
  const ctx = lienzo();
  if (ctx === null) return textos.map((t) => t.length * tamano * FACTOR_SIN_LIENZO);
  ctx.font = `${tamano}px ${familia}`;
  return textos.map((t) => ctx.measureText(t).width);
}
