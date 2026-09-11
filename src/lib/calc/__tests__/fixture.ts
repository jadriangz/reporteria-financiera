import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import * as XLSX from "xlsx";

import { readWorkbookFromBuffer } from "../../parse/readWorkbook";
import { validate } from "../../parse/validate";
import type { Dataset } from "../../schema";

/**
 * Fixture compartido: el archivo de demostracion, leido por el mismo parser que
 * usa la app. No hay transcripcion a mano en ningun punto.
 *
 * DATOS 100% FICTICIOS. La empresa "Agrodrones del Bajio S.A. de C.V." no
 * existe; clientes, series, importes, fechas y gastos son inventados. Ningun
 * archivo con datos reales de un cliente entra al repositorio, ni siquiera como
 * fixture (GOBERNANZA.md, seccion 10).
 *
 * El archivo se construyo para ejercitar los casos limite que el motor debe
 * resolver y que antes no se probaban:
 *
 *   - Los CINCO tramos de antiguedad con saldo, el de 91-180 incluido.
 *   - Base de medicion mixta: ventas con `dias_credito` (vencido) y sin el
 *     (antiguedad) en el mismo archivo.
 *   - Las seis lineas de producto, incluida la Demo que el motor excluye.
 *   - Un SOBRECOBRO (V-018: abonos por encima del precio, saldo negativo).
 *   - Una venta SIN FECHA (V-025) y abonos con fecha y metodo.
 */
const RUTA = fileURLToPath(
  new URL("../../../../docs/DEMO_Agrodrones_Bajio_FICTICIO.xlsx", import.meta.url),
);

export const ARCHIVO_FIXTURE = "DEMO_Agrodrones_Bajio_FICTICIO.xlsx";

/** El .xlsx del fixture como ArrayBuffer, para las pruebas que leen el archivo. */
export function bufferFixture(): ArrayBuffer {
  const buf = readFileSync(RUTA);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

export function cargarFixture(): Dataset {
  return validate(readWorkbookFromBuffer(bufferFixture(), ARCHIVO_FIXTURE, XLSX)).dataset;
}

/**
 * Fecha de corte FIJA para las pruebas.
 *
 * El aging depende del corte, asi que usar "hoy" haria que la suite empezara a
 * fallar sola con el paso de los dias. Los valores esperados corresponden a
 * este corte y solo a este.
 */
export const CORTE = new Date(Date.UTC(2026, 8, 9));

/**
 * Las cifras verificadas del archivo de demostracion al corte 2026-09-09,
 * EXCLUYENDO la fila Demo (V-006). En centavos: el motor trabaja en centavos,
 * asi que son los pesos del archivo por 100.
 *
 * Si un cambio rompe estos numeros, el cambio esta mal. Las cifras se
 * verifican, no se ajustan (GOBERNANZA.md, seccion 1).
 */
export const ESPERADO = {
  operaciones: 24,
  ventaTotal: 449_690_000,
  costoTotal: 327_800_000,
  utilidadBruta: 121_890_000,
  /** utilidadBruta / ventaTotal = 27.11%. */
  margen: 0.2711,
  comision: 14_615_000,
  utilidadContribucion: 107_275_000,
  cobrado: 254_110_000,
  saldo: 195_580_000,
  gastosFijos: 64_080_000,
  gastosVariables: 36_010_000,
  resultadoOperativo: 7_185_000,
  /** Punto de equilibrio por mes: el del periodo entre los 9 meses del eje. */
  puntoEquilibrioMensual: 29_846_589,
  /** venta_total / operaciones, redondeado a centavo entero. */
  ticketPromedio: 18_737_083,
  aging: {
    "0-30": 68_300_000,
    "31-60": 9_480_000,
    "61-90": 39_000_000,
    "91-180": 11_800_000,
    "+180": 67_000_000,
    "sin-fecha": 0,
  },
  attachAmbos: 3,
  attachEquipo: 10,
  /** 3 de 10 = 30%. */
  attachTasa: 0.3,
} as const;

/** Folio de la unica fila `linea = "Demo"` del archivo. */
export const FOLIO_DEMO = "V-006";

/** Folio de la venta sobrecobrada: sus abonos superan el precio de venta. */
export const FOLIO_SOBRECOBRO = "V-018";

/** Folio de la unica venta sin fecha capturada. */
export const FOLIO_SIN_FECHA = "V-025";

/**
 * Recorre un resultado completo buscando NaN, Infinity o undefined.
 * Devuelve las rutas problematicas; vacio significa que el objeto es sano.
 */
export function rutasInvalidas(valor: unknown, ruta = "$"): string[] {
  if (valor === undefined) return [`${ruta} = undefined`];
  if (valor === null) return [];
  if (typeof valor === "number") {
    if (Number.isNaN(valor)) return [`${ruta} = NaN`];
    if (!Number.isFinite(valor)) return [`${ruta} = ${valor > 0 ? "Infinity" : "-Infinity"}`];
    return [];
  }
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? [`${ruta} = Invalid Date`] : [];
  }
  if (Array.isArray(valor)) {
    return valor.flatMap((v, i) => rutasInvalidas(v, `${ruta}[${i}]`));
  }
  if (typeof valor === "object") {
    return Object.entries(valor).flatMap(([k, v]) => rutasInvalidas(v, `${ruta}.${k}`));
  }
  return [];
}
