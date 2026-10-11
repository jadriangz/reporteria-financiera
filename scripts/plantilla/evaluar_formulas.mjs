// Evalua las FORMULAS REALES de la plantilla v2 (leidas de su XML) con un motor de hoja de calculo,
// sobre datos inventados, para comprobar lo que hacen. No es Excel: es una segunda opinion.
// Necesita `hyperformula`, que NO es dependencia del proyecto: se instala y se corre fuera del
// repositorio.  Uso:  node evaluar_formulas.mjs <plantilla.xlsx>
import { HyperFormula } from "hyperformula";
import { DOMParser } from "@xmldom/xmldom";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os"; import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "xlsx-")); execFileSync("unzip", ["-q", "-o", process.argv[2], "-d", dir]);
const hoja = new DOMParser().parseFromString(readFileSync(`${dir}/xl/worksheets/sheet3.xml`, "utf8"), "text/xml");
const formulas = new Map([...hoja.getElementsByTagName("c")].filter((c) => c.getElementsByTagName("f").length).map((c) => [c.getAttribute("r"), "=" + c.getElementsByTagName("f")[0].textContent]));
const COLS = "ABCDEFGHIJKLMNOPQR"; const FILAS = 12;
const ventas = Array.from({ length: FILAS }, (_, i) => Array.from(COLS, (c) => formulas.get(c + (i + 1)) ?? null));
ventas[0] = ["folio","fecha","linea","cliente","modelo","serie","costo_unitario","precio_venta","comision_pct","comision_base","dias_credito","condicion","vendedor","utilidad_bruta","margen_pct","cobrado","saldo","notas"];
ventas[1] = ["V-000","15/03/2026","Equipo","EJEMPLO","Modelo A","X",200000,260000,0.05,"Venta",90,"Credito","Nombre", ...["N2","O2","P2","Q2"].map((r) => formulas.get(r)), "ejemplo"];
const pon = (fila, valores) => { for (const [col, v] of Object.entries(valores)) ventas[fila - 1][COLS.indexOf(col)] = v; };
// Datos inventados. V-101: equipo y accesorio. V-102: una partida. V-103: equipo + partida Demo con precio. V-101 otra vez, no contigua.
pon(3, { A: "V-101", C: "Equipo", D: "Cliente A", E: "Modelo A", G: 80000, H: 100000, K: 90, L: "Credito", M: "Vendedor Uno" });
pon(4, { A: "V-101", C: "Accesorios", E: "Modelo B", G: 5000, H: 10000 });
pon(5, { A: "V-102", C: "Equipo", D: "Cliente B", E: "Modelo C", G: 60000, H: 80000, L: "Contado" });
pon(6, { A: "V-103", C: "Equipo", D: "Cliente C", E: "Modelo A", G: 80000, H: 100000 });
pon(7, { A: "V-103", C: "demo", E: "Modelo D", G: 70000, H: 90000 });
pon(8, { A: "V-101", C: "Refacciones", E: "Modelo E", G: 500, H: 1000 });
const cobranza = [["folio_pago","folio_venta","fecha_pago","monto"],["P-000","V-000","20/04/2026",100000],["P-001","V-101","20/01/2026",40000],["P-002","V-101","25/02/2026",20000],["P-003","V-102","01/03/2026",80000]];
const hf = HyperFormula.buildFromSheets({ ventas, cobranza }, { licenseKey: "gpl-v3" });
const id = hf.getSheetId("ventas"); const v = (ref) => { const col = COLS.indexOf(ref[0]); const val = hf.getCellValue({ sheet: id, col, row: Number(ref.slice(1)) - 1 }); return typeof val === "object" && val !== null ? "#ERR:" + val.value : val; };
console.log("fila folio  cliente      dias cond      vendedor       utilidad margen  cobrado saldo");
for (let n = 2; n <= 10; n++) console.log(String(n).padStart(3), String(v("A" + n) ?? "").padEnd(6), JSON.stringify(v("D" + n)).padEnd(12), JSON.stringify(v("K" + n)).padEnd(4), JSON.stringify(v("L" + n)).padEnd(9), JSON.stringify(v("M" + n)).padEnd(14), JSON.stringify(v("N" + n)).padEnd(8), JSON.stringify(typeof v("O" + n) === "number" ? Number(v("O" + n).toFixed(3)) : v("O" + n)).padEnd(7), JSON.stringify(v("P" + n)).padEnd(7), JSON.stringify(v("Q" + n)));
const errores = []; for (let n = 2; n <= FILAS; n++) for (const c of COLS) { const x = v(c + n); if (typeof x === "string" && x.startsWith("#ERR")) errores.push(c + n + x); }
console.log("celdas con error:", errores.join(" ") || "ninguna");
