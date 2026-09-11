import { describe, expect, it } from "vitest";

import { BUCKET_SIN_FECHA, type Cartera, type SaldoVenta, calcularCartera } from "../../../lib/calc";
import { ESPERADO, cargarFixture } from "../../../lib/calc/__tests__/fixture";
import {
  type Cobranza,
  type Dataset,
  ParametrosSchema,
  type Venta,
} from "../../../lib/schema";
import {
  ESCENARIOS,
  ESTILO_BUCKET,
  abonosDe,
  baseDeMedicion,
  bucketsVisibles,
  evaluarEscenario,
  evaluarEscenarios,
  exposicionPorCliente,
  filasEscenarios,
  mismasTasas,
  provisionDe,
  saldosPendientes,
  sinFechasDePago,
  tonoDeBucket,
} from "../selectores";

const CORTE = new Date(Date.UTC(2026, 8, 9));

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

function abono(p: Partial<Cobranza> & Pick<Cobranza, "folio_venta">): Cobranza {
  return {
    folio_pago: "P-1",
    fecha_pago: new Date(Date.UTC(2026, 1, 15)),
    monto: 10_000_000,
    metodo: "Transferencia",
    cliente_ref: null,
    notas: null,
    ...p,
  };
}

function dataset(p: Partial<Dataset> = {}): Dataset {
  return {
    ventas: [],
    cobranza: [],
    gastos: [],
    parametros: ParametrosSchema.parse({}),
    ...p,
  };
}

const cartera = (d: Dataset): Cartera => calcularCartera(d, { fechaCorte: CORTE });

describe("tono y estilo por bucket", () => {
  it("solo el tramo +180 pone la fila en riesgo", () => {
    expect(tonoDeBucket("+180")).toBe("riesgo");
    expect(tonoDeBucket("91-180")).toBe("advertencia");
    expect(tonoDeBucket("0-30")).toBe("neutro");
    expect(tonoDeBucket("31-60")).toBe("neutro");
    expect(tonoDeBucket("61-90")).toBe("neutro");
  });

  it("sin fecha es advertencia, no riesgo: no sabemos si es vieja", () => {
    expect(tonoDeBucket(BUCKET_SIN_FECHA)).toBe("advertencia");
  });

  it("sin fecha queda fuera de la escala de antiguedad de la barra", () => {
    expect(ESTILO_BUCKET[BUCKET_SIN_FECHA]).toBe("indefinido");
    const escala = ["0-30", "31-60", "61-90", "91-180", "+180"] as const;
    for (const b of escala) expect(ESTILO_BUCKET[b]).not.toBe("indefinido");
    // La escala no repite estilo: cada tramo se distingue del anterior.
    const usados = escala.map((b) => ESTILO_BUCKET[b]);
    expect(new Set(usados).size).toBe(escala.length);
  });
});

describe("buckets visibles", () => {
  it("oculta el tramo sin fecha cuando no tiene monto", () => {
    const d = dataset({ ventas: [venta({ folio: "V-1" })] });
    expect(bucketsVisibles(cartera(d))).not.toContain(BUCKET_SIN_FECHA);
  });

  it("lo muestra en cuanto hay saldo sin fecha", () => {
    const d = dataset({ ventas: [venta({ folio: "V-1", fecha: null })] });
    const visibles = bucketsVisibles(cartera(d));
    expect(visibles).toContain(BUCKET_SIN_FECHA);
    // Y siempre va al final, despues de la escala.
    expect(visibles[visibles.length - 1]).toBe(BUCKET_SIN_FECHA);
  });

  it("los cinco tramos de la escala se muestran siempre, valgan cero o no", () => {
    const d = dataset({ ventas: [venta({ folio: "V-1" })] });
    const visibles = bucketsVisibles(cartera(d));
    for (const b of ["0-30", "31-60", "61-90", "91-180", "+180"]) {
      expect(visibles).toContain(b);
    }
  });
});

describe("base de medicion de la antiguedad", () => {
  it("dice antiguedad cuando ninguna venta con saldo tiene credito", () => {
    const d = dataset({ ventas: [venta({ folio: "V-1", dias_credito: null })] });
    expect(baseDeMedicion(cartera(d))).toBe("antiguedad");
  });

  it("dice vencimiento cuando todas lo tienen", () => {
    const d = dataset({ ventas: [venta({ folio: "V-1", dias_credito: 90 })] });
    expect(baseDeMedicion(cartera(d))).toBe("vencimiento");
  });

  it("dice mixta cuando conviven las dos", () => {
    const d = dataset({
      ventas: [venta({ folio: "V-1", dias_credito: 90 }), venta({ folio: "V-2" })],
    });
    expect(baseDeMedicion(cartera(d))).toBe("mixta");
  });

  it("dice ninguna cuando no hay saldo con fecha", () => {
    const d = dataset({
      ventas: [venta({ folio: "V-1" })],
      cobranza: [abono({ folio_venta: "V-1", monto: 50_000_000 })],
    });
    expect(baseDeMedicion(cartera(d))).toBe("ninguna");
  });
});

describe("orden de los saldos pendientes", () => {
  const d = dataset({
    ventas: [
      venta({ folio: "V-viejo", fecha: new Date(Date.UTC(2026, 0, 1)) }),
      venta({ folio: "V-nuevo", fecha: new Date(Date.UTC(2026, 7, 1)) }),
      venta({ folio: "V-medio", fecha: new Date(Date.UTC(2026, 3, 1)) }),
      venta({ folio: "V-sinfecha", fecha: null }),
    ],
  });

  it("ordena por dias descendente y deja las sin fecha al final", () => {
    const filas = saldosPendientes(cartera(d), d);
    expect(filas.map((f) => f.folio)).toEqual(["V-viejo", "V-medio", "V-nuevo", "V-sinfecha"]);
  });

  it("la venta sin fecha llega con dias null, para pintarse como raya", () => {
    const filas = saldosPendientes(cartera(d), d);
    const sinFecha = filas.find((f) => f.folio === "V-sinfecha");
    expect(sinFecha?.dias).toBeNull();
    expect(sinFecha?.bucket).toBe(BUCKET_SIN_FECHA);
  });

  it("une el modelo desde el dataset sin tocar el motor", () => {
    const filas = saldosPendientes(cartera(d), d);
    expect(filas[0]?.modelo).toBe("T70P");
  });

  it("deja el modelo en null si no encuentra la venta", () => {
    const filas = saldosPendientes(cartera(d), null);
    expect(filas[0]?.modelo).toBeNull();
  });

  it("excluye las ventas totalmente pagadas, no las lista en cero", () => {
    const pagado = dataset({
      ventas: [venta({ folio: "V-1" }), venta({ folio: "V-2" })],
      cobranza: [abono({ folio_venta: "V-1", monto: 50_000_000 })],
    });
    const filas = saldosPendientes(cartera(pagado), pagado);
    expect(filas.map((f) => f.folio)).toEqual(["V-2"]);
  });

  it("CONSERVA el saldo negativo: un sobrecobro no se esconde ni se pone en cero", () => {
    const sobre = dataset({
      ventas: [venta({ folio: "V-1", precio_venta: 10_000_000 })],
      cobranza: [abono({ folio_venta: "V-1", monto: 15_000_000 })],
    });
    const filas = saldosPendientes(cartera(sobre), sobre);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.saldo).toBe(-5_000_000);
  });
});

describe("abonos por venta", () => {
  const d = dataset({
    ventas: [venta({ folio: "V-1" })],
    cobranza: [
      abono({ folio_pago: "P-2", folio_venta: "V-1", fecha_pago: new Date(Date.UTC(2026, 5, 1)) }),
      abono({ folio_pago: "P-1", folio_venta: "V-1", fecha_pago: new Date(Date.UTC(2026, 2, 1)) }),
      abono({ folio_pago: "P-3", folio_venta: "V-9" }),
    ],
  });

  it("devuelve solo los de esa venta, en orden cronologico", () => {
    expect(abonosDe(d, "V-1").map((a) => a.folio_pago)).toEqual(["P-1", "P-2"]);
  });

  it("manda al final los abonos sin fecha", () => {
    const conHueco = dataset({
      cobranza: [
        abono({ folio_pago: "P-1", folio_venta: "V-1", fecha_pago: null }),
        abono({ folio_pago: "P-2", folio_venta: "V-1", fecha_pago: new Date(Date.UTC(2026, 2, 1)) }),
      ],
    });
    expect(abonosDe(conHueco, "V-1").map((a) => a.folio_pago)).toEqual(["P-2", "P-1"]);
  });

  it("detecta cuando ningun abono tiene fecha, para avisarlo en vez de mostrar huecos", () => {
    expect(sinFechasDePago([abono({ folio_venta: "V-1", fecha_pago: null })])).toBe(true);
    expect(sinFechasDePago([abono({ folio_venta: "V-1" })])).toBe(false);
    // Sin abonos no hay nada que avisar: el mensaje seria enganoso.
    expect(sinFechasDePago([])).toBe(false);
  });
});

describe("exposicion por cliente", () => {
  const d = dataset({
    ventas: [
      venta({ folio: "V-1", cliente: "Grande SA", fecha: new Date(Date.UTC(2026, 0, 1)) }),
      venta({ folio: "V-2", cliente: "Grande SA", fecha: new Date(Date.UTC(2026, 7, 20)) }),
      venta({ folio: "V-3", cliente: "  chico  sa ", precio_venta: 20_000_000 }),
    ],
  });

  it("ordena por saldo descendente, no alfabeticamente", () => {
    const filas = exposicionPorCliente(cartera(d));
    expect(filas.map((c) => c.nombre)).toEqual(["Grande SA", "chico  sa"]);
    expect(filas[0]?.saldo).toBeGreaterThan(filas[1]?.saldo ?? 0);
  });

  it("agrupa por nombre normalizado y suma las operaciones", () => {
    const filas = exposicionPorCliente(cartera(d));
    expect(filas[0]?.operaciones).toBe(2);
    expect(filas[0]?.venta).toBe(100_000_000);
  });

  it("reporta el bucket MAS antiguo en el que el cliente tiene saldo", () => {
    const filas = exposicionPorCliente(cartera(d));
    // Grande SA tiene una venta de enero (+180) y otra de agosto (0-30).
    expect(filas[0]?.bucketMasAntiguo).toBe("+180");
  });

  it("las participaciones suman 1", () => {
    const filas = exposicionPorCliente(cartera(d));
    const suma = filas.reduce((t, c) => t + (c.participacion ?? 0), 0);
    expect(suma).toBeCloseTo(1, 6);
  });

  it("sin fecha solo gana como tramo si no hay ningun otro", () => {
    const soloSinFecha = dataset({
      ventas: [venta({ folio: "V-1", cliente: "Anon", fecha: null })],
    });
    expect(exposicionPorCliente(cartera(soloSinFecha))[0]?.bucketMasAntiguo).toBe(BUCKET_SIN_FECHA);

    const mixto = dataset({
      ventas: [
        venta({ folio: "V-1", cliente: "Anon", fecha: null }),
        venta({ folio: "V-2", cliente: "Anon", fecha: new Date(Date.UTC(2026, 7, 20)) }),
      ],
    });
    expect(exposicionPorCliente(cartera(mixto))[0]?.bucketMasAntiguo).toBe("0-30");
  });

  it("un cliente sin saldo queda sin tramo, no en 0-30", () => {
    const pagado = dataset({
      ventas: [venta({ folio: "V-1", cliente: "Al corriente" })],
      cobranza: [abono({ folio_venta: "V-1", monto: 50_000_000 })],
    });
    expect(exposicionPorCliente(cartera(pagado))[0]?.bucketMasAntiguo).toBeNull();
  });
});

describe("escenarios de provision", () => {
  const porBucket = {
    "0-30": 10_000_000,
    "31-60": 0,
    "61-90": 0,
    "91-180": 40_000_000,
    "+180": 100_000_000,
    [BUCKET_SIN_FECHA]: 5_000_000,
  } as const;

  it("provisiona solo los dos tramos mas viejos", () => {
    // 40M * 25% + 100M * 50% = 10M + 50M = 60M
    expect(provisionDe(porBucket, 0.25, 0.5)).toBe(60_000_000);
    // Los tramos frescos y el sin fecha nunca entran.
    expect(provisionDe(porBucket, 0, 0)).toBe(0);
  });

  it("los cuatro de referencia son exactamente los de la definicion", () => {
    expect(ESCENARIOS.map((e) => [e.nombre, e.pct91180, e.pctMas180])).toEqual([
      ["Sin provisión", 0, 0],
      ["Moderado", 0, 0.25],
      ["Conservador", 0.25, 0.5],
      ["Pesimista", 0.5, 1],
    ]);
  });

  it("con este reparto: 0, 25M, 60M y 120M", () => {
    // Conservador = 40M * 25% + 100M * 50%; Pesimista = 40M * 50% + 100M * 100%.
    expect(evaluarEscenarios(porBucket, 200_000_000).map((e) => e.provision)).toEqual([
      0, 25_000_000, 60_000_000, 120_000_000,
    ]);
  });

  it("INVARIANTE: cada escenario tiene tasas >= que el anterior en ambos tramos", () => {
    // Condicion estructural: con tasas que no bajan en ningun tramo, la
    // provision no puede bajar con NINGUN reparto de cartera.
    for (let i = 1; i < ESCENARIOS.length; i += 1) {
      const previo = ESCENARIOS[i - 1];
      const actual = ESCENARIOS[i];
      expect(actual?.pct91180 ?? -1, actual?.nombre).toBeGreaterThanOrEqual(previo?.pct91180 ?? 0);
      expect(actual?.pctMas180 ?? -1, actual?.nombre).toBeGreaterThanOrEqual(previo?.pctMas180 ?? 0);
    }
  });

  it("INVARIANTE: la provision nunca baja de un escenario al siguiente, con la cartera en 91-180", () => {
    const repartos = [
      // Todo en 91-180: el caso que rompia la definicion anterior.
      { "91-180": 100_000_000, "+180": 0 },
      // Casi todo en 91-180, un poco en +180.
      { "91-180": 100_000_000, "+180": 1_000_000 },
      { "91-180": 40_000_000, "+180": 100_000_000 },
      { "91-180": 0, "+180": 100_000_000 },
      { "91-180": 0, "+180": 0 },
    ];
    for (const r of repartos) {
      const buckets = { ...porBucket, ...r };
      const provisiones = evaluarEscenarios(buckets, 200_000_000).map((e) => e.provision);
      for (let i = 1; i < provisiones.length; i += 1) {
        expect(provisiones[i] ?? -1, JSON.stringify(r)).toBeGreaterThanOrEqual(provisiones[i - 1] ?? 0);
      }
    }
    // Con todo en 91-180: 0, 0, 25M y 50M. Pesimista ya no queda debajo de Conservador.
    const soloNoventa = { ...porBucket, "91-180": 100_000_000, "+180": 0 };
    expect(evaluarEscenarios(soloNoventa, 0).map((e) => e.provision)).toEqual([0, 0, 25_000_000, 50_000_000]);
  });

  it("INVARIANTE sobre un dataset real con peso en 91-180", () => {
    // Tres ventas de mayo (131 dias al corte: tramo 91-180) y una de enero (+180).
    const d = dataset({
      ventas: [
        venta({ folio: "V-1", fecha: new Date(Date.UTC(2026, 4, 1)), precio_venta: 90_000_000 }),
        venta({ folio: "V-2", fecha: new Date(Date.UTC(2026, 4, 2)), precio_venta: 80_000_000 }),
        venta({ folio: "V-3", fecha: new Date(Date.UTC(2026, 4, 3)), precio_venta: 70_000_000 }),
        venta({ folio: "V-4", fecha: new Date(Date.UTC(2026, 0, 3)), precio_venta: 10_000_000 }),
      ],
    });
    const c = cartera(d);
    expect(c.aging.porBucket["91-180"]).toBe(240_000_000);
    const provisiones = evaluarEscenarios(c.aging.porBucket, 0).map((e) => e.provision);
    expect(provisiones).toEqual([0, 2_500_000, 65_000_000, 130_000_000]);
    for (let i = 1; i < provisiones.length; i += 1) {
      expect(provisiones[i] ?? -1).toBeGreaterThanOrEqual(provisiones[i - 1] ?? 0);
    }
  });

  it("con el archivo de demostracion dan 0 · $167,500 · $364,500 · $729,000", () => {
    const c = calcularCartera(cargarFixture(), { fechaCorte: CORTE });
    expect(evaluarEscenarios(c.aging.porBucket, 0).map((e) => e.provision)).toEqual([
      0, 16_750_000, 36_450_000, 72_900_000,
    ]);
  });

  /**
   * La monotonia con el archivo de demostracion.
   *
   * Con el archivo anterior esta prueba no valia: su tramo 91-180 estaba en
   * cero, asi que el escenario Conservador y el Moderado solo se distinguian
   * por el +180 y la escalera se sostenia sola. Aqui los dos tramos tienen
   * monto, y por eso la propiedad si se ejercita: cada escenario provisiona
   * ESTRICTAMENTE mas que el anterior.
   */
  it("los cuatro escenarios crecen en orden, y con este archivo lo hacen estrictamente", () => {
    const c = calcularCartera(cargarFixture(), { fechaCorte: CORTE });
    expect(c.aging.porBucket["91-180"]).toBeGreaterThan(0);
    expect(c.aging.porBucket["+180"]).toBeGreaterThan(0);

    const evaluados = evaluarEscenarios(c.aging.porBucket, ESPERADO.utilidadContribucion);
    expect(evaluados.map((e) => e.clave)).toEqual(["sin", "moderado", "conservador", "pesimista"]);

    for (let i = 1; i < evaluados.length; i += 1) {
      const previo = evaluados[i - 1];
      const actual = evaluados[i];
      if (previo === undefined || actual === undefined) throw new Error("escenario ausente");
      // Las tasas no bajan en ningun tramo...
      expect(actual.pct91180, actual.clave).toBeGreaterThanOrEqual(previo.pct91180);
      expect(actual.pctMas180, actual.clave).toBeGreaterThanOrEqual(previo.pctMas180);
      // ...asi que la provision no puede bajar, y aqui ademas sube.
      expect(actual.provision, actual.clave).toBeGreaterThan(previo.provision);
      // Y la utilidad ajustada baja al mismo ritmo.
      expect(actual.utilidadAjustada, actual.clave).toBeLessThan(previo.utilidadAjustada);
    }

    // El peor caso no puede salir menos malo que el conservador: es lo que
    // destruiria la credibilidad de la tabla.
    const pesimista = evaluados[evaluados.length - 1];
    expect(pesimista?.provision).toBe(72_900_000);
    expect(pesimista?.utilidadAjustada).toBe(ESPERADO.utilidadContribucion - 72_900_000);
  });

  it("la variacion es la proporcion de utilidad que se lleva la provision", () => {
    const e = evaluarEscenario(
      { clave: "x", nombre: "X", pct91180: 0.25, pctMas180: 0.5 },
      porBucket,
      200_000_000,
    );
    expect(e.provision).toBe(60_000_000);
    expect(e.utilidadAjustada).toBe(140_000_000);
    expect(e.variacion).toBeCloseTo(-0.3, 6);
  });

  it("sin utilidad contra la cual comparar, la variacion es null y no Infinity", () => {
    const e = evaluarEscenario(
      { clave: "x", nombre: "X", pct91180: 0.25, pctMas180: 0.5 },
      porBucket,
      0,
    );
    expect(e.variacion).toBeNull();
    expect(e.utilidadAjustada).toBe(-60_000_000);
  });

  it("la utilidad ajustada puede quedar negativa y se reporta tal cual", () => {
    const e = evaluarEscenario(
      { clave: "x", nombre: "X", pct91180: 1, pctMas180: 1 },
      porBucket,
      10_000_000,
    );
    expect(e.utilidadAjustada).toBe(-130_000_000);
  });

  it("los cuatro de referencia NO se mueven con las tasas del usuario", () => {
    const conPlantilla = filasEscenarios(porBucket, 200_000_000, 0.25, 0.5).slice(0, 4);
    const conOtras = filasEscenarios(porBucket, 200_000_000, 0.9, 0.1).slice(0, 4);
    expect(conOtras).toEqual(conPlantilla);
    for (const f of conPlantilla) {
      expect(f.aplicada).toBe(false);
      expect(f.coincideCon).toBeNull();
    }
  });

  it("la fila aplicada va siempre al final, una sola vez, y sigue a los controles", () => {
    // 40M * 30% + 100M * 60% = 72M.
    const filas = filasEscenarios(porBucket, 200_000_000, 0.3, 0.6);
    expect(filas.map((f) => f.clave)).toEqual(["sin", "moderado", "conservador", "pesimista", "aplicado"]);
    expect(filas.filter((f) => f.aplicada)).toHaveLength(1);
    const aplicada = filas[filas.length - 1];
    expect(aplicada?.nombre).toBe("Tasas aplicadas");
    expect(aplicada?.provision).toBe(72_000_000);
    expect(aplicada?.coincideCon).toBeNull();

    // Mover un control mueve solo esa fila.
    const movida = filasEscenarios(porBucket, 200_000_000, 0.3, 0.8);
    expect(movida[movida.length - 1]?.provision).toBe(92_000_000);
  });

  it("si las tasas aplicadas coinciden con una referencia, lo dice en vez de esconder la fila", () => {
    // Las tasas que trae la plantilla (25% / 50%) son las de Conservador.
    const filas = filasEscenarios(porBucket, 200_000_000, 0.25, 0.5);
    expect(filas).toHaveLength(5);
    expect(filas[4]?.coincideCon).toBe("Conservador");
    expect(filas[4]?.provision).toBe(filas[2]?.provision);
  });

  it("la fila aplicada reproduce la provision del motor con esas mismas tasas", () => {
    const d = dataset({
      ventas: [
        venta({ folio: "V-1", fecha: new Date(Date.UTC(2026, 0, 1)) }),
        venta({ folio: "V-2", fecha: new Date(Date.UTC(2026, 4, 1)) }),
      ],
      parametros: ParametrosSchema.parse({ provision_91_180: 0.3, provision_mas_180: 0.6 }),
    });
    const c = cartera(d);
    const aplicada = filasEscenarios(c.aging.porBucket, 0, 0.3, 0.6).find((f) => f.aplicada);
    expect(aplicada?.provision).toBe(c.provision);
  });

  it("compara tasas exactas", () => {
    const conservador = ESCENARIOS[2];
    expect(conservador).toBeDefined();
    if (conservador === undefined) return;
    expect(mismasTasas(conservador, 0.25, 0.5)).toBe(true);
    expect(mismasTasas(conservador, 0.25, 0.75)).toBe(false);
  });
});

describe("cartera vacia", () => {
  const pagado = dataset({
    ventas: [venta({ folio: "V-1" })],
    cobranza: [abono({ folio_venta: "V-1", monto: 50_000_000 })],
  });

  it("no produce filas ni clientes expuestos, para poder mostrar el mensaje positivo", () => {
    const c = cartera(pagado);
    expect(saldosPendientes(c, pagado)).toEqual([]);
    expect(exposicionPorCliente(c).filter((x) => x.saldo !== 0)).toEqual([]);
    expect(c.saldoTotal).toBe(0);
  });

  it("las participaciones quedan en null, no en NaN", () => {
    const c = cartera(pagado);
    for (const v of Object.values(c.aging.participacion)) expect(v).toBeNull();
  });
});

describe("consistencia con el motor", () => {
  it("la suma de saldos por cliente reproduce el saldo total", () => {
    const d = dataset({
      ventas: [
        venta({ folio: "V-1", cliente: "A" }),
        venta({ folio: "V-2", cliente: "B", precio_venta: 30_000_000 }),
      ],
      cobranza: [abono({ folio_venta: "V-1", monto: 20_000_000 })],
    });
    const c = cartera(d);
    const suma = exposicionPorCliente(c).reduce((t, x) => t + x.saldo, 0);
    expect(suma).toBe(c.saldoTotal);
  });

  it("las filas de la tabla no inventan ni pierden saldo", () => {
    const d = dataset({
      ventas: [venta({ folio: "V-1" }), venta({ folio: "V-2", precio_venta: 30_000_000 })],
      cobranza: [abono({ folio_venta: "V-1", monto: 20_000_000 })],
    });
    const c = cartera(d);
    const filas: readonly SaldoVenta[] = saldosPendientes(c, d);
    expect(filas.reduce((t, f) => t + f.saldo, 0)).toBe(c.saldoTotal);
  });
});
