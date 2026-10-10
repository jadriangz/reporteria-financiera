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

import { type FilaResuelta, folioDe, resolverCabeceras } from "./cabecera";
import { CLAVES_PARAMETROS, LECTURAS, type ParametroSustituido, sinCapturar } from "./parametros";
import { REGLAS, type ContextoValidacion, type FilaEvaluada, type FolioExcluido } from "./reglas";
import type { NombreHoja, RawParametros, RawSheets } from "./tipos";

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
  /**
   * Numeros de fila que entraron al Dataset, por hoja. Es lo que le permite a un
   * listado decir de cada fila lo mismo que el motor hace con ella: una partida
   * puede cumplir el esquema y aun asi quedar fuera con todo su folio.
   */
  readonly filasAceptadas: Readonly<Record<NombreHoja, ReadonlySet<number>>>;
}

/**
 * Aplica un esquema del contrato a cada fila de una hoja. Devuelve las filas que
 * pasaron y, en paralelo, la marca de aceptacion que las reglas necesitan para
 * reportar las rechazadas. Nunca lanza: una fila mala se excluye y se reporta.
 */
function aplicarEsquema<T>(
  crudas: readonly (Pick<FilaResuelta, "fila" | "valores"> & Partial<Pick<FilaResuelta, "capturados">>)[],
  esquema: { safeParse(v: unknown): { success: boolean; data?: T } },
): { filas: T[]; evaluadas: FilaEvaluada[]; leidas: (T | null)[] } {
  const filas: T[] = [];
  const evaluadas: FilaEvaluada[] = [];
  const leidas: (T | null)[] = [];

  for (const cruda of crudas) {
    const r = esquema.safeParse(cruda.valores);
    const dato = r.success && r.data !== undefined ? r.data : null;
    if (dato !== null) filas.push(dato);
    leidas.push(dato);
    evaluadas.push({
      fila: cruda.fila,
      valores: cruda.valores,
      capturados: cruda.capturados ?? cruda.valores,
      cumpleEsquema: dato !== null,
      aceptada: dato !== null,
    });
  }

  return { filas, evaluadas, leidas };
}

/**
 * Las ventas se leen por folio y no fila por fila: primero se resuelve la
 * cabecera de cada folio, despues se aplica el esquema, y al final se decide que
 * folios no se pueden valuar.
 *
 * Un folio sale COMPLETO del dataset en dos casos, y en los dos por la misma
 * razon: no se sabe de que operacion se trata o cuanto vale.
 *
 * - `cliente` distinto entre sus partidas.
 * - Una de sus partidas no cumple el esquema. Dejar las demas repartiria entre
 *   ellas los pagos del folio y fabricaria un sobrecobro que nadie hizo: una
 *   partida que no se pudo leer no es una partida que no existe.
 */
function leerVentas(raw: RawSheets): {
  filas: Venta[];
  evaluadas: FilaEvaluada[];
  conflictos: ContextoValidacion["conflictos"];
  foliosExcluidos: FolioExcluido[];
} {
  const cabeceras = resolverCabeceras(raw.ventas);
  const { evaluadas, leidas } = aplicarEsquema<Venta>(cabeceras.filas, VentaSchema);

  const porFila = new Map(evaluadas.map((f) => [f.fila, f]));
  const foliosExcluidos: FolioExcluido[] = [];
  for (const [folio, filas] of cabeceras.filasPorFolio) {
    if (filas.length < 2) continue;
    const enConflicto = cabeceras.conflictos.find((c) => c.folio === folio && c.campo === "cliente");
    if (enConflicto !== undefined) {
      foliosExcluidos.push({ folio, motivo: "cliente-en-conflicto", filas, capturas: enConflicto.capturas });
      continue;
    }
    const ilegibles = filas.filter((n) => porFila.get(n)?.cumpleEsquema === false);
    if (ilegibles.length > 0) foliosExcluidos.push({ folio, motivo: "partida-ilegible", filas, ilegibles });
  }

  const fuera = new Set(foliosExcluidos.map((f) => f.folio));
  const filas: Venta[] = [];
  const finales: FilaEvaluada[] = [];
  evaluadas.forEach((f, i) => {
    const dato = leidas[i];
    if (dato == null || fuera.has(folioDe(f.valores))) {
      finales.push(Object.assign({}, f, { aceptada: false }));
      return;
    }
    filas.push(dato);
    finales.push(f);
  });

  return {
    filas,
    evaluadas: finales,
    conflictos: cabeceras.conflictos.filter((c) => c.campo !== "cliente"),
    foliosExcluidos,
  };
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
 * fuera del Dataset y se reportan como error. En `ventas` la unidad es el folio:
 * ver `leerVentas`. Una hoja ausente produce un
 * Dataset con esa coleccion vacia, que es lo que `capacidades()` interpreta
 * para deshabilitar los modulos correspondientes.
 */
export function validate(raw: RawSheets): ResultadoValidacion {
  const ventas = leerVentas(raw);
  const cobranza = aplicarEsquema<Cobranza>(raw.cobranza.filas, CobranzaSchema);
  const gastos = aplicarEsquema<Gasto>(raw.gastos.filas, GastoSchema);
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
    conflictos: ventas.conflictos,
    foliosExcluidos: ventas.foliosExcluidos,
    sustituciones,
  };

  const hallazgos = REGLAS.flatMap((regla) => regla.evaluar(ctx));

  const aceptadas = (filas: readonly FilaEvaluada[]): ReadonlySet<number> =>
    new Set(filas.filter((f) => f.aceptada).map((f) => f.fila));

  return {
    dataset,
    hallazgos,
    sustituciones,
    filasAceptadas: {
      ventas: aceptadas(ventas.evaluadas),
      cobranza: aceptadas(cobranza.evaluadas),
      gastos: aceptadas(gastos.evaluadas),
    },
  };
}

/** Atajo para la UI: cuenta hallazgos por severidad. */
export function resumenHallazgos(hallazgos: readonly Hallazgo[]): Record<Hallazgo["severidad"], number> {
  const out = { error: 0, advertencia: 0, info: 0 };
  for (const h of hallazgos) out[h.severidad] += 1;
  return out;
}
