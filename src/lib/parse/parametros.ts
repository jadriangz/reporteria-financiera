import {
  ANIO_MAXIMO,
  ANIO_MINIMO,
  COMISION_BASE,
  MONEDA_BASE,
  type Parametros,
  ParametrosSchema,
  canonizar,
  parseBool,
  parseEnteroNoNegativo,
  parseFecha,
  parsePct,
  parsePositivo,
  parseTexto,
} from "../schema";

import type { RawCelda } from "./tipos";

/**
 * La hoja `parametros`, leida con el mismo rigor que las hojas de datos.
 *
 * Los parametros son lo unico que el usuario configura a mano para ajustar el
 * reporte a su criterio. Un valor que no se puede leer no puede convertirse en
 * silencio en un valor por omision que nadie eligio: quien decidio provisionar
 * al 30% veria un reporte al 25% sin que nada se lo dijera.
 *
 * Aqui no se coerciona nada: toda coercion vive en el esquema (CLAUDE.md,
 * «Restricciones aprendidas»). Cada parametro elige cual de las del esquema lo
 * lee, y se redacta que formatos acepta y que se aplica si no se puede leer.
 * `validate()` lee con esta declaracion y la regla `parametro-no-reconocido`
 * avisa con esta misma declaracion. Ver docs/decisiones.md (2026-09-14).
 */

/** Lo que se aplica cuando un parametro esta vacio o no se pudo leer. */
export const PARAMETROS_POR_OMISION: Parametros = ParametrosSchema.parse({});

export interface LecturaParametro<T> {
  /** La coercion del esquema que lo lee: null si lo capturado no se puede leer. Nunca recibe una celda vacia. */
  readonly leer: (crudo: RawCelda) => T | null;
  /** Que formatos se aceptan, dicho para quien captura. Completa la frase "Escriba ...". */
  readonly formatos: string;
  /** Lo que se aplica si no se puede leer, dicho para quien lee. Completa "se aplica ...". */
  readonly porOmision: string;
}

/** Un parametro capturado que no se pudo leer, con lo que se aplico en su lugar. */
export interface ParametroSustituido {
  readonly clave: keyof Parametros;
  /** Lo que decia la celda, sin espacios sobrantes. */
  readonly capturado: string;
  /** Lo que se aplico, dicho para quien lee: "25% (valor por omisión)". */
  readonly aplicado: string;
  /** Fila de la hoja parametros, o null si no se conoce. */
  readonly fila: number | null;
}

/** La frase de una sustitucion: la usan el aviso junto a la cifra y la portada del PDF. */
export function textoSustitucion(s: ParametroSustituido): string {
  return `En la hoja parámetros, ${s.clave} dice «${s.capturado}», que no se pudo leer: se aplica ${s.aplicado}.`;
}

type Lecturas = { readonly [K in keyof Parametros]-?: LecturaParametro<NonNullable<Parametros[K]>> };

/** Celda sin capturar: vacia o solo espacios. No es un valor, y no se avisa. */
export function sinCapturar(crudo: RawCelda | undefined): boolean {
  return crudo === null || crudo === undefined || String(crudo).trim() === "";
}

/**
 * La regla de los porcentajes, tal como la aplica `parsePct` y la documentan la
 * hoja INSTRUCCIONES y las notas de `parametros` en la plantilla.
 */
export const REGLA_PORCENTAJE =
  "30%, 30, 0.30 o 0,30 valen lo mismo; un número mayor que 1 se lee como por ciento, " +
  "y 1 solo es 100% (para uno por ciento escriba 1%)";

const NINGUNO = "ningún valor: queda vacío, como si no se hubiera capturado";
const omision = (valor: string): string => `${valor} (valor por omisión)`;
const porciento = (v: number): string => `${Number((v * 100).toFixed(4))}%`;
const ddmmaaaa = (d: Date): string =>
  `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;

function textoLibre(porOmision: string | null): LecturaParametro<string> {
  return {
    leer: parseTexto,
    formatos: "cualquier texto",
    porOmision: porOmision === null ? NINGUNO : omision(`"${porOmision}"`),
  };
}

function lista<T extends string>(opciones: readonly T[], porOmision: T): LecturaParametro<T> {
  return {
    leer: (crudo) => canonizar(opciones, crudo),
    formatos: `una de: ${opciones.join(", ")}`,
    porOmision: omision(`"${porOmision}"`),
  };
}

function siNo(porOmision: boolean | null): LecturaParametro<boolean> {
  return {
    leer: parseBool,
    formatos: "SI o NO (también se acepta Sí, si, true, false, 1 o 0)",
    porOmision:
      porOmision === null ? "ningún valor: la pregunta queda sin contestar" : omision(porOmision ? "SI" : "NO"),
  };
}

function porcentaje(porOmision: number): LecturaParametro<number> {
  return {
    leer: parsePct,
    formatos: `un porcentaje entre 0% y 100%: ${REGLA_PORCENTAJE}`,
    porOmision: omision(porciento(porOmision)),
  };
}

function fecha(porOmision: Date | null): LecturaParametro<Date> {
  return {
    leer: parseFecha,
    formatos: `una fecha dd/mm/aaaa, como 31/12/2026, o una celda con formato de fecha de Excel, entre ${ANIO_MINIMO} y ${ANIO_MAXIMO}`,
    porOmision: porOmision === null ? NINGUNO : omision(ddmmaaaa(porOmision)),
  };
}

function diasEnteros(porOmision: number | null): LecturaParametro<number> {
  return {
    leer: parseEnteroNoNegativo,
    formatos: "un número entero de días, sin texto: 30",
    porOmision: porOmision === null ? NINGUNO : omision(String(porOmision)),
  };
}

function mayorQueCero(porOmision: number | null): LecturaParametro<number> {
  return {
    leer: parsePositivo,
    formatos: "un número mayor que cero, con punto o coma decimal y sin texto: 17.50 o 17,50",
    porOmision: porOmision === null ? NINGUNO : omision(String(porOmision)),
  };
}

const POR = PARAMETROS_POR_OMISION;

/** Como se lee cada parametro del contrato. El tipo exige que esten todos. */
export const LECTURAS: Lecturas = {
  nombre_cliente: textoLibre(POR.nombre_cliente),
  moneda_base: lista(MONEDA_BASE, POR.moneda_base),
  importes_incluyen_iva: siNo(POR.importes_incluyen_iva),
  tasa_iva: porcentaje(POR.tasa_iva),
  periodo_inicio: fecha(POR.periodo_inicio),
  periodo_fin: fecha(POR.periodo_fin),
  comision_base_default: lista(COMISION_BASE, POR.comision_base_default),
  dias_credito_default: diasEnteros(POR.dias_credito_default),
  provision_91_180: porcentaje(POR.provision_91_180),
  provision_mas_180: porcentaje(POR.provision_mas_180),
  tipo_cambio_usd: mayorQueCero(POR.tipo_cambio_usd),
};

/** Las claves del contrato, en el orden de la declaracion. */
export const CLAVES_PARAMETROS = Object.keys(LECTURAS) as readonly (keyof Parametros)[];
