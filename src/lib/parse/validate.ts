import {
  COMISION_BASE,
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
  canonizar,
  parseBool,
  parseFecha,
  parseNumero,
} from "../schema";

import { REGLAS, type ContextoValidacion, type FilaEvaluada } from "./reglas";
import type { RawCelda, RawHoja, RawParametros, RawSheets } from "./tipos";

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
 * Coerciona la hoja clave-valor a los tipos que espera ParametrosSchema.
 *
 * Zod aplica `.default()` solo ante `undefined`, nunca ante `null`, asi que un
 * parametro que el cliente dejo en blanco debe omitirse para que tome su valor
 * por omision. La excepcion es importes_incluyen_iva, cuyo default ES null:
 * ahi null significa "el cliente todavia no lo contesta".
 */
function coercionarParametros(raw: RawParametros): Parametros {
  const v = raw.valores;
  const crudo = (k: string): RawCelda => v[k] ?? null;

  const numero = (k: string): number | undefined => parseNumero(crudo(k)) ?? undefined;
  const fecha = (k: string): Date | undefined => parseFecha(crudo(k)) ?? undefined;

  const monedaBase = String(crudo("moneda_base") ?? "").trim();
  const nombreCliente = String(crudo("nombre_cliente") ?? "").trim();
  const baseComision = crudo("comision_base_default");
  // ParametrosSchema lo canoniza («utilidad» → "Utilidad"). Uno que ni asi es de la
  // lista se omite y toma el valor por omision, pero NO en silencio: lo avisa la
  // regla `parametro-no-reconocido`.
  const comisionValida = canonizar(COMISION_BASE, baseComision) !== null;

  const entrada: Record<string, unknown> = {
    importes_incluyen_iva: parseBool(crudo("importes_incluyen_iva")),
  };
  if (monedaBase !== "") entrada["moneda_base"] = monedaBase;
  if (nombreCliente !== "") entrada["nombre_cliente"] = nombreCliente;
  if (comisionValida) entrada["comision_base_default"] = baseComision;
  for (const k of ["tasa_iva", "provision_91_180", "provision_mas_180", "dias_credito_default", "tipo_cambio_usd"]) {
    const n = numero(k);
    if (n !== undefined) entrada[k] = n;
  }
  for (const k of ["periodo_inicio", "periodo_fin"]) {
    const f = fecha(k);
    if (f !== undefined) entrada[k] = f;
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
