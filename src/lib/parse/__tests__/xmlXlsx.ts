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
