import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { ARCHIVO_FIXTURE, bufferFixture, cargarFixture } from "../../calc/__tests__/fixture";
import { libroDeDataset } from "../../exportar";
import { readWorkbookFromBuffer } from "../../parse/readWorkbook";
import type { RawSheets } from "../../parse/tipos";
import { validate } from "../../parse/validate";
import { CobranzaSchema, GastoSchema, VentaSchema } from "../../schema";
import {
  CAMPOS,
  type Capturas,
  SIN_CAPTURAS,
  aCelda,
  combinar,
  entradasVacias,
  etiquetaOrigen,
  filasDeHoja,
  hojasEnBlanco,
  nuevaCaptura,
  siguienteFila,
  validarCandidata,
} from "../index";

const leer = (): RawSheets => readWorkbookFromBuffer(bufferFixture(), ARCHIVO_FIXTURE, XLSX);

const archivo = leer();

const venta = (id: string, fila: number, cambios: Record<string, string>) =>
  nuevaCaptura(id, fila, "ventas", { ...entradasVacias("ventas"), ...cambios });

const VENTA_OK = {
  folio: "V-100",
  fecha: "2026-09-01",
  linea: "Equipo",
  cliente: "Cliente Nuevo",
  modelo: "AX-55",
  costo_unitario: "231,200",
  precio_venta: "$289,000.00",
  comision_pct: "5",
  dias_credito: "90",
};

describe("los campos del formulario son los del contrato", () => {
  it("ni uno de mas ni uno de menos por hoja: no hay un segundo esquema", () => {
    const esquemas = { ventas: VentaSchema, cobranza: CobranzaSchema, gastos: GastoSchema };
    for (const hoja of ["ventas", "cobranza", "gastos"] as const) {
      expect(CAMPOS[hoja].map((c) => c.clave).sort(), hoja).toEqual(Object.keys(esquemas[hoja].shape).sort());
    }
  });
});

describe("de lo escrito a la celda cruda", () => {
  it("un importe al estilo mexicano llega como numero en pesos, no como texto europeo", () => {
    expect(aCelda("importe", "$444,800.50")).toBe(444_800.5);
    expect(aCelda("importe", "15000")).toBe(15_000);
  });

  it("un porcentaje escrito como 5 es 5%, y 0.5 es medio punto", () => {
    expect(aCelda("porcentaje", "5")).toBe("5%");
    expect(aCelda("porcentaje", "0.5")).toBe("0.5%");
  });

  it("la fecha del control nativo llega como Date en UTC, sin desfase", () => {
    expect((aCelda("fecha", "2026-01-31") as Date).toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });

  it("lo vacio es celda vacia; lo ilegible se entrega tal cual, para que el validador lo nombre", () => {
    expect(aCelda("importe", "  ")).toBeNull();
    expect(aCelda("importe", "mucho")).toBe("mucho");
  });
});

describe("una sola representacion: la captura entra al mismo dataset que el archivo", () => {
  it("la venta capturada aparece en el dataset validado, en centavos", () => {
    const capturas: Capturas = { ...SIN_CAPTURAS, ventas: [venta("c1", 28, VENTA_OK)] };
    const { dataset } = validate(combinar(archivo, capturas));
    const v = dataset.ventas.find((x) => x.folio === "V-100");
    expect(dataset.ventas).toHaveLength(26);
    expect(v?.precio_venta).toBe(28_900_000);
    expect(v?.costo_unitario).toBe(23_120_000);
    expect(v?.comision_pct).toBeCloseTo(0.05, 9);
    expect(v?.fecha?.toISOString().slice(0, 10)).toBe("2026-09-01");
  });

  it("la siguiente fila libre va despues de lo que trae el archivo", () => {
    // ventas: datos hasta la 27. cobranza: hasta la 32. gastos: hasta la 84.
    expect(siguienteFila(archivo, SIN_CAPTURAS, "ventas")).toBe(28);
    expect(siguienteFila(archivo, SIN_CAPTURAS, "cobranza")).toBe(33);
    expect(siguienteFila(archivo, SIN_CAPTURAS, "gastos")).toBe(85);
    const capturas: Capturas = { ...SIN_CAPTURAS, ventas: [venta("c1", 28, VENTA_OK)] };
    expect(siguienteFila(archivo, capturas, "ventas")).toBe(29);
  });

  it("sin archivo, la primera fila es la 3, como en la plantilla", () => {
    expect(siguienteFila(hojasEnBlanco(), SIN_CAPTURAS, "cobranza")).toBe(3);
  });

  it("empezar de cero no produce avisos de hojas faltantes", () => {
    expect(validate(combinar(hojasEnBlanco(), SIN_CAPTURAS)).hallazgos).toEqual([]);
  });

  it("lo capturado se exporta a Excel y vuelve igual, junto con el archivo", () => {
    const capturas: Capturas = { ...SIN_CAPTURAS, ventas: [venta("c1", 28, VENTA_OK)] };
    const { dataset } = validate(combinar(archivo, capturas));
    const datos = XLSX.write(libroDeDataset(XLSX, dataset), { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    expect(validate(readWorkbookFromBuffer(datos, "x.xlsx", XLSX)).dataset).toEqual(dataset);
  });

  it("el archivo cargado sin capturas no cambia en nada", () => {
    expect(validate(combinar(archivo, SIN_CAPTURAS)).dataset).toEqual(cargarFixture());
  });
});

describe("validacion en vivo", () => {
  it("un folio repetido se dice al escribirlo, con el mismo mensaje del panel de carga", () => {
    const candidata = venta("tmp", 28, { ...VENTA_OK, folio: "V-001" });
    const h = validarCandidata(archivo, SIN_CAPTURAS, "ventas", candidata, null);
    const duplicado = h.find((x) => x.campo === "folio");
    expect(duplicado?.severidad).toBe("error");
    // V-001 esta en la fila 3 del archivo.
    expect(duplicado?.mensaje).toBe("El folio V-001 ya se uso en la fila 3.");
  });

  it("tambien contra otra fila capturada a mano", () => {
    const capturas: Capturas = { ...SIN_CAPTURAS, ventas: [venta("c1", 28, VENTA_OK)] };
    const candidata = venta("tmp", 29, VENTA_OK);
    const h = validarCandidata(archivo, capturas, "ventas", candidata, null);
    expect(h.find((x) => x.campo === "folio")?.mensaje).toBe("El folio V-100 ya se uso en la fila 28.");
  });

  it("al editar una captura no choca consigo misma", () => {
    const capturas: Capturas = { ...SIN_CAPTURAS, ventas: [venta("c1", 28, VENTA_OK)] };
    const editada = venta("c1", 28, { ...VENTA_OK, cliente: "Otro nombre" });
    const h = validarCandidata(archivo, capturas, "ventas", editada, "c1");
    expect(h.filter((x) => x.severidad === "error")).toEqual([]);
  });

  it("solo devuelve lo que habla de la fila que se escribe, no el resto del archivo", () => {
    const h = validarCandidata(archivo, SIN_CAPTURAS, "ventas", venta("tmp", 28, VENTA_OK), null);
    for (const x of h) expect(x.fila).toBe(28);
  });

  it("un importe ilegible da el mismo error que en el archivo", () => {
    const h = validarCandidata(archivo, SIN_CAPTURAS, "ventas", venta("tmp", 28, { ...VENTA_OK, precio_venta: "mucho" }), null);
    expect(h.some((x) => x.severidad === "error" && x.mensaje === 'El importe "mucho" no es un numero valido.')).toBe(true);
  });

  it("un abono a una venta que no existe se rechaza, y a una capturada a mano se acepta", () => {
    const abono = (folioVenta: string) =>
      nuevaCaptura("tmp", 32, "cobranza", { ...entradasVacias("cobranza"), folio_venta: folioVenta, monto: "1000" });
    expect(validarCandidata(archivo, SIN_CAPTURAS, "cobranza", abono("V-999"), null).some((x) => x.severidad === "error")).toBe(true);

    const conVenta: Capturas = { ...SIN_CAPTURAS, ventas: [venta("c1", 28, VENTA_OK)] };
    expect(validarCandidata(archivo, conVenta, "cobranza", abono("V-100"), null).some((x) => x.severidad === "error")).toBe(false);
  });

  it("una venta sin cliente ni modelo se rechaza con el mensaje del contrato", () => {
    const h = validarCandidata(hojasEnBlanco(), SIN_CAPTURAS, "ventas", venta("tmp", 3, { folio: "V-1" }), null);
    expect(h.some((x) => x.severidad === "error" && x.mensaje.includes("no cumple el formato"))).toBe(true);
  });
});

describe("listado de filas", () => {
  it("distingue las del archivo de las capturadas, y solo estas se pueden editar", () => {
    const capturas: Capturas = { ...SIN_CAPTURAS, ventas: [venta("c1", 28, VENTA_OK)] };
    const { hallazgos } = validate(combinar(archivo, capturas));
    const filas = filasDeHoja(archivo, capturas, "ventas", hallazgos);
    expect(filas).toHaveLength(26);
    expect(filas.filter((f) => f.origen === "archivo")).toHaveLength(25);
    const nueva = filas.find((f) => f.origen === "captura");
    expect(nueva).toMatchObject({ idCaptura: "c1", fila: 28, folio: "V-100", importe: 28_900_000, valida: true });
    for (const f of filas.filter((x) => x.origen === "archivo")) expect(f.idCaptura).toBeNull();
  });

  it("cuenta los hallazgos de cada fila", () => {
    const { hallazgos } = validate(combinar(archivo, SIN_CAPTURAS));
    const v025 = filasDeHoja(archivo, SIN_CAPTURAS, "ventas", hallazgos).find((f) => f.folio === "V-025");
    // Sin fecha y sin dias de credito.
    expect(v025?.advertencias).toBe(2);
    expect(v025?.errores).toBe(0);
  });
});

describe("etiqueta de origen", () => {
  it("dice de donde salen los datos, y si hay filas agregadas a mano", () => {
    expect(etiquetaOrigen("archivo.xlsx", 0)).toBe("archivo.xlsx");
    expect(etiquetaOrigen("archivo.xlsx", 2)).toBe("archivo.xlsx + 2 filas capturadas a mano");
    expect(etiquetaOrigen(null, 5)).toBe("Captura manual");
  });
});
