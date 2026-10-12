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
 * Fija el estado real:
 *
 * - El DEMO trae sus 1,200 formulas: N, O, P y Q, de la fila 2 a la 301.
 * - La PLANTILLA v1 solo traia formula en la fila de ejemplo, desde v1.0.0.
 * - La PLANTILLA v2 (v1.2.0) las trae en cada fila de captura, y ademas las
 *   cuatro de cabecera, que copian la fila de arriba al repetir el folio.
 *
 * Desde la v1.2.0 `cobrado` y `saldo` son del FOLIO, en el demo y en la v2:
 * aparecen en la primera fila de cada folio, y las demas muestran una flecha.
 * Repetidos en cada fila, la columna dejaria de poder sumarse.
 *
 * La regla del lector de ignorar las columnas calculadas no depende de nada de
 * esto (CLAUDE.md, "Restricciones aprendidas").
 */

const NS_HOJA = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_RELACION = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PAQUETE = "http://schemas.openxmlformats.org/package/2006/relationships";

const COLUMNAS_CALCULADAS = ["N", "O", "P", "Q"];
const RANGO_SUMIF = "cobranza!$B$3:$B$1000";
/** cliente, dias_credito, condicion y vendedor: la cabecera del folio. */
const COLUMNAS_CABECERA = ["D", "K", "L", "M"];
/** «Primera aparicion del folio en la hoja», no «la fila de arriba es distinta». */
const PRIMERA = "COUNTIF($A$3:$A3,$A3)=1";
const COBRADO_FILA_3 = `IF($A3="","",IF(${PRIMERA},SUMIF(${RANGO_SUMIF},$A3,cobranza!$D$3:$D$1000),"↑"))`;
const SALDO_FILA_3 = `IF($A3="","",IF(${PRIMERA},SUMIFS($H$3:$H$1000,$A$3:$A$1000,$A3,$C$3:$C$1000,"<>Demo")-P3,"↑"))`;

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

/** Columna -> filas con formula, en orden, y el texto de la formula de las filas 2 y 3. */
function formulasDeVentas(archivo: string): Map<string, { filas: number[]; fila2: string | null; fila3: string | null }> {
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

  const porColumna = new Map<string, { filas: number[]; fila2: string | null; fila3: string | null }>();
  for (const celda of elementos(ventas.getElementsByTagNameNS(NS_HOJA, "c"))) {
    const formula = elementos(celda.getElementsByTagNameNS(NS_HOJA, "f"))[0];
    if (formula === undefined) continue;
    const ref = celda.getAttribute("r") ?? "";
    const columna = ref.replace(/\d+$/, "");
    const fila = Number(ref.slice(columna.length));
    const actual = porColumna.get(columna) ?? { filas: [], fila2: null, fila3: null };
    actual.filas.push(fila);
    if (fila === 2) actual.fila2 = formula.textContent;
    if (fila === 3) actual.fila3 = formula.textContent;
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

  it("en el demo, cobrado y saldo son del folio: primera fila, y flecha en las demás", () => {
    const formulas = formulasDeVentas("DEMO_Agrodrones_Bajio_FICTICIO.xlsx");
    expect(formulas.get("P")?.fila3).toBe(COBRADO_FILA_3);
    expect(formulas.get("Q")?.fila3).toBe(SALDO_FILA_3);
  });

  it("la plantilla v1 solo traía fórmula en la fila de ejemplo", () => {
    const formulas = formulasDeVentas("Plantilla_Captura_Reporteria_v1.xlsx");
    expect([...formulas.keys()].sort()).toEqual(COLUMNAS_CALCULADAS);
    for (const columna of COLUMNAS_CALCULADAS) {
      expect(formulas.get(columna)?.filas, columna).toEqual([2]);
    }
    expect(formulas.get("P")?.fila2).toContain(RANGO_SUMIF);
  });

  it("la plantilla v2 trae sus fórmulas en cada fila de captura", () => {
    const formulas = formulasDeVentas("Plantilla_Captura_Reporteria_v2.xlsx");
    expect([...formulas.keys()].sort()).toEqual([...COLUMNAS_CABECERA, ...COLUMNAS_CALCULADAS]);
    // Las calculadas, desde el ejemplo; las de cabecera, desde la primera fila de captura.
    for (const columna of COLUMNAS_CALCULADAS) expect(formulas.get(columna)?.filas, columna).toEqual(desde(2, 301));
    for (const columna of COLUMNAS_CABECERA) expect(formulas.get(columna)?.filas, columna).toEqual(desde(3, 301));
    const total = [...formulas.values()].reduce((suma, v) => suma + v.filas.length, 0);
    expect(total).toBe(4 * 300 + 4 * 299);
  });

  it("en la v2, cobrado y saldo son del folio, y el saldo no cuenta las partidas Demo", () => {
    const formulas = formulasDeVentas("Plantilla_Captura_Reporteria_v2.xlsx");
    expect(formulas.get("P")?.fila3).toBe(COBRADO_FILA_3);
    expect(formulas.get("Q")?.fila3).toBe(SALDO_FILA_3);
    // Utilidad y margen siguen siendo de la partida: una por fila.
    expect(formulas.get("N")?.fila3).toBe('IF(H3="","",H3-G3)');
    expect(formulas.get("O")?.fila3).toBe('IFERROR(N3/H3,"")');
  });

  it("en la v2, la cabecera se copia de la fila de arriba solo si repite el folio", () => {
    const formulas = formulasDeVentas("Plantilla_Captura_Reporteria_v2.xlsx");
    for (const columna of COLUMNAS_CABECERA) {
      expect(formulas.get(columna)?.fila3, columna).toBe(`IF(AND($A3<>"",$A3=$A2),${columna}2,"")`);
    }
  });
});
