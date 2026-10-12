import { DOMParser } from "@xmldom/xmldom";
import * as XLSX from "xlsx";

/**
 * Partes XML de un .xlsx y la comprobacion de que estan bien formadas, para las
 * pruebas de los archivos que la app ofrece como descarga.
 *
 * Existe por un defecto que ya paso: la plantilla se publico con 1,297 filas sin
 * cerrar en ventas, cobranza y gastos. SheetJS la leia sin quejarse, asi que
 * ninguna prueba lo noto, y Excel pedia reparar el archivo. Como la plantilla se
 * edita a mano sobre su XML (GOBERNANZA.md, seccion 7), la cerca tiene que mirar
 * el XML, no lo que SheetJS entiende de el.
 */

/** Lo que usamos del modulo CFB que SheetJS trae dentro; sus tipos lo declaran sin forma. */
interface ContenedorZip {
  readonly FullPaths: readonly string[];
  readonly FileIndex: readonly { readonly content?: Uint8Array | readonly number[] }[];
}
interface ModuloCfb {
  read(datos: Uint8Array, opciones: { readonly type: "buffer" }): ContenedorZip;
}
const CFB: ModuloCfb = XLSX.CFB;

/** Ruta dentro del zip -> texto, de las partes .xml y .rels. */
export function partesXml(datos: Uint8Array): Map<string, string> {
  const zip = CFB.read(datos, { type: "buffer" });
  const partes = new Map<string, string>();
  zip.FullPaths.forEach((ruta, i) => {
    const contenido = zip.FileIndex[i]?.content;
    if (contenido === undefined || !/\.(xml|rels)$/.test(ruta)) return;
    partes.set(ruta.replace(/^Root Entry\//, ""), Buffer.from(contenido).toString("utf8"));
  });
  return partes;
}

const atributos = (etiqueta: string): Map<string, string> =>
  new Map([...etiqueta.matchAll(/([\w:]+)="([^"]*)"/g)].map((m) => [m[1] ?? "", m[2] ?? ""]));

/** Nombre de hoja -> XML de su parte, en el orden del libro, siguiendo sus relaciones. */
export function hojasXml(partes: ReadonlyMap<string, string>): Map<string, string> {
  const destinos = new Map<string, string>();
  for (const [etiqueta] of (partes.get("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship\b[^>]*>/g)) {
    const a = atributos(etiqueta);
    destinos.set(a.get("Id") ?? "", `xl/${(a.get("Target") ?? "").replace(/^\/?(xl\/)?/, "")}`);
  }
  const hojas = new Map<string, string>();
  for (const [etiqueta] of (partes.get("xl/workbook.xml") ?? "").matchAll(/<sheet\b[^>]*>/g)) {
    const a = atributos(etiqueta);
    const xml = partes.get(destinos.get(a.get("r:id") ?? "") ?? "");
    if (xml !== undefined) hojas.set(a.get("name") ?? "", xml);
  }
  return hojas;
}

const NOMBRE = String.raw`[A-Za-z_][\w.:-]*`;
const ETIQUETA = new RegExp(
  String.raw`<(/?)(${NOMBRE})((?:\s+${NOMBRE}\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(/?)>`,
  "y",
);
const AMPERSAND_SUELTO = /&(?!(?:lt|gt|amp|quot|apos|#\d+|#x[\da-fA-F]+);)/;

/** Salta una construccion `<?…?>`, `<!--…-->` o `<![CDATA[…]]>`; devuelve donde sigue, o -1. */
function saltar(xml: string, desde: number): number | null {
  for (const [abre, cierra] of [["<?", "?>"], ["<!--", "-->"], ["<![CDATA[", "]]>"]] as const) {
    if (!xml.startsWith(abre, desde)) continue;
    const fin = xml.indexOf(cierra, desde + abre.length);
    return fin === -1 ? -1 : fin + cierra.length;
  }
  return null;
}

/**
 * `null` si el XML esta bien formado; si no, la primera falla con su posicion.
 *
 * No es un parser completo: no hay uno en las dependencias y no vale agregarlo
 * para una prueba. Revisa lo que una edicion a mano de OOXML puede romper:
 * etiquetas legibles con atributos entre comillas, anidacion balanceada, un solo
 * elemento raiz y ningun `&` suelto en el texto. OOXML no usa DTD, asi que con eso
 * se cubre la gramatica que aparece en estos archivos.
 */
export function fallaXml(xml: string): string | null {
  const pila: string[] = [];
  let hayRaiz = false;
  let i = xml.charCodeAt(0) === 0xfeff ? 1 : 0;

  while (i < xml.length) {
    const lt = xml.indexOf("<", i);
    const texto = xml.slice(i, lt === -1 ? xml.length : lt);
    if (AMPERSAND_SUELTO.test(texto)) return `"&" suelto cerca de la posicion ${i}`;
    if (pila.length === 0 && texto.trim() !== "") return `texto fuera del elemento raiz en la posicion ${i}`;
    if (lt === -1) break;

    const siguiente = saltar(xml, lt);
    if (siguiente === -1) return `construccion sin terminar en la posicion ${lt}`;
    if (siguiente !== null) {
      i = siguiente;
      continue;
    }

    ETIQUETA.lastIndex = lt;
    const m = ETIQUETA.exec(xml);
    if (m === null) return `etiqueta ilegible en la posicion ${lt}: ${xml.slice(lt, lt + 40)}`;
    const [, cierre, nombre = "", attrs, autocierre] = m;

    if (cierre) {
      if (autocierre || attrs) return `cierre </${nombre}> mal escrito en la posicion ${lt}`;
      const abierta = pila.pop();
      if (abierta !== nombre) return `</${nombre}> en la posicion ${lt} cierra <${abierta ?? "nada"}>`;
    } else {
      if (pila.length === 0 && hayRaiz) return `segundo elemento raiz <${nombre}> en la posicion ${lt}`;
      hayRaiz = true;
      if (!autocierre) pila.push(nombre);
    }
    i = ETIQUETA.lastIndex;
  }

  if (pila.length > 0) return `sin cerrar al terminar: <${pila.join("> <")}>`;
  return hayRaiz ? null : "sin elemento raiz";
}

/**
 * Lo que un PARSER XML REAL objeta de una parte: vacio si la lee sin quejarse.
 *
 * `fallaXml` es un verificador hecho a mano, de cuando no habia parser en las
 * dependencias. Se conserva —detecta la fila sin cerrar que ya se colo una
 * vez—, pero una edicion de miles de celdas no se da por buena con un
 * verificador propio: se le pregunta a `@xmldom/xmldom`, que es el mismo lector
 * con el que se hacen las afirmaciones sobre el contenido del archivo.
 */
export function erroresXml(xml: string): string[] {
  const errores: string[] = [];
  try {
    new DOMParser({ onError: (nivel, mensaje) => errores.push(`${nivel}: ${mensaje}`) }).parseFromString(xml, "text/xml");
  } catch (e) {
    errores.push(`fatal: ${e instanceof Error ? e.message : String(e)}`);
  }
  return errores;
}

// --------------------------- Lectura con el parser real ---------------------------

interface NodoXml {
  getAttribute(nombre: string): string | null;
  getElementsByTagName(nombre: string): { readonly length: number; item(i: number): NodoXml | null };
  readonly textContent: string | null;
}

function hijos(raiz: Pick<NodoXml, "getElementsByTagName">, etiqueta: string): NodoXml[] {
  const lista = raiz.getElementsByTagName(etiqueta);
  return Array.from({ length: lista.length }, (_, i) => lista.item(i)).filter((n): n is NodoXml => n !== null);
}

function documentoXml(xml: string): Pick<NodoXml, "getElementsByTagName"> {
  return new DOMParser().parseFromString(xml, "text/xml") as unknown as Pick<NodoXml, "getElementsByTagName">;
}

export interface CeldaXml {
  readonly ref: string;
  readonly columna: string;
  readonly fila: number;
  /** Indice en `cellXfs` de styles.xml. */
  readonly estilo: number;
  readonly formula: string | null;
}

/** Las celdas de una hoja, tal como estan en su XML. */
export function celdasXml(xmlHoja: string): CeldaXml[] {
  return hijos(documentoXml(xmlHoja), "c").map((c): CeldaXml => {
    const ref = c.getAttribute("r") ?? "";
    const columna = ref.replace(/\d+$/, "");
    return {
      ref,
      columna,
      fila: Number(ref.slice(columna.length)),
      estilo: Number(c.getAttribute("s") ?? 0),
      formula: hijos(c, "f")[0]?.textContent ?? null,
    };
  });
}

/** Por cada estilo de celda (`cellXfs`), el color de su letra: "FF0000FF" es el azul de captura. */
export function colorDeLetraPorEstilo(xmlEstilos: string): (string | null)[] {
  const doc = documentoXml(xmlEstilos);
  const fuentes = hijos(hijos(doc, "fonts")[0] ?? doc, "font").map((f) => hijos(f, "color")[0]?.getAttribute("rgb") ?? null);
  return hijos(hijos(doc, "cellXfs")[0] ?? doc, "xf").map((xf) => fuentes[Number(xf.getAttribute("fontId") ?? 0)] ?? null);
}

/** Un atributo del primer elemento con esa etiqueta, o null. */
export function atributoXml(xml: string, etiqueta: string, atributo: string): string | null {
  return hijos(documentoXml(xml), etiqueta)[0]?.getAttribute(atributo) ?? null;
}

/** El texto de todas las celdas de una hoja, resolviendo las cadenas compartidas. */
export function textosXml(xmlHoja: string, xmlCadenas: string): string[] {
  const cadenas = hijos(documentoXml(xmlCadenas), "si").map((si) => hijos(si, "t").map((t) => t.textContent ?? "").join(""));
  return hijos(documentoXml(xmlHoja), "c").flatMap((c) => {
    const enLinea = hijos(c, "is")[0]?.textContent;
    if (enLinea !== undefined && enLinea !== null) return [enLinea];
    const v = hijos(c, "v")[0]?.textContent;
    return c.getAttribute("t") === "s" && v !== undefined && v !== null ? [cadenas[Number(v)] ?? ""] : [];
  });
}
