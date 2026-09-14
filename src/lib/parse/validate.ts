import {
  type Cobranza,
  CobranzaSchema,
  type Dataset,
  type Gasto,
  GastoSchema,
  type Hallazgo,
  type Parametros,
  ParametrosSchema,
  type Venta,
  VentaSchema,
} from "../schema";

import { CLAVES_PARAMETROS, LECTURAS, sinCapturar } from "./parametros";
import { REGLAS, type ContextoValidacion, type FilaEvaluada } from "./reglas";
import type { RawHoja, RawParametros, RawSheets } from "./tipos";

export interface ResultadoValidacion {
  readonly dataset: Dataset;
  readonly hallazgos: readonly Hallazgo[];
}

/**
 * Aplica un esquema del contrato a cada fila de una hoja. Devuelve las filas que
 * pasaron y, en paralelo, la marca de aceptacion que las reglas necesitan para
 * reportar las rechazadas. Nunca lanza: una fila mala se excluye y se reporta.
 */
function aplicarEsquema<T>(
  hoja: RawHoja,
  esquema: { safeParse(v: unknown): { success: boolean; data?: T } },
): { filas: T[]; evaluadas: FilaEvaluada[] } {
  const filas: T[] = [];
  const evaluadas: FilaEvaluada[] = [];

  for (const cruda of hoja.filas) {
    const r = esquema.safeParse(cruda.valores);
    const aceptada = r.success && r.data !== undefined;
    if (aceptada && r.data !== undefined) filas.push(r.data);
    evaluadas.push({ fila: cruda.fila, valores: cruda.valores, aceptada });
  }

  return { filas, evaluadas };
}

/**
 * Lee la hoja clave-valor con la declaracion de `parametros.ts`.
 *
 * Zod aplica `.default()` solo ante `undefined`, asi que un parametro vacio se
 * omite para que tome su valor por omision. Uno capturado que no se puede leer
 * tambien se omite, pero NO en silencio: lo avisa la regla
 * `parametro-no-reconocido`, que consulta la misma lectura.
 */
function coercionarParametros(raw: RawParametros): Parametros {
  const entrada: Partial<Record<keyof Parametros, unknown>> = {};
  for (const clave of CLAVES_PARAMETROS) {
    const crudo = raw.valores[clave];
    if (sinCapturar(crudo)) continue;
    const valor = LECTURAS[clave].leer(crudo ?? null);
    if (valor !== null) entrada[clave] = valor;
  }
  return ParametrosSchema.parse(entrada);
}

/**
 * Convierte las filas crudas en un Dataset y una lista de hallazgos.
 *
 * Nunca lanza por datos malos: las filas que no cumplen el contrato quedan
 * fuera del Dataset y se reportan como error. Una hoja ausente produce un
 * Dataset con esa coleccion vacia, que es lo que `capacidades()` interpreta
 * para deshabilitar los modulos correspondientes.
 */
export function validate(raw: RawSheets): ResultadoValidacion {
  const ventas = aplicarEsquema<Venta>(raw.ventas, VentaSchema);
  const cobranza = aplicarEsquema<Cobranza>(raw.cobranza, CobranzaSchema);
  const gastos = aplicarEsquema<Gasto>(raw.gastos, GastoSchema);

  const dataset: Dataset = {
    ventas: ventas.filas,
    cobranza: cobranza.filas,
    gastos: gastos.filas,
    parametros: coercionarParametros(raw.parametros),
  };

  const ctx: ContextoValidacion = {
    raw,
    ventas: ventas.evaluadas,
    cobranza: cobranza.evaluadas,
    gastos: gastos.evaluadas,
  };

  const hallazgos = REGLAS.flatMap((regla) => regla.evaluar(ctx));

  return { dataset, hallazgos };
}

/** Atajo para la UI: cuenta hallazgos por severidad. */
export function resumenHallazgos(hallazgos: readonly Hallazgo[]): Record<Hallazgo["severidad"], number> {
  const out = { error: 0, advertencia: 0, info: 0 };
  for (const h of hallazgos) out[h.severidad] += 1;
  return out;
}
