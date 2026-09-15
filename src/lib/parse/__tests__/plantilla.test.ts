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
import { fallaXml, hojasXml, partesXml } from "./xmlXlsx";

/**
 * El CONTRATO DE DATOS contra la plantilla real que descarga el cliente.
 *
 * Esta plantilla esta VACIA a proposito: encabezados, la fila verde de ejemplo
 * con sus formulas —las unicas de la plantilla— y las filas de relleno del
 * formato, que no traen formulas, y nada mas. Ningun archivo con datos
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
  new URL("../../../../docs/Plantilla_Captura_Reporteria_v1.xlsx", import.meta.url),
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
    raw = readWorkbookFromBuffer(leerPlantilla(), "Plantilla_Captura_Reporteria_v1.xlsx", XLSX);
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

  it("descarta como vacias las filas de relleno del formato", () => {
    // En la plantilla estas filas solo traen formato: sus columnas calculadas no
    // tienen formula. Las filas de relleno CON formulas estan en el demo y en el
    // archivo del cliente, y esa vacuidad la prueba `demo.test.ts`.
    expect(raw.ventas.filasVacias).toBeGreaterThan(200);
    const info = conId(res.hallazgos, "info");
    expect(info.some((h) => h.hoja === "ventas" && h.mensaje.includes("filas vacias"))).toBe(true);
  });

  it("no reporta errores: la plantilla es estructuralmente valida", () => {
    expect(conId(res.hallazgos, "error")).toEqual([]);
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
