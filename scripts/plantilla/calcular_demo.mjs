// Calcula, para el demo, los valores que dan las formulas de cobrado y saldo a nivel de folio.
// NO ES UN GENERADOR: registro de como se edito el demo el 2026-10-10. Lea README.md.
// Necesita `hyperformula`, que NO es dependencia del proyecto: se instala y se corre fuera del
// repositorio.  Uso:  node calcular_demo.mjs <carpeta con el demo descomprimido> <valores.json>
import { HyperFormula } from "hyperformula";
import { DOMParser } from "@xmldom/xmldom";
import { readFileSync, writeFileSync } from "node:fs";
const dir = process.argv[2];
const xml = (p) => new DOMParser().parseFromString(readFileSync(`${dir}/${p}`, "utf8"), "text/xml");
const sst = [...xml("xl/sharedStrings.xml").getElementsByTagName("si")].map((si) => [...si.getElementsByTagName("t")].map((t) => t.textContent).join(""));
const COLS = "ABCDEFGHIJKLMNOPQR";
function matriz(parte, filas, cols) {
  const m = Array.from({ length: filas }, () => Array.from({ length: cols }, () => null));
  for (const c of [...xml(parte).getElementsByTagName("c")]) {
    const ref = c.getAttribute("r"); const col = COLS.indexOf(ref.replace(/\d+$/, "")); const fila = Number(ref.replace(/^[A-Z]+/, "")) - 1;
    if (fila >= filas || col < 0 || col >= cols) continue;
    const v = c.getElementsByTagName("v")[0]?.textContent; if (v == null || v === "") continue;
    m[fila][col] = c.getAttribute("t") === "s" ? sst[Number(v)] : c.getAttribute("t") === "str" ? v : Number(v);
  }
  return m;
}
const ventas = matriz("xl/worksheets/sheet2.xml", 301, 18); const cobranza = matriz("xl/worksheets/sheet3.xml", 501, 7);
const P = (n) => `IF($A${n}="","",IF(COUNTIF($A$3:$A${n},$A${n})=1,SUMIF(cobranza!$B$3:$B$1000,$A${n},cobranza!$D$3:$D$1000),"↑"))`;
const Q = (n) => `IF($A${n}="","",IF(COUNTIF($A$3:$A${n},$A${n})=1,SUMIFS($H$3:$H$1000,$A$3:$A$1000,$A${n},$C$3:$C$1000,"<>Demo")-P${n},"↑"))`;
for (let n = 3; n <= 301; n++) { ventas[n - 1][15] = "=" + P(n); ventas[n - 1][16] = "=" + Q(n); }
const hf = HyperFormula.buildFromSheets({ ventas, cobranza }, { licenseKey: "gpl-v3" }); const id = hf.getSheetId("ventas");
const out = {}; let sumaP = 0, sumaQ = 0;
for (let n = 3; n <= 301; n++) {
  const p = hf.getCellValue({ sheet: id, col: 15, row: n - 1 }), q = hf.getCellValue({ sheet: id, col: 16, row: n - 1 });
  if (typeof p === "object" || typeof q === "object") throw new Error("error de formula en la fila " + n);
  out[n] = { folio: ventas[n - 1][0], P: { f: P(n), v: p }, Q: { f: Q(n), v: q } };
  if (typeof p === "number") sumaP += p; if (typeof q === "number") sumaQ += q;
}
writeFileSync(process.argv[3], JSON.stringify(out));
console.log("suma de cobrado:", sumaP, "| suma de saldo:", sumaQ);
for (const n of [3, 8, 10, 11, 17, 18, 19, 20, 27, 28]) console.log(n, out[n].folio, out[n].P.v, out[n].Q.v);
