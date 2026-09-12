import type { Hallazgo, Severidad } from "../lib/schema";

/**
 * Lógica del panel de validación, sin React.
 *
 * Vive aparte por la misma razón que `tabla.ts` e `impresion.ts`: qué tono le
 * toca al panel y qué dice su línea de conteo son decisiones con reglas, y las
 * reglas se prueban en node sin montar nada.
 */

export const ORDEN_SEVERIDAD: readonly Severidad[] = ["error", "advertencia", "info"];

/** Cómo se nombra cada severidad en el conteo, en singular y en plural. */
const NOMBRE: Readonly<Record<Severidad, readonly [string, string]>> = {
  error: ["error", "errores"],
  advertencia: ["advertencia", "advertencias"],
  info: ["informativo", "informativos"],
};

/** El tono del panel entero. Proporcional a lo peor que haya dentro. */
export type TonoValidacion = "riesgo" | "advertencia" | "neutro";

const TONO_DE: Readonly<Record<Severidad, TonoValidacion>> = {
  error: "riesgo",
  advertencia: "advertencia",
  info: "neutro",
};

export interface ResumenValidacion {
  readonly conteos: Readonly<Record<Severidad, number>>;
  readonly total: number;
  readonly errores: number;
  /** La peor severidad presente. `null` si no hay ninguna incidencia. */
  readonly severidadMaxima: Severidad | null;
  /**
   * Tono del encabezado: semáforo. Riesgo si hay errores, advertencia si solo
   * hay advertencias, neutro si está limpio o solo hay informativos.
   */
  readonly tono: TonoValidacion;
  /**
   * El conteo por grupo, SIEMPRE visible aunque el panel esté comprimido:
   * "3 errores · 19 advertencias · 7 informativos".
   */
  readonly textoConteo: string;
  /**
   * ¿El panel puede comprimirse por completo a una sola línea?
   *
   * NO CUANDO HAY ERRORES. El propósito de comprimir el panel es bajar el
   * ruido, no esconder problemas: con errores presentes siempre queda a la
   * vista una línea con el conteo y el acceso directo al primero. Un error que
   * se puede ocultar con un clic acaba siendo un error que nadie vio.
   */
  readonly comprimibleDelTodo: boolean;
  /** Sin una sola fila leída no hay nada que validar todavía. */
  readonly vacio: boolean;
}

/** Cuántos hallazgos hay de cada severidad. */
function contar(hallazgos: readonly Hallazgo[]): Record<Severidad, number> {
  const conteos: Record<Severidad, number> = { error: 0, advertencia: 0, info: 0 };
  for (const h of hallazgos) conteos[h.severidad] += 1;
  return conteos;
}

/** "3 errores · 19 advertencias · 7 informativos". Omite los grupos vacíos. */
export function textoConteo(conteos: Readonly<Record<Severidad, number>>): string {
  const partes = ORDEN_SEVERIDAD.filter((s) => conteos[s] > 0).map((s) => {
    const [singular, plural] = NOMBRE[s];
    return `${conteos[s]} ${conteos[s] === 1 ? singular : plural}`;
  });
  return partes.join(" · ");
}

/** Las partes del conteo por separado, para pintarlas cada una en su tono. */
export function partesConteo(
  conteos: Readonly<Record<Severidad, number>>,
): readonly { severidad: Severidad; texto: string }[] {
  return ORDEN_SEVERIDAD.filter((s) => conteos[s] > 0).map((s) => {
    const [singular, plural] = NOMBRE[s];
    return { severidad: s, texto: `${conteos[s]} ${conteos[s] === 1 ? singular : plural}` };
  });
}

export function resumirValidacion(
  hallazgos: readonly Hallazgo[],
  filasLeidas: number,
): ResumenValidacion {
  const conteos = contar(hallazgos);
  const severidadMaxima = ORDEN_SEVERIDAD.find((s) => conteos[s] > 0) ?? null;

  return {
    conteos,
    total: hallazgos.length,
    errores: conteos.error,
    severidadMaxima,
    tono: severidadMaxima === null ? "neutro" : TONO_DE[severidadMaxima],
    textoConteo: textoConteo(conteos),
    comprimibleDelTodo: conteos.error === 0,
    vacio: filasLeidas === 0,
  };
}

/**
 * Agrupa los hallazgos por severidad, en orden de gravedad y sin grupos vacíos.
 */
export function agruparPorSeveridad(
  hallazgos: readonly Hallazgo[],
): readonly { severidad: Severidad; items: readonly Hallazgo[] }[] {
  return ORDEN_SEVERIDAD.map((severidad) => ({
    severidad,
    items: hallazgos.filter((h) => h.severidad === severidad),
  })).filter((g) => g.items.length > 0);
}

/**
 * Clave estable derivada del contenido del hallazgo, no de su posición.
 *
 * Dos hallazgos idénticos son posibles (misma hoja, mismo campo, sin fila), así
 * que se desempata con un contador de repeticiones en vez de con el índice.
 */
export function conClave(items: readonly Hallazgo[]): { clave: string; h: Hallazgo }[] {
  const vistos = new Map<string, number>();
  return items.map((h) => {
    const base = `${h.hoja}|${h.fila ?? ""}|${h.campo ?? ""}|${h.mensaje}`;
    const repeticion = vistos.get(base) ?? 0;
    vistos.set(base, repeticion + 1);
    return { clave: repeticion === 0 ? base : `${base}#${repeticion}`, h };
  });
}
