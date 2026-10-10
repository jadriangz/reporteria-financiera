import { describe, expect, it } from "vitest";

import { type Cobranza, type Dataset, ParametrosSchema, type Venta } from "../../schema";
import { particionarVentas } from "../base";
import { aplicarPagos, calcularCartera, ordenDeEntrega } from "../cobranza";
import { calcularClientes } from "../clientes";
import { calcularFlujo } from "../flujo";
import { calcularInsights } from "../insights";
import { calcularProducto } from "../producto";
import { calcularResultados } from "../resultados";
import { calcularVenta } from "../venta";
import { CORTE, ESPERADO, FOLIO_CONFLICTO, FOLIO_HEREDA, cargarFixture } from "./fixture";

/**
 * Varias partidas por venta (v1.2.0).
 *
 * Un folio agrupa partidas. El cobro y el saldo son del folio; lo pendiente se
 * reparte entre sus partidas en orden de entrega y envejece con la fecha de
 * cada una. Los casos de aqui se arman en codigo, no en el archivo de
 * demostracion: son los casos limite del reparto, y meterlos al demo moveria
 * cifras de referencia que no tienen por que moverse.
 *
 * Corte de todas las pruebas: 2026-09-09. Importes en centavos.
 */

const dia = (mes: number, d: number): Date => new Date(Date.UTC(2026, mes - 1, d));

/** Entregas de referencia y los dias que llevan al corte, sin dias de credito. */
const ENERO = dia(1, 15); // 237 dias: tramo +180
const JUNIO = dia(6, 20); // 81 dias: tramo 61-90
const AGOSTO = dia(8, 20); // 20 dias: tramo 0-30

/** Una partida minima. La cabecera llega resuelta, como la entrega el parseo. */
function partida(parcial: Partial<Venta> & Pick<Venta, "folio">): Venta {
  return {
    fecha: ENERO,
    linea: "Equipo",
    cliente: "Cliente Unico",
    modelo: "Modelo A",
    serie: null,
    costo_unitario: 8_000_000,
    precio_venta: 10_000_000,
    comision_pct: null,
    comision_base: null,
    dias_credito: null,
    condicion: "Credito",
    vendedor: null,
    notas: null,
    ...parcial,
  };
}

function abono(folio_venta: string, monto: number, fecha_pago: Date | null = dia(2, 1)): Cobranza {
  return { folio_pago: "P", folio_venta, fecha_pago, monto, metodo: "Transferencia", cliente_ref: null, notas: null };
}

function dataset(ventas: Venta[], cobranza: Cobranza[] = []): Dataset {
  return { ventas, cobranza, gastos: [], parametros: ParametrosSchema.parse({}) };
}

const cartera = (d: Dataset) => calcularCartera(d, { fechaCorte: CORTE });

/** Equipo entregado en enero ($100,000) y accesorio entregado en agosto ($10,000), mismo folio. */
const EQUIPO = partida({ folio: "V-1", fecha: ENERO, linea: "Equipo", modelo: "Modelo A", precio_venta: 10_000_000 });
const ACCESORIO = partida({
  folio: "V-1",
  fecha: AGOSTO,
  linea: "Accesorios",
  modelo: "Modelo B",
  precio_venta: 1_000_000,
  costo_unitario: 500_000,
});

describe("orden de entrega", () => {
  it("la mas antigua primero, sin importar el orden de las filas", () => {
    expect(ordenDeEntrega([ACCESORIO, EQUIPO])).toEqual([1, 0]);
    expect(ordenDeEntrega([EQUIPO, ACCESORIO])).toEqual([0, 1]);
  });

  it("dos partidas con la misma fecha conservan el orden de las filas", () => {
    const a = partida({ folio: "V-1", fecha: JUNIO, modelo: "A" });
    const b = partida({ folio: "V-1", fecha: JUNIO, modelo: "B" });
    const c = partida({ folio: "V-1", fecha: ENERO, modelo: "C" });
    expect(ordenDeEntrega([a, b, c])).toEqual([2, 0, 1]);
  });

  it("una partida sin fecha va al final, tambien en el orden de las filas", () => {
    const sin1 = partida({ folio: "V-1", fecha: null, modelo: "S1" });
    const sin2 = partida({ folio: "V-1", fecha: null, modelo: "S2" });
    expect(ordenDeEntrega([sin1, ACCESORIO, sin2, EQUIPO])).toEqual([3, 1, 0, 2]);
  });
});

describe("reparto de los pagos de un folio", () => {
  it("cubre cada partida hasta su precio antes de pasar a la siguiente", () => {
    expect(aplicarPagos([EQUIPO, ACCESORIO], 4_000_000)).toEqual([4_000_000, 0]);
    expect(aplicarPagos([EQUIPO, ACCESORIO], 10_400_000)).toEqual([10_000_000, 400_000]);
    expect(aplicarPagos([EQUIPO, ACCESORIO], 11_000_000)).toEqual([10_000_000, 1_000_000]);
  });

  it("reparte por entrega y devuelve en el orden de las filas", () => {
    // El accesorio va primero en el archivo, pero se entrego despues: se paga al final.
    expect(aplicarPagos([ACCESORIO, EQUIPO], 4_000_000)).toEqual([0, 4_000_000]);
  });

  it("sin pagos no aplica nada, y lo aplicado siempre suma lo cobrado", () => {
    expect(aplicarPagos([EQUIPO, ACCESORIO], 0)).toEqual([0, 0]);
    for (const cobrado of [-500_000, 0, 1, 9_999_999, 10_000_000, 10_000_001, 11_000_000, 25_000_000]) {
      const aplicado = aplicarPagos([ACCESORIO, EQUIPO], cobrado);
      expect(aplicado.reduce((t, a) => t + a, 0), String(cobrado)).toBe(cobrado);
    }
  });
});

describe("el saldo de un folio envejece por partida", () => {
  it("con lo pendiente en dos entregas, el saldo cae en DOS tramos", () => {
    // $110,000 de venta, $40,000 cobrados: quedan $60,000 del equipo de enero
    // y los $10,000 completos del accesorio de agosto.
    const c = cartera(dataset([EQUIPO, ACCESORIO], [abono("V-1", 4_000_000)]));

    expect(c.detalle).toHaveLength(1);
    const folio = c.detalle[0];
    expect(folio?.precioVenta).toBe(11_000_000);
    expect(folio?.cobrado).toBe(4_000_000);
    expect(folio?.saldo).toBe(7_000_000);

    expect(c.aging.porBucket["+180"]).toBe(6_000_000);
    expect(c.aging.porBucket["0-30"]).toBe(1_000_000);
    expect(c.aging.saldoTotal).toBe(7_000_000);

    expect(folio?.partidas.map((p) => [p.modelo, p.aplicado, p.saldo, p.bucket])).toEqual([
      ["Modelo A", 4_000_000, 6_000_000, "+180"],
      ["Modelo B", 0, 1_000_000, "0-30"],
    ]);
  });

  it("el renglon del folio lleva el tramo de su pendiente mas antiguo", () => {
    const c = cartera(dataset([ACCESORIO, EQUIPO], [abono("V-1", 4_000_000)]));
    const folio = c.detalle[0];
    expect(folio?.bucket).toBe("+180");
    expect(folio?.dias).toBe(237);
    expect(folio?.fecha).toEqual(ENERO);
  });

  it("pagado lo primero entregado, lo pendiente es solo lo ultimo y la cartera es fresca", () => {
    // $104,000 cobrados: el equipo de enero queda pagado y del accesorio faltan $6,000.
    const c = cartera(dataset([EQUIPO, ACCESORIO], [abono("V-1", 10_400_000)]));
    expect(c.aging.porBucket["+180"]).toBe(0);
    expect(c.aging.porBucket["0-30"]).toBe(600_000);
    expect(c.detalle[0]?.bucket).toBe("0-30");
    expect(c.detalle[0]?.fecha).toEqual(AGOSTO);
  });

  it("los dias de credito del folio cuentan desde la entrega de cada partida", () => {
    // 60 dias de credito: el equipo de enero lleva 177 vencido (91-180) y el
    // accesorio de agosto todavia no vence (-40 dias: tramo 0-30).
    const c = cartera(
      dataset([{ ...EQUIPO, dias_credito: 60 }, { ...ACCESORIO, dias_credito: 60 }], [abono("V-1", 4_000_000)]),
    );
    expect(c.detalle[0]?.partidas.map((p) => [p.dias, p.base, p.bucket])).toEqual([
      [177, "vencido", "91-180"],
      [-40, "vencido", "0-30"],
    ]);
    expect(c.aging.porBucket["91-180"]).toBe(6_000_000);
    expect(c.aging.porBucket["0-30"]).toBe(1_000_000);
  });

  it("un folio de una sola partida se calcula exactamente como antes", () => {
    const sola = partida({ folio: "V-9", fecha: JUNIO, dias_credito: 30 });
    const c = cartera(dataset([sola], [abono("V-9", 2_500_000)]));
    expect(c.detalle[0]).toMatchObject({
      folio: "V-9",
      fecha: JUNIO,
      precioVenta: 10_000_000,
      cobrado: 2_500_000,
      saldo: 7_500_000,
      dias: 51,
      base: "vencido",
      bucket: "31-60",
    });
    expect(c.detalle[0]?.partidas).toHaveLength(1);
  });

  it("un folio repetido ya no cuenta su cobro una vez por fila", () => {
    // El defecto de la 1.1.5: $100,000 + $10,000 con un abono de $60,000 daba
    // cobrado $120,000 y saldo -$10,000, porque cada fila restaba todo el cobro.
    const c = cartera(dataset([EQUIPO, ACCESORIO], [abono("V-1", 6_000_000)]));
    expect(c.cobradoTotal).toBe(6_000_000);
    expect(c.saldoTotal).toBe(5_000_000);
    expect(calcularClientes(dataset([EQUIPO, ACCESORIO], [abono("V-1", 6_000_000)])).detalle[0]).toMatchObject({
      cobrado: 6_000_000,
      saldo: 5_000_000,
    });
  });
});

describe("casos limite del reparto", () => {
  it("sobrecobro con varias entregas: el exceso queda en la ultima partida entregada, en su tramo", () => {
    // $110,000 de venta y $112,000 cobrados: sobran $2,000.
    const c = cartera(dataset([EQUIPO, ACCESORIO], [abono("V-1", 11_200_000)]));
    expect(c.detalle[0]?.saldo).toBe(-200_000);
    expect(c.detalle[0]?.partidas.map((p) => p.saldo)).toEqual([0, -200_000]);
    expect(c.aging.porBucket["0-30"]).toBe(-200_000);
    expect(c.aging.porBucket["+180"]).toBe(0);
    expect(c.aging.saldoTotal).toBe(-200_000);
    // El renglon del folio se resume con la partida que carga el saldo a favor.
    expect(c.detalle[0]?.bucket).toBe("0-30");
  });

  it("sobrecobro con una partida sin fecha: el exceso va a la ultima CON fecha", () => {
    const sinFecha = partida({ folio: "V-1", fecha: null, modelo: "Sin fecha", precio_venta: 500_000 });
    // $115,000 de venta y $117,000 cobrados.
    const c = cartera(dataset([EQUIPO, sinFecha, ACCESORIO], [abono("V-1", 11_700_000)]));
    expect(c.detalle[0]?.partidas.map((p) => [p.modelo, p.saldo])).toEqual([
      ["Modelo A", 0],
      ["Sin fecha", 0],
      ["Modelo B", -200_000],
    ]);
    expect(c.aging.porBucket["sin-fecha"]).toBe(0);
    expect(c.aging.porBucket["0-30"]).toBe(-200_000);
  });

  it("sobrecobro en un folio donde ninguna partida tiene fecha: va al tramo sin fecha", () => {
    const a = partida({ folio: "V-1", fecha: null, modelo: "A", precio_venta: 1_000_000 });
    const b = partida({ folio: "V-1", fecha: null, modelo: "B", precio_venta: 1_000_000 });
    const c = cartera(dataset([a, b], [abono("V-1", 2_300_000)]));
    expect(c.detalle[0]?.partidas.map((p) => p.saldo)).toEqual([0, -300_000]);
    expect(c.aging.porBucket["sin-fecha"]).toBe(-300_000);
  });

  it("partida sin fecha dentro de un folio: se paga al final y lo pendiente va a «sin fecha»", () => {
    const sinFecha = partida({ folio: "V-1", fecha: null, modelo: "Sin fecha", precio_venta: 500_000 });
    // La partida sin fecha va PRIMERO en el archivo; aun asi se paga al ultimo.
    const c = cartera(dataset([sinFecha, EQUIPO, ACCESORIO], [abono("V-1", 11_200_000)]));
    expect(c.detalle[0]?.partidas.map((p) => [p.modelo, p.aplicado, p.saldo, p.bucket])).toEqual([
      ["Sin fecha", 200_000, 300_000, "sin-fecha"],
      ["Modelo A", 10_000_000, 0, "+180"],
      ["Modelo B", 1_000_000, 0, "0-30"],
    ]);
    expect(c.aging.porBucket["sin-fecha"]).toBe(300_000);
    expect(c.aging.saldoTotal).toBe(300_000);
    expect(c.detalle[0]?.bucket).toBe("sin-fecha");
    expect(c.detalle[0]?.dias).toBeNull();
  });

  it("partida Demo en un folio con ventas: se excluye, y los pagos van a las partidas que cuentan", () => {
    const demo = partida({ folio: "V-1", fecha: ENERO, linea: "Demo", modelo: "Demo", precio_venta: 9_000_000 });
    const d = dataset([demo, EQUIPO, ACCESORIO], [abono("V-1", 10_400_000)]);
    const c = cartera(d);

    // La Demo no es venta ni cartera, aunque traiga precio.
    expect(c.ventaTotal).toBe(11_000_000);
    expect(c.excluidas.map((e) => [e.venta.modelo, e.motivo])).toEqual([["Demo", "demo"]]);
    // Los $104,000 se aplican completos al equipo y al accesorio.
    expect(c.detalle[0]?.partidas.map((p) => [p.modelo, p.aplicado])).toEqual([
      ["Modelo A", 10_000_000],
      ["Modelo B", 400_000],
    ]);
    expect(c.cobradoTotal).toBe(10_400_000);
    expect(c.saldoTotal).toBe(600_000);
    expect(calcularResultados(d).total.operaciones).toBe(1);
  });

  it("un folio que es SOLO Demo no genera cartera, y su abono no se aplica a nada", () => {
    const demo = partida({ folio: "V-D", linea: "Demo", precio_venta: null });
    const c = cartera(dataset([demo, EQUIPO], [abono("V-D", 9_000_000), abono("V-1", 1_000_000)]));
    expect(c.detalle.map((s) => s.folio)).toEqual(["V-1"]);
    expect(c.cobradoTotal).toBe(1_000_000);
  });

  it("dos partidas con la misma fecha: decide el orden de las filas", () => {
    const primera = partida({ folio: "V-1", fecha: JUNIO, modelo: "Primera" });
    const segunda = partida({ folio: "V-1", fecha: JUNIO, modelo: "Segunda" });
    const pago = [abono("V-1", 12_000_000)];
    expect(cartera(dataset([primera, segunda], pago)).detalle[0]?.partidas.map((p) => [p.modelo, p.saldo])).toEqual([
      ["Primera", 0],
      ["Segunda", 8_000_000],
    ]);
    expect(cartera(dataset([segunda, primera], pago)).detalle[0]?.partidas.map((p) => [p.modelo, p.saldo])).toEqual([
      ["Segunda", 0],
      ["Primera", 8_000_000],
    ]);
  });
});

describe("que se calcula por folio y que por partida", () => {
  // Dos folios: V-1 con equipo (enero) y accesorio (agosto); V-2 con un equipo en junio.
  const otro = partida({ folio: "V-2", fecha: JUNIO, cliente: "Otro Cliente", precio_venta: 20_000_000, costo_unitario: 15_000_000 });
  const d = dataset([EQUIPO, ACCESORIO, otro], [abono("V-1", 4_000_000), abono("V-2", 20_000_000)]);

  it("operaciones y ticket promedio son por folio", () => {
    const { total } = calcularResultados(d);
    expect(total.operaciones).toBe(2);
    expect(total.partidas).toBe(3);
    expect(total.ventaTotal).toBe(31_000_000);
    expect(total.ticketPromedio).toBe(15_500_000);
  });

  it("utilidad, margen y producto son por partida", () => {
    const { total } = calcularResultados(d);
    const porPartida = [EQUIPO, ACCESORIO, otro].map((p) => calcularVenta(p, d.parametros).utilidadBruta);
    expect(porPartida).toEqual([2_000_000, 500_000, 5_000_000]);
    expect(total.utilidadBruta).toBe(7_500_000);

    const producto = calcularProducto(d);
    expect(producto.porLinea.map((l) => [l.etiqueta, l.unidades, l.ingreso])).toEqual([
      ["Equipo", 2, 30_000_000],
      ["Accesorios", 1, 1_000_000],
    ]);
  });

  it("el ingreso por mes se agrupa por la fecha de cada partida: un folio puede abarcar dos meses", () => {
    const flujo = calcularFlujo(d);
    const conVenta = flujo.meses.filter((m) => m.operaciones > 0).map((m) => [m.mes, m.facturado, m.operaciones]);
    expect(conVenta).toEqual([
      ["2026-01", 10_000_000, 1],
      ["2026-06", 20_000_000, 1],
      ["2026-08", 1_000_000, 1],
    ]);
    // Por mes se cuentan ENTREGAS: suman 3, no las 2 operaciones del periodo.
    const entregas = flujo.meses.reduce((t, m) => t + m.operaciones, 0);
    expect(entregas).toBe(3);
    expect(entregas).toBe(calcularResultados(d).total.partidas);
  });

  it("en clientes, operaciones son folios, y su cobro y su saldo se cuentan una vez", () => {
    const { detalle } = calcularClientes(d);
    const unico = detalle.find((c) => c.nombre === "Cliente Unico");
    expect(unico).toMatchObject({ operaciones: 1, ingreso: 11_000_000, cobrado: 4_000_000, saldo: 7_000_000 });
    // Un folio con dos partidas no es volver a comprar.
    expect(unico?.recurrente).toBe(false);
    expect(unico?.lineas).toEqual(["ACCESORIOS", "EQUIPO"]);
  });

  it("recurrente es mas de un folio", () => {
    const segundaCompra = partida({ folio: "V-3", fecha: AGOSTO, linea: "Refacciones" });
    const { detalle } = calcularClientes(dataset([EQUIPO, ACCESORIO, segundaCompra]));
    expect(detalle[0]).toMatchObject({ operaciones: 2, recurrente: true });
  });

  it("el hallazgo de cartera +180 cita lo que el folio tiene en ESE tramo, no su saldo entero", () => {
    // V-1 debe $70,000: $60,000 de enero (+180) y $10,000 de agosto (0-30).
    const insights = calcularInsights(d, { fechaCorte: CORTE });
    const vencida = insights.find((i) => i.id === "cartera-mas-180");
    expect(vencida?.detalle).toContain("Cliente Unico $60,000 (237 dias, folio V-1)");
    expect(vencida?.detalle).not.toContain("$70,000");
  });
});

describe("venta cruzada por folio", () => {
  it("cuenta los folios con equipo que llevan accesorio en el mismo folio", () => {
    const soloEquipo = partida({ folio: "V-2", cliente: "Otro Cliente" });
    const { ventaCruzadaFolio } = calcularClientes(dataset([EQUIPO, ACCESORIO, soloEquipo]));
    expect(ventaCruzadaFolio).toEqual({
      foliosConEquipo: 2,
      foliosConAmbos: 1,
      tasa: 0.5,
      foliosConVariasPartidas: 1,
    });
  });

  it("es distinta del attach rate por cliente, que no cambia", () => {
    // El mismo cliente compra el equipo en un folio y el accesorio en otro: por
    // cliente SI hay venta cruzada; dentro del folio, no.
    const equipo = partida({ folio: "V-1", linea: "Equipo" });
    const accesorio = partida({ folio: "V-2", linea: "Accesorios", fecha: AGOSTO });
    const c = calcularClientes(dataset([equipo, accesorio]));
    expect(c.attachRate.tasa).toBe(1);
    expect(c.ventaCruzadaFolio.tasa).toBe(0);
  });

  it("en un archivo de una fila por folio dice que no hay partidas con que juzgarla", () => {
    // Ausencia de partidas no es venta cruzada en cero: quien lea la tasa tiene
    // que mirar esto primero.
    const c = calcularClientes(dataset([partida({ folio: "V-1" }), partida({ folio: "V-2", linea: "Accesorios" })]));
    expect(c.ventaCruzadaFolio.foliosConVariasPartidas).toBe(0);
    expect(c.ventaCruzadaFolio.tasa).toBe(0);
  });

  it("sin ningun folio con equipo la tasa es null, no cero", () => {
    const c = calcularClientes(dataset([partida({ folio: "V-1", linea: "Servicio" })]));
    expect(c.ventaCruzadaFolio.tasa).toBeNull();
  });
});

describe("los dos folios con varias partidas del archivo de demostracion", () => {
  const demo = cargarFixture();
  const c = cartera(demo);
  const clientes = calcularClientes(demo);

  it("la venta cruzada por folio es 2 de 13", () => {
    expect(clientes.ventaCruzadaFolio.foliosConAmbos).toBe(ESPERADO.cruzadaAmbos);
    expect(clientes.ventaCruzadaFolio.foliosConEquipo).toBe(ESPERADO.cruzadaEquipo);
    expect(clientes.ventaCruzadaFolio.foliosConVariasPartidas).toBe(ESPERADO.foliosConVariasPartidas);
  });

  it("el attach rate por cliente sigue en 3 de 10", () => {
    expect(clientes.attachRate.clientesConAmbos).toBe(ESPERADO.attachAmbos);
    expect(clientes.attachRate.clientesConEquipo).toBe(ESPERADO.attachEquipo);
  });

  it("hay 24 partidas computables en 22 folios", () => {
    expect(particionarVentas(demo.ventas).incluidas).toHaveLength(ESPERADO.partidas);
    expect(c.detalle).toHaveLength(ESPERADO.operaciones);
  });

  it("V-008: equipo y accesorio entregados el mismo dia; lo cobrado cubre primero el equipo", () => {
    const folio = c.detalle.find((s) => s.folio === FOLIO_HEREDA);
    // $265,000 + $24,000 de venta, $100,000 + $24,000 cobrados.
    expect(folio).toMatchObject({ precioVenta: 28_900_000, cobrado: 12_400_000, saldo: 16_500_000 });
    expect(folio?.partidas.map((p) => [p.linea, p.aplicado, p.saldo])).toEqual([
      ["Equipo", 12_400_000, 14_100_000],
      ["Accesorios", 0, 2_400_000],
    ]);
    // Misma fecha y mismos 90 dias de credito: todo su saldo cae en un solo tramo.
    expect(new Set(folio?.partidas.map((p) => p.bucket)).size).toBe(1);
  });

  it("V-015: el saldo del folio es el mismo que tenia el equipo antes de unirlo", () => {
    const folio = c.detalle.find((s) => s.folio === FOLIO_CONFLICTO);
    expect(folio).toMatchObject({ precioVenta: 53_150_000, cobrado: 43_150_000, saldo: 10_000_000 });
    expect(new Set(folio?.partidas.map((p) => p.bucket)).size).toBe(1);
  });
});
