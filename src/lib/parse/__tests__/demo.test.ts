import { beforeAll, describe, expect, it } from "vitest";

import * as XLSX from "xlsx";

import { ARCHIVO_FIXTURE, FOLIO_DEMO, FOLIO_SIN_FECHA, FOLIO_SOBRECOBRO, bufferFixture } from "../../calc/__tests__/fixture";
import { capacidades, type Hallazgo } from "../../schema";
import { readWorkbookFromBuffer } from "../readWorkbook";
import type { RawSheets } from "../tipos";
import { validate, type ResultadoValidacion } from "../validate";
import { fallaXml, partesXml } from "./xmlXlsx";

/**
 * Prueba de integracion del lector contra un archivo CAPTURADO, no en blanco.
 *
 * Usa el archivo de demostracion con datos ficticios: tiene filas de relleno,
 * columnas calculadas, huecos, una fila Demo, un sobrecobro y una venta sin
 * fecha. Es el reemplazo del archivo del cliente, que salio del repositorio
 * por GOBERNANZA.md seccion 10.
 */
function conId(hallazgos: readonly Hallazgo[], severidad: Hallazgo["severidad"]): Hallazgo[] {
  return hallazgos.filter((h) => h.severidad === severidad);
}

describe("lectura del archivo de demostracion", () => {
  let raw: RawSheets;
  let res: ResultadoValidacion;

  beforeAll(() => {
    raw = readWorkbookFromBuffer(bufferFixture(), ARCHIVO_FIXTURE, XLSX);
    res = validate(raw);
  });

  it("encuentra las cuatro hojas del contrato e ignora la hoja LEEME", () => {
    expect(raw.ventas.presente).toBe(true);
    expect(raw.cobranza.presente).toBe(true);
    expect(raw.gastos.presente).toBe(true);
    expect(raw.parametros.presente).toBe(true);
  });

  it("lee 25 ventas, 30 abonos y 82 gastos: descarta las filas de ejemplo", () => {
    expect(res.dataset.ventas).toHaveLength(25);
    expect(res.dataset.cobranza).toHaveLength(30);
    expect(res.dataset.gastos).toHaveLength(82);
    expect(raw.ventas.filasEjemplo).toBe(1);
    expect(res.dataset.ventas.map((v) => v.folio)).not.toContain("V-000");
    expect(res.dataset.ventas[0]?.folio).toBe("V-001");
  });

  it("conserva la fila Demo: excluirla es trabajo del motor, no del lector", () => {
    const demo = res.dataset.ventas.filter((v) => v.linea === "Demo");
    expect(demo).toHaveLength(1);
    expect(demo[0]?.folio).toBe(FOLIO_DEMO);
  });

  it("ignora por completo las columnas calculadas de la hoja ventas", () => {
    expect(raw.ventas.columnasIgnoradas).toEqual([
      "utilidad_bruta",
      "margen_pct",
      "cobrado",
      "saldo",
    ]);
    // Ninguna fila cruda arrastra el valor precalculado por Excel.
    for (const fila of raw.ventas.filas) {
      expect(Object.keys(fila.valores)).not.toContain("utilidad_bruta");
      expect(Object.keys(fila.valores)).not.toContain("saldo");
    }
  });

  it("descarta como vacias las filas de relleno del formato", () => {
    // Las formulas de las columnas calculadas devuelven 0 y "" en esas filas:
    // si se tomaran en cuenta, pareceria que hay 299 ventas capturadas.
    expect(raw.ventas.filasVacias).toBe(274);
    const info = conId(res.hallazgos, "info");
    expect(info.some((h) => h.hoja === "ventas" && h.mensaje.includes("filas vacias"))).toBe(true);
  });

  it("numera las filas con el numero real de Excel", () => {
    // V-001 esta en la fila 3: encabezado en la 1, ejemplo en la 2.
    expect(raw.ventas.filas[0]?.fila).toBe(3);
  });

  it("advierte de la unica venta sin fecha, citando su fila", () => {
    const sinFecha = conId(res.hallazgos, "advertencia").filter(
      (h) => h.hoja === "ventas" && h.campo === "fecha",
    );
    expect(sinFecha).toHaveLength(1);
    expect(sinFecha[0]?.fila).toBe(27);
    expect(res.dataset.ventas.find((v) => v.folio === FOLIO_SIN_FECHA)?.fecha).toBeNull();
  });

  it("advierte del sobrecobro de V-018 sin rechazar el abono", () => {
    const sobre = conId(res.hallazgos, "advertencia").filter((h) => h.hoja === "cobranza");
    expect(sobre).toHaveLength(1);
    expect(sobre[0]?.mensaje).toContain(FOLIO_SOBRECOBRO);
    expect(sobre[0]?.campo).toBe("monto");
    expect(sobre[0]?.fila).toBeGreaterThan(0);
    // El abono sigue en el dataset: se avisa, no se descarta.
    expect(res.dataset.cobranza.filter((c) => c.folio_venta === FOLIO_SOBRECOBRO)).toHaveLength(1);
  });

  it("advierte de cada venta sin dias_credito, y solo de esas", () => {
    const sinCredito = conId(res.hallazgos, "advertencia").filter(
      (h) => h.campo === "dias_credito",
    );
    // 25 ventas, 8 con plazo capturado: las otras 17 se miden por antiguedad.
    expect(sinCredito).toHaveLength(17);
    expect(res.dataset.ventas.filter((v) => v.dias_credito !== null)).toHaveLength(8);
  });

  it("NO advierte margen uniforme: los costos del archivo no derivan del precio", () => {
    const margen = conId(res.hallazgos, "advertencia").filter((h) =>
      h.mensaje.includes("costo parece derivado del precio"),
    );
    expect(margen).toEqual([]);
  });

  it("no reporta errores: el archivo es estructuralmente valido", () => {
    expect(conId(res.hallazgos, "error")).toEqual([]);
  });

  it("relaciona toda la cobranza con una venta existente", () => {
    const folios = new Set(res.dataset.ventas.map((v) => v.folio));
    for (const c of res.dataset.cobranza) expect(folios.has(c.folio_venta)).toBe(true);
  });

  it("habilita los cuatro modulos, flujo incluido: todo abono trae fecha_pago", () => {
    expect(res.dataset.cobranza.every((c) => c.fecha_pago !== null)).toBe(true);
    const cap = capacidades(res.dataset);
    expect(cap.flujo).toBe(true);
    expect(cap.cobranza).toBe(true);
    expect(cap.resumen).toBe(true);
    expect(cap.estadoResultados).toBe(true);
  });

  it("lee los parametros como clave-valor, con el SI/NO del IVA resuelto", () => {
    const p = res.dataset.parametros;
    expect(p.nombre_cliente).toContain("FICTICIA");
    expect(p.importes_incluyen_iva).toBe(false);
    expect(p.moneda_base).toBe("MXN");
    expect(p.tasa_iva).toBe(0.16);
    expect(p.comision_base_default).toBe("Venta");
    expect(p.dias_credito_default).toBe(90);
    expect(p.provision_91_180).toBe(0.25);
    expect(p.provision_mas_180).toBe(0.5);
    expect(p.tipo_cambio_usd).toBe(18.4);
    expect(p.periodo_inicio?.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(p.periodo_fin?.toISOString().slice(0, 10)).toBe("2026-12-31");
  });

  it("convierte los importes a centavos enteros", () => {
    const v1 = res.dataset.ventas.find((v) => v.folio === "V-001");
    expect(v1?.precio_venta).toBe(52_000_000);
    expect(v1?.costo_unitario).toBe(38_000_000);
    for (const v of res.dataset.ventas) {
      if (v.precio_venta !== null) expect(Number.isInteger(v.precio_venta)).toBe(true);
    }
    for (const c of res.dataset.cobranza) {
      if (c.monto !== null) expect(Number.isInteger(c.monto)).toBe(true);
    }
  });

  it("lee las fechas seriales de Excel sin desfase", () => {
    const v1 = res.dataset.ventas.find((v) => v.folio === "V-001");
    expect(v1?.fecha?.toISOString().slice(0, 10)).toBe("2026-01-14");
  });

  it("informa de la fila Demo sin excluirla", () => {
    const demo = conId(res.hallazgos, "info").filter((h) => h.mensaje.includes("Demo"));
    expect(demo).toHaveLength(1);
    expect(demo[0]?.fila).toBeGreaterThan(0);
  });

  it("nunca lanza: devuelve dataset y hallazgos incluso con datos incompletos", () => {
    expect(() => validate(raw)).not.toThrow();
    expect(res.hallazgos.length).toBeGreaterThan(0);
  });

  it("cada parte XML del archivo esta bien formada: tambien se ofrece como descarga", () => {
    // Misma cerca que la de la plantilla (plantilla.test.ts): SheetJS tolera XML
    // mal formado que Excel no.
    const fallas = [...partesXml(Buffer.from(bufferFixture()))].flatMap(([ruta, xml]) => {
      const falla = fallaXml(xml);
      return falla === null ? [] : [`${ruta}: ${falla}`];
    });
    expect(fallas).toEqual([]);
  });
});
