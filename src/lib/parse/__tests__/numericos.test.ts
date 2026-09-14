import { describe, expect, it } from "vitest";

import * as XLSX from "xlsx";

import { ENCABEZADOS } from "../../exportar";
import { readWorkbookFromBuffer } from "../readWorkbook";
import { HOJAS_TABULARES, type NombreHoja } from "../tipos";
import { type ResultadoValidacion, validate } from "../validate";

/**
 * Los campos numericos y de fecha de las hojas de datos, con lo que escribe una persona.
 *
 * El defecto (1.1.4): `dias_credito` se coercionaba con Number() y "30dias"
 * llegaba al aging como NaN; `comision_pct` aceptaba 150%; un importe con otra
 * gramatica se leia en silencio ("1,234.56" como $1.23); un serial de fecha sin
 * rango daba 1900, y con hora. El invariante: ningun valor capturado llega al
 * dataset como NaN o fuera de su dominio, y ninguno se descarta sin un hallazgo
 * que cite hoja, fila y campo.
 */
const utc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));

type Celda = string | number | boolean;

const BASE: Readonly<Record<NombreHoja, Readonly<Record<string, Celda>>>> = {
  ventas: {
    folio: "V-1",
    fecha: "15/01/2026",
    linea: "Equipo",
    cliente: "Cliente A",
    modelo: "Modelo A",
    costo_unitario: 800,
    precio_venta: 1000,
    comision_pct: 0.05,
    comision_base: "Venta",
    dias_credito: 30,
    condicion: "Credito",
  },
  cobranza: { folio_pago: "P-1", folio_venta: "V-1", fecha_pago: "20/01/2026", monto: 100, metodo: "Efectivo" },
  gastos: { folio_gasto: "G-1", fecha: "10/01/2026", categoria: "Renta", descripcion: "Renta", monto: 50, tipo: "Fijo" },
};

/** Las tres hojas con su fila base, y `valor` en `hoja.campo`. Leido por el camino de la app. */
function cargar(hoja: NombreHoja, campo: string, valor: Celda): ResultadoValidacion {
  const libro = XLSX.utils.book_new();
  for (const h of HOJAS_TABULARES) {
    const fila: Record<string, Celda> = { ...BASE[h], ...(h === hoja ? { [campo]: valor } : {}) };
    const aoa = [[...ENCABEZADOS[h]], ENCABEZADOS[h].map((c) => fila[c] ?? "")];
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(aoa), h);
  }
  const datos = XLSX.write(libro, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return validate(readWorkbookFromBuffer(datos, "prueba.xlsx", XLSX));
}

const valorEn = (r: ResultadoValidacion, hoja: NombreHoja, campo: string): unknown =>
  ((r.dataset[hoja] as readonly object[])[0] as Record<string, unknown> | undefined)?.[campo];

/**
 * Avisos sobre `hoja.campo`. Sin el de margen uniforme: con una sola venta, esa
 * regla siempre se dispara y cita `costo_unitario`, aunque no hable de su lectura.
 */
const avisosDe = (r: ResultadoValidacion, hoja: NombreHoja, campo: string) =>
  r.hallazgos.filter(
    (h) =>
      h.hoja === hoja &&
      h.campo === campo &&
      h.severidad !== "info" &&
      !h.mensaje.startsWith("El margen es exactamente"),
  );

interface Caso {
  readonly hoja: NombreHoja;
  readonly campo: string;
  readonly severidad: "error" | "advertencia";
  readonly validos: readonly (readonly [Celda, unknown])[];
  readonly ilegibles: readonly Celda[];
}

const CASOS: readonly Caso[] = [
  {
    hoja: "ventas",
    campo: "dias_credito",
    severidad: "advertencia",
    validos: [[90, 90], [" 45 ", 45], ["0", 0]],
    ilegibles: ["30dias", "-5", "30.5", "abc"],
  },
  {
    hoja: "ventas",
    campo: "comision_pct",
    severidad: "advertencia",
    validos: [["5", 0.05], ["0,05", 0.05], [0.05, 0.05], ["100%", 1]],
    ilegibles: ["150", 150, "-5%", "abc"],
  },
  {
    hoja: "ventas",
    campo: "precio_venta",
    severidad: "error",
    validos: [["$ 444.800,00", 44_480_000], ["1.500", 150_000], ["1234,5", 123_450], [1234.56, 123_456]],
    ilegibles: ["1,234.56", "1234.56", "1.50", "12.3456", "1.2.3", "abc"],
  },
  { hoja: "ventas", campo: "costo_unitario", severidad: "error", validos: [["800", 80_000]], ilegibles: ["800.00"] },
  { hoja: "cobranza", campo: "monto", severidad: "error", validos: [["100,50", 10_050]], ilegibles: ["1,234.56", "12.5"] },
  { hoja: "gastos", campo: "monto", severidad: "error", validos: [["1.234,56", 123_456]], ilegibles: ["1234.56"] },
  {
    hoja: "ventas",
    campo: "fecha",
    severidad: "error",
    validos: [[46_023, utc(2026, 1, 1)], [45_000.75, utc(2023, 3, 15)], ["15/01/26", utc(2026, 1, 15)]],
    ilegibles: [45, 100_000, "2026-01-15"],
  },
  { hoja: "cobranza", campo: "fecha_pago", severidad: "error", validos: [["20/01/2026", utc(2026, 1, 20)]], ilegibles: [3.5] },
  { hoja: "gastos", campo: "fecha", severidad: "error", validos: [[46_000, utc(2025, 12, 9)]], ilegibles: ["01/01/1985"] },
];

describe("campos numericos y de fecha de las hojas de datos", () => {
  describe.each(CASOS)("$hoja, $campo", ({ hoja, campo, severidad, validos, ilegibles }) => {
    it("un valor valido se lee, sin aviso", () => {
      for (const [capturado, esperado] of validos) {
        const r = cargar(hoja, campo, capturado);
        expect(valorEn(r, hoja, campo), JSON.stringify(capturado)).toEqual(esperado);
        expect(avisosDe(r, hoja, campo), JSON.stringify(capturado)).toEqual([]);
      }
    });

    it(`uno que no se puede leer queda vacio, nunca NaN, y se avisa como ${severidad} con su fila`, () => {
      for (const capturado of ilegibles) {
        const r = cargar(hoja, campo, capturado);
        expect(valorEn(r, hoja, campo), JSON.stringify(capturado)).toBeNull();
        const avisos = avisosDe(r, hoja, campo);
        expect(avisos, JSON.stringify(capturado)).toHaveLength(1);
        expect(avisos[0]).toMatchObject({ severidad, hoja, campo, fila: 2 });
        expect(avisos[0]?.mensaje).toContain(`"${String(capturado).trim()}"`);
      }
    });
  });

  it("barrido: con cualquier basura, ningun campo deja pasar NaN, Infinity ni un valor vacio sin aviso", () => {
    const basura: readonly Celda[] = ["30dias", "N/A", "-", "1e999", "1,5,5", "12:30", "--5", "5%%", true, -1, 1.5, 99_999_999];
    for (const { hoja, campo } of CASOS) {
      for (const valor of basura) {
        const r = cargar(hoja, campo, valor);
        const leido = valorEn(r, hoja, campo);
        const donde = `${hoja}.${campo} = ${JSON.stringify(valor)}`;
        if (typeof leido === "number") expect(Number.isFinite(leido), donde).toBe(true);
        if (leido instanceof Date) expect(Number.isNaN(leido.getTime()), donde).toBe(false);
        if (leido === null) expect(avisosDe(r, hoja, campo).length, donde).toBeGreaterThan(0);
      }
    }
  });

  it("dias_credito ilegible no se avisa dos veces: no es una venta sin dias_credito", () => {
    const r = cargar("ventas", "dias_credito", "30dias");
    expect(avisosDe(r, "ventas", "dias_credito").map((h) => h.mensaje)).toHaveLength(1);
    expect(avisosDe(r, "ventas", "dias_credito")[0]?.mensaje).toContain("antiguedad");
  });
});
