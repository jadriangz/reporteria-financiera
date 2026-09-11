import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { capacidades } from "../../schema";
import { readWorkbookFromBuffer } from "../readWorkbook";
import { validate } from "../validate";

/** Encabezado, fila de ejemplo y datos: la forma exacta de la plantilla. */
const VENTAS = [
  ["folio", "fecha", "linea", "cliente", "modelo", "serie", "costo_unitario", "precio_venta", "comision_pct", "comision_base", "dias_credito", "condicion", "vendedor", "utilidad_bruta", "margen_pct", "cobrado", "saldo", "notas"],
  ["V-000", "15/03/2026", "Equipo", "EJEMPLO", "T55", "ABC", 200000, 260000, 0.05, "Venta", 90, "Credito", "x", 60000, 0.23, 0, 260000, "Fila de ejemplo"],
  ["V-001", "31/01/2026", "Equipo", "Cliente Uno", "  t70p ", "S1", 400000, 500000, 0.05, "Venta", 90, "Credito", null, 100000, 0.2, 0, 500000, null],
];

const COBRANZA = [
  ["folio_pago", "folio_venta", "fecha_pago", "monto", "metodo", "cliente_ref", "notas"],
  ["P-000", "V-000", "20/04/2026", 100000, "Transferencia", "EJEMPLO", "Fila de ejemplo"],
  ["P-001", "V-001", "15/02/2026", 200000, "Transferencia", "Cliente Uno", null],
];

function construirLibro(hojas: Readonly<Record<string, unknown[][]>>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [nombre, filas] of Object.entries(hojas)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), nombre);
  }
  const out: unknown = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return out as ArrayBuffer;
}

describe("degradacion elegante", () => {
  it("sin la hoja gastos deshabilita el estado de resultados e informa, sin lanzar", () => {
    const datos = construirLibro({ ventas: VENTAS, cobranza: COBRANZA });

    const raw = readWorkbookFromBuffer(datos, "sin-gastos.xlsx", XLSX);
    expect(raw.gastos.presente).toBe(false);
    expect(raw.gastos.filas).toEqual([]);

    const res = validate(raw);
    const cap = capacidades(res.dataset);

    expect(cap.estadoResultados).toBe(false);
    // Lo que si depende de ventas y cobranza sigue disponible.
    expect(cap.resumen).toBe(true);
    expect(cap.cobranza).toBe(true);
    expect(cap.flujo).toBe(true);

    const aviso = res.hallazgos.find((h) => h.hoja === "gastos" && h.severidad === "info");
    expect(aviso).toBeDefined();
    expect(aviso?.mensaje).toContain("no trae la hoja gastos");
    expect(aviso?.accion).toBeTruthy();

    // Degradar no es fallar: ningun error y ninguna excepcion.
    expect(res.hallazgos.filter((h) => h.severidad === "error")).toEqual([]);
  });

  it("sin la hoja parametros usa los valores por omision del contrato", () => {
    const raw = readWorkbookFromBuffer(construirLibro({ ventas: VENTAS }), "solo-ventas.xlsx", XLSX);
    const res = validate(raw);

    expect(res.dataset.parametros.moneda_base).toBe("MXN");
    expect(res.dataset.parametros.tasa_iva).toBe(0.16);
    expect(res.dataset.parametros.importes_incluyen_iva).toBeNull();
    expect(res.hallazgos.some((h) => h.hoja === "parametros")).toBe(true);
  });

  it("un archivo sin ninguna hoja conocida no truena: todo queda deshabilitado", () => {
    const raw = readWorkbookFromBuffer(construirLibro({ otra: [["a", "b"]] }), "ajeno.xlsx", XLSX);
    const res = validate(raw);
    const cap = capacidades(res.dataset);

    expect(cap.resumen).toBe(false);
    expect(cap.cobranza).toBe(false);
    expect(cap.estadoResultados).toBe(false);
    expect(res.dataset.ventas).toEqual([]);
    expect(res.hallazgos.filter((h) => h.severidad === "info").length).toBeGreaterThan(0);
  });
});

describe("deteccion de errores del contrato", () => {
  it("detecta folio duplicado, cobranza huerfana, monto y fecha invalidos", () => {
    const ventas = [
      VENTAS[0] as unknown[],
      ["V-001", "31/01/2026", "Equipo", "Uno", "T70P", "S1", 400000, 500000, 0.05, "Venta", 90, "Credito", null, 0, 0, 0, 0, null],
      ["V-001", "01/02/2026", "Equipo", "Dos", "T70P", "S2", 400000, 500000, 0.05, "Venta", 90, "Credito", null, 0, 0, 0, 0, null],
      ["V-002", "no es fecha", "Equipo", "Tres", "T55", "S3", "doscientos mil", 500000, 0.05, "Venta", 90, "Credito", null, 0, 0, 0, 0, null],
    ];
    const cobranza = [
      COBRANZA[0] as unknown[],
      ["P-001", "V-999", "15/02/2026", 200000, "Transferencia", "Fantasma", null],
    ];

    const res = validate(readWorkbookFromBuffer(construirLibro({ ventas, cobranza }), "malo.xlsx", XLSX));
    const errores = res.hallazgos.filter((h) => h.severidad === "error");

    // Esta hoja NO lleva fila de ejemplo, asi que los datos arrancan en la 2:
    // el descarte del ejemplo es por folio, no por posicion.
    const dup = errores.find((h) => h.mensaje.includes("ya se uso"));
    expect(dup?.fila).toBe(3);
    expect(dup?.mensaje).toContain("fila 2");
    expect(dup?.accion).toBeTruthy();

    const huerfana = errores.find((h) => h.hoja === "cobranza");
    expect(huerfana?.mensaje).toContain("V-999");
    expect(huerfana?.accion).toBeTruthy();

    const monto = errores.find((h) => h.campo === "costo_unitario");
    expect(monto?.mensaje).toContain("no es un numero valido");
    expect(monto?.fila).toBe(4);

    const fecha = errores.find((h) => h.campo === "fecha" && h.severidad === "error");
    expect(fecha?.mensaje).toContain("no es valida");

    // Todo error debe decir en que fila y que hacer.
    for (const e of errores) {
      expect(e.accion).toBeTruthy();
      expect(e.hoja).toBeTruthy();
    }
  });

  it("advierte cuando los abonos superan el precio de la venta", () => {
    const cobranza = [
      COBRANZA[0] as unknown[],
      ["P-001", "V-001", "15/02/2026", 400000, "Transferencia", "Uno", null],
      ["P-002", "V-001", "16/02/2026", 300000, "Transferencia", "Uno", null],
    ];
    const res = validate(
      readWorkbookFromBuffer(construirLibro({ ventas: VENTAS, cobranza }), "exceso.xlsx", XLSX),
    );
    const aviso = res.hallazgos.find((h) => h.mensaje.includes("suman mas que su precio"));
    expect(aviso?.severidad).toBe("advertencia");
    expect(aviso?.mensaje).toContain("V-001");
  });
});

describe("lectura de csv", () => {
  it("detecta la hoja por sus encabezados y aplica las mismas reglas", () => {
    const csv = [
      "folio,fecha,linea,cliente,modelo,serie,costo_unitario,precio_venta,comision_pct,comision_base,dias_credito,condicion,vendedor,utilidad_bruta,margen_pct,cobrado,saldo,notas",
      "V-000,15/03/2026,Equipo,EJEMPLO,T55,ABC,200000,260000,0.05,Venta,90,Credito,x,60000,0.23,0,260000,ejemplo",
      "V-001,31/01/2026,Equipo,Cliente Uno,T70P,S1,400000,500000,0.05,Venta,90,Credito,,100000,0.2,0,500000,",
    ].join("\n");
    const datos = new TextEncoder().encode(csv);

    const raw = readWorkbookFromBuffer(
      datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength) as ArrayBuffer,
      "ventas.csv",
      XLSX,
    );

    expect(raw.ventas.presente).toBe(true);
    expect(raw.ventas.filasEjemplo).toBe(1);
    expect(raw.ventas.encabezados).not.toContain("saldo");

    const res = validate(raw);
    expect(res.dataset.ventas).toHaveLength(1);
    expect(res.dataset.ventas[0]?.folio).toBe("V-001");
    expect(res.dataset.ventas[0]?.precio_venta).toBe(50000000);
  });
});

describe("filas de notas", () => {
  const leerGastosCsv = (lineas: readonly string[]) => {
    const datos = new TextEncoder().encode(
      ["folio_gasto,fecha,categoria,subcategoria,descripcion,monto,tipo,proveedor,notas", ...lineas].join("\n"),
    );
    return readWorkbookFromBuffer(
      datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength) as ArrayBuffer,
      "gastos.csv",
      XLSX,
    );
  };

  it("una fila sin folio ni monto es una nota: se descarta y se informa, no se cuenta", () => {
    const raw = leerGastosCsv([
      "G-001,31/01/2026,Nomina,Sueldo,Sueldo,15000,Fijo,,",
      ',,,,"FALTA CAPTURAR: nomina mensual completa, renta, servicios",,,,',
    ]);
    expect(raw.gastos.filas).toHaveLength(1);
    expect(raw.gastos.filasNota).toEqual([3]);

    const res = validate(raw);
    expect(res.dataset.gastos).toHaveLength(1);
    const info = res.hallazgos.find((h) => h.hoja === "gastos" && h.fila === 3);
    expect(info?.severidad).toBe("info");
    expect(info?.mensaje).toContain("parece una nota");
    // La nota no produce la advertencia de fecha faltante que produciria un gasto.
    expect(res.hallazgos.filter((h) => h.fila === 3)).toHaveLength(1);
  });

  it("un gasto sin folio pero CON monto si es un registro y se conserva", () => {
    const raw = leerGastosCsv([",31/01/2026,Renta,Oficina,Renta de enero,8000,Fijo,,"]);
    expect(raw.gastos.filasNota).toEqual([]);
    expect(validate(raw).dataset.gastos).toHaveLength(1);
  });

  it("una fila con folio pero sin monto no es una nota: sigue siendo un registro", () => {
    const raw = leerGastosCsv(["G-009,31/01/2026,Renta,Oficina,Pendiente de monto,,Fijo,,"]);
    expect(raw.gastos.filasNota).toEqual([]);
    expect(raw.gastos.filas).toHaveLength(1);
  });

  it("en un libro completo, la nota al pie se descarta y quedan cinco gastos", () => {
    // La forma exacta que traia el archivo del cliente: cinco gastos y un
    // renglon final de recordatorio, sin folio ni monto. Se reproduce el CASO,
    // no los datos (GOBERNANZA.md, seccion 10).
    const GASTOS = [
      ["folio_gasto", "fecha", "categoria", "subcategoria", "descripcion", "monto", "tipo", "proveedor", "notas"],
      ["G-000", "10/03/2026", "Nomina", "Sueldo", "Ejemplo", 15000, "Fijo", "N/A", "Fila de ejemplo"],
      ["G-001", "31/01/2026", "Nomina", "Sueldo", "Sueldo", 15000, "Fijo", null, null],
      ["G-002", "31/01/2026", "Operativos", "Varios", "Varios", 3000, "Variable", null, null],
      ["G-003", null, "Comercial", "Demostraciones", "Demostraciones", 8000, "Variable", null, null],
      ["G-004", null, "Comercial", "Eventos", "Eventos", 8000, "Variable", null, null],
      ["G-005", null, "Viaticos", "Hospedaje", "Hospedaje", 8000, "Variable", null, null],
      [null, null, null, null, "FALTA CAPTURAR: renta, servicios, gasolina, seguros.", null, null, null, null],
    ];
    const raw = readWorkbookFromBuffer(
      construirLibro({ ventas: VENTAS, cobranza: COBRANZA, gastos: GASTOS }),
      "libro-con-nota.xlsx",
      XLSX,
    );
    expect(raw.gastos.filasNota).toEqual([8]);

    const res = validate(raw);
    expect(res.dataset.gastos.map((g) => g.folio_gasto)).toEqual(["G-001", "G-002", "G-003", "G-004", "G-005"]);
    expect(res.hallazgos.filter((h) => h.severidad === "error")).toEqual([]);
  });
});

describe("nombre del cliente en parametros", () => {
  const leerParametros = (valor: string) => {
    const datos = new TextEncoder().encode(["parametro,valor,nota", `nombre_cliente,${valor},`].join("\n"));
    return validate(
      readWorkbookFromBuffer(
        datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength) as ArrayBuffer,
        "parametros.csv",
        XLSX,
      ),
    ).dataset.parametros;
  };

  it("se lee recortado", () => {
    expect(leerParametros("  North Precision  ").nombre_cliente).toBe("North Precision");
  });

  it("vacio queda en null, no en cadena vacia", () => {
    expect(leerParametros("").nombre_cliente).toBeNull();
  });
});
