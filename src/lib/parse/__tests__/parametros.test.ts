import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import * as XLSX from "xlsx";

import { ARCHIVO_FIXTURE, bufferFixture } from "../../calc/__tests__/fixture";
import { ParametrosSchema } from "../../schema";
import { CLAVES_PARAMETROS, LECTURAS, PARAMETROS_POR_OMISION } from "../parametros";
import { readWorkbookFromBuffer } from "../readWorkbook";
import type { RawCelda } from "../tipos";
import { type ResultadoValidacion, validate } from "../validate";

/**
 * La hoja `parametros`, con lo que escribe una persona.
 *
 * El invariante: NINGUN valor capturado se descarta sin producir un hallazgo. Un
 * valor valido se aplica; uno mal escrito pero interpretable se aplica ya
 * interpretado; uno que no se puede leer cae a su valor por omision y el panel
 * dice que se capturo, que se aplico y que formatos se aceptan.
 */
const utc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));

/** Una hoja parametros con las filas dadas, leida por el camino de la app. En .xlsx los numeros llegan como numeros. */
function cargar(filas: readonly (readonly [string, RawCelda])[]): ResultadoValidacion {
  const libro = XLSX.utils.book_new();
  const aoa = [["parametro", "valor", "nota"], ...filas.map(([clave, valor]) => [clave, valor, ""])];
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(aoa), "parametros");
  const datos = XLSX.write(libro, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return validate(readWorkbookFromBuffer(datos, "parametros.xlsx", XLSX));
}

const avisosDe = (r: ResultadoValidacion, campo: string) =>
  r.hallazgos.filter((h) => h.hoja === "parametros" && h.severidad === "advertencia" && h.campo === campo);

const avisosDeParametros = (r: ResultadoValidacion) =>
  r.hallazgos.filter((h) => h.hoja === "parametros" && h.severidad === "advertencia");

interface Casos {
  readonly validos: readonly (readonly [RawCelda, unknown])[];
  readonly interpretables: readonly (readonly [RawCelda, unknown])[];
  readonly ilegibles: readonly RawCelda[];
}

const CASOS: Readonly<Record<(typeof CLAVES_PARAMETROS)[number], Casos>> = {
  // Texto libre: cualquier texto es un nombre. No existe un valor ilegible.
  nombre_cliente: {
    validos: [["North Precision", "North Precision"]],
    interpretables: [["  North Precision  ", "North Precision"], [2026, "2026"]],
    ilegibles: [],
  },
  moneda_base: {
    validos: [["MXN", "MXN"]],
    interpretables: [[" mxn ", "MXN"]],
    ilegibles: ["pesos mexicanos", "USD"],
  },
  importes_incluyen_iva: {
    validos: [["SI", true], ["NO", false]],
    interpretables: [["Sí", true], ["sí", true], ["true", true], [1, true], [true, true], ["no", false], [0, false]],
    ilegibles: ["Sí incluye", "tal vez"],
  },
  tasa_iva: {
    validos: [[0.16, 0.16]],
    interpretables: [["16%", 0.16], ["16", 0.16], [16, 0.16], ["0,16", 0.16]],
    ilegibles: ["dieciseis", "160%", "-16%"],
  },
  periodo_inicio: {
    validos: [[46_023, utc(2026, 1, 1)], ["01/01/2026", utc(2026, 1, 1)]],
    interpretables: [["1/1/2026", utc(2026, 1, 1)], [" 01-01-2026 ", utc(2026, 1, 1)]],
    ilegibles: ["2026-01-01", "enero 2026", 3.5],
  },
  periodo_fin: {
    validos: [[46_387, utc(2026, 12, 31)]],
    interpretables: [["31/12/26", utc(2026, 12, 31)]],
    ilegibles: ["31/02/2026"],
  },
  comision_base_default: {
    validos: [["Venta", "Venta"]],
    interpretables: [["utilidad", "Utilidad"], ["NO APLICA", "No aplica"]],
    ilegibles: ["Comision"],
  },
  dias_credito_default: {
    validos: [[30, 30]],
    interpretables: [["30", 30], [" 45 ", 45]],
    ilegibles: ["treinta", -5, "30.5"],
  },
  provision_91_180: {
    validos: [[0.25, 0.25]],
    interpretables: [["30%", 0.3], ["30", 0.3], [30, 0.3], ["0,30", 0.3], ["0.30", 0.3]],
    ilegibles: ["cincuenta", "-10%", "250%"],
  },
  provision_mas_180: {
    validos: [[0.5, 0.5]],
    interpretables: [["80%", 0.8], ["1", 1]],
    ilegibles: ["mucho"],
  },
  tipo_cambio_usd: {
    validos: [[18.4, 18.4]],
    interpretables: [["17,50", 17.5], ["17.5", 17.5]],
    ilegibles: ["17.5 MXN", 0, "-18"],
  },
};

describe("la hoja parametros: ningun valor capturado se descarta sin un hallazgo", () => {
  it("cada parametro del contrato tiene su lectura y sus casos", () => {
    expect([...CLAVES_PARAMETROS].sort()).toEqual(Object.keys(ParametrosSchema.shape).sort());
    expect(Object.keys(CASOS).sort()).toEqual([...CLAVES_PARAMETROS].sort());
  });

  describe.each(CLAVES_PARAMETROS)("%s", (clave) => {
    const casos = CASOS[clave];

    it("un valor valido, o mal escrito pero interpretable, se aplica sin aviso", () => {
      for (const [capturado, esperado] of [...casos.validos, ...casos.interpretables]) {
        const r = cargar([[clave, capturado]]);
        expect(r.dataset.parametros[clave], JSON.stringify(capturado)).toEqual(esperado);
        expect(avisosDeParametros(r), JSON.stringify(capturado)).toEqual([]);
      }
    });

    it("uno que no se puede leer aplica el valor por omision y lo dice: capturado, aplicado y formatos", () => {
      for (const capturado of casos.ilegibles) {
        const r = cargar([[clave, capturado]]);
        expect(r.dataset.parametros[clave], JSON.stringify(capturado)).toEqual(PARAMETROS_POR_OMISION[clave]);
        const avisos = avisosDe(r, clave);
        expect(avisos, JSON.stringify(capturado)).toHaveLength(1);
        expect(avisos[0]).toMatchObject({ severidad: "advertencia", hoja: "parametros", campo: clave, fila: 2 });
        expect(avisos[0]?.mensaje).toContain(`"${String(capturado).trim()}"`);
        expect(avisos[0]?.mensaje).toContain(LECTURAS[clave].porOmision);
        expect(avisos[0]?.accion).toContain(LECTURAS[clave].formatos);
      }
    });
  });

  it("barrido: con cualquier basura, cada parametro o la lee o la avisa; nunca la descarta callado", () => {
    const basura: readonly RawCelda[] = ["???", "tal vez", "12 abc", "-", "N/A", "0", "1", "100", "2026-01-01", "sí", 3.5, -1, true];
    for (const clave of CLAVES_PARAMETROS) {
      for (const valor of basura) {
        const r = cargar([[clave, valor]]);
        const leido = LECTURAS[clave].leer(valor);
        const avisado = avisosDe(r, clave).length > 0;
        expect(avisado, `${clave} = ${JSON.stringify(valor)}`).toBe(leido === null);
        if (leido !== null) expect(r.dataset.parametros[clave], `${clave} = ${JSON.stringify(valor)}`).toEqual(leido);
      }
    }
  });

  it("la regla de porcentajes resuelve el caso ambiguo: mayor que 1 es por ciento, y 1 solo es 100%", () => {
    const provision = (valor: RawCelda) => cargar([["provision_91_180", valor]]).dataset.parametros.provision_91_180;
    expect(provision("30")).toBe(0.3);
    expect(provision(30)).toBe(0.3);
    expect(provision("0.30")).toBe(0.3);
    expect(provision("1")).toBe(1);
    expect(provision("1%")).toBe(0.01);
  });

  it("un nombre que no es del contrato se avisa, y su valor no se aplica", () => {
    const r = cargar([["provision_90_180", "30%"]]);
    expect(r.dataset.parametros.provision_91_180).toBe(PARAMETROS_POR_OMISION.provision_91_180);
    const avisos = avisosDe(r, "provision_90_180");
    expect(avisos).toMatchObject([{ severidad: "advertencia", fila: 2 }]);
    expect(avisos[0]?.mensaje).toContain('"30%"');
  });

  it("un parametro repetido: se aplica la ultima fila, y se dice cuales se ignoraron", () => {
    const r = cargar([["provision_91_180", "30%"], ["provision_91_180", "40%"]]);
    expect(r.dataset.parametros.provision_91_180).toBe(0.4);
    const avisos = avisosDe(r, "provision_91_180");
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ fila: 3 });
    expect(avisos[0]?.mensaje).toContain("2, 3");
  });

  it("un valor escrito sin nombre de parametro se avisa", () => {
    const r = cargar([["", "30%"]]);
    expect(avisosDeParametros(r)).toMatchObject([{ severidad: "advertencia", fila: 2 }]);
  });

  it("el demo ficticio y la plantilla no producen ningun aviso de parametros", () => {
    const plantilla = readFileSync(
      fileURLToPath(new URL("../../../../docs/Plantilla_Captura_Reporteria_v1.xlsx", import.meta.url)),
    );
    const demo = validate(readWorkbookFromBuffer(bufferFixture(), ARCHIVO_FIXTURE, XLSX));
    const vacia = validate(
      readWorkbookFromBuffer(
        plantilla.buffer.slice(plantilla.byteOffset, plantilla.byteOffset + plantilla.byteLength) as ArrayBuffer,
        "Plantilla_Captura_Reporteria_v1.xlsx",
        XLSX,
      ),
    );
    expect(avisosDeParametros(demo)).toEqual([]);
    expect(avisosDeParametros(vacia)).toEqual([]);
    expect(demo.sustituciones).toEqual([]);
    expect(vacia.sustituciones).toEqual([]);
  });

  it("validate entrega como datos cada sustitucion que avisa, con lo capturado y lo aplicado", () => {
    const r = cargar([["provision_91_180", "cincuenta"], ["tasa_iva", "16%"], ["periodo_inicio", "2026-01-01"]]);
    expect(r.sustituciones).toEqual([
      { clave: "periodo_inicio", capturado: "2026-01-01", aplicado: LECTURAS.periodo_inicio.porOmision, fila: 4 },
      { clave: "provision_91_180", capturado: "cincuenta", aplicado: LECTURAS.provision_91_180.porOmision, fila: 2 },
    ]);
    // El panel y la interfaz salen de la misma lista: un aviso por sustitucion.
    expect(avisosDeParametros(r).map((h) => h.campo)).toEqual(r.sustituciones.map((s) => s.clave));
  });
});
