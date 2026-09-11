import { describe, expect, it } from "vitest";

import {
  UMBRAL_CONCENTRACION_TOP5,
  calcularCartera,
  calcularClientes,
  calcularProducto,
  calcularResultados,
} from "../../../lib/calc";
import { CORTE, ESPERADO, cargarFixture } from "../../../lib/calc/__tests__/fixture";
import { type Cobranza, type Dataset, ParametrosSchema, type Venta } from "../../../lib/schema";
import { filasClientes, operacionesDe, tonoDeSaldo, ventaCruzada } from "../selectores";

function venta(p: Partial<Venta> & Pick<Venta, "folio">): Venta {
  return {
    fecha: new Date(Date.UTC(2026, 0, 15)),
    linea: "Equipo",
    cliente: "Cliente Uno",
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
    ...p,
  };
}

function abono(p: Partial<Cobranza> & Pick<Cobranza, "folio_venta" | "monto">): Cobranza {
  return { folio_pago: null, fecha_pago: null, metodo: null, cliente_ref: null, notas: null, ...p };
}

const dataset = (p: Partial<Dataset>): Dataset => ({
  ventas: [],
  cobranza: [],
  gastos: [],
  parametros: ParametrosSchema.parse({}),
  ...p,
});

const fixture = cargarFixture();
const clientes = calcularClientes(fixture);
const cartera = calcularCartera(fixture, { fechaCorte: CORTE });
const filas = filasClientes(clientes, cartera, true);
const porNombre = (nombre: string) => filas.find((f) => f.nombre === nombre);

describe("tabla de concentracion", () => {
  it("va por ingreso descendente, no por saldo", () => {
    for (let i = 1; i < filas.length; i += 1) {
      expect(filas[i]?.ingreso ?? 0).toBeLessThanOrEqual(filas[i - 1]?.ingreso ?? 0);
    }
    expect(filas[0]?.ingreso).toBe(79_090_000);
  });

  it("un cliente cuyo saldo mas viejo esta al corriente NO se marca en riesgo", () => {
    // Semillas del Norte: $650,000 de ingreso, $260,000 de saldo, lo mas viejo
    // a 31 dias. Debe dinero, pero nada de eso es cartera en riesgo.
    const semillas = porNombre("Semillas del Norte");
    expect(semillas?.saldo).toBe(26_000_000);
    expect(semillas?.tramo).toBe("31-60");
    expect(semillas?.tonoSaldo).toBe("neutro");
  });

  it("el saldo de mas de 180 dias si se marca, y solo en su celda", () => {
    const lorenzo = porNombre("Agricola San Lorenzo");
    expect(lorenzo?.tramo).toBe("+180");
    expect(lorenzo?.tonoSaldo).toBe("riesgo");
    // La fila no tiene tono propio: el unico tono que existe es el del saldo.
    expect(Object.keys(lorenzo ?? {})).not.toContain("tono");
  });

  it("el tramo de 91-180 se marca como advertencia, no como riesgo", () => {
    const alamos = porNombre("Finca Los Alamos");
    expect(alamos?.tramo).toBe("91-180");
    expect(alamos?.tonoSaldo).toBe("advertencia");
  });

  it("el tramo cruza con la clave del motor: todo cliente que debe tiene tramo", () => {
    for (const f of filas.filter((x) => x.saldo > 0)) expect(f.tramo, f.nombre).not.toBeNull();
  });

  it("un cliente al corriente queda sin tramo y sin tono", () => {
    const pagado = filas.find((f) => f.saldo === 0);
    expect(pagado?.tramo).toBeNull();
    expect(pagado?.tonoSaldo).toBe("neutro");
  });

  it("sin hoja de cobranza no colorea ningun saldo", () => {
    for (const f of filasClientes(clientes, cartera, false)) {
      expect(f.tonoSaldo).toBe("neutro");
      expect(f.tramo).toBeNull();
    }
  });

  it("los cinco mayores concentran 69%: por encima del umbral", () => {
    expect(clientes.concentracion.top5).toBeCloseTo(0.6855, 4);
    expect(clientes.concentracion.top5 ?? 0).toBeGreaterThan(UMBRAL_CONCENTRACION_TOP5);
  });
});

describe("tono del saldo", () => {
  it("sigue la escala de Cobranza solo cuando hay saldo", () => {
    expect(tonoDeSaldo(100, "0-30", true)).toBe("neutro");
    expect(tonoDeSaldo(100, "91-180", true)).toBe("advertencia");
    expect(tonoDeSaldo(100, "+180", true)).toBe("riesgo");
    expect(tonoDeSaldo(0, "+180", true)).toBe("neutro");
  });

  it("un sobrecobro es advertencia, no riesgo", () => {
    expect(tonoDeSaldo(-100, null, true)).toBe("advertencia");
  });
});

describe("operaciones de un cliente", () => {
  it("suman el ingreso y el saldo del cliente, para cada cliente del archivo", () => {
    for (const c of clientes.detalle) {
      const ops = operacionesDe(c.clave, cartera, fixture, true);
      expect(ops.length, c.nombre).toBe(c.operaciones);
      expect(ops.reduce((t, o) => t + o.precioVenta, 0), c.nombre).toBe(c.ingreso);
      expect(ops.reduce((t, o) => t + o.saldo, 0), c.nombre).toBe(c.saldo);
    }
  });

  it("une linea y modelo, y va en orden cronologico", () => {
    const coop = clientes.detalle.find((c) => c.nombre === "Cooperativa Rio Verde");
    const ops = operacionesDe(coop?.clave ?? "", cartera, fixture, true);
    expect(ops.map((o) => [o.folio, o.linea, o.modelo])).toEqual([
      ["V-015", "Equipo", "AX-100"],
      ["V-016", "Accesorios", "Bateria BX-30"],
      ["V-024", "Accesorios", "Bateria BX-30"],
    ]);
  });

  it("el sobrecobro de una operacion se marca en advertencia, no en riesgo", () => {
    const lorenzo = clientes.detalle.find((c) => c.nombre === "Agricola San Lorenzo");
    const ops = operacionesDe(lorenzo?.clave ?? "", cartera, fixture, true);
    const sobre = ops.find((o) => o.folio === "V-018");
    expect(sobre?.saldo).toBe(-20_000);
    expect(sobre?.tonoSaldo).toBe("advertencia");
  });

  it("agrupa nombres con distinto espaciado bajo el mismo cliente", () => {
    const d = dataset({
      ventas: [
        venta({ folio: "V-1", cliente: "Agricola  Shensim" }),
        venta({ folio: "V-2", cliente: "agricola shensim" }),
      ],
    });
    const c = calcularClientes(d);
    const ops = operacionesDe(c.detalle[0]?.clave ?? "", calcularCartera(d, { fechaCorte: CORTE }), d, true);
    expect(c.detalle).toHaveLength(1);
    expect(ops).toHaveLength(2);
  });

  it("la Demo no aparece como operacion de nadie", () => {
    const todas = clientes.detalle.flatMap((c) => operacionesDe(c.clave, cartera, fixture, true));
    expect(todas.map((o) => o.folio)).not.toContain("V-006");
    expect(todas).toHaveLength(ESPERADO.operaciones);
  });

  it("el saldo de cada operacion se colorea por su propio tramo", () => {
    const d = dataset({
      ventas: [
        venta({ folio: "V-viejo", fecha: new Date(Date.UTC(2026, 0, 1)) }),
        venta({ folio: "V-nuevo", fecha: new Date(Date.UTC(2026, 8, 1)) }),
        venta({ folio: "V-pagado", fecha: new Date(Date.UTC(2026, 0, 1)) }),
      ],
      cobranza: [abono({ folio_venta: "V-pagado", monto: 50_000_000 })],
    });
    const c = calcularClientes(d);
    const ops = operacionesDe(c.detalle[0]?.clave ?? "", calcularCartera(d, { fechaCorte: CORTE }), d, true);
    expect(Object.fromEntries(ops.map((o) => [o.folio, o.tonoSaldo]))).toEqual({
      "V-viejo": "riesgo",
      "V-pagado": "neutro",
      "V-nuevo": "neutro",
    });
  });
});

describe("venta cruzada", () => {
  const vc = ventaCruzada(clientes, calcularProducto(fixture), calcularResultados(fixture).total.ventaTotal);

  it("reproduce el archivo: 3 de 10 y $94,900 de accesorios", () => {
    expect(vc.compradoresEquipo).toBe(ESPERADO.attachEquipo);
    expect(vc.conAccesorio).toBe(ESPERADO.attachAmbos);
    expect(vc.attachRate).toBeCloseTo(ESPERADO.attachTasa, 9);
    expect(vc.ingresoAccesorios).toBe(9_490_000);
    expect(vc.pctIngreso).toBeCloseTo(0.0211, 4);
    expect(vc.sinAccesorio).toHaveLength(7);
    expect(vc.hayAccesorios).toBe(true);
  });

  // AUSENCIA DE LINEA NO ES ATTACH RATE BAJO: la vista lo dice en vez de
  // pintar un 0% en ambar.
  it("sin una sola operacion de accesorios, la metrica no aplica", () => {
    const d = dataset({
      ventas: [venta({ folio: "V-1", linea: "Equipo" }), venta({ folio: "V-2", linea: "Servicio" })],
    });
    const r = ventaCruzada(calcularClientes(d), calcularProducto(d), calcularResultados(d).total.ventaTotal);
    expect(r.hayAccesorios).toBe(false);
    expect(r.attachRate).toBe(0);
  });

  it("sin linea de accesorios, el ingreso es cero y no un hueco", () => {
    const d = dataset({ ventas: [venta({ folio: "V-1" })] });
    const r = ventaCruzada(calcularClientes(d), calcularProducto(d), calcularResultados(d).total.ventaTotal);
    expect(r.ingresoAccesorios).toBe(0);
    expect(r.pctIngreso).toBe(0);
    expect(r.attachRate).toBe(0);
  });

  it("sin venta no hay porcentajes, en lugar de NaN", () => {
    const d = dataset({});
    const r = ventaCruzada(calcularClientes(d), calcularProducto(d), 0);
    expect(r.attachRate).toBeNull();
    expect(r.pctIngreso).toBeNull();
  });
});
