import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { cargarFixture } from "../../calc/__tests__/fixture";
import { readWorkbookFromBuffer } from "../../parse/readWorkbook";
import { validate } from "../../parse/validate";
import {
  CobranzaSchema,
  type Dataset,
  GastoSchema,
  ParametrosSchema,
  VentaSchema,
} from "../../schema";
import { ENCABEZADOS, FORMATO, libroDeDataset, nombreArchivoExcel, serialExcel } from "../index";

/** Exportar y volver a leer con el MISMO lector que usa la app. */
function idaYVuelta(dataset: Dataset) {
  const libro = libroDeDataset(XLSX, dataset);
  const datos = XLSX.write(libro, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return validate(readWorkbookFromBuffer(datos, "exportado.xlsx", XLSX));
}

const utc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));

describe("ida y vuelta", () => {
  it("el archivo de demostracion, exportado y vuelto a cargar, da exactamente el mismo dataset", () => {
    const original = cargarFixture();
    expect(idaYVuelta(original).dataset).toEqual(original);
  });

  it("no introduce errores de validacion que el original no tenia", () => {
    const { hallazgos } = idaYVuelta(cargarFixture());
    expect(hallazgos.filter((h) => h.severidad === "error")).toEqual([]);
  });

  it("conserva los casos limite: nulos, centavos sueltos, porcentajes, IVA y nombre del cliente", () => {
    const d: Dataset = {
      ventas: [
        {
          folio: "V-1",
          fecha: utc(2026, 1, 31),
          linea: "Accesorios",
          cliente: "Agricola Shensim",
          modelo: "BATERIA W37",
          serie: null,
          costo_unitario: 244_900,
          // $3,100.01: el residuo de formula del archivo original.
          precio_venta: 310_001,
          comision_pct: 0.07,
          comision_base: "Utilidad",
          dias_credito: 90,
          condicion: "Credito",
          vendedor: "Ana",
          notas: "Con acento: garantía, año",
        },
        {
          folio: "V-2",
          fecha: null,
          linea: "Demo",
          cliente: "Demo (interno)",
          modelo: "T100",
          serie: "APEDNEH001009V",
          costo_unitario: 39_520_000,
          precio_venta: null,
          comision_pct: null,
          comision_base: null,
          dias_credito: null,
          condicion: null,
          vendedor: null,
          notas: null,
        },
      ],
      cobranza: [
        {
          folio_pago: "P-1",
          folio_venta: "V-1",
          fecha_pago: utc(2026, 2, 28),
          monto: 1,
          metodo: "Transferencia",
          cliente_ref: null,
          notas: null,
        },
        {
          folio_pago: null,
          folio_venta: "V-2",
          fecha_pago: null,
          monto: 39_520_000,
          metodo: null,
          cliente_ref: "Demo",
          notas: "Sin fecha",
        },
      ],
      gastos: [
        {
          folio_gasto: "G-1",
          fecha: utc(2026, 12, 31),
          categoria: "Nomina",
          subcategoria: "Sueldo",
          descripcion: "Sueldo diciembre",
          monto: 1_500_050,
          tipo: "Fijo",
          proveedor: null,
          notas: null,
        },
      ],
      parametros: ParametrosSchema.parse({
        nombre_cliente: "North Precision",
        importes_incluyen_iva: true,
        tasa_iva: 0.16,
        periodo_inicio: utc(2026, 1, 1),
        periodo_fin: utc(2026, 12, 31),
        comision_base_default: "Utilidad",
        dias_credito_default: 30,
        provision_91_180: 0.3,
        provision_mas_180: 0.8,
        tipo_cambio_usd: 17.25,
      }),
    };
    expect(idaYVuelta(d).dataset).toEqual(d);

    const sinIva = { ...d, parametros: { ...d.parametros, importes_incluyen_iva: false } };
    expect(idaYVuelta(sinIva).dataset.parametros.importes_incluyen_iva).toBe(false);
  });

  it("un dataset vacio tambien va y vuelve: hojas con encabezados y sin datos", () => {
    const vacio: Dataset = { ventas: [], cobranza: [], gastos: [], parametros: ParametrosSchema.parse({}) };
    expect(idaYVuelta(vacio).dataset).toEqual(vacio);
  });
});

describe("misma estructura que la plantilla", () => {
  const plantilla = XLSX.read(
    readFileSync(fileURLToPath(new URL("../../../../docs/Plantilla_Captura_Reporteria_v1.xlsx", import.meta.url))),
    // Con los formatos de numero, para compararlos contra los de la exportacion.
    { cellNF: true },
  );
  const encabezadosDe = (libro: XLSX.WorkBook, hoja: string) =>
    (XLSX.utils.sheet_to_json<string[]>(libro.Sheets[hoja] ?? {}, { header: 1 })[0] ?? []).map(String);

  it("los encabezados son identicos a los de la plantilla, en el mismo orden", () => {
    for (const hoja of ["ventas", "cobranza", "gastos"] as const) {
      expect(ENCABEZADOS[hoja], hoja).toEqual(encabezadosDe(plantilla, hoja));
    }
  });

  it("cada campo del contrato tiene su columna", () => {
    const esquemas = { ventas: VentaSchema, cobranza: CobranzaSchema, gastos: GastoSchema };
    for (const hoja of ["ventas", "cobranza", "gastos"] as const) {
      for (const campo of Object.keys(esquemas[hoja].shape)) expect(ENCABEZADOS[hoja], hoja).toContain(campo);
    }
  });

  it("la hoja parametros trae todos los parametros del contrato, en el orden de la plantilla", () => {
    const exportado = libroDeDataset(XLSX, cargarFixture());
    const claves = (libro: XLSX.WorkBook) =>
      XLSX.utils
        .sheet_to_json<unknown[]>(libro.Sheets["parametros"] ?? {}, { header: 1 })
        .slice(1)
        .map((f) => String(f[0]));
    expect(claves(exportado)).toEqual(claves(plantilla));
    expect([...claves(exportado)].sort()).toEqual(Object.keys(ParametrosSchema.shape).sort());
  });

  it("las cuatro hojas, la fila de ejemplo en la fila 2 y los datos desde la 3", () => {
    const exportado = libroDeDataset(XLSX, cargarFixture());
    expect(exportado.SheetNames).toEqual(["ventas", "cobranza", "gastos", "parametros"]);
    expect(exportado.Sheets["ventas"]?.["A2"]?.v).toBe("V-000");
    expect(exportado.Sheets["ventas"]?.["A3"]?.v).toBe("V-001");
  });

  it("la fila de ejemplo es la de la plantilla, celda por celda", () => {
    // Son dos copias del mismo ejemplo: si divergen, el primer archivo exportado
    // le devuelve al cliente algo distinto de lo que descargo. Asi volvio a
    // aparecer el modelo "T55" del cliente de drones.
    const vacio: Dataset = { ventas: [], cobranza: [], gastos: [], parametros: ParametrosSchema.parse({}) };
    const exportado = libroDeDataset(XLSX, vacio);
    const celda = (libro: XLSX.WorkBook, hoja: string, ref: string) => {
      const c = libro.Sheets[hoja]?.[ref] as XLSX.CellObject | undefined;
      if (c === undefined) return null;
      // Las formulas se comparan por su texto: la plantilla guarda ademas el
      // ultimo valor calculado, que la exportacion no escribe.
      return c.f === undefined ? { v: c.v, z: c.z === "General" ? undefined : c.z } : { f: c.f, z: c.z };
    };
    for (const hoja of ["ventas", "cobranza", "gastos"] as const) {
      ENCABEZADOS[hoja].forEach((campo, c) => {
        const ref = XLSX.utils.encode_cell({ r: 1, c });
        expect(celda(exportado, hoja, ref), `${hoja}.${campo}`).toEqual(celda(plantilla, hoja, ref));
      });
    }
  });

  it("los importes, fechas y porcentajes llevan los formatos de la plantilla", () => {
    const ventas = libroDeDataset(XLSX, cargarFixture()).Sheets["ventas"];
    expect(ventas?.["H3"]).toMatchObject({ t: "n", v: 520_000, z: FORMATO.moneda });
    expect(ventas?.["B3"]).toMatchObject({ t: "n", z: FORMATO.fecha });
    expect(ventas?.["I3"]).toMatchObject({ t: "n", v: 0.05, z: FORMATO.porcentaje });
    // Las columnas calculadas van como formula, igual que en la plantilla.
    expect(ventas?.["N3"]?.f).toBe('IFERROR(H3-G3,"")');
    // La plantilla esta vacia: su unica celda de importe con formato es la de
    // la fila de ejemplo, y es contra ella que se compara el formato.
    expect(plantilla.Sheets["ventas"]?.["H2"]?.z).toBe(FORMATO.moneda);
  });

  it("las fechas son seriales de Excel exactos, sin desfase de zona horaria", () => {
    // 31/01/2026 es el serial 46053 en la plantilla original.
    expect(serialExcel(utc(2026, 1, 31))).toBe(46_053);
  });
});

describe("nombre del archivo exportado", () => {
  it("es Datos_<periodo>_<corte>.xlsx", () => {
    expect(nombreArchivoExcel({ inicio: utc(2026, 1, 1), fin: utc(2026, 12, 31) }, utc(2026, 9, 9))).toBe(
      "Datos_2026-01-01-a-2026-12-31_2026-09-09.xlsx",
    );
    expect(nombreArchivoExcel(null, utc(2026, 9, 9))).toBe("Datos_sin-periodo_2026-09-09.xlsx");
  });
});
