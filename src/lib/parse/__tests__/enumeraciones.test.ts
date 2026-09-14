import { describe, expect, it } from "vitest";

import * as XLSX from "xlsx";

import { ENCABEZADOS } from "../../exportar";
import { ENUMERACIONES } from "../../schema";
import { readWorkbookFromBuffer } from "../readWorkbook";
import { HOJAS_TABULARES, type NombreHoja } from "../tipos";
import { type ResultadoValidacion, validate } from "../validate";

/**
 * Las seis columnas de lista frente a lo que escribe una persona.
 *
 * Criterio (docs/decisiones.md, 2026-09-13): tras canonizar, un valor que no es
 * de la lista recibe lo mismo que la celda vacia y se avisa como advertencia.
 * Invariante: nunca llega al Dataset un valor fuera de la lista, y nunca se
 * sustituye uno sin que el panel lo diga.
 */
const FILA_BASE: Readonly<Record<NombreHoja, Readonly<Record<string, string>>>> = {
  ventas: { folio: "V-1", fecha: "15/01/2026", linea: "Equipo", cliente: "Cliente A", modelo: "Modelo A", costo_unitario: "800", precio_venta: "1000", comision_base: "Venta", condicion: "Credito" },
  cobranza: { folio_pago: "P-1", folio_venta: "V-1", fecha_pago: "20/01/2026", monto: "100", metodo: "Efectivo" },
  gastos: { folio_gasto: "G-1", fecha: "10/01/2026", categoria: "Renta", descripcion: "Renta de oficina", monto: "50", tipo: "Fijo" },
};

const FOLIO: Readonly<Record<NombreHoja, string>> = { ventas: "folio", cobranza: "folio_pago", gastos: "folio_gasto" };

/** Las tres hojas con su fila base; en `hoja`, una fila por cada valor dado a `campo`. */
function cargar(hoja: NombreHoja, campo: string, valores: readonly string[]): ResultadoValidacion {
  const libro = XLSX.utils.book_new();
  for (const h of HOJAS_TABULARES) {
    const filas =
      h === hoja
        ? valores.map((valor, i) => ({ ...FILA_BASE[h], [FOLIO[h]]: `${FILA_BASE[h][FOLIO[h]]}${i}`, [campo]: valor }))
        : [FILA_BASE[h]];
    // Las ventas conservan V-1 para que la cobranza no quede huerfana.
    if (h === "ventas" && hoja === "ventas") filas.push(FILA_BASE.ventas);
    const aoa = [[...ENCABEZADOS[h]], ...filas.map((f) => ENCABEZADOS[h].map((c) => f[c] ?? ""))];
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(aoa), h);
  }
  const datos = XLSX.write(libro, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return validate(readWorkbookFromBuffer(datos, "prueba.xlsx", XLSX));
}

const CASOS = HOJAS_TABULARES.flatMap((hoja) =>
  Object.entries(ENUMERACIONES[hoja]).map(([campo, e]) => ({ hoja, campo, e })),
);

/** Advertencias sobre columnas de lista. Solo advertencias: la fila Demo produce un info en `linea`. */
const avisosDeLista = (r: ResultadoValidacion) =>
  r.hallazgos.filter(
    (h) => h.severidad === "advertencia" && CASOS.some((c) => c.hoja === h.hoja && c.campo === h.campo),
  );

/** El valor de `campo` en las filas de `hoja` que vienen de `valores` (sin la fila base agregada). */
const valoresEn = (r: ResultadoValidacion, hoja: NombreHoja, campo: string, n: number) =>
  (r.dataset[hoja] as readonly object[]).slice(0, n).map((f) => (f as Record<string, unknown>)[campo]);

const ACENTOS: Readonly<Record<string, string>> = { a: "á", e: "é", i: "í", o: "ó", u: "ú" };
const acentuar = (s: string) => s.replace(/[aeiou]/, (v) => ACENTOS[v] ?? v);

describe("columnas de lista", () => {
  it("son seis, una por enumeracion del contrato", () => {
    expect(CASOS.map((c) => `${c.hoja}.${c.campo}`)).toEqual([
      "ventas.linea",
      "ventas.comision_base",
      "ventas.condicion",
      "cobranza.metodo",
      "gastos.categoria",
      "gastos.tipo",
    ]);
  });

  // "$hoja, $campo" y no "$hoja.$campo": vitest leeria lo segundo como ruta de propiedad.
  it.each(CASOS)("en $hoja, $campo: cada opcion se reconoce sin importar mayusculas, espacios ni acentos", ({ hoja, campo, e }) => {
    const opciones: readonly string[] = e.opciones;
    const grafias = opciones.flatMap((o) => [o.toUpperCase(), `  ${o.toLowerCase()} `, acentuar(o)]);
    const r = cargar(hoja, campo, grafias);
    expect(avisosDeLista(r)).toEqual([]);
    expect(valoresEn(r, hoja, campo, grafias.length)).toEqual(opciones.flatMap((o) => [o, o, o]));
  });

  it.each(CASOS)("en $hoja, $campo: un valor fuera de la lista recibe lo de la celda vacia, y se avisa", ({ hoja, campo, e }) => {
    const vacia = cargar(hoja, campo, [""]);
    const rara = cargar(hoja, campo, ["Valor inventado"]);

    expect(valoresEn(rara, hoja, campo, 1)).toEqual([e.siVacia]);
    expect(valoresEn(rara, hoja, campo, 1)).toEqual(valoresEn(vacia, hoja, campo, 1));
    expect(avisosDeLista(vacia)).toEqual([]);

    const avisos = avisosDeLista(rara);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ severidad: "advertencia", hoja, campo, fila: 2 });
    expect(avisos[0]?.mensaje).toContain('"Valor inventado"');
    for (const opcion of e.opciones) expect(avisos[0]?.accion).toContain(opcion);
  });
});
