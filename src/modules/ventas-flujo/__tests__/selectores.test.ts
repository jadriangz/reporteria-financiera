import { describe, expect, it } from "vitest";

import { SIN_FECHA, calcularCartera, calcularFlujo } from "../../../lib/calc";
import { CORTE, ESPERADO, cargarFixture } from "../../../lib/calc/__tests__/fixture";
import {
  type Cobranza,
  type Dataset,
  ParametrosSchema,
  type Venta,
  capacidades,
} from "../../../lib/schema";
import {
  brechaFinal,
  filasMensualesFlujo,
  indicadoresFlujo,
  puntosAcumulados,
  puntosMensuales,
  tonoConversion,
  totalFlujo,
} from "../selectores";

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

function abono(p: Partial<Cobranza> & Pick<Cobranza, "folio_venta" | "fecha_pago" | "monto">): Cobranza {
  return { folio_pago: null, metodo: null, cliente_ref: null, notas: null, ...p };
}

const utc = (anio: number, mes: number, dia: number) => new Date(Date.UTC(anio, mes - 1, dia));

/**
 * Escenario con fechas de pago reales, que el archivo demo no tiene.
 *
 * Enero vende 500k y se cobra en febrero y abril; marzo vende 300k y se cobra
 * en parte en abril. Febrero no vende nada pero cobra. Hay ademas una venta y
 * un abono sin fecha.
 */
const conPagos: Dataset = {
  ventas: [
    venta({ folio: "V-1", fecha: utc(2026, 1, 10), precio_venta: 50_000_000 }),
    venta({ folio: "V-2", fecha: utc(2026, 3, 5), precio_venta: 30_000_000 }),
    venta({ folio: "V-3", fecha: null, precio_venta: 10_000_000 }),
    venta({ folio: "V-D", fecha: utc(2026, 2, 1), linea: "Demo", precio_venta: null }),
  ],
  cobranza: [
    abono({ folio_venta: "V-1", fecha_pago: utc(2026, 2, 20), monto: 20_000_000 }),
    abono({ folio_venta: "V-1", fecha_pago: utc(2026, 4, 2), monto: 30_000_000 }),
    abono({ folio_venta: "V-2", fecha_pago: utc(2026, 4, 28), monto: 10_000_000 }),
    abono({ folio_venta: "V-3", fecha_pago: null, monto: 5_000_000 }),
    // Abono contra la Demo: el motor lo excluye del flujo.
    abono({ folio_venta: "V-D", fecha_pago: utc(2026, 2, 2), monto: 99_000_000 }),
  ],
  gastos: [],
  parametros: ParametrosSchema.parse({}),
};

const flujo = calcularFlujo(conPagos);

describe("cobrado por fecha de pago real", () => {
  const { puntos } = puntosMensuales(flujo);
  const en = (mes: number) => puntos.find((p) => p.fecha.getUTCMonth() === mes - 1)?.valores;

  it("el cobrado cae en el mes en que entro el dinero, no en el mes de la venta", () => {
    // Enero facturo 500k y no cobro nada ese mes.
    expect(en(1)).toEqual({ facturado: 50_000_000, cobrado: 0 });
    // Febrero no vendio, pero cobro 200k de la venta de enero.
    expect(en(2)).toEqual({ facturado: 0, cobrado: 20_000_000 });
    // Abril cobra de dos ventas distintas.
    expect(en(4)).toEqual({ facturado: 0, cobrado: 40_000_000 });
  });

  it("el abono contra la Demo no entra al flujo", () => {
    expect(flujo.cobradoTotal).toBe(65_000_000);
    expect(en(2)?.["cobrado"]).toBe(20_000_000);
  });

  it("un punto por mes del eje continuo, en orden", () => {
    expect(puntos.map((p) => p.fecha.toISOString().slice(0, 7))).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
    ]);
  });

  it("lo que no tiene fecha se reporta fuera del eje, y con eso cuadra con el total", () => {
    const serie = puntosMensuales(flujo);
    expect(serie.fueraDelEje).toEqual({ facturado: 10_000_000, cobrado: 5_000_000, operaciones: 1 });

    let facturado = serie.fueraDelEje?.facturado ?? 0;
    let cobrado = serie.fueraDelEje?.cobrado ?? 0;
    for (const p of serie.puntos) {
      facturado += p.valores["facturado"] ?? 0;
      cobrado += p.valores["cobrado"] ?? 0;
    }
    expect(facturado).toBe(flujo.facturadoTotal);
    expect(cobrado).toBe(flujo.cobradoTotal);
  });

  it("sin nada sin fecha, no hay nada fuera del eje", () => {
    const limpio = calcularFlujo({
      ...conPagos,
      ventas: conPagos.ventas.filter((v) => v.fecha !== null),
      cobranza: conPagos.cobranza.filter((c) => c.fecha_pago !== null),
    });
    expect(puntosMensuales(limpio).fueraDelEje).toBeNull();
  });
});

describe("acumulados", () => {
  const serie = puntosAcumulados(flujo);

  it("nunca bajan: son sumas corridas", () => {
    for (let i = 1; i < serie.puntos.length; i += 1) {
      const antes = serie.puntos[i - 1]?.valores;
      const ahora = serie.puntos[i]?.valores;
      expect(ahora?.["facturado"] ?? 0).toBeGreaterThanOrEqual(antes?.["facturado"] ?? 0);
      expect(ahora?.["cobrado"] ?? 0).toBeGreaterThanOrEqual(antes?.["cobrado"] ?? 0);
    }
  });

  it("el ultimo punto mas lo que no tiene fecha es el total del periodo", () => {
    const ultimo = serie.puntos[serie.puntos.length - 1]?.valores;
    expect((ultimo?.["facturado"] ?? 0) + (serie.fueraDelEje?.facturado ?? 0)).toBe(flujo.facturadoTotal);
    expect((ultimo?.["cobrado"] ?? 0) + (serie.fueraDelEje?.cobrado ?? 0)).toBe(flujo.cobradoTotal);
  });

  it("la brecha final es lo facturado con fecha que no se ha cobrado con fecha", () => {
    // 800k facturados con fecha contra 600k cobrados con fecha.
    expect(brechaFinal(serie)).toBe(20_000_000);
  });

  it("sin puntos no hay brecha, en lugar de un cero", () => {
    expect(brechaFinal({ puntos: [], fueraDelEje: null })).toBeNull();
  });
});

describe("tabla mensual", () => {
  const filas = filasMensualesFlujo(flujo);
  const total = totalFlujo(flujo);

  it("la suma de los meses mas sin fecha cuadra con la fila de total", () => {
    let operaciones = 0;
    let facturado = 0;
    let cobrado = 0;
    let saldo = 0;
    for (const f of filas) {
      operaciones += f.operaciones;
      facturado += f.facturado;
      cobrado += f.cobrado;
      saldo += f.saldoGenerado;
    }
    expect(operaciones).toBe(total.operaciones);
    expect(facturado).toBe(total.facturado);
    expect(cobrado).toBe(total.cobrado);
    expect(saldo).toBe(total.saldoGenerado);
  });

  it("el saldo del total es el saldo de cartera del motor", () => {
    const cartera = calcularCartera(conPagos, { fechaCorte: CORTE });
    expect(total.saldoGenerado).toBe(cartera.saldoTotal);
    expect(indicadoresFlujo(flujo).saldo).toBe(cartera.saldoTotal);
  });

  it("sin fecha va al final y en ambar", () => {
    const ultima = filas[filas.length - 1];
    expect(ultima?.clave).toBe(SIN_FECHA);
    expect(ultima?.tono).toBe("advertencia");
  });

  it("un mes que cobra deuda vieja genera saldo negativo y % sobre 100 o sin base", () => {
    const febrero = filas.find((f) => f.clave === "2026-02");
    expect(febrero?.saldoGenerado).toBe(-20_000_000);
    // Sin facturacion no hay base para el porcentaje: null, no Infinity.
    expect(febrero?.pctCobrado).toBeNull();
  });

  it("un mes sin ventas ni cobros se atenua", () => {
    const vacio = calcularFlujo({
      ...conPagos,
      ventas: [venta({ folio: "V-1", fecha: utc(2026, 1, 1) }), venta({ folio: "V-2", fecha: utc(2026, 3, 1) })],
      cobranza: [],
    });
    expect(filasMensualesFlujo(vacio).find((f) => f.clave === "2026-02")?.tono).toBe("tenue");
  });
});

describe("indicadores", () => {
  it("la conversion a efectivo es cobrado sobre facturado", () => {
    const i = indicadoresFlujo(flujo);
    expect(i.facturado).toBe(90_000_000);
    expect(i.cobrado).toBe(65_000_000);
    expect(i.conversion).toBeCloseTo(65 / 90, 9);
  });

  it("bajo 70% la conversion se marca en riesgo", () => {
    expect(tonoConversion(0.68)).toBe("riesgo");
    expect(tonoConversion(0.7)).toBe("positivo");
    expect(tonoConversion(null)).toBe("neutro");
  });
});

describe("el archivo de demostracion", () => {
  it("trae fecha en todos sus abonos: el modulo queda habilitado", () => {
    const demo = cargarFixture();
    expect(capacidades(demo).flujo).toBe(true);

    const serie = puntosMensuales(calcularFlujo(demo));
    // Nueve meses en el eje y ninguno con la cobranza fuera de el.
    expect(serie.puntos).toHaveLength(9);
    expect(serie.fueraDelEje?.cobrado ?? 0).toBe(0);
    expect(serie.puntos.reduce((t, p) => t + (p.valores["cobrado"] ?? 0), 0)).toBe(ESPERADO.cobrado);
  });

  it("la unica venta sin fecha queda fuera del eje, no repartida en los meses", () => {
    const serie = puntosMensuales(calcularFlujo(cargarFixture()));
    // V-025, por $3,600: facturada pero sin mes al que pertenecer.
    expect(serie.fueraDelEje?.facturado).toBe(360_000);
    expect(serie.puntos.reduce((t, p) => t + (p.valores["facturado"] ?? 0), 0)).toBe(
      ESPERADO.ventaTotal - 360_000,
    );
  });
});
