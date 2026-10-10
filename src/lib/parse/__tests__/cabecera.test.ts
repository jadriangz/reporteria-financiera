import { describe, expect, it } from "vitest";

import * as XLSX from "xlsx";

import { calcularCartera } from "../../calc/cobranza";
import { CORTE } from "../../calc/__tests__/fixture";
import { ENCABEZADOS } from "../../exportar";
import type { Hallazgo } from "../../schema";
import { readWorkbookFromBuffer } from "../readWorkbook";
import { validate } from "../validate";

/**
 * La cabecera de un folio se resuelve AL LEER (v1.2.0).
 *
 * Varias filas de `ventas` con el mismo folio son una sola operacion. Cliente,
 * dias de credito, condicion y vendedor son de la operacion: vale el primer
 * valor no vacio del folio, las filas que lo dejan vacio lo heredan sin aviso, y
 * solo chocan dos valores capturados distintos. El motor recibe cada partida con
 * su cabecera ya puesta.
 *
 * Los datos son inventados. Las ventas empiezan en la fila 2 del archivo y los
 * abonos tambien: estos libros no llevan fila de ejemplo.
 */

type Fila = Record<string, string | number>;

const EQUIPO: Fila = {
  folio: "V-001",
  fecha: "15/01/2026",
  linea: "Equipo",
  cliente: "Cliente A",
  modelo: "Modelo A",
  costo_unitario: 80000,
  precio_venta: 100000,
  dias_credito: 90,
  condicion: "Credito",
  vendedor: "Vendedor Uno",
};

/** Un accesorio del mismo folio que deja la cabecera vacia: la hereda. */
const ACCESORIO: Fila = {
  folio: "V-001",
  fecha: "20/02/2026",
  linea: "Accesorios",
  modelo: "Modelo B",
  costo_unitario: 5000,
  precio_venta: 10000,
};

/** Otro folio. Con otro costo: dos margenes identicos dispararian el aviso de margen uniforme. */
const OTRA: Fila = { ...EQUIPO, folio: "V-002", cliente: "Cliente B", modelo: "Modelo C", costo_unitario: 70000 };

const ABONOS: Fila[] = [
  { folio_pago: "P-001", folio_venta: "V-001", fecha_pago: "20/01/2026", monto: 40000 },
  { folio_pago: "P-002", folio_venta: "V-001", fecha_pago: "25/02/2026", monto: 20000 },
];

function leer(ventas: Fila[], cobranza: Fila[] = []) {
  const hoja = (encabezados: readonly string[], filas: Fila[]) =>
    XLSX.utils.aoa_to_sheet([[...encabezados], ...filas.map((f) => encabezados.map((c) => f[c] ?? ""))]);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja(ENCABEZADOS.ventas, ventas), "ventas");
  if (cobranza.length > 0) XLSX.utils.book_append_sheet(libro, hoja(ENCABEZADOS.cobranza, cobranza), "cobranza");
  const datos = XLSX.write(libro, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return validate(readWorkbookFromBuffer(datos, "partidas.xlsx", XLSX));
}

const de = (hallazgos: readonly Hallazgo[], severidad: Hallazgo["severidad"], campo?: string) =>
  hallazgos.filter((h) => h.severidad === severidad && h.hoja === "ventas" && (campo === undefined || h.campo === campo));

describe("repetir el folio es capturar una venta con varias partidas", () => {
  it("no produce ningun error: el folio duplicado dejo de serlo", () => {
    const { dataset, hallazgos } = leer([EQUIPO, ACCESORIO]);
    expect(hallazgos.filter((h) => h.severidad === "error")).toEqual([]);
    expect(hallazgos.some((h) => h.mensaje.includes("ya se uso"))).toBe(false);
    expect(dataset.ventas.map((v) => [v.folio, v.modelo])).toEqual([
      ["V-001", "Modelo A"],
      ["V-001", "Modelo B"],
    ]);
  });

  it("un folio por fila sigue siendo valido y se lee igual que antes", () => {
    const { dataset, hallazgos } = leer([EQUIPO, OTRA]);
    expect(hallazgos.filter((h) => h.severidad !== "info")).toEqual([]);
    expect(dataset.ventas.map((v) => [v.folio, v.cliente, v.dias_credito])).toEqual([
      ["V-001", "Cliente A", 90],
      ["V-002", "Cliente B", 90],
    ]);
  });
});

describe("cabecera heredada", () => {
  it("la partida que deja vacia la cabecera recibe la de su folio, sin advertencia", () => {
    const { dataset, hallazgos } = leer([EQUIPO, ACCESORIO]);
    const accesorio = dataset.ventas[1];
    expect(accesorio).toMatchObject({
      cliente: "Cliente A",
      dias_credito: 90,
      condicion: "Credito",
      vendedor: "Vendedor Uno",
      // Lo que es de la partida no se hereda.
      linea: "Accesorios",
      modelo: "Modelo B",
      precio_venta: 1_000_000,
    });
    expect(accesorio?.fecha).toEqual(new Date(Date.UTC(2026, 1, 20)));
    // Ni «sin dias_credito» ni ningun otro aviso: heredar es capturar bien.
    expect(de(hallazgos, "advertencia")).toEqual([]);
  });

  it("vale el PRIMER VALOR NO VACIO: quien escribe los dias de credito en el segundo renglon no los pierde", () => {
    const sinPlazo = { ...EQUIPO, dias_credito: "", vendedor: "" };
    const conPlazo = { ...ACCESORIO, dias_credito: 60, vendedor: "Vendedor Dos" };
    const { dataset, hallazgos } = leer([sinPlazo, conPlazo]);
    expect(dataset.ventas.map((v) => [v.dias_credito, v.vendedor])).toEqual([
      [60, "Vendedor Dos"],
      [60, "Vendedor Dos"],
    ]);
    expect(de(hallazgos, "advertencia")).toEqual([]);
  });

  it("si ninguna partida trae dias de credito, el folio queda sin ellos y se avisa como siempre", () => {
    const { dataset, hallazgos } = leer([{ ...EQUIPO, dias_credito: "" }, ACCESORIO]);
    expect(dataset.ventas.map((v) => v.dias_credito)).toEqual([null, null]);
    expect(de(hallazgos, "advertencia", "dias_credito").map((h) => h.fila)).toEqual([2, 3]);
  });

  it("no hereda nada de otro folio", () => {
    const sola = { ...ACCESORIO, folio: "V-003", cliente: "Cliente C" };
    const { dataset } = leer([EQUIPO, sola]);
    expect(dataset.ventas[1]).toMatchObject({ dias_credito: null, condicion: null, vendedor: null });
  });

  it("un dias_credito ilegible en una partida cuenta como vacio: hereda, y se dice que se aplico", () => {
    const { dataset, hallazgos } = leer([EQUIPO, { ...ACCESORIO, dias_credito: "30dias" }]);
    expect(dataset.ventas.map((v) => v.dias_credito)).toEqual([90, 90]);
    const aviso = de(hallazgos, "advertencia", "dias_credito");
    expect(aviso).toHaveLength(1);
    expect(aviso[0]?.fila).toBe(3);
    expect(aviso[0]?.mensaje).toContain('dias_credito dice "30dias"');
    expect(aviso[0]?.mensaje).toContain("se aplican los 90 dias de las demas partidas de su folio");
  });
});

describe("cabecera en conflicto", () => {
  it("el mismo cliente con otra capitalizacion o espacios no es un conflicto", () => {
    const { dataset, hallazgos } = leer([EQUIPO, { ...ACCESORIO, cliente: "  cliente   a " }]);
    expect(hallazgos.filter((h) => h.severidad === "error")).toEqual([]);
    // Se conserva la grafia del primero.
    expect(dataset.ventas.map((v) => v.cliente)).toEqual(["Cliente A", "Cliente A"]);
  });

  it("dias_credito distinto: advertencia, se aplica el primero y se dice cual", () => {
    const { dataset, hallazgos } = leer([EQUIPO, { ...ACCESORIO, dias_credito: 30 }]);
    expect(dataset.ventas.map((v) => v.dias_credito)).toEqual([90, 90]);
    const aviso = de(hallazgos, "advertencia", "dias_credito");
    expect(aviso).toHaveLength(1);
    expect(aviso[0]?.fila).toBe(3);
    expect(aviso[0]?.mensaje).toBe(
      'El folio V-001 trae dias_credito distinto en sus partidas (fila 2: "90"; fila 3: "30"): ' +
        'se aplica "90", el de la fila 2, a todo el folio.',
    );
    expect(aviso[0]?.accion).toBeTruthy();
  });

  it("condicion y vendedor distintos: una advertencia por cada uno", () => {
    const { dataset, hallazgos } = leer([EQUIPO, { ...ACCESORIO, condicion: "contado", vendedor: "Vendedor Dos" }]);
    expect(dataset.ventas.map((v) => [v.condicion, v.vendedor])).toEqual([
      ["Credito", "Vendedor Uno"],
      ["Credito", "Vendedor Uno"],
    ]);
    expect(de(hallazgos, "advertencia", "condicion")[0]?.mensaje).toContain('se aplica "Credito", el de la fila 2');
    expect(de(hallazgos, "advertencia", "vendedor")[0]?.mensaje).toContain('fila 3: "Vendedor Dos"');
    expect(hallazgos.filter((h) => h.severidad === "error")).toEqual([]);
  });

  it("cliente distinto: ERROR, y el folio completo sale del dataset", () => {
    const { dataset, hallazgos } = leer([EQUIPO, { ...ACCESORIO, cliente: "Cliente Z" }, OTRA], ABONOS);
    expect(dataset.ventas.map((v) => v.folio)).toEqual(["V-002"]);

    const errores = hallazgos.filter((h) => h.severidad === "error");
    expect(errores).toHaveLength(1);
    expect(errores[0]).toMatchObject({ hoja: "ventas", fila: 3, campo: "cliente" });
    expect(errores[0]?.mensaje).toBe(
      'El folio V-001 trae clientes distintos en sus partidas (fila 2: "Cliente A"; fila 3: "Cliente Z"): ' +
        "no se sabe de quien es la venta, y el folio completo queda fuera del analisis " +
        "(filas 2 y 3, $110,000 de venta). " +
        "Sus 2 abonos por $60,000 (hoja cobranza, filas 2 y 3) quedan sin aplicar.",
    );
    expect(errores[0]?.accion).toBeTruthy();
  });

  it("los abonos de un folio excluido se conservan en el dataset, sin error propio, y el motor no los aplica", () => {
    const { dataset, hallazgos } = leer([EQUIPO, { ...ACCESORIO, cliente: "Cliente Z" }, OTRA], ABONOS);
    // No se le quitan al cliente: la exportacion a Excel los sigue llevando.
    expect(dataset.cobranza.map((c) => c.folio_pago)).toEqual(["P-001", "P-002"]);
    // El folio existe en la hoja: decir "la venta no existe" seria falso.
    expect(hallazgos.filter((h) => h.hoja === "cobranza" && h.severidad === "error")).toEqual([]);

    const cartera = calcularCartera(dataset, { fechaCorte: CORTE });
    expect(cartera.detalle.map((s) => s.folio)).toEqual(["V-002"]);
    expect(cartera.cobradoTotal).toBe(0);
    expect(cartera.ventaTotal).toBe(10_000_000);
  });
});

describe("partida que no se pudo leer", () => {
  const sinModelo = { ...ACCESORIO, modelo: "" };

  it("en un folio con mas partidas, saca el folio completo: no se fabrica un sobrecobro", () => {
    // Sin esta regla quedaria solo el equipo ($100,000) con $110,000 cobrados:
    // un sobrecobro de $10,000 que nadie hizo.
    const abonos: Fila[] = [{ folio_pago: "P-001", folio_venta: "V-001", fecha_pago: "20/01/2026", monto: 110000 }];
    const { dataset, hallazgos } = leer([EQUIPO, sinModelo, OTRA], abonos);
    expect(dataset.ventas.map((v) => v.folio)).toEqual(["V-002"]);

    const folio = hallazgos.find((h) => h.severidad === "error" && h.campo === "folio");
    expect(folio?.fila).toBe(3);
    expect(folio?.mensaje).toBe(
      "La fila 3 del folio V-001 no se pudo leer, y sin ella el folio no se puede valuar: sus 2 partidas " +
        "quedan fuera del analisis (filas 2 y 3, $110,000 de venta legible). " +
        "Su abono por $110,000 (hoja cobranza, fila 2) queda sin aplicar.",
    );
    expect(folio?.accion).toContain("el folio V-001 completo vuelve a entrar");
    // La fila rota conserva su propio error, que dice que le falta.
    expect(hallazgos.some((h) => h.fila === 3 && h.mensaje.includes("no cumple el formato esperado"))).toBe(true);

    const cartera = calcularCartera(dataset, { fechaCorte: CORTE });
    expect(cartera.detalle.some((s) => s.saldo < 0)).toBe(false);
  });

  it("en un folio de una sola fila se excluye esa fila, como siempre, sin el error de folio", () => {
    const { dataset, hallazgos } = leer([{ ...EQUIPO, modelo: "" }, OTRA]);
    expect(dataset.ventas.map((v) => v.folio)).toEqual(["V-002"]);
    const errores = hallazgos.filter((h) => h.severidad === "error");
    expect(errores).toHaveLength(1);
    expect(errores[0]?.mensaje).toContain("no cumple el formato esperado");
  });

  it("un folio donde NINGUNA partida trae cliente se rechaza completo", () => {
    const { dataset } = leer([{ ...EQUIPO, cliente: "" }, ACCESORIO, OTRA]);
    expect(dataset.ventas.map((v) => v.folio)).toEqual(["V-002"]);
  });
});

describe("partida Demo dentro de un folio con ventas", () => {
  const demo = { ...ACCESORIO, linea: "demo", modelo: "Modelo D", precio_venta: "" };

  it("se conserva en el dataset, y una advertencia dice a donde van los pagos", () => {
    const { dataset, hallazgos } = leer([EQUIPO, demo]);
    // Canonizar no es excluir: la fila llega al motor, que es quien la aparta.
    expect(dataset.ventas.map((v) => v.linea)).toEqual(["Equipo", "Demo"]);
    const aviso = de(hallazgos, "advertencia", "linea");
    expect(aviso).toHaveLength(1);
    expect(aviso[0]?.fila).toBe(3);
    expect(aviso[0]?.mensaje).toContain("los pagos del folio se aplican solo a las partidas que cuentan");
  });

  it("una Demo sola en su folio no lleva esa advertencia", () => {
    const { hallazgos } = leer([EQUIPO, { ...demo, folio: "V-009", cliente: "Interno" }]);
    expect(de(hallazgos, "advertencia", "linea")).toEqual([]);
  });
});

describe("abonos contra el precio del folio", () => {
  it("no advierte sobrecobro si los abonos caben en la suma de las partidas", () => {
    // $105,000 cobrados contra $110,000 del folio: mas que el equipo solo, pero no de mas.
    const abonos: Fila[] = [{ folio_pago: "P-001", folio_venta: "V-001", fecha_pago: "20/01/2026", monto: 105000 }];
    const { hallazgos } = leer([EQUIPO, ACCESORIO], abonos);
    expect(hallazgos.filter((h) => h.mensaje.includes("suman mas que su precio"))).toEqual([]);
  });

  it("si advierte cuando superan el precio del folio completo", () => {
    const abonos: Fila[] = [{ folio_pago: "P-001", folio_venta: "V-001", fecha_pago: "20/01/2026", monto: 110001 }];
    const { hallazgos } = leer([EQUIPO, ACCESORIO], abonos);
    expect(hallazgos.filter((h) => h.mensaje.includes("suman mas que su precio"))).toHaveLength(1);
  });
});
