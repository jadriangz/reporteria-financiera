import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import * as XLSX from "xlsx";

import { ENCABEZADOS } from "../../exportar";
import {
  CATEGORIA_GASTO,
  COMISION_BASE,
  CONDICION,
  LINEA,
  METODO_PAGO,
  TIPO_GASTO,
  capacidades,
  type Hallazgo,
} from "../../schema";
import { readWorkbookFromBuffer } from "../readWorkbook";
import { HOJAS_TABULARES, type NombreHoja, type RawSheets } from "../tipos";
import { validate, type ResultadoValidacion } from "../validate";
import {
  atributoXml,
  celdasXml,
  colorDeLetraPorEstilo,
  erroresXml,
  fallaXml,
  hojasXml,
  partesXml,
  textosXml,
} from "./xmlXlsx";

/**
 * El CONTRATO DE DATOS contra la plantilla real que descarga el cliente.
 *
 * Es la v2 (v1.2.0): las mismas columnas que la v1, con las filas de captura
 * completas —celdas de letra azul para lo que se escribe, de letra negra con
 * formula para lo calculado— y `cobrado` y `saldo` a nivel de folio. La v1 se
 * sigue aceptando, y al final de este archivo se prueba.
 *
 * Esta plantilla esta VACIA a proposito: encabezados, la fila verde de ejemplo
 * y las filas de captura con su formato y sus formulas, y nada mas. Ningun archivo con datos
 * de un cliente entra al repositorio (GOBERNANZA.md, seccion 10), asi que el
 * comportamiento del lector frente a datos reales se prueba con el archivo de
 * demostracion ficticio, en `demo.test.ts`.
 *
 * Lo que se verifica aqui es el acoplamiento mas fragil del proyecto: que
 * `schema.ts` y el .xlsx sigan coincidiendo campo por campo (GOBERNANZA.md,
 * seccion 7). Si divergen, la app lee mal el archivo del cliente y nadie se
 * entera hasta que un numero sale raro.
 */
const RUTA_PLANTILLA = fileURLToPath(
  new URL("../../../../docs/Plantilla_Captura_Reporteria_v2.xlsx", import.meta.url),
);

function leerPlantilla(): ArrayBuffer {
  const buf = readFileSync(RUTA_PLANTILLA);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function conId(hallazgos: readonly Hallazgo[], severidad: Hallazgo["severidad"]): Hallazgo[] {
  return hallazgos.filter((h) => h.severidad === severidad);
}

describe("la plantilla que descarga el cliente", () => {
  let raw: RawSheets;
  let res: ResultadoValidacion;

  beforeAll(() => {
    raw = readWorkbookFromBuffer(leerPlantilla(), "Plantilla_Captura_Reporteria_v2.xlsx", XLSX);
    res = validate(raw);
  });

  it("encuentra las cuatro hojas del contrato e ignora INSTRUCCIONES y _listas", () => {
    expect(raw.ventas.presente).toBe(true);
    expect(raw.cobranza.presente).toBe(true);
    expect(raw.gastos.presente).toBe(true);
    expect(raw.parametros.presente).toBe(true);
  });

  it("sus encabezados coinciden campo por campo con el contrato", () => {
    // El orden importa: la exportacion a Excel escribe en este mismo orden para
    // que el archivo exportado se pueda volver a cargar.
    for (const hoja of ["ventas", "cobranza", "gastos"] as const) {
      const leidos = [...raw[hoja].encabezados, ...raw[hoja].columnasIgnoradas];
      expect(new Set(leidos), hoja).toEqual(new Set(ENCABEZADOS[hoja]));
    }
  });

  it("ignora por completo las columnas calculadas de la hoja ventas", () => {
    expect(raw.ventas.columnasIgnoradas).toEqual([
      "utilidad_bruta",
      "margen_pct",
      "cobrado",
      "saldo",
    ]);
    for (const col of raw.ventas.columnasIgnoradas) {
      expect(raw.ventas.encabezados).not.toContain(col);
    }
  });

  it("esta vacia: solo trae la fila de ejemplo, que se descarta", () => {
    expect(res.dataset.ventas).toEqual([]);
    expect(res.dataset.cobranza).toEqual([]);
    expect(res.dataset.gastos).toEqual([]);
    expect(raw.ventas.filasEjemplo).toBe(1);
    expect(raw.cobranza.filasEjemplo).toBe(1);
    expect(raw.gastos.filasEjemplo).toBe(1);
  });

  it("descarta como vacias las filas de captura sin llenar, aunque traigan formulas", () => {
    // Desde la v2 cada fila de captura trae formulas: en las columnas calculadas
    // y tambien en las cuatro de cabecera, que copian la fila de arriba al
    // repetir el folio. Sin capturar nada, ninguna cuenta como dato.
    expect(raw.ventas.filasVacias).toBe(299);
    expect(raw.cobranza.filasVacias).toBe(499);
    expect(raw.gastos.filasVacias).toBe(499);
    const info = conId(res.hallazgos, "info");
    expect(info.some((h) => h.hoja === "ventas" && h.mensaje.includes("filas vacias"))).toBe(true);
  });

  it("no reporta errores ni advertencias: vacia, solo informa", () => {
    expect(conId(res.hallazgos, "error")).toEqual([]);
    expect(conId(res.hallazgos, "advertencia")).toEqual([]);
  });

  it("sin una sola fila capturada, ningun modulo queda habilitado", () => {
    const cap = capacidades(res.dataset);
    expect(cap.resumen).toBe(false);
    expect(cap.cobranza).toBe(false);
    expect(cap.flujo).toBe(false);
    expect(cap.estadoResultados).toBe(false);
  });

  it("lee los parametros como clave-valor y respeta los pendientes de capturar", () => {
    const p = res.dataset.parametros;
    expect(p.importes_incluyen_iva).toBeNull();
    expect(p.moneda_base).toBe("MXN");
    expect(p.tasa_iva).toBe(0.16);
    expect(p.provision_91_180).toBe(0.25);
    expect(p.provision_mas_180).toBe(0.5);
    expect(p.periodo_inicio?.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(p.periodo_fin?.toISOString().slice(0, 10)).toBe("2026-12-31");
    // Vacio en el archivo: debe caer al valor por omision del contrato.
    expect(p.comision_base_default).toBe("Venta");
    expect(p.tipo_cambio_usd).toBeNull();
  });

  it("trae el renglon nombre_cliente, pendiente de capturar", () => {
    expect(Object.keys(raw.parametros.valores)).toContain("nombre_cliente");
    expect(raw.parametros.filaDe["nombre_cliente"]).toBe(12);
    expect(res.dataset.parametros.nombre_cliente).toBeNull();
  });

  it("no contiene datos de ningun cliente: solo la fila de ejemplo", () => {
    // Regla de GOBERNANZA.md seccion 10. Esta prueba existe para que nadie
    // vuelva a versionar la plantilla con el archivo de un cliente dentro.
    const folios = [...raw.ventas.filas, ...raw.cobranza.filas, ...raw.gastos.filas];
    expect(folios).toEqual([]);
    expect(raw.parametros.valores["nombre_cliente"]).toBeFalsy();
  });

  it("nunca lanza: devuelve dataset y hallazgos incluso con el archivo en blanco", () => {
    expect(() => validate(raw)).not.toThrow();
    expect(res.hallazgos.length).toBeGreaterThan(0);
  });
});

describe("la plantilla vista como XML, que es como se edita", () => {
  const partes = partesXml(readFileSync(RUTA_PLANTILLA));
  const hojas = hojasXml(partes);

  it("cada parte XML esta bien formada", () => {
    // SheetJS lee sin quejarse un XML con filas sin cerrar, y Excel pide reparar
    // el archivo. Ya paso una vez: 1,297 filas sin cerrar en ventas, cobranza y
    // gastos, en el archivo que el cliente descarga desde produccion.
    const fallas = [...partes].flatMap(([ruta, xml]) => {
      const falla = fallaXml(xml);
      return falla === null ? [] : [`${ruta}: ${falla}`];
    });
    expect(fallas).toEqual([]);
    // Y con un parser XML real, no solo con el verificador propio.
    expect([...partes].flatMap(([ruta, xml]) => erroresXml(xml).map((e) => `${ruta}: ${e}`))).toEqual([]);
    expect([...hojas.keys()]).toEqual(["INSTRUCCIONES", "_listas", "ventas", "cobranza", "gastos", "parametros"]);
  });

  it("el verificador detecta la fila sin cerrar que ya se colo una vez", () => {
    // Sin esta prueba, un verificador roto que siempre dijera "bien formado"
    // haria pasar la de arriba en silencio.
    const sinCerrar =
      '<?xml version="1.0"?><sheetData><row r="3"><c r="A3" s="18"/><row r="4"><c r="A4" s="18"/></row></sheetData>';
    expect(fallaXml(sinCerrar)).not.toBeNull();
    expect(fallaXml(sinCerrar.replace('s="18"/><row r="4"', 's="18"/></row><row r="4"'))).toBeNull();
    expect(fallaXml("<a><b></a></b>")).not.toBeNull();
    expect(fallaXml("<a/><b/>")).not.toBeNull();
    expect(fallaXml("<a>1 & 2</a>")).not.toBeNull();
    expect(fallaXml("<a>1 &amp; 2<![CDATA[ < & ]]></a>")).toBeNull();
    // El parser real tambien la ve: una prueba que nunca falla no cuida nada.
    expect(erroresXml(sinCerrar)).not.toEqual([]);
    expect(erroresXml("<a><b></a></b>")).not.toEqual([]);
    expect(erroresXml("<a>1 &amp; 2</a>")).toEqual([]);
  });

  it("las listas desplegables son las enumeraciones del contrato, y modelo es texto libre", () => {
    // La lista de modelos era del cliente de drones: la plantilla es agnostica
    // al giro (CLAUDE.md, "Contexto"). Cada lista que queda apunta a la columna de
    // _listas que contiene exactamente su enumeracion de schema.ts.
    const esperadas: Readonly<Record<NombreHoja, Readonly<Record<string, readonly string[]>>>> = {
      ventas: { linea: LINEA, comision_base: COMISION_BASE, condicion: CONDICION },
      cobranza: { metodo: METODO_PAGO },
      gastos: { categoria: CATEGORIA_GASTO, tipo: TIPO_GASTO },
    };
    const listas = XLSX.utils.sheet_to_json<unknown[]>(
      XLSX.read(readFileSync(RUTA_PLANTILLA)).Sheets["_listas"] ?? {},
      { header: 1, defval: null },
    );
    const valores = (col: number, desde = 0, hasta = listas.length - 1) =>
      listas.slice(desde, hasta + 1).map((f) => f[col]).filter((v): v is string => typeof v === "string");

    for (const hoja of HOJAS_TABULARES) {
      const validadas: Record<string, readonly string[]> = {};
      const xml = hojas.get(hoja) ?? "";
      for (const [, sqref = "", formula = ""] of xml.matchAll(
        /<dataValidation\b[^>]*\bsqref="([^"]+)"[^>]*>\s*<formula1>([^<]*)<\/formula1>/g,
      )) {
        const columna = ENCABEZADOS[hoja][XLSX.utils.decode_range(sqref).s.c] ?? sqref;
        const origen = XLSX.utils.decode_range(formula.replace(/^_listas!/, "").replaceAll("$", ""));
        const rango = valores(origen.s.c, origen.s.r, origen.e.r);
        // El rango cubre la columna completa de _listas, ni una celda de mas ni de menos.
        expect(rango, `${hoja}.${columna}`).toEqual(valores(origen.s.c));
        validadas[columna] = rango;
      }
      expect(validadas, hoja).toEqual(esperadas[hoja]);
    }
    expect(listas[0]).toHaveLength(6);
  });
});

/** El azul de «solo escriba en las celdas de letra azul». */
const AZUL = "FF0000FF";

describe("la v2 cumple lo que INSTRUCCIONES promete", () => {
  // Hasta la v1, las filas de captura traian UNA celda, la del folio: en `ventas`
  // ni una sola era azul, y en `cobranza` y `gastos` solo esa. «Solo escriba en
  // las celdas de letra azul» no era cierto en las filas donde se escribe.
  const partes = partesXml(readFileSync(RUTA_PLANTILLA));
  const hojas = hojasXml(partes);
  const color = colorDeLetraPorEstilo(partes.get("xl/styles.xml") ?? "");
  const CALCULADAS = ["N", "O", "P", "Q"];
  const FILAS: Readonly<Record<NombreHoja, number>> = { ventas: 301, cobranza: 501, gastos: 501 };

  it.each(HOJAS_TABULARES)("%s: cada fila de captura trae todas sus celdas, una por columna y en orden", (hoja) => {
    const columnas = ENCABEZADOS[hoja].length;
    const porFila = new Map<number, string[]>();
    for (const c of celdasXml(hojas.get(hoja) ?? "")) porFila.set(c.fila, [...(porFila.get(c.fila) ?? []), c.columna]);
    const esperadas = Array.from({ length: columnas }, (_, i) => XLSX.utils.encode_col(i));
    for (let fila = 3; fila <= FILAS[hoja]; fila += 1) expect(porFila.get(fila), `${hoja} fila ${fila}`).toEqual(esperadas);
    expect(Math.max(...porFila.keys())).toBe(FILAS[hoja]);
  });

  it.each(HOJAS_TABULARES)("%s: lo que se captura va en letra azul, y lo calculado en letra negra", (hoja) => {
    for (const c of celdasXml(hojas.get(hoja) ?? "")) {
      if (c.fila < 3) continue;
      const calculada = hoja === "ventas" && CALCULADAS.includes(c.columna);
      if (calculada) expect(color[c.estilo], c.ref).not.toBe(AZUL);
      else expect(color[c.estilo], c.ref).toBe(AZUL);
    }
  });

  it("ninguna celda de captura hereda el fondo verde del ejemplo", () => {
    const estilosDelEjemplo = new Set(celdasXml(hojas.get("ventas") ?? "").filter((c) => c.fila === 2 && !CALCULADAS.includes(c.columna)).map((c) => c.estilo));
    const usados = new Set(celdasXml(hojas.get("ventas") ?? "").filter((c) => c.fila >= 3).map((c) => c.estilo));
    expect([...usados].filter((e) => estilosDelEjemplo.has(e))).toEqual([]);
  });

  it("el libro pide calcular al abrir: las formulas no llevan valor guardado", () => {
    expect(atributoXml(partes.get("xl/workbook.xml") ?? "", "calcPr", "fullCalcOnLoad")).toBe("true");
  });

  it("INSTRUCCIONES dice que repetir el folio es como se captura una venta con varios productos", () => {
    const texto = textosXml(hojas.get("INSTRUCCIONES") ?? "", partes.get("xl/sharedStrings.xml") ?? "").join("\n");
    expect(texto).toContain("CON EL MISMO FOLIO");
    expect(texto).toContain("↑");
    // Y avisa de la diferencia que alguien va a reportar como defecto: la hoja suma
    // los pagos de una unidad Demo en `cobrado`, y el reporte no los cuenta.
    expect(texto).toContain("Una unidad de linea Demo no es una venta");
    // Lo que dejo de ser cierto con partidas, o nunca lo fue.
    expect(texto).not.toContain("NUNCA reutilice un folio");
    expect(texto).not.toContain("traen formula solo en la fila de ejemplo");
    expect(texto).not.toContain("la que hoy no existe");
  });
});

describe("la v2 como la devuelve una hoja de calculo", () => {
  // La plantilla sale sin valores guardados en sus formulas. En cuanto alguien la
  // abre y la guarda, cada formula trae su resultado: cadena vacia en las filas
  // sin capturar, la cabecera copiada en las partidas de un folio, la flecha.
  function libro(): XLSX.WorkBook {
    return XLSX.read(readFileSync(RUTA_PLANTILLA), { cellFormula: true });
  }
  function cargar(wb: XLSX.WorkBook): ResultadoValidacion & { raw: RawSheets } {
    const datos = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const raw = readWorkbookFromBuffer(datos, "guardada.xlsx", XLSX);
    return { ...validate(raw), raw };
  }
  /** Le pone a cada formula de captura el valor que tendria guardado, vacio salvo lo indicado. */
  function guardarValores(ws: XLSX.WorkSheet, valores: Readonly<Record<string, string | number>> = {}): void {
    for (const ref of Object.keys(ws)) {
      if (ref.startsWith("!") || XLSX.utils.decode_cell(ref).r < 2) continue;
      const celda = ws[ref] as XLSX.CellObject;
      if (celda.f === undefined) continue;
      const v = valores[ref] ?? "";
      ws[ref] = { ...celda, t: typeof v === "number" ? "n" : "s", v };
    }
  }

  it("sin capturar nada, las formulas guardadas como cadena vacia no cuentan como datos", () => {
    const wb = libro();
    guardarValores(wb.Sheets["ventas"] ?? {});
    const r = cargar(wb);
    expect(r.dataset.ventas).toEqual([]);
    expect(r.raw.ventas.filasVacias).toBe(299);
    expect(conId(r.hallazgos, "error")).toEqual([]);
    expect(conId(r.hallazgos, "advertencia")).toEqual([]);
  });

  it("una venta de dos partidas, con la cabecera copiada por formula y la flecha en la segunda", () => {
    // Datos inventados, los del ejemplo de INSTRUCCIONES.
    const wb = libro();
    const ws = wb.Sheets["ventas"] ?? {};
    const pon = (ref: string, v: string | number) => {
      ws[ref] = { t: typeof v === "number" ? "n" : "s", v };
    };
    pon("A3", "V-101"); pon("B3", "15/01/2026"); pon("C3", "Equipo"); pon("D3", "Cliente A"); pon("E3", "Modelo A");
    pon("G3", 80000); pon("H3", 100000); pon("K3", 90); pon("L3", "Credito"); pon("M3", "Vendedor Uno");
    pon("A4", "V-101"); pon("B4", "20/02/2026"); pon("C4", "Accesorios"); pon("E4", "Modelo B");
    pon("G4", 5000); pon("H4", 10000);
    // Lo que las formulas de la fila 4 muestran, y la hoja de calculo guarda.
    guardarValores(ws, { D4: "Cliente A", K4: 90, L4: "Credito", M4: "Vendedor Uno", N3: 20000, N4: 5000, P3: 0, Q3: 110000, P4: "↑", Q4: "↑" });

    const r = cargar(wb);
    expect(conId(r.hallazgos, "error")).toEqual([]);
    expect(r.dataset.ventas.map((v) => [v.folio, v.modelo, v.cliente, v.dias_credito, v.condicion, v.vendedor, v.precio_venta])).toEqual([
      ["V-101", "Modelo A", "Cliente A", 90, "Credito", "Vendedor Uno", 10_000_000],
      ["V-101", "Modelo B", "Cliente A", 90, "Credito", "Vendedor Uno", 1_000_000],
    ]);
    // La flecha vive en columnas calculadas, que el lector ignora: no llega a ningun lado.
    expect(JSON.stringify(r.dataset)).not.toContain("↑");
    expect(r.raw.ventas.filasVacias).toBe(297);
  });
});

describe("la v1 se sigue aceptando", () => {
  // La promesa de la v2 (docs/decisiones.md): mismas columnas, y un folio por fila
  // sigue siendo valido. Nadie tiene que volver a capturar su archivo. La app no
  // las distingue: no lo necesita, porque las lee igual.
  const RUTA_V1 = fileURLToPath(new URL("../../../../docs/Plantilla_Captura_Reporteria_v1.xlsx", import.meta.url));
  const leer = (ruta: string) => {
    const buf = readFileSync(ruta);
    const raw = readWorkbookFromBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, "plantilla.xlsx", XLSX);
    return { raw, res: validate(raw) };
  };
  const v1 = leer(RUTA_V1);
  const v2 = leer(RUTA_PLANTILLA);

  it("tiene los mismos encabezados y las mismas columnas calculadas que la v2", () => {
    for (const hoja of HOJAS_TABULARES) {
      expect(v1.raw[hoja].encabezados, hoja).toEqual(v2.raw[hoja].encabezados);
      expect(v1.raw[hoja].columnasIgnoradas, hoja).toEqual(v2.raw[hoja].columnasIgnoradas);
    }
  });

  it("carga igual que siempre: vacia, sin errores, con los mismos parametros", () => {
    expect(conId(v1.res.hallazgos, "error")).toEqual([]);
    expect(v1.res.dataset.ventas).toEqual([]);
    expect(v1.raw.ventas.filasEjemplo).toBe(1);
    expect(v1.res.dataset.parametros).toEqual(v2.res.dataset.parametros);
  });

  it("y su XML sigue bien formado, tambien para el parser real", () => {
    const partes = partesXml(readFileSync(RUTA_V1));
    expect([...partes].flatMap(([ruta, xml]) => erroresXml(xml).map((e) => `${ruta}: ${e}`))).toEqual([]);
  });
});
