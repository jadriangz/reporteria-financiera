import { describe, expect, it } from "vitest";

import * as XLSX from "xlsx";

import { ENCABEZADOS } from "../../exportar";
import { readWorkbookFromBuffer } from "../../parse/readWorkbook";
import { validate } from "../../parse/validate";
import { COMISION_BASE, type Dataset } from "../../schema";
import { calcularVenta } from "../venta";

/**
 * La base de comision, escrita como la escriba el cliente.
 *
 * El defecto que motivo esta prueba: «utilidad» cobraba la comision sobre el
 * PRECIO, «no aplica» la cobraba en vez de anularla, y un comision_base_default
 * «utilidad» se descartaba sin aviso y quedaba "Venta". El monto esperado sale de
 * la formula de CLAUDE.md escrita aqui a mano, no de lo que devuelva el motor.
 */
type Base = (typeof COMISION_BASE)[number];

const PRECIO = 100_000; // pesos
const COSTO = 80_000;
const PCT = 0.1;

/** CLAUDE.md, «Definiciones de calculo»: comision_monto, en centavos enteros. */
function comisionSegunClaude(base: Base): number {
  const precio = PRECIO * 100;
  const utilidadBruta = (PRECIO - COSTO) * 100;
  return Math.round(base === "No aplica" ? 0 : base === "Utilidad" ? PCT * utilidadBruta : PCT * precio);
}

const GRAFIAS: Readonly<Record<Base, readonly string[]>> = {
  Venta: ["Venta", "venta", "VENTA", " venta "],
  Utilidad: ["Utilidad", "utilidad", "UTILIDAD", " utilidad "],
  "No aplica": ["No aplica", "no aplica", "NO APLICA", "  no   aplica "],
};

const venta = (folio: string, comision_base: string): Record<string, string> => ({
  folio,
  fecha: "15/01/2026",
  linea: "Equipo",
  cliente: "Cliente A",
  modelo: "Modelo A",
  costo_unitario: String(COSTO),
  precio_venta: String(PRECIO),
  comision_pct: String(PCT),
  comision_base,
});

/** Un .xlsx con ventas y parametros, leido y validado por el mismo camino que la app. */
function cargar(ventas: readonly Record<string, string>[], parametros: Readonly<Record<string, string>> = {}) {
  const libro = XLSX.utils.book_new();
  const filas = ventas.map((v) => ENCABEZADOS.ventas.map((c) => v[c] ?? ""));
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([[...ENCABEZADOS.ventas], ...filas]), "ventas");
  const clavesValor = Object.entries(parametros).map(([k, v]) => [k, v, ""]);
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([["parametro", "valor", "nota"], ...clavesValor]), "parametros");
  const datos = XLSX.write(libro, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return validate(readWorkbookFromBuffer(datos, "prueba.xlsx", XLSX));
}

const comisiones = (d: Dataset) => d.ventas.map((v) => calcularVenta(v, d.parametros));

describe("comision_base en la fila, sin importar como se escriba", () => {
  it.each(COMISION_BASE)("«%s» en cuatro grafias da el monto de la formula, tomado de la fila", (base) => {
    const { dataset, hallazgos } = cargar(GRAFIAS[base].map((g, i) => venta(`V-${i + 1}`, g)));
    expect(hallazgos.filter((h) => h.campo === "comision_base")).toEqual([]);
    const r = comisiones(dataset);
    expect(r.map((c) => c.comisionMonto)).toEqual(GRAFIAS[base].map(() => comisionSegunClaude(base)));
    expect(r.map((c) => [c.baseComision, c.origenBaseComision])).toEqual(GRAFIAS[base].map(() => [base, "fila"]));
  });

  it("las tres bases dan tres montos distintos: la prueba de arriba no pasa por casualidad", () => {
    expect(new Set(COMISION_BASE.map(comisionSegunClaude)).size).toBe(3);
  });

  it("un valor que no es de la lista cae a la base de parametros, y lo avisa", () => {
    const { dataset, hallazgos } = cargar([venta("V-1", "Utilida")], { comision_base_default: "Utilidad" });
    expect(hallazgos.filter((h) => h.campo === "comision_base")).toMatchObject([
      { severidad: "advertencia", hoja: "ventas", fila: 2 },
    ]);
    const [c] = comisiones(dataset);
    expect([c?.baseComision, c?.origenBaseComision, c?.comisionMonto]).toEqual([
      "Utilidad",
      "parametro",
      comisionSegunClaude("Utilidad"),
    ]);
  });
});

describe("comision_base_default en parametros", () => {
  it.each(COMISION_BASE)("«%s» en cuatro grafias se aplica a las ventas sin base propia", (base) => {
    for (const grafia of GRAFIAS[base]) {
      const { dataset, hallazgos } = cargar([venta("V-1", "")], { comision_base_default: grafia });
      expect(dataset.parametros.comision_base_default, grafia).toBe(base);
      expect(hallazgos.filter((h) => h.hoja === "parametros"), grafia).toEqual([]);
      const [c] = comisiones(dataset);
      expect(c?.comisionMonto, grafia).toBe(comisionSegunClaude(base));
      expect(c?.origenBaseComision, grafia).toBe("parametro");
    }
  });

  it("un valor que no es de la lista NO cae al default en silencio: dice que se capturo, que no se reconocio y que se aplico", () => {
    const { dataset, hallazgos } = cargar([venta("V-1", "")], { comision_base_default: "Comision" });
    const avisos = hallazgos.filter((h) => h.campo === "comision_base_default");
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ severidad: "advertencia", hoja: "parametros", fila: 2 });
    expect(avisos[0]?.mensaje).toContain('"Comision"');
    expect(avisos[0]?.mensaje).toContain('"Venta"');
    for (const opcion of COMISION_BASE) expect(avisos[0]?.accion).toContain(opcion);
    // Lo que el aviso dice que se aplico es lo que el motor aplica.
    expect(dataset.parametros.comision_base_default).toBe("Venta");
    expect(comisiones(dataset)[0]?.comisionMonto).toBe(comisionSegunClaude("Venta"));
  });
});
