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

import { CLAVES_PARAMETROS, LECTURAS, type ParametroSustituido, sinCapturar } from "./parametros";
import { REGLAS, type ContextoValidacion, type FilaEvaluada } from "./reglas";
import type { RawHoja, RawParametros, RawSheets } from "./tipos";

export interface ResultadoValidacion {
  readonly dataset: Dataset;
  readonly hallazgos: readonly Hallazgo[];
  /**
   * Parametros capturados que no se pudieron leer, con lo que se aplico en su
   * lugar. Son datos y no texto: el store los guarda con el dataset y la interfaz
   * los pinta junto a la cifra que afectan y en la portada del PDF, porque el
   * panel de validacion no viaja con el documento. El motor no los ve (AD-06).
   */
  readonly sustituciones: readonly ParametroSustituido[];
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
 * tambien se omite, pero queda registrado como sustitucion: la regla
 * `parametro-no-reconocido` lo avisa en el panel y la interfaz lo pinta donde
 * se usa. Las dos cosas salen de esta misma lista.
 */
function leerParametros(raw: RawParametros): { parametros: Parametros; sustituciones: ParametroSustituido[] } {
  const entrada: Partial<Record<keyof Parametros, unknown>> = {};
  const sustituciones: ParametroSustituido[] = [];
  for (const clave of CLAVES_PARAMETROS) {
    const crudo = raw.valores[clave];
    if (sinCapturar(crudo)) continue;
    const lectura = LECTURAS[clave];
    const valor = lectura.leer(crudo ?? null);
    if (valor !== null) {
      entrada[clave] = valor;
      continue;
    }
    sustituciones.push({
      clave,
      capturado: String(crudo).trim(),
      aplicado: lectura.porOmision,
      fila: raw.filaDe[clave] ?? null,
    });
  }
  return { parametros: ParametrosSchema.parse(entrada), sustituciones };
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
  const { parametros, sustituciones } = leerParametros(raw.parametros);

  const dataset: Dataset = {
    ventas: ventas.filas,
    cobranza: cobranza.filas,
    gastos: gastos.filas,
    parametros,
  };

  const ctx: ContextoValidacion = {
    raw,
    ventas: ventas.evaluadas,
    cobranza: cobranza.evaluadas,
    gastos: gastos.evaluadas,
    sustituciones,
  };

  const hallazgos = REGLAS.flatMap((regla) => regla.evaluar(ctx));

  return { dataset, hallazgos, sustituciones };
}

/** Atajo para la UI: cuenta hallazgos por severidad. */
export function resumenHallazgos(hallazgos: readonly Hallazgo[]): Record<Hallazgo["severidad"], number> {
  const out = { error: 0, advertencia: 0, info: 0 };
  for (const h of hallazgos) out[h.severidad] += 1;
  return out;
}
