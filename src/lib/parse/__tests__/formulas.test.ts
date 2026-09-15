import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";

import { partesXml } from "./xmlXlsx";

/**
 * Las formulas de las columnas calculadas de `ventas`, leidas con un PARSER XML.
 *
 * Por que no con expresiones regulares: el 2026-09-14, dos lecturas seguidas de
 * este mismo XML con expresiones regulares llevaron a conclusiones falsas. Una
 * celda vacia escrita `<c r="R27"/>` se tragaba la celda siguiente y parecia que
 * el demo tenia formulas desplazadas. Por que no con SheetJS: por dentro parte el
 * XML con expresiones regulares (`parse_ws_xml_data`), asi que no sirve para
 * verificar lo que el mismo SheetJS lee.
 *
 * Fija el estado real, verificado ese dia con dos lectores XML independientes:
 *
 * - El DEMO trae sus 1,200 formulas: N, O, P y Q, de la fila 2 a la 301.
 * - La PLANTILLA solo trae formula en la fila de ejemplo, desde v1.0.0.
 *
 * La regla del lector de ignorar esas columnas no depende de esto (CLAUDE.md,
 * "Restricciones aprendidas"). Cuando la v1.2 escriba las formulas a nivel de
 * folio, esta prueba tiene que cambiar a proposito.
 */

const NS_HOJA = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_RELACION = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PAQUETE = "http://schemas.openxmlformats.org/package/2006/relationships";

const COLUMNAS_CALCULADAS = ["N", "O", "P", "Q"];
const RANGO_SUMIF = "cobranza!$B$3:$B$1000";

const rutaDoc = (archivo: string): string =>
  fileURLToPath(new URL(`../../../../docs/${archivo}`, import.meta.url));

interface ElementoXml {
  getAttribute(nombre: string): string | null;
  getAttributeNS(ns: string, nombre: string): string | null;
  getElementsByTagNameNS(ns: string, nombre: string): ListaXml;
  readonly textContent: string | null;
}
interface ListaXml {
  readonly length: number;
  item(i: number): ElementoXml | null;
}
/** Un documento solo se recorre por etiqueta: no tiene atributos propios. */
interface DocumentoXml {
  getElementsByTagNameNS(ns: string, nombre: string): ListaXml;
}

const elementos = (lista: ListaXml): ElementoXml[] =>
  Array.from({ length: lista.length }, (_, i) => lista.item(i)).filter((e): e is ElementoXml => e !== null);

function documento(partes: ReadonlyMap<string, string>, ruta: string): DocumentoXml {
  const xml = partes.get(ruta);
  if (xml === undefined) throw new Error(`El .xlsx no trae la parte ${ruta}`);
  return new DOMParser().parseFromString(xml, "text/xml");
}

/** Columna -> filas con formula, en orden, y el texto de la formula de la fila 2. */
function formulasDeVentas(archivo: string): Map<string, { filas: number[]; fila2: string | null }> {
  const partes = partesXml(readFileSync(rutaDoc(archivo)));
  const libro = documento(partes, "xl/workbook.xml");
  const relaciones = documento(partes, "xl/_rels/workbook.xml.rels");

  const hoja = elementos(libro.getElementsByTagNameNS(NS_HOJA, "sheet")).find(
    (s) => s.getAttribute("name") === "ventas",
  );
  const id = hoja?.getAttributeNS(NS_RELACION, "id") ?? null;
  const relacion = elementos(relaciones.getElementsByTagNameNS(NS_PAQUETE, "Relationship")).find(
    (r) => r.getAttribute("Id") === id,
  );
  const destino = relacion?.getAttribute("Target");
  if (destino === undefined || destino === null) throw new Error(`${archivo}: no encuentro la hoja ventas`);
  const ventas = documento(partes, `xl/${destino.replace(/^\/?(xl\/)?/, "")}`);

  const porColumna = new Map<string, { filas: number[]; fila2: string | null }>();
  for (const celda of elementos(ventas.getElementsByTagNameNS(NS_HOJA, "c"))) {
    const formula = elementos(celda.getElementsByTagNameNS(NS_HOJA, "f"))[0];
    if (formula === undefined) continue;
    const ref = celda.getAttribute("r") ?? "";
    const columna = ref.replace(/\d+$/, "");
    const fila = Number(ref.slice(columna.length));
    const actual = porColumna.get(columna) ?? { filas: [], fila2: null };
    actual.filas.push(fila);
    if (fila === 2) actual.fila2 = formula.textContent;
    porColumna.set(columna, actual);
  }
  for (const valor of porColumna.values()) valor.filas.sort((a, b) => a - b);
  return porColumna;
}

const desde = (inicio: number, fin: number): number[] =>
  Array.from({ length: fin - inicio + 1 }, (_, i) => inicio + i);

describe("fórmulas de las columnas calculadas, leídas con un parser XML", () => {
  it("el demo trae sus 1,200 fórmulas: N, O, P y Q de la fila 2 a la 301", () => {
    const formulas = formulasDeVentas("DEMO_Agrodrones_Bajio_FICTICIO.xlsx");
    expect([...formulas.keys()].sort()).toEqual(COLUMNAS_CALCULADAS);
    for (const columna of COLUMNAS_CALCULADAS) {
      expect(formulas.get(columna)?.filas, columna).toEqual(desde(2, 301));
    }
    const total = [...formulas.values()].reduce((suma, v) => suma + v.filas.length, 0);
    expect(total).toBe(1200);
    expect(formulas.get("P")?.fila2).toContain(RANGO_SUMIF);
  });

  it("la plantilla solo trae fórmula en la fila de ejemplo", () => {
    const formulas = formulasDeVentas("Plantilla_Captura_Reporteria_v1.xlsx");
    expect([...formulas.keys()].sort()).toEqual(COLUMNAS_CALCULADAS);
    for (const columna of COLUMNAS_CALCULADAS) {
      expect(formulas.get(columna)?.filas, columna).toEqual([2]);
    }
    expect(formulas.get("P")?.fila2).toContain(RANGO_SUMIF);
  });
});
