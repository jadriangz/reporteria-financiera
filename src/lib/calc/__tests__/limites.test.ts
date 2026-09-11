import { describe, expect, it } from "vitest";

import {
  type Cobranza,
  type Dataset,
  type Gasto,
  ParametrosSchema,
  type Venta,
} from "../../schema";
import { divSegura, hoyUTC } from "../base";
import { calcularCartera } from "../cobranza";
import { calcularClientes } from "../clientes";
import { calcularFlujo } from "../flujo";
import { calcularProducto } from "../producto";
import { calcularResultados } from "../resultados";
import { rutasInvalidas } from "./fixture";

const CORTE = new Date(Date.UTC(2026, 8, 9));

/** Venta minima valida. Los importes ya van en centavos, como los da el parser. */
function venta(parcial: Partial<Venta> & Pick<Venta, "folio">): Venta {
  return {
    fecha: new Date(Date.UTC(2026, 0, 15)),
    linea: "Equipo",
    cliente: "Cliente Unico",
    modelo: "T70P",
    serie: null,
    costo_unitario: 40_000_000,
    precio_venta: 50_000_000,
    comision_pct: null,
    comision_base: null,
    dias_credito: null,
    condicion: "Credito",
    vendedor: null,
    notas: null,
    ...parcial,
  };
}

function abono(parcial: Partial<Cobranza> & Pick<Cobranza, "folio_venta">): Cobranza {
  return {
    folio_pago: "P-1",
    fecha_pago: new Date(Date.UTC(2026, 1, 15)),
    monto: 10_000_000,
    metodo: "Transferencia",
    cliente_ref: null,
    notas: null,
    ...parcial,
  };
}

function gasto(parcial: Partial<Gasto> = {}): Gasto {
  return {
    folio_gasto: "G-1",
    fecha: new Date(Date.UTC(2026, 0, 31)),
    categoria: "Nomina",
    subcategoria: null,
    descripcion: null,
    monto: 1_500_000,
    tipo: "Fijo",
    proveedor: null,
    notas: null,
    ...parcial,
  };
}

function dataset(parcial: Partial<Dataset> = {}): Dataset {
  return {
    ventas: [],
    cobranza: [],
    gastos: [],
    parametros: ParametrosSchema.parse({}),
    ...parcial,
  };
}

describe("dataset vacio", () => {
  const d = dataset();

  it("no lanza y devuelve ceros y nulls, nunca NaN", () => {
    const r = calcularResultados(d);
    const c = calcularCartera(d, { fechaCorte: CORTE });
    const cl = calcularClientes(d);
    const p = calcularProducto(d);
    const f = calcularFlujo(d);

    expect(r.total.ventaTotal).toBe(0);
    expect(r.total.operaciones).toBe(0);
    // Sin operaciones no hay ticket promedio: null, no division entre cero.
    expect(r.total.ticketPromedio).toBeNull();
    expect(r.total.margenPct).toBeNull();
    expect(r.puntoEquilibrio).toBeNull();

    expect(c.saldoTotal).toBe(0);
    expect(c.dso).toBeNull();
    expect(c.aging.participacion["+180"]).toBeNull();

    expect(cl.totalClientes).toBe(0);
    expect(cl.concentracion.top1).toBeNull();
    expect(cl.concentracion.hhi).toBeNull();
    expect(cl.attachRate.tasa).toBeNull();

    expect(p.porModelo).toEqual([]);
    expect(f.meses).toEqual([]);

    for (const [nombre, valor] of Object.entries({ r, c, cl, p, f })) {
      expect(rutasInvalidas(valor, nombre)).toEqual([]);
    }
  });
});

describe("venta con precio 0", () => {
  const d = dataset({ ventas: [venta({ folio: "V-1", precio_venta: 0, costo_unitario: 0 })] });

  it("no produce NaN al calcular el margen", () => {
    const r = calcularResultados(d);
    expect(r.total.ventaTotal).toBe(0);
    expect(r.total.operaciones).toBe(1);
    expect(r.total.margenPct).toBeNull();
    expect(r.total.ticketPromedio).toBe(0);
    expect(rutasInvalidas(r)).toEqual([]);
  });

  it("tampoco al agrupar por producto ni por cliente", () => {
    expect(calcularProducto(d).porModelo[0]?.margenPct).toBeNull();
    expect(calcularClientes(d).detalle[0]?.participacion).toBeNull();
    expect(rutasInvalidas(calcularClientes(d))).toEqual([]);
  });
});

describe("venta con mas cobrado que precio", () => {
  const d = dataset({
    ventas: [venta({ folio: "V-1", precio_venta: 10_000_000 })],
    cobranza: [abono({ folio_venta: "V-1", monto: 15_000_000 })],
  });

  it("deja el saldo en negativo y lo neta en el bucket que le toca", () => {
    const c = calcularCartera(d, { fechaCorte: CORTE });
    expect(c.saldoTotal).toBe(-5_000_000);
    expect(c.detalle[0]?.saldo).toBe(-5_000_000);
    // El saldo negativo entra al aging con su signo. Descartarlo dejaria los
    // buckets sumando mas que el saldo total, y el reporte diria tener cartera
    // que no existe. El bucket del sobrecobro queda en negativo, que es la
    // verdad: a ese cliente se le debe dinero.
    expect(c.aging.porBucket[c.detalle[0]?.bucket ?? "0-30"]).toBe(-5_000_000);
  });

  it("mantiene la identidad cobrado + saldo === venta", () => {
    const c = calcularCartera(d, { fechaCorte: CORTE });
    expect(c.cobradoTotal + c.saldoTotal).toBe(c.ventaTotal);
  });

  it("y la suma de los buckets sigue siendo el saldo total", () => {
    const c = calcularCartera(d, { fechaCorte: CORTE });
    const suma = Object.values(c.aging.porBucket).reduce((t, v) => t + v, 0);
    expect(suma).toBe(c.saldoTotal);
  });
});

describe("todos los gastos variables", () => {
  const d = dataset({
    ventas: [venta({ folio: "V-1" })],
    gastos: [gasto({ tipo: "Variable" }), gasto({ folio_gasto: "G-2", tipo: "Variable" })],
  });

  it("deja el punto de equilibrio en null porque no hay gastos fijos", () => {
    const r = calcularResultados(d);
    expect(r.total.gastosFijos).toBe(0);
    expect(r.total.gastosVariables).toBe(3_000_000);
    // Sin gastos fijos el cociente daria 0, y un equilibrio de $0 en el reporte
    // se lee como "ya lo alcanzaste". null dice lo correcto: no aplica.
    expect(r.puntoEquilibrio).toBeNull();
  });

  it("si ademas no hay margen de contribucion, el equilibrio es null", () => {
    const sinMargen = dataset({
      ventas: [venta({ folio: "V-1", costo_unitario: 60_000_000, precio_venta: 50_000_000 })],
      gastos: [gasto({ tipo: "Fijo" })],
    });
    const r = calcularResultados(sinMargen);
    expect(r.total.utilidadContribucion).toBeLessThan(0);
    expect(r.puntoEquilibrio).toBeNull();
  });
});

describe("exclusion de la fila Demo", () => {
  // En el archivo de demostracion la Demo tampoco tiene precio, asi que quedaria fuera por
  // cualquiera de los dos motivos. Aqui se le pone precio a proposito para
  // comprobar que lo que la excluye es la linea, no la falta de importe.
  const demoConPrecio = venta({
    folio: "V-D",
    linea: "Demo",
    cliente: "Demo (interno)",
    precio_venta: 99_000_000,
    costo_unitario: 39_520_000,
  });

  const d = dataset({
    ventas: [venta({ folio: "V-1" }), demoConPrecio],
    cobranza: [abono({ folio_venta: "V-D", monto: 99_000_000 })],
  });

  it("no suma su precio ni su costo aunque los tenga", () => {
    const r = calcularResultados(d);
    expect(r.total.ventaTotal).toBe(50_000_000);
    expect(r.total.costoTotal).toBe(40_000_000);
    expect(r.total.operaciones).toBe(1);
  });

  it("la reporta en excluidas con motivo demo, no la esconde", () => {
    const r = calcularResultados(d);
    expect(r.excluidas).toHaveLength(1);
    expect(r.excluidas[0]?.venta.folio).toBe("V-D");
    expect(r.excluidas[0]?.motivo).toBe("demo");
  });

  it("no arrastra su cobranza al cobrado ni al flujo", () => {
    expect(calcularCartera(d, { fechaCorte: CORTE }).cobradoTotal).toBe(0);
    expect(calcularFlujo(d).cobradoTotal).toBe(0);
  });

  it("no aparece en producto ni en clientes", () => {
    expect(calcularProducto(d).porLinea.map((g) => g.clave)).not.toContain("DEMO");
    expect(calcularClientes(d).detalle.map((c) => c.nombre)).not.toContain("Demo (interno)");
  });
});

describe("cliente unico", () => {
  const d = dataset({
    ventas: [venta({ folio: "V-1" }), venta({ folio: "V-2" })],
  });

  it("concentra el 100% en un solo cliente", () => {
    const cl = calcularClientes(d);
    expect(cl.totalClientes).toBe(1);
    expect(cl.concentracion.top1).toBe(1);
    expect(cl.concentracion.top3).toBe(1);
    expect(cl.concentracion.hhi).toBe(1);
    expect(cl.recurrentes).toBe(1);
    expect(cl.detalle[0]?.operaciones).toBe(2);
  });
});

describe("guardas de division", () => {
  it("divSegura devuelve null en vez de NaN o Infinity", () => {
    expect(divSegura(1, 0)).toBeNull();
    expect(divSegura(0, 0)).toBeNull();
    expect(divSegura(-1, 0)).toBeNull();
    expect(divSegura(Number.NaN, 1)).toBeNull();
    expect(divSegura(1, Number.POSITIVE_INFINITY)).toBeNull();
    expect(divSegura(10, 4)).toBe(2.5);
  });
});

describe("base de comision", () => {
  it("toma la de la fila cuando viene capturada", () => {
    const d = dataset({
      ventas: [venta({ folio: "V-1", comision_pct: 0.1, comision_base: "Utilidad" })],
    });
    const r = calcularResultados(d);
    // 10% sobre la utilidad bruta (10_000_000), no sobre el precio.
    expect(r.total.comisionTotal).toBe(1_000_000);
    expect(r.comisiones[0]?.base).toBe("Utilidad");
    expect(r.comisiones[0]?.origen).toBe("fila");
  });

  it("cae al valor por omision de parametros cuando la fila viene vacia", () => {
    const d = dataset({
      ventas: [venta({ folio: "V-1", comision_pct: 0.1, comision_base: null })],
      parametros: ParametrosSchema.parse({ comision_base_default: "Utilidad" }),
    });
    const r = calcularResultados(d);
    expect(r.total.comisionTotal).toBe(1_000_000);
    expect(r.comisiones[0]?.origen).toBe("parametro");
  });

  it("la base Venta calcula sobre el precio", () => {
    const d = dataset({
      ventas: [venta({ folio: "V-1", comision_pct: 0.05, comision_base: "Venta" })],
    });
    expect(calcularResultados(d).total.comisionTotal).toBe(2_500_000);
  });

  it('"No aplica" anula la comision aunque la fila traiga comision_pct', () => {
    const d = dataset({
      ventas: [venta({ folio: "V-1", comision_pct: 0.25, comision_base: "No aplica" })],
    });
    const r = calcularResultados(d);
    expect(r.total.comisionTotal).toBe(0);
    expect(r.comisiones[0]?.base).toBe("No aplica");
    // Sin comision, la utilidad de contribucion es toda la utilidad bruta.
    expect(r.total.utilidadContribucion).toBe(r.total.utilidadBruta);
  });

  it('"No aplica" tambien anula cuando viene del valor por omision', () => {
    const d = dataset({
      ventas: [venta({ folio: "V-1", comision_pct: 0.25, comision_base: null })],
      parametros: ParametrosSchema.parse({ comision_base_default: "No aplica" }),
    });
    const r = calcularResultados(d);
    expect(r.total.comisionTotal).toBe(0);
    expect(r.comisiones[0]?.origen).toBe("parametro");
  });
});

describe("la fecha de corte es siempre explicita", () => {
  // No existe valor por omision de fechaCorte: es un campo obligatorio de
  // OpcionesCartera, asi que el compilador impide olvidarlo. Esta prueba fija
  // ademas el corte del fixture para que nadie lo mueva sin darse cuenta.
  it("CORTE es 2026-09-09 y el aging responde solo a lo que se le pasa", () => {
    expect(CORTE.toISOString().slice(0, 10)).toBe("2026-09-09");

    const d = dataset({
      ventas: [venta({ folio: "V-1", fecha: new Date(Date.UTC(2026, 5, 1)) })],
    });

    // Mismo dataset, tres cortes distintos, tres buckets distintos.
    expect(calcularCartera(d, { fechaCorte: new Date(Date.UTC(2026, 5, 15)) }).detalle[0]?.bucket)
      .toBe("0-30");
    expect(calcularCartera(d, { fechaCorte: CORTE }).detalle[0]?.bucket).toBe("91-180");
    expect(calcularCartera(d, { fechaCorte: new Date(Date.UTC(2027, 0, 1)) }).detalle[0]?.bucket)
      .toBe("+180");
  });
});

describe("antiguedad con dias_credito", () => {
  it("mide dias_vencido cuando la venta tiene credito pactado", () => {
    const d = dataset({
      ventas: [
        venta({
          folio: "V-1",
          fecha: new Date(Date.UTC(2026, 5, 1)),
          dias_credito: 90,
        }),
      ],
    });
    const c = calcularCartera(d, { fechaCorte: CORTE });
    const s = c.detalle[0];
    expect(s?.base).toBe("vencido");
    // 1-jun + 90 dias = 30-ago; al 9-sep lleva 10 dias vencida.
    expect(s?.dias).toBe(10);
    expect(s?.bucket).toBe("0-30");
  });

  it("mide antiguedad cuando no hay credito pactado", () => {
    const d = dataset({
      ventas: [venta({ folio: "V-1", fecha: new Date(Date.UTC(2026, 5, 1)), dias_credito: null })],
    });
    const s = calcularCartera(d, { fechaCorte: CORTE }).detalle[0];
    expect(s?.base).toBe("antiguedad");
    expect(s?.dias).toBe(100);
    expect(s?.bucket).toBe("91-180");
  });

  it("una venta sin fecha nunca cae en 0-30", () => {
    const d = dataset({ ventas: [venta({ folio: "V-1", fecha: null })] });
    const s = calcularCartera(d, { fechaCorte: CORTE }).detalle[0];
    expect(s?.bucket).toBe("sin-fecha");
    expect(s?.dias).toBeNull();
  });
});

describe("meses sin actividad", () => {
  it("emite en cero los meses intermedios sin ventas", () => {
    const d = dataset({
      ventas: [
        venta({ folio: "V-1", fecha: new Date(Date.UTC(2026, 0, 10)) }),
        venta({ folio: "V-2", fecha: new Date(Date.UTC(2026, 3, 10)) }),
      ],
    });
    const f = calcularFlujo(d);
    expect(f.meses.map((m) => m.mes)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
    expect(f.mesesSinVenta).toEqual(["2026-02", "2026-03"]);
  });
});

describe("fecha de corte por omision", () => {
  it("es el dia del calendario del usuario, no el de UTC", () => {
    // 10 de septiembre a las 23:30 hora LOCAL: en Mexico, en UTC ya es el 11.
    const nocheLocal = new Date(2026, 8, 10, 23, 30);
    expect(hoyUTC(nocheLocal).toISOString()).toBe("2026-09-10T00:00:00.000Z");
    // Y a las 00:05 locales ya es el dia nuevo, aunque en UTC falten horas.
    expect(hoyUTC(new Date(2026, 8, 11, 0, 5)).toISOString()).toBe("2026-09-11T00:00:00.000Z");
  });
});
