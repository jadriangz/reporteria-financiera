import { beforeAll, describe, expect, it } from "vitest";

import type { Dataset } from "../../schema";
import { particionarVentas } from "../base";
import { BUCKETS, calcularCartera, type Cartera } from "../cobranza";
import { calcularClientes, type Clientes } from "../clientes";
import { calcularFlujo, type Flujo } from "../flujo";
import { calcularProducto, type Producto } from "../producto";
import { calcularResultados, type Resultados } from "../resultados";
import {
  CORTE,
  ESPERADO,
  FOLIO_DEMO,
  FOLIO_SIN_FECHA,
  FOLIO_SOBRECOBRO,
  cargarFixture,
  rutasInvalidas,
} from "./fixture";

/**
 * El motor contra el archivo de demostracion. Los valores esperados estan
 * verificados de forma independiente: si uno no cuadra, el error esta aqui, no
 * en la tabla (GOBERNANZA.md, seccion 1).
 */
describe("motor contra el archivo de demostracion", () => {
  let dataset: Dataset;
  let resultados: Resultados;
  let cartera: Cartera;
  let clientes: Clientes;
  let producto: Producto;
  let flujo: Flujo;

  beforeAll(() => {
    dataset = cargarFixture();
    resultados = calcularResultados(dataset);
    cartera = calcularCartera(dataset, { fechaCorte: CORTE });
    clientes = calcularClientes(dataset);
    producto = calcularProducto(dataset);
    flujo = calcularFlujo(dataset);
  });

  it("parte de 25 ventas y excluye la Demo", () => {
    expect(dataset.ventas).toHaveLength(25);
    const { incluidas, excluidas } = particionarVentas(dataset.ventas);
    expect(incluidas).toHaveLength(ESPERADO.operaciones);
    expect(excluidas).toHaveLength(1);
    expect(excluidas[0]?.venta.folio).toBe(FOLIO_DEMO);
    expect(excluidas[0]?.motivo).toBe("demo");
    expect(excluidas[0]?.explicacion).toContain("Demo");
  });

  it("reproduce la cascada del estado de resultados", () => {
    const t = resultados.total;
    expect(t.ventaTotal).toBe(ESPERADO.ventaTotal);
    expect(t.costoTotal).toBe(ESPERADO.costoTotal);
    expect(t.utilidadBruta).toBe(ESPERADO.utilidadBruta);
    expect(t.margenPct).toBeCloseTo(ESPERADO.margen, 4);
    expect(t.comisionTotal).toBe(ESPERADO.comision);
    expect(t.utilidadContribucion).toBe(ESPERADO.utilidadContribucion);
    expect(t.operaciones).toBe(ESPERADO.operaciones);
    expect(t.ticketPromedio).toBe(ESPERADO.ticketPromedio);
  });

  it("reproduce gastos y resultado operativo", () => {
    const t = resultados.total;
    expect(t.gastosFijos).toBe(ESPERADO.gastosFijos);
    expect(t.gastosVariables).toBe(ESPERADO.gastosVariables);
    expect(t.gastosTotal).toBe(ESPERADO.gastosFijos + ESPERADO.gastosVariables);
    expect(t.resultadoOperativo).toBe(ESPERADO.resultadoOperativo);
  });

  it("reproduce cobrado y saldo", () => {
    expect(cartera.cobradoTotal).toBe(ESPERADO.cobrado);
    expect(cartera.saldoTotal).toBe(ESPERADO.saldo);
    expect(cartera.ventaTotal).toBe(ESPERADO.ventaTotal);
  });

  it("no arrastra el costo ni la cobranza de la fila Demo", () => {
    // La Demo no tiene precio, asi que la venta no cambiaria al incluirla; su
    // costo y sus abonos si. Con ella dentro el costo seria 3,573,000 y lo
    // cobrado 2,836,100: si ve esas cifras, el motor no la esta excluyendo.
    expect(resultados.total.costoTotal).not.toBe(357_300_000);
    expect(cartera.cobradoTotal).not.toBe(283_610_000);
    expect(cartera.detalle.find((s) => s.folio === FOLIO_DEMO)).toBeUndefined();
  });

  it("reproduce los cinco tramos de antiguedad al corte fijado", () => {
    expect(cartera.aging.porBucket).toEqual(ESPERADO.aging);
    // Ninguno de los cinco tramos queda vacio: el archivo los ejercita todos.
    for (const b of BUCKETS) expect(cartera.aging.porBucket[b]).not.toBe(0);
  });

  it("mide unas ventas por vencimiento y otras por antiguedad, y lo documenta", () => {
    const conFecha = cartera.detalle.filter((s) => s.fecha !== null);
    const vencido = conFecha.filter((s) => s.base === "vencido");
    const antiguedad = conFecha.filter((s) => s.base === "antiguedad");
    // Base mixta en el mismo archivo: es el caso que el archivo del cliente
    // nunca ejercito, porque ninguna de sus ventas traia dias_credito.
    expect(vencido.length).toBeGreaterThan(0);
    expect(antiguedad.length).toBeGreaterThan(0);
    expect(vencido.length + antiguedad.length).toBe(conFecha.length);
    // Una venta con credito vigente da dias negativos y cae en 0-30, no fuera.
    const vigente = vencido.filter((s) => (s.dias ?? 0) < 0);
    expect(vigente.length).toBeGreaterThan(0);
    for (const s of vigente) expect(s.bucket).toBe("0-30");
  });

  it("manda a su propio bucket la venta sin fecha, nunca a 0-30", () => {
    const sinFecha = cartera.detalle.filter((s) => s.fecha === null);
    expect(sinFecha.map((s) => s.folio)).toEqual([FOLIO_SIN_FECHA]);
    for (const s of sinFecha) {
      expect(s.bucket).toBe("sin-fecha");
      expect(s.dias).toBeNull();
      expect(s.base).toBe("sin-fecha");
    }
  });

  it("neta el sobrecobro en su tramo en vez de descartarlo", () => {
    const s = cartera.detalle.find((x) => x.folio === FOLIO_SOBRECOBRO);
    expect(s?.saldo).toBe(-20_000);
    expect(s?.cobrado).toBeGreaterThan(s?.precioVenta ?? 0);
    expect(s?.bucket).toBe("31-60");
    // 95,000 de V-011 menos los 200 sobrecobrados de V-018.
    expect(cartera.aging.porBucket["31-60"]).toBe(9_480_000);
  });

  it("reproduce el attach rate", () => {
    expect(clientes.attachRate.clientesConEquipo).toBe(ESPERADO.attachEquipo);
    expect(clientes.attachRate.clientesConAmbos).toBe(ESPERADO.attachAmbos);
    expect(clientes.attachRate.tasa).toBeCloseTo(ESPERADO.attachTasa, 6);
    expect(clientes.attachRate.operacionesAccesorio).toBe(5);
  });

  it("agrupa las seis lineas del archivo: cinco computables y la Demo aparte", () => {
    expect(producto.porLinea.map((l) => l.clave)).toEqual([
      "EQUIPO",
      "ACCESORIOS",
      "SERVICIO",
      "REFACCIONES",
      "CAPACITACION",
    ]);
    // La sexta linea es Demo, y no se pierde: se lista aparte con su motivo.
    expect(producto.excluidas.map((e) => e.venta.linea)).toEqual(["Demo"]);
    for (const l of producto.porLinea) expect(l.unidades).toBeGreaterThan(0);
  });

  it("agrupa modelos normalizados a mayusculas y sin repetir clave", () => {
    const claves = producto.porModelo.map((g) => g.clave);
    expect(claves).toEqual([...new Set(claves)]);
    for (const c of claves) expect(c).toBe(c.toUpperCase());
  });

  it("documenta de donde salio la base de comision de cada venta", () => {
    expect(resultados.comisiones).toHaveLength(ESPERADO.operaciones);
    for (const c of resultados.comisiones) {
      expect(["fila", "parametro"]).toContain(c.origen);
      expect(c.base).toBeTruthy();
    }
    // Este archivo captura comision_base en TODAS las filas, asi que ninguna
    // cae al valor por omision. La caida al parametro se prueba en limites.
    expect(resultados.comisiones.every((c) => c.origen === "fila")).toBe(true);
  });

  it("separa la venta sin fecha en su propio grupo mensual, al final", () => {
    const sinFecha = resultados.meses.find((m) => m.mes === "sin-fecha");
    expect(sinFecha?.operaciones).toBe(1);
    expect(resultados.meses[resultados.meses.length - 1]?.mes).toBe("sin-fecha");
  });

  it("calcula provision y DSO sin producir NaN", () => {
    // 91-180 * 25% + (+180) * 50% con las tasas de la hoja parametros.
    expect(cartera.provision).toBe(36_450_000);
    expect(Number.isInteger(cartera.provision)).toBe(true);
    expect(cartera.dso).not.toBeNull();
    expect(Number.isFinite(cartera.dso ?? Number.NaN)).toBe(true);
  });

  it("reporta el flujo facturado contra cobrado mes a mes", () => {
    expect(flujo.facturadoTotal).toBe(ESPERADO.ventaTotal);
    // Todos los abonos traen fecha_pago: el flujo mensual si es calculable.
    const fechados = flujo.meses.filter((m) => m.mes !== "sin-fecha");
    expect(fechados).toHaveLength(9);
    expect(fechados.reduce((t, m) => t + m.cobrado, 0)).toBe(ESPERADO.cobrado);
  });

  it("ningun resultado del motor contiene NaN, Infinity ni undefined", () => {
    for (const [nombre, valor] of Object.entries({
      resultados,
      cartera,
      clientes,
      producto,
      flujo,
    })) {
      expect(rutasInvalidas(valor, nombre)).toEqual([]);
    }
  });
});

/**
 * Invariantes: propiedades que deben cumplirse siempre, no solo con este
 * archivo. Son la red que atrapa un cambio que "arregla" un numero rompiendo
 * la coherencia entre modulos.
 */
describe("invariantes del motor", () => {
  let dataset: Dataset;

  beforeAll(() => {
    dataset = cargarFixture();
  });

  it("la suma de utilidad por modelo es la utilidad total", () => {
    const total = calcularResultados(dataset).total.utilidadBruta;
    const porModelo = calcularProducto(dataset).porModelo.reduce((t, g) => t + g.utilidadBruta, 0);
    expect(porModelo).toBe(total);
  });

  it("la suma de utilidad por linea es la utilidad total", () => {
    const total = calcularResultados(dataset).total.utilidadBruta;
    const porLinea = calcularProducto(dataset).porLinea.reduce((t, g) => t + g.utilidadBruta, 0);
    expect(porLinea).toBe(total);
  });

  it("en el desglose linea -> modelo, los modelos suman su linea campo por campo", () => {
    const { detalle, porLinea } = calcularProducto(dataset);
    expect(detalle.map((l) => l.clave)).toEqual(porLinea.map((l) => l.clave));
    for (const linea of detalle) {
      const campos = ["unidades", "ingreso", "costo", "utilidadBruta", "comision", "utilidadContribucion"] as const;
      for (const campo of campos) {
        const suma = linea.modelos.reduce((t, m) => t + m[campo], 0);
        expect(suma, `${linea.etiqueta}.${campo}`).toBe(linea[campo]);
      }
      // La participacion de los modelos es sobre el total, asi que suma la de su linea.
      const part = linea.modelos.reduce((t, m) => t + (m.participacion ?? 0), 0);
      expect(part).toBeCloseTo(linea.participacion ?? 0, 9);
    }
  });

  it("y las lineas suman el total del periodo", () => {
    const { total } = calcularResultados(dataset);
    const { detalle } = calcularProducto(dataset);
    const suma = (f: (l: (typeof detalle)[number]) => number) => detalle.reduce((t, l) => t + f(l), 0);
    expect(suma((l) => l.ingreso)).toBe(total.ventaTotal);
    expect(suma((l) => l.costo)).toBe(total.costoTotal);
    expect(suma((l) => l.utilidadBruta)).toBe(total.utilidadBruta);
    expect(suma((l) => l.unidades)).toBe(total.operaciones);
  });

  it("el desglose por modelo reproduce las unidades e ingreso de cada equipo", () => {
    const equipo = calcularProducto(dataset).detalle.find((l) => l.clave === "EQUIPO");
    const modelos = Object.fromEntries((equipo?.modelos ?? []).map((m) => [m.clave, [m.unidades, m.ingreso]]));
    expect(modelos["AX-100"]).toEqual([3, 156_000_000]);
    expect(modelos["AX-70"]).toEqual([3, 115_500_000]);
    expect(modelos["AX-55"]).toEqual([4, 106_000_000]);
    expect(modelos["AX-25"]).toEqual([3, 53_400_000]);
  });

  it("la suma de todos los buckets de aging es el saldo total", () => {
    const cartera = calcularCartera(dataset, { fechaCorte: CORTE });
    const suma = Object.values(cartera.aging.porBucket).reduce((t, v) => t + v, 0);
    expect(suma).toBe(cartera.saldoTotal);
  });

  it("cobrado + saldo === venta total", () => {
    const cartera = calcularCartera(dataset, { fechaCorte: CORTE });
    expect(cartera.cobradoTotal + cartera.saldoTotal).toBe(cartera.ventaTotal);
    expect(cartera.ventaTotal).toBe(calcularResultados(dataset).total.ventaTotal);
  });

  it("la suma mensual coincide con el total", () => {
    const r = calcularResultados(dataset);
    const suma = (campo: "ventaTotal" | "costoTotal" | "utilidadBruta" | "comisionTotal"): number =>
      r.meses.reduce((t, m) => t + m[campo], 0);
    expect(suma("ventaTotal")).toBe(r.total.ventaTotal);
    expect(suma("costoTotal")).toBe(r.total.costoTotal);
    expect(suma("utilidadBruta")).toBe(r.total.utilidadBruta);
    expect(suma("comisionTotal")).toBe(r.total.comisionTotal);
  });

  it("la suma de ingreso por cliente es la venta total", () => {
    const total = calcularResultados(dataset).total.ventaTotal;
    const porCliente = calcularClientes(dataset).detalle.reduce((t, c) => t + c.ingreso, 0);
    expect(porCliente).toBe(total);
  });

  it("la exposicion crediticia por cliente suma el saldo total", () => {
    const cartera = calcularCartera(dataset, { fechaCorte: CORTE });
    expect(calcularClientes(dataset).exposicionTotal).toBe(cartera.saldoTotal);
  });

  it("todo importe del motor es entero: nunca hay centavos fraccionarios", () => {
    const r = calcularResultados(dataset);
    const c = calcularCartera(dataset, { fechaCorte: CORTE });
    const enteros = [
      r.total.ventaTotal,
      r.total.costoTotal,
      r.total.utilidadBruta,
      r.total.comisionTotal,
      r.total.utilidadContribucion,
      r.total.resultadoOperativo,
      r.total.ticketPromedio ?? 0,
      r.puntoEquilibrio ?? 0,
      c.saldoTotal,
      c.cobradoTotal,
      c.provision,
      ...Object.values(c.aging.porBucket),
    ];
    for (const v of enteros) expect(Number.isInteger(v)).toBe(true);
  });

  it("las participaciones de los buckets suman 1 cuando hay cartera", () => {
    const c = calcularCartera(dataset, { fechaCorte: CORTE });
    const suma = Object.values(c.aging.participacion).reduce<number>((t, v) => t + (v ?? 0), 0);
    expect(suma).toBeCloseTo(1, 6);
  });
});
