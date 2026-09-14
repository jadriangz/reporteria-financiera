import { describe, expect, it } from "vitest";

import * as XLSX from "xlsx";

import { ENCABEZADOS } from "../../exportar";
import { readWorkbookFromBuffer } from "../../parse/readWorkbook";
import { validate } from "../../parse/validate";
import { LINEA, VentaSchema, canonizar } from "../../schema";
import { particionarVentas } from "../base";
import { calcularResultados } from "../resultados";

/**
 * La fila Demo, escrita como la escriba el cliente.
 *
 * El defecto que motivo esta prueba: una venta con `linea` «demo» se contaba
 * como venta mientras el panel de validacion afirmaba haberla excluido. No habia
 * error ni advertencia; la utilidad bruta del cliente cargaba el costo de una
 * unidad que no vendio, y la interfaz decia lo contrario.
 *
 * El invariante no es solo que se excluya: es que LO QUE EL PANEL AFIRMA DE UNA
 * FILA ES LO QUE EL MOTOR HACE CON ELLA, en las dos direcciones.
 */
const GRAFIAS_DEMO = ["Demo", "demo", "DEMO", " demo "] as const;

/** Una venta normal y una segunda fila con la `linea` dada, CON precio: sin
 * precio el motor la excluiria por "sin-precio" y taparia el defecto. */
function archivoVentas(linea: string): ArrayBuffer {
  const filas: Record<string, string>[] = [
    { folio: "V-001", fecha: "15/01/2026", linea: "Equipo", cliente: "Cliente A", modelo: "Modelo A", costo_unitario: "80000", precio_venta: "100000" },
    { folio: "V-002", fecha: "20/01/2026", linea, cliente: "Cliente B", modelo: "Modelo A", costo_unitario: "50000", precio_venta: "90000" },
  ];
  const csv = [ENCABEZADOS.ventas, ...filas.map((f) => ENCABEZADOS.ventas.map((c) => f[c] ?? ""))]
    .map((f) => f.join(","))
    .join("\n");
  return new TextEncoder().encode(csv).buffer as ArrayBuffer;
}

/** Lo que dice el panel y lo que hace el motor con el mismo archivo. */
function evaluar(linea: string) {
  const raw = readWorkbookFromBuffer(archivoVentas(linea), "ventas.csv", XLSX);
  const { dataset, hallazgos } = validate(raw);
  const folioDeFila = new Map(raw.ventas.filas.map((f) => [f.fila, String(f.valores["folio"])]));
  const { incluidas, excluidas } = particionarVentas(dataset.ventas);
  return {
    anunciadasComoDemo: hallazgos
      .filter((h) => h.severidad === "info" && h.campo === "linea" && h.fila !== undefined)
      .map((h) => folioDeFila.get(h.fila ?? 0)),
    excluidasPorDemo: excluidas.filter((e) => e.motivo === "demo").map((e) => e.venta.folio),
    incluidas: incluidas.map((v) => v.folio),
    lineaEnDataset: dataset.ventas.find((v) => v.folio === "V-002")?.linea,
    resultados: calcularResultados(dataset),
  };
}

describe("la fila Demo, sin importar como se escriba", () => {
  it.each(GRAFIAS_DEMO)("«%s»: el motor excluye exactamente lo que el panel anuncia como excluido", (linea) => {
    const r = evaluar(linea);
    expect(r.anunciadasComoDemo).toEqual(["V-002"]);
    expect(r.excluidasPorDemo).toEqual(r.anunciadasComoDemo);
    expect(r.incluidas).toEqual(["V-001"]);
    // El parser la CONSERVA con la grafia del contrato; excluirla es del motor.
    expect(r.lineaEnDataset).toBe("Demo");
  });

  it("las cuatro grafias dan el mismo estado de resultados", () => {
    const referencia = evaluar("Demo").resultados;
    for (const linea of GRAFIAS_DEMO) expect(evaluar(linea).resultados, linea).toEqual(referencia);
  });

  it("en la otra direccion: una linea que no es Demo ni se anuncia ni se excluye", () => {
    const r = evaluar("Demostracion");
    expect(r.anunciadasComoDemo).toEqual([]);
    expect(r.excluidasPorDemo).toEqual([]);
    expect(r.incluidas).toEqual(["V-001", "V-002"]);
  });
});

describe("canonizar", () => {
  it("devuelve la grafia del contrato sin importar mayusculas ni espacios", () => {
    expect(canonizar(LINEA, " dEmO ")).toBe("Demo");
    expect(canonizar(LINEA, "ACCESORIOS")).toBe("Accesorios");
    expect(canonizar(LINEA, "Accesorio")).toBeNull();
  });

  it("en VentaSchema: canoniza lo reconocible, y lo no reconocido recibe lo de la celda vacia", () => {
    // Todas las columnas presentes, como las entrega el lector: Zod exige la clave.
    const vacia = Object.fromEntries(ENCABEZADOS.ventas.map((c) => [c, null]));
    const linea = (valor: unknown) =>
      VentaSchema.parse({ ...vacia, folio: "V-1", cliente: "Cliente", modelo: "Modelo A", linea: valor }).linea;
    expect(linea("capacitacion")).toBe("Capacitacion");
    // Fuera de la lista: recibe lo mismo que la celda vacia y el validador lo
    // avisa (enumeraciones.test.ts). Antes se conservaba "Accesorio" y el tipo
    // prometia una enumeracion que el dato no cumplia.
    expect(linea("Accesorio")).toBe("Equipo");
    expect(linea("")).toBe("Equipo");
  });
});
