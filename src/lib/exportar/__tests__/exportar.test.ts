import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { FOLIO_CONFLICTO, FOLIO_HEREDA, cargarFixture } from "../../calc/__tests__/fixture";
import {
  atributoXml,
  celdasXml,
  colorDeLetraPorEstilo,
  erroresXml,
  fallaXml,
  hojasXml,
  partesXml,
} from "../../parse/__tests__/xmlXlsx";
import {
  CobranzaSchema,
  type Cobranza,
  type Dataset,
  GastoSchema,
  ParametrosSchema,
  type Venta,
  VentaSchema,
} from "../../schema";
import { PlantillaInesperada, escaparTexto, letraDeColumna } from "../hojaXml";
import { ENCABEZADOS, excelDeDataset, nombreArchivoExcel, serialExcel } from "../index";

import { PLANTILLA, exportar, idaYVuelta } from "./plantilla";

const utc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));

const VACIO: Dataset = { ventas: [], cobranza: [], gastos: [], parametros: ParametrosSchema.parse({}) };

/** Una partida inventada; lo que no se indica va como en una venta de contado sencilla. */
const partida = (folio: string, cambios: Partial<Venta> = {}): Venta => ({
  folio,
  fecha: utc(2026, 3, 10),
  linea: "Equipo",
  cliente: "Cliente Uno",
  modelo: "MODELO A",
  serie: null,
  costo_unitario: 8_000_000,
  precio_venta: 10_000_000,
  comision_pct: 0.05,
  comision_base: "Venta",
  dias_credito: 90,
  condicion: "Credito",
  vendedor: "Vendedor Uno",
  notas: null,
  ...cambios,
});

const abono = (n: number, folio: string, monto: number): Cobranza => ({
  folio_pago: `P-${n}`,
  folio_venta: folio,
  fecha_pago: utc(2026, 4, 1),
  monto,
  metodo: "Transferencia",
  cliente_ref: null,
  notas: null,
});

/** Un folio de tres partidas con entregas en fechas distintas, otro de una, y el primero otra vez mas abajo. */
const CON_PARTIDAS: Dataset = {
  ...VACIO,
  ventas: [
    partida("V-1"),
    partida("V-1", { linea: "Accesorios", modelo: "BATERIA", fecha: utc(2026, 4, 20), costo_unitario: 500_000, precio_venta: 1_000_000 }),
    partida("V-1", { linea: "Refacciones", modelo: "HELICE", fecha: null, costo_unitario: 20_000, precio_venta: 50_000, comision_pct: null, comision_base: null }),
    partida("V-2", { cliente: "Cliente Dos", dias_credito: null, condicion: "Contado", vendedor: null }),
    partida("V-1", { linea: "Servicio", modelo: "CAPACITACION", fecha: utc(2026, 5, 2), costo_unitario: 0, precio_venta: 300_000 }),
  ],
  cobranza: [abono(1, "V-1", 6_000_000), abono(2, "V-2", 10_000_000)],
};

describe("ida y vuelta", () => {
  it("el archivo de demostracion, exportado y vuelto a cargar, da exactamente el mismo dataset", () => {
    const original = cargarFixture();
    expect(idaYVuelta(original).dataset).toEqual(original);
  });

  it("no introduce errores de validacion que el original no tenia", () => {
    const { hallazgos } = idaYVuelta(cargarFixture());
    expect(hallazgos.filter((h) => h.severidad === "error")).toEqual([]);
  });

  it("los folios de varias partidas vuelven completos: mismas partidas, en el mismo orden, con su cabecera", () => {
    const { dataset, hallazgos } = idaYVuelta(CON_PARTIDAS);
    expect(dataset).toEqual(CON_PARTIDAS);
    // Ni conflicto de cabecera ni folio excluido: lo exportado es coherente.
    expect(hallazgos.filter((h) => h.severidad === "error")).toEqual([]);
    expect(hallazgos.filter((h) => h.severidad === "advertencia" && h.hoja === "ventas" && /cabecera|distint/i.test(h.mensaje))).toEqual([]);
  });

  it("los dos folios de varias partidas del demo conservan sus partidas", () => {
    const original = cargarFixture();
    const vuelto = idaYVuelta(original).dataset;
    for (const folio of [FOLIO_HEREDA, FOLIO_CONFLICTO]) {
      const partidas = original.ventas.filter((v) => v.folio === folio);
      expect(partidas.length, folio).toBe(2);
      expect(vuelto.ventas.filter((v) => v.folio === folio), folio).toEqual(partidas);
    }
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

  it("un dataset vacio tambien va y vuelve: la plantilla, tal cual", () => {
    expect(idaYVuelta(VACIO).dataset).toEqual(VACIO);
  });

  it("el texto llega tal como se capturo, tambien con lo que XML no admite suelto", () => {
    const raros = ['Tornillo 1/4" <inox> & tuerca', "dos\nrenglones", "codigo _x0041_ literal", "campana\u0007"];
    const d: Dataset = { ...VACIO, ventas: raros.map((notas, i) => partida(`V-${i + 1}`, { notas })) };
    expect(idaYVuelta(d).dataset.ventas.map((v) => v.notas)).toEqual(raros);
    expect(escaparTexto("a & b < c")).toBe("a &amp; b &lt; c");
  });

  it("mas filas de las que trae la plantilla: se agregan, y nada se pierde", () => {
    // La plantilla trae 299 filas de captura en ventas y 499 en cobranza.
    const ventas = Array.from({ length: 350 }, (_, i) => partida(`V-${Math.floor(i / 2) + 1}`, { modelo: `M${i}` }));
    const cobranza = Array.from({ length: 1_100 }, (_, i) => abono(i + 1, `V-${(i % 175) + 1}`, 100 + i));
    const d: Dataset = { ...VACIO, ventas, cobranza };
    const { dataset, hallazgos } = idaYVuelta(d);
    expect(dataset).toEqual(d);
    expect(hallazgos.filter((h) => h.severidad === "error")).toEqual([]);
  });
});

describe("lo exportado es la plantilla v2 con los datos puestos", () => {
  const demo = cargarFixture();
  const original = partesXml(PLANTILLA);
  const exportado = partesXml(exportar(demo));
  const hojasOriginal = hojasXml(original);
  const hojas = hojasXml(exportado);
  const leido = XLSX.read(exportar(demo), { cellFormula: true, cellNF: true });
  const DATOS = ["ventas", "cobranza", "gastos"] as const;

  /** Fila de la hoja `ventas` en que queda la partida `i` del dataset. */
  const filaDe = (i: number) => 3 + i;
  const celda = (hoja: string, ref: string) => leido.Sheets[hoja]?.[ref] as XLSX.CellObject | undefined;

  it("trae las mismas hojas que la plantilla, INSTRUCCIONES y listas incluidas", () => {
    expect([...hojas.keys()]).toEqual(["INSTRUCCIONES", "_listas", "ventas", "cobranza", "gastos", "parametros"]);
  });

  it("solo cambian las cuatro hojas de datos: estilos, textos, libro e INSTRUCCIONES son los de la plantilla, byte a byte", () => {
    const cambiadas = [...exportado.keys()].filter((ruta) => exportado.get(ruta) !== original.get(ruta));
    expect([...exportado.keys()]).toEqual([...original.keys()]);
    expect(cambiadas).toHaveLength(4);
    for (const hoja of [...DATOS, "parametros"]) expect(hojas.get(hoja), hoja).not.toBe(hojasOriginal.get(hoja));
    for (const hoja of ["INSTRUCCIONES", "_listas"]) expect(hojas.get(hoja), hoja).toBe(hojasOriginal.get(hoja));
    expect(atributoXml(exportado.get("xl/workbook.xml") ?? "", "calcPr", "fullCalcOnLoad")).toBe("true");
  });

  it("cada parte XML esta bien formada, para el verificador propio y para el parser real", () => {
    for (const [ruta, xml] of exportado) {
      expect(fallaXml(xml), ruta).toBeNull();
      expect(erroresXml(xml), ruta).toEqual([]);
    }
  });

  it.each(DATOS)("%s: fuera de las filas de datos, la hoja es identica a la de la plantilla", (hoja) => {
    const xml = hojas.get(hoja) ?? "";
    const base = hojasOriginal.get(hoja) ?? "";
    // Anchos, panel fijo y rango antes de las filas; listas desplegables despues.
    expect(xml.slice(0, xml.indexOf("<sheetData>"))).toBe(base.slice(0, base.indexOf("<sheetData>")));
    expect(xml.slice(xml.indexOf("</sheetData>"))).toBe(base.slice(base.indexOf("</sheetData>")));
    expect(xml).toContain("<dataValidations");
    expect(xml).toContain('state="frozen"');
    // Encabezados y fila de ejemplo, y las filas de captura que quedaron libres.
    const filas = (x: string) => x.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) ?? [];
    const libres = 2 + demo[hoja].length;
    expect(filas(xml).slice(0, 2)).toEqual(filas(base).slice(0, 2));
    expect(filas(xml).slice(libres)).toEqual(filas(base).slice(libres));
    expect(filas(xml)).toHaveLength(filas(base).length);
  });

  it.each(DATOS)("%s: cada celda sigue en su lugar y con el estilo de la plantilla", (hoja) => {
    const forma = (x: string) => celdasXml(x).map((c) => `${c.ref}:${c.estilo}`);
    expect(forma(hojas.get(hoja) ?? "")).toEqual(forma(hojasOriginal.get(hoja) ?? ""));
  });

  it("lo capturado va en letra azul y lo calculado en negra, tambien en las filas con datos", () => {
    const color = colorDeLetraPorEstilo(exportado.get("xl/styles.xml") ?? "");
    const conDatos = celdasXml(hojas.get("ventas") ?? "").filter((c) => c.fila >= 3 && c.fila < filaDe(demo.ventas.length));
    expect(conDatos).toHaveLength(demo.ventas.length * ENCABEZADOS.ventas.length);
    for (const c of conDatos) {
      if (["N", "O", "P", "Q"].includes(c.columna)) expect(color[c.estilo], c.ref).not.toBe("FF0000FF");
      else expect(color[c.estilo], c.ref).toBe("FF0000FF");
    }
  });

  it("las columnas calculadas conservan sus formulas: cobrado y saldo por folio, con la flecha", () => {
    const formulas = (x: string) =>
      celdasXml(x)
        .filter((c) => ["N", "O", "P", "Q"].includes(c.columna))
        .map((c) => `${c.ref}=${c.formula}`);
    expect(formulas(hojas.get("ventas") ?? "")).toEqual(formulas(hojasOriginal.get("ventas") ?? ""));
    const fila3 = new Map(celdasXml(hojas.get("ventas") ?? "").filter((c) => c.fila === 3).map((c) => [c.columna, c.formula]));
    expect(fila3.get("P")).toContain("COUNTIF($A$3:$A3,$A3)=1");
    expect(fila3.get("P")).toContain("↑");
    expect(fila3.get("Q")).toContain('"<>Demo"');
  });

  it("en la segunda partida de un folio, la cabecera es la formula que la copia, con su valor guardado", () => {
    const COLUMNAS = { cliente: "D", dias_credito: "K", condicion: "L", vendedor: "M" } as const;
    for (const folio of [FOLIO_HEREDA, FOLIO_CONFLICTO]) {
      const i = demo.ventas.findIndex((v) => v.folio === folio);
      const [primera, segunda] = [demo.ventas[i], demo.ventas[i + 1]];
      expect(segunda?.folio, folio).toBe(folio);
      for (const [campo, columna] of Object.entries(COLUMNAS) as [keyof typeof COLUMNAS, string][]) {
        const arriba = celda("ventas", `${columna}${filaDe(i)}`);
        const abajo = celda("ventas", `${columna}${filaDe(i + 1)}`);
        const n = filaDe(i + 1);
        // La primera fila del folio trae el dato escrito, como lo deja quien captura.
        if (primera?.[campo] !== null) expect(arriba?.f, `${folio}.${campo}`).toBeUndefined();
        expect(arriba?.v ?? null, `${folio}.${campo}`).toBe(primera?.[campo] ?? null);
        expect(abajo?.f, `${folio}.${campo}`).toBe(`IF(AND($A${n}<>"",$A${n}=$A${n - 1}),${columna}${n - 1},"")`);
        expect(abajo?.v === "" ? null : abajo?.v, `${folio}.${campo}`).toBe(segunda?.[campo] ?? null);
      }
    }
  });

  it("un folio que se repite mas abajo, no en la fila siguiente, lleva su cabecera escrita y no la formula", () => {
    const libro = XLSX.read(exportar(CON_PARTIDAS), { cellFormula: true });
    const ws = libro.Sheets["ventas"] ?? {};
    const en = (ref: string) => ws[ref] as XLSX.CellObject | undefined;
    // Filas 3 a 5: V-1 tres veces. Fila 6: V-2. Fila 7: V-1 otra vez.
    expect(en("D4")?.f).toBeDefined();
    expect(en("D5")?.f).toBeDefined();
    expect(en("D6")).toMatchObject({ v: "Cliente Dos" });
    expect(en("D6")?.f).toBeUndefined();
    // La formula de la fila 7 mostraria "" (la de arriba es otro folio): el dato va escrito.
    expect(en("D7")).toMatchObject({ v: "Cliente Uno" });
    expect(en("D7")?.f).toBeUndefined();
    // V-2 no trae vendedor ni plazo: la formula, que ahi no muestra nada, se queda.
    expect(en("M6")?.f).toBeDefined();
    expect(en("K6")?.f).toBeDefined();
    expect(en("M6")?.v ?? "").toBe("");
  });

  it("los importes, fechas y porcentajes se ven con los formatos de la plantilla", () => {
    expect(celda("ventas", "H3")).toMatchObject({ t: "n", v: 520_000, z: celda("ventas", "H2")?.z });
    expect(celda("ventas", "B3")).toMatchObject({ t: "n", z: "dd/mm/yyyy" });
    expect(celda("ventas", "I3")).toMatchObject({ t: "n", v: 0.05, z: "0.0%" });
    expect(celda("cobranza", "D3")?.z).toBe(celda("cobranza", "D2")?.z);
    expect(celda("ventas", "A3")?.v).toBe("V-001");
    expect(celda("ventas", "A2")?.v).toBe("V-000");
  });

  it("las fechas son seriales de Excel exactos, sin desfase de zona horaria", () => {
    // 31/01/2026 es el serial 46053 en la plantilla original.
    expect(serialExcel(utc(2026, 1, 31))).toBe(46_053);
  });

  it("si los datos no caben, las filas que se agregan son como las de la plantilla y los rangos llegan hasta ellas", () => {
    const ventas = Array.from({ length: 350 }, (_, i) => partida(`V-${Math.floor(i / 2) + 1}`));
    const cobranza = Array.from({ length: 1_100 }, (_, i) => abono(i + 1, `V-${(i % 175) + 1}`, 100 + i));
    const partes = partesXml(exportar({ ...VACIO, ventas, cobranza }));
    for (const [ruta, xml] of partes) expect(erroresXml(xml), ruta).toEqual([]);
    const xml = hojasXml(partes).get("ventas") ?? "";
    const celdas = celdasXml(xml);
    const de = (fila: number) => celdas.filter((c) => c.fila === fila);

    // 350 partidas: de la fila 3 a la 352. La plantilla llega a la 301.
    expect(Math.max(...celdas.map((c) => c.fila))).toBe(352);
    expect(de(352).map((c) => c.columna)).toEqual(ENCABEZADOS.ventas.map((_, i) => letraDeColumna(i)));
    expect(de(352).map((c) => c.estilo)).toEqual(de(301).map((c) => c.estilo));
    expect(de(352).find((c) => c.columna === "N")?.formula).toBe('IF(H352="","",H352-G352)');
    expect(de(352).find((c) => c.columna === "D")?.formula).toBe('IF(AND($A352<>"",$A352=$A351),D351,"")');
    expect(atributoXml(xml, "dimension", "ref")).toBe("A1:R352");
    expect(xml).toContain('sqref="C3:C352"');
    expect(xml).not.toContain('sqref="C3:C301"');
    // 1,100 abonos llegan a la fila 1102 de cobranza: los rangos de `cobrado` no pueden cerrar en la 1000.
    expect(de(3).find((c) => c.columna === "P")?.formula).toContain("cobranza!$B$3:$B$1102,$A3,cobranza!$D$3:$D$1102");
    expect(de(352).find((c) => c.columna === "Q")?.formula).toContain("$H$3:$H$1102");
    expect(xml).not.toContain("$1000");
    expect(atributoXml(hojasXml(partes).get("cobranza") ?? "", "dimension", "ref")).toBe("A1:G1102");
  });
});

describe("mismo contrato que la plantilla", () => {
  const plantilla = XLSX.read(PLANTILLA);
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

  it("no exporta sobre un archivo que no es la plantilla: lanza, no escribe a medias", () => {
    const otro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(otro, XLSX.utils.aoa_to_sheet([["folio", "importe"]]), "ventas");
    const bytes = new Uint8Array(XLSX.write(otro, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
    expect(() => excelDeDataset(XLSX, bytes, VACIO)).toThrow(PlantillaInesperada);
  });
});

describe("la hoja parametros", () => {
  const renglones = (datos: Uint8Array) =>
    XLSX.utils.sheet_to_json<(string | number | undefined)[]>(XLSX.read(datos).Sheets["parametros"] ?? {}, { header: 1 }).slice(1);

  it("trae todos los parametros del contrato, en el orden de la plantilla", () => {
    const claves = (datos: Uint8Array) => renglones(datos).map((f) => String(f[0]));
    expect(claves(exportar(cargarFixture()))).toEqual(claves(PLANTILLA));
    expect([...claves(PLANTILLA)].sort()).toEqual(Object.keys(ParametrosSchema.shape).sort());
  });

  it("un parametro sin capturar queda vacio y pendiente; no toma el valor que la plantilla sugiere", () => {
    const filas = new Map(renglones(exportar(VACIO)).map((f) => [String(f[0]), f]));
    // La plantilla trae un periodo de muestra. El dataset no trae periodo: el archivo tampoco.
    expect(renglones(PLANTILLA).find((f) => f[0] === "periodo_inicio")?.[1]).toBe("01/01/2026");
    const sinCapturar = Object.entries(VACIO.parametros).filter(([, valor]) => valor === null).map(([clave]) => clave);
    expect(sinCapturar).toContain("periodo_inicio");
    for (const clave of sinCapturar) expect(filas.get(clave)?.[1], clave).toBeUndefined();
    expect(String(filas.get("importes_incluyen_iva")?.[2])).toMatch(/^PENDIENTE — /);
  });

  it("un parametro capturado deja de estar pendiente: sin el aviso en la nota y sin el fondo de aviso", () => {
    const d: Dataset = {
      ...VACIO,
      parametros: ParametrosSchema.parse({ importes_incluyen_iva: true, nombre_cliente: "North Precision", periodo_inicio: utc(2026, 1, 1) }),
    };
    const datos = exportar(d);
    const filas = new Map(renglones(datos).map((f) => [String(f[0]), f]));
    expect(filas.get("importes_incluyen_iva")?.slice(1)).toEqual(["SI", "Escriba SI o NO. Critico: define si los reportes van con o sin IVA."]);
    expect(filas.get("nombre_cliente")?.[1]).toBe("North Precision");
    expect(String(filas.get("nombre_cliente")?.[2])).not.toContain("PENDIENTE");
    // Las fechas, como las trae la plantilla: texto dd/mm/aaaa.
    expect(filas.get("periodo_inicio")?.[1]).toBe("01/01/2026");
    // Lo que sigue sin capturar sigue pendiente.
    expect(String(filas.get("dias_credito_default")?.[2])).toMatch(/^PENDIENTE — /);

    const estilos = new Map(celdasXml(hojasXml(partesXml(datos)).get("parametros") ?? "").map((c) => [c.ref, c.estilo]));
    const base = new Map(celdasXml(hojasXml(partesXml(PLANTILLA)).get("parametros") ?? "").map((c) => [c.ref, c.estilo]));
    // B3 es importes_incluyen_iva; B2, moneda_base, la celda de valor que la plantilla trae llena.
    expect(estilos.get("B3")).toBe(base.get("B2"));
    expect(estilos.get("B3")).not.toBe(base.get("B3"));
    expect(estilos.get("B8")).toBe(base.get("B8"));
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
