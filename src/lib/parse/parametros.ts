import {
  COMISION_BASE,
  MONEDA_BASE,
  type Parametros,
  ParametrosSchema,
  canonizar,
  parseBool,
  parseFecha,
  parseNumero,
  parsePct,
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
 * Cada parametro declara aqui como se lee y que formatos acepta. `validate()` lee
 * con esta declaracion y la regla `parametro-no-reconocido` avisa con esta misma
 * declaracion, asi que lo que se aplica y lo que se avisa no pueden divergir.
 * Ver docs/decisiones.md (2026-09-14).
 */

/** Lo que se aplica cuando un parametro esta vacio o no se pudo leer. */
export const PARAMETROS_POR_OMISION: Parametros = ParametrosSchema.parse({});

export interface LecturaParametro<T> {
  /** El valor interpretado, o null si lo capturado no se puede leer. Nunca recibe una celda vacia. */
  readonly leer: (crudo: RawCelda) => T | null;
  /** Que formatos se aceptan, dicho para quien captura. Completa la frase "Escriba ...". */
  readonly formatos: string;
  /** Lo que se aplica si no se puede leer, dicho para quien captura. Completa "se aplica ...". */
  readonly porOmision: string;
}

type Lecturas = { readonly [K in keyof Parametros]-?: LecturaParametro<NonNullable<Parametros[K]>> };

/** Celda sin capturar: vacia o solo espacios. No es un valor, y no se avisa. */
export function sinCapturar(crudo: RawCelda | undefined): boolean {
  return crudo === null || crudo === undefined || String(crudo).trim() === "";
}

/**
 * La regla de los porcentajes: la misma de `comision_pct` en ventas (`parsePct`),
 * y la que documentan la hoja INSTRUCCIONES y las notas de `parametros` en la
 * plantilla. El caso ambiguo se resuelve asi: un numero mayor que 1 se lee como
 * por ciento ("30" es 30%, nunca 3000%); uno entre 0 y 1, como fraccion ("0.30"
 * es 30%); con el signo %, siempre por ciento. "1" solo es 100%.
 */
export const REGLA_PORCENTAJE =
  "30%, 30, 0.30 o 0,30 valen lo mismo; un numero mayor que 1 se lee como por ciento, " +
  "y 1 solo es 100% (para uno por ciento escriba 1%)";

/** Anios que puede tener una fecha de periodo. Un serial fuera de rango es un numero en la celda equivocada. */
const ANIO_MINIMO = 1990;
const ANIO_MAXIMO = 2100;

const NINGUNO = "ningun valor: queda vacio, como si no se hubiera capturado";
const omision = (valor: string): string => `${valor} (valor por omision)`;
const porciento = (v: number): string => `${Number((v * 100).toFixed(4))}%`;
const ddmmaaaa = (d: Date): string =>
  `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;

function textoLibre(porOmision: string | null): LecturaParametro<string> {
  return {
    leer: (crudo) => {
      const s = String(crudo ?? "").trim();
      return s === "" ? null : s;
    },
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
    leer: (crudo) => parseBool(crudo),
    formatos: "SI o NO (tambien se acepta Si, si, true, false, 1 o 0)",
    porOmision:
      porOmision === null ? "ningun valor: la pregunta queda sin contestar" : omision(porOmision ? "SI" : "NO"),
  };
}

function porcentaje(porOmision: number): LecturaParametro<number> {
  return {
    leer: (crudo) => {
      const n = parsePct(crudo);
      return n !== null && n >= 0 && n <= 1 ? n : null;
    },
    formatos: `un porcentaje entre 0% y 100%: ${REGLA_PORCENTAJE}`,
    porOmision: omision(porciento(porOmision)),
  };
}

function fecha(porOmision: Date | null): LecturaParametro<Date> {
  return {
    leer: (crudo) => {
      const f = parseFecha(crudo);
      if (f === null || Number.isNaN(f.getTime())) return null;
      const anio = f.getUTCFullYear();
      return anio >= ANIO_MINIMO && anio <= ANIO_MAXIMO ? f : null;
    },
    formatos: "una fecha dd/mm/aaaa, como 31/12/2026, o una celda con formato de fecha de Excel",
    porOmision: porOmision === null ? NINGUNO : omision(ddmmaaaa(porOmision)),
  };
}

function diasEnteros(porOmision: number | null): LecturaParametro<number> {
  return {
    leer: (crudo) => {
      const n = parseNumero(crudo);
      return n !== null && Number.isInteger(n) && n >= 0 ? n : null;
    },
    formatos: "un numero entero de dias, sin texto: 30",
    porOmision: porOmision === null ? NINGUNO : omision(String(porOmision)),
  };
}

function mayorQueCero(porOmision: number | null): LecturaParametro<number> {
  return {
    leer: (crudo) => {
      const n = parseNumero(crudo);
      return n !== null && n > 0 ? n : null;
    },
    formatos: "un numero mayor que cero, con punto o coma decimal y sin texto: 17.50 o 17,50",
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
