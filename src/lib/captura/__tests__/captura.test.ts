import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { ARCHIVO_FIXTURE, bufferFixture, cargarFixture } from "../../calc/__tests__/fixture";
import { exportar, idaYVuelta } from "../../exportar/__tests__/plantilla";
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
    expect(idaYVuelta(dataset).dataset).toEqual(dataset);
  });

  it("una venta de varias partidas capturada a mano se exporta y vuelve igual", () => {
    // Dos partidas nuevas del mismo folio, la segunda sin cabecera, y una
    // tercera que se suma a un folio del archivo (V-001, en la fila 3).
    const capturas: Capturas = {
      ...SIN_CAPTURAS,
      ventas: [
        venta("c1", 28, { ...VENTA_OK, condicion: "Credito", vendedor: "Vendedor Uno" }),
        venta("c2", 29, { folio: "V-100", fecha: "2026-09-20", linea: "Accesorios", modelo: "BATERIA", costo_unitario: "5,000", precio_venta: "10,000" }),
        venta("c3", 30, { folio: "V-001", fecha: "2026-09-21", linea: "Accesorios", modelo: "HELICE", costo_unitario: "200", precio_venta: "500" }),
      ],
      cobranza: [nuevaCaptura("c4", 33, "cobranza", { ...entradasVacias("cobranza"), folio_pago: "P-100", folio_venta: "V-100", fecha_pago: "2026-09-25", monto: "150,000" })],
    };
    const { dataset, hallazgos } = validate(combinar(archivo, capturas));
    expect(hallazgos.filter((h) => h.severidad === "error")).toEqual([]);
    const capturadas = dataset.ventas.filter((v) => v.folio === "V-100");
    expect(capturadas.map((v) => [v.modelo, v.cliente, v.dias_credito, v.condicion, v.vendedor])).toEqual([
      ["AX-55", "Cliente Nuevo", 90, "Credito", "Vendedor Uno"],
      ["BATERIA", "Cliente Nuevo", 90, "Credito", "Vendedor Uno"],
    ]);

    const vuelta = idaYVuelta(dataset);
    expect(vuelta.dataset).toEqual(dataset);
    expect(vuelta.hallazgos.filter((h) => h.severidad === "error")).toEqual([]);

    // En el archivo, la partida capturada queda como la deja la plantilla v2:
    // la cabecera copiada por formula en la fila que repite el folio de arriba,
    // y escrita en la que se sumo a un folio que esta lejos.
    const ws = XLSX.read(exportar(dataset), { cellFormula: true }).Sheets["ventas"] ?? {};
    const en = (ref: string) => ws[ref] as XLSX.CellObject | undefined;
    expect([en("A28")?.v, en("A29")?.v, en("A30")?.v]).toEqual(["V-100", "V-100", "V-001"]);
    expect(en("D28")?.f).toBeUndefined();
    expect(en("D29")).toMatchObject({ f: 'IF(AND($A29<>"",$A29=$A28),D28,"")', v: "Cliente Nuevo" });
    expect(en("K29")).toMatchObject({ f: 'IF(AND($A29<>"",$A29=$A28),K28,"")', v: 90 });
    expect(en("D30")).toMatchObject({ v: "Agricola San Lorenzo" });
    expect(en("D30")?.f).toBeUndefined();
  });

  it("el archivo cargado sin capturas no cambia en nada", () => {
    expect(validate(combinar(archivo, SIN_CAPTURAS)).dataset).toEqual(cargarFixture());
  });
});

describe("validacion en vivo", () => {
  // Hasta la 1.1.5 estas pruebas exigian el error "El folio ya se uso": repetir
  // un folio era el defecto que se cazaba. Desde la 1.2.0 es como se captura una
  // venta con varias partidas, y lo que se caza es que el folio cambie de dueño.
  it("repetir un folio no es un error: la fila entra como partida de esa venta y hereda su cabecera", () => {
    const candidata = venta("tmp", 28, { ...VENTA_OK, folio: "V-001", cliente: "" });
    const h = validarCandidata(archivo, SIN_CAPTURAS, "ventas", candidata, null);
    expect(h.filter((x) => x.severidad === "error")).toEqual([]);

    const { dataset } = validate(combinar(archivo, { ...SIN_CAPTURAS, ventas: [candidata] }));
    const partidas = dataset.ventas.filter((v) => v.folio === "V-001");
    expect(partidas).toHaveLength(2);
    // V-001 esta en la fila 3 del archivo, a nombre de Agricola San Lorenzo.
    expect(partidas[1]?.cliente).toBe("Agricola San Lorenzo");
  });

  it("un folio con otro cliente que el suyo se dice al escribirlo, como error", () => {
    const candidata = venta("tmp", 28, { ...VENTA_OK, folio: "V-001" });
    const h = validarCandidata(archivo, SIN_CAPTURAS, "ventas", candidata, null);
    const conflicto = h.find((x) => x.campo === "cliente");
    expect(conflicto?.severidad).toBe("error");
    expect(conflicto?.mensaje).toContain('fila 3: "Agricola San Lorenzo"; fila 28: "Cliente Nuevo"');
    expect(conflicto?.accion).toBeTruthy();
  });

  it("tambien contra otra fila capturada a mano", () => {
    const capturas: Capturas = { ...SIN_CAPTURAS, ventas: [venta("c1", 28, VENTA_OK)] };
    const candidata = venta("tmp", 29, { ...VENTA_OK, cliente: "Otro Cliente" });
    const h = validarCandidata(archivo, capturas, "ventas", candidata, null);
    expect(h.find((x) => x.campo === "cliente")?.mensaje).toContain('fila 28: "Cliente Nuevo"; fila 29: "Otro Cliente"');
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
    // Sin fecha. Tampoco trae dias de credito, pero esta pagada: eso ya no se avisa.
    expect(v025?.advertencias).toBe(1);
    expect(v025?.errores).toBe(0);
    // V-001 debe $320,000 y no trae dias de credito: esa si.
    const v001 = filasDeHoja(archivo, SIN_CAPTURAS, "ventas", hallazgos).find((f) => f.folio === "V-001");
    expect(v001?.advertencias).toBe(1);
  });
});

describe("etiqueta de origen", () => {
  it("dice de donde salen los datos, y si hay filas agregadas a mano", () => {
    expect(etiquetaOrigen("archivo.xlsx", 0)).toBe("archivo.xlsx");
    expect(etiquetaOrigen("archivo.xlsx", 2)).toBe("archivo.xlsx + 2 filas capturadas a mano");
    expect(etiquetaOrigen(null, 5)).toBe("Captura manual");
  });
});

describe("listado: una partida capturada se juzga dentro de su folio", () => {
  // V-001 esta en la fila 3 del archivo, a nombre de Agricola San Lorenzo.
  it("la partida que hereda el cliente de su folio no aparece como rechazada", () => {
    const partida = venta("c1", 28, { ...VENTA_OK, folio: "V-001", cliente: "" });
    const capturas: Capturas = { ...SIN_CAPTURAS, ventas: [partida] };
    const { hallazgos, dataset } = validate(combinar(archivo, capturas));
    // Entra al reporte...
    expect(dataset.ventas.filter((v) => v.folio === "V-001")).toHaveLength(2);
    // ...y el listado tiene que decir lo mismo, con el cliente que heredo.
    const fila = filasDeHoja(archivo, capturas, "ventas", hallazgos).find((f) => f.idCaptura === "c1");
    expect(fila?.valida).toBe(true);
    expect(fila?.detalle).toBe("Agricola San Lorenzo · AX-55");
  });

  it("si su folio sale completo, todas sus filas aparecen como fuera del reporte, no solo la que lo rompio", () => {
    const partida = venta("c1", 28, { ...VENTA_OK, folio: "V-001" });
    const capturas: Capturas = { ...SIN_CAPTURAS, ventas: [partida] };
    const { hallazgos, dataset } = validate(combinar(archivo, capturas));
    expect(dataset.ventas.some((v) => v.folio === "V-001")).toBe(false);
    const filas = filasDeHoja(archivo, capturas, "ventas", hallazgos).filter((f) => f.folio === "V-001");
    expect(filas.map((f) => [f.fila, f.valida])).toEqual([
      [3, false],
      [28, false],
    ]);
  });

  it("una fila sin cliente y sin folio del que heredar sigue rechazada", () => {
    const sola = venta("c1", 28, { ...VENTA_OK, cliente: "" });
    const capturas: Capturas = { ...SIN_CAPTURAS, ventas: [sola] };
    const { hallazgos } = validate(combinar(archivo, capturas));
    expect(filasDeHoja(archivo, capturas, "ventas", hallazgos).find((f) => f.idCaptura === "c1")?.valida).toBe(false);
  });
});
