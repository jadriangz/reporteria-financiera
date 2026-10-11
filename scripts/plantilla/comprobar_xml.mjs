// Lee cada parte XML de un .xlsx con un parser real y cuenta lo que hay en sus hojas.
// Uso, desde la raiz del repositorio:  node scripts/plantilla/comprobar_xml.mjs <archivo.xlsx> [hoja]
// Con [hoja], lista ademas que estilo usa cada columna en sus filas de captura.
import { DOMParser } from "@xmldom/xmldom";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [archivo, hojaDetalle] = process.argv.slice(2);
if (!archivo) throw new Error("Falta el archivo .xlsx");
const dir = mkdtempSync(join(tmpdir(), "xlsx-"));
execFileSync("unzip", ["-q", "-o", archivo, "-d", dir]);

const recorrer = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? recorrer(join(d, n)) : [join(d, n)]));
let fallas = 0;
function leer(ruta) {
  const errores = [];
  let doc = null;
  try {
    doc = new DOMParser({ onError: (nivel, mensaje) => errores.push(`${nivel}: ${mensaje}`) }).parseFromString(readFileSync(ruta, "utf8"), "text/xml");
  } catch (e) {
    errores.push(`fatal: ${e.message}`);
  }
  if (errores.length > 0) {
    fallas += 1;
    console.log("  FALLA", ruta.slice(dir.length + 1), errores[0].slice(0, 160));
  }
  return doc;
}

const partes = recorrer(dir).filter((p) => /\.(xml|rels)$/.test(p));
const docs = new Map(partes.map((p) => [p.slice(dir.length + 1), leer(p)]));
console.log(`${archivo}: ${partes.length} partes XML, ${fallas} con error de lectura`);

const libro = docs.get("xl/workbook.xml");
const relaciones = docs.get("xl/_rels/workbook.xml.rels");
const destino = Object.fromEntries([...relaciones.getElementsByTagName("Relationship")].map((r) => [r.getAttribute("Id"), r.getAttribute("Target")]));
console.log("  calcPr fullCalcOnLoad:", libro.getElementsByTagName("calcPr")[0]?.getAttribute("fullCalcOnLoad"));

for (const hoja of [...libro.getElementsByTagName("sheet")]) {
  const doc = docs.get(`xl/${destino[hoja.getAttribute("r:id")]}`);
  const filas = [...doc.getElementsByTagName("row")];
  const celdasPorFila = new Map();
  const estilos = new Map();
  let formulas = 0;
  let fueraDeOrden = 0;
  let refsAjenas = 0;
  for (const fila of filas) {
    const n = Number(fila.getAttribute("r"));
    const celdas = [...fila.getElementsByTagName("c")];
    if (n >= 3) celdasPorFila.set(celdas.length, (celdasPorFila.get(celdas.length) ?? 0) + 1);
    let previa = -1;
    for (const c of celdas) {
      const ref = c.getAttribute("r");
      const col = ref.replace(/\d+$/, "");
      const indice = [...col].reduce((t, ch) => t * 26 + ch.charCodeAt(0) - 64, 0);
      if (Number(ref.slice(col.length)) !== n) refsAjenas += 1;
      if (indice <= previa) fueraDeOrden += 1;
      previa = indice;
      const clave = `${col}:s${c.getAttribute("s")}`;
      if (n >= 3) estilos.set(clave, (estilos.get(clave) ?? 0) + 1);
      if (c.getElementsByTagName("f").length > 0) formulas += 1;
    }
  }
  const numeros = filas.map((r) => Number(r.getAttribute("r")));
  const enOrden = numeros.every((v, i) => i === 0 || v > numeros[i - 1]);
  const nombre = hoja.getAttribute("name");
  console.log(
    `  ${nombre}: filas ${numeros[0]}..${numeros[numeros.length - 1]} (${filas.length}, en orden: ${enOrden})` +
      ` | celdas por fila de captura: ${[...celdasPorFila].map(([k, v]) => `${k}→${v}`).join(",")}` +
      ` | formulas: ${formulas} | celdas fuera de orden: ${fueraDeOrden} | refs de otra fila: ${refsAjenas}` +
      ` | dim: ${doc.getElementsByTagName("dimension")[0]?.getAttribute("ref")}`,
  );
  if (hojaDetalle === nombre) console.log("     estilos por columna:", [...estilos].map(([k, v]) => `${k}x${v}`).join(" "));
}
if (fallas > 0) process.exitCode = 1;
