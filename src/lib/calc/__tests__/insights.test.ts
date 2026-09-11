import { describe, expect, it } from "vitest";

import {
  type Cobranza,
  type Dataset,
  type Gasto,
  ParametrosSchema,
  type Venta,
} from "../../schema";
import { calcularClientes } from "../clientes";
import { REGLAS_INSIGHT, calcularInsights } from "../insights";
import { CORTE, FOLIO_DEMO, cargarFixture } from "./fixture";

function venta(parcial: Partial<Venta> & Pick<Venta, "folio">): Venta {
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
    ...parcial,
  };
}

function abono(parcial: Partial<Cobranza> & Pick<Cobranza, "folio_venta">): Cobranza {
  return {
    folio_pago: "P-1",
    fecha_pago: new Date(Date.UTC(2026, 1, 15)),
    monto: 10_000_000,
    metodo: null,
    cliente_ref: null,
    notas: null,
    ...parcial,
  };
}

function dataset(parcial: Partial<Dataset> = {}): Dataset {
  return {
    ventas: [],
    cobranza: [],
    gastos: [] as Gasto[],
    parametros: ParametrosSchema.parse({}),
    ...parcial,
  };
}

const insights = (d: Dataset) => calcularInsights(d, { fechaCorte: CORTE });
const buscar = (d: Dataset, id: string) => insights(d).find((i) => i.id === id);

describe("estructura de las reglas", () => {
  it("cada regla tiene id unico, nivel y descripcion", () => {
    const ids = REGLAS_INSIGHT.map((r) => r.id);
    expect(ids).toEqual([...new Set(ids)]);
    for (const r of REGLAS_INSIGHT) {
      expect(r.id).toBeTruthy();
      expect(r.descripcion).toBeTruthy();
      expect(["alerta", "advertencia", "oportunidad", "nota"]).toContain(r.nivel);
    }
  });

  it("un dataset vacio no dispara ninguna regla y no lanza", () => {
    expect(insights(dataset())).toEqual([]);
  });
});

describe("regla: la utilidad del periodo esta en cartera", () => {
  it("se dispara y nombra a los deudores con sus montos", () => {
    // Utilidad 10M; se cobraron 10M de 50M: el saldo de 40M esta en cartera.
    // La cobranza capturada es lo que convierte ese saldo en un hecho.
    const d = dataset({
      ventas: [venta({ folio: "V-1", cliente: "Agricola Shensim" })],
      cobranza: [abono({ folio_venta: "V-1", monto: 10_000_000 })],
    });
    const i = buscar(d, "utilidad-en-cartera");
    expect(i?.nivel).toBe("alerta");
    expect(i?.detalle).toContain("Agricola Shensim");
    expect(i?.detalle).toContain("$400,000");
    expect(i?.detalle).toContain("$100,000");
    expect(i?.involucrados).toContain("Agricola Shensim");
  });

  it("no se dispara cuando ya se cobro casi todo", () => {
    const d = dataset({
      ventas: [venta({ folio: "V-1" })],
      cobranza: [abono({ folio_venta: "V-1", monto: 49_000_000 })],
    });
    expect(buscar(d, "utilidad-en-cartera")).toBeUndefined();
  });
});

describe("regla: cartera de mas de 180 dias", () => {
  it("se dispara sobre el 30% y nombra clientes, montos y folios", () => {
    const d = dataset({
      ventas: [
        venta({ folio: "V-1", cliente: "Rene Barraza", fecha: new Date(Date.UTC(2026, 0, 1)) }),
        venta({ folio: "V-2", cliente: "Reciente SA", fecha: new Date(Date.UTC(2026, 8, 1)) }),
      ],
      // Un abono parcial a la venta reciente: hay cobranza capturada, y la de
      // enero sigue sin un peso. +180 = 50M de 90M = 56%.
      cobranza: [abono({ folio_venta: "V-2", monto: 10_000_000 })],
    });
    const i = buscar(d, "cartera-mas-180");
    expect(i?.nivel).toBe("alerta");
    expect(i?.detalle).toContain("Rene Barraza");
    expect(i?.detalle).toContain("folio V-1");
    expect(i?.detalle).toContain("dias");
    expect(i?.involucrados).toEqual(["Rene Barraza"]);
    // No debe acusar al cliente cuya venta es reciente.
    expect(i?.involucrados).not.toContain("Reciente SA");
  });

  it("no se dispara si el bucket +180 esta por debajo del umbral", () => {
    // Con cobranza capturada, para que la prueba mida el umbral y no la
    // ausencia de la hoja: +180 = 10M de 50M = 20%.
    const d = dataset({
      ventas: [
        venta({ folio: "V-1", fecha: new Date(Date.UTC(2026, 0, 1)), precio_venta: 10_000_000 }),
        venta({ folio: "V-2", fecha: new Date(Date.UTC(2026, 8, 1)) }),
      ],
      cobranza: [abono({ folio_venta: "V-2", monto: 10_000_000 })],
    });
    expect(buscar(d, "cartera-mas-180")).toBeUndefined();
  });
});

describe("sin cobranza capturada no hay conclusiones de cartera", () => {
  // La misma venta de enero, sin un solo abono capturado.
  const sinCobranza = dataset({
    ventas: [
      venta({ folio: "V-1", fecha: new Date(Date.UTC(2026, 0, 1)) }),
      venta({ folio: "V-2", fecha: null }),
    ],
  });

  it("ninguna de las tres reglas de cartera se dispara", () => {
    const ids = insights(sinCobranza).map((i) => i.id);
    expect(ids).not.toContain("utilidad-en-cartera");
    expect(ids).not.toContain("cartera-mas-180");
    expect(ids).not.toContain("cartera-sin-fecha");
  });

  it("en su lugar hay UN aviso de que el analisis no esta disponible y que capturar", () => {
    const avisos = insights(sinCobranza).filter((i) => i.id === "cartera-no-disponible");
    expect(avisos).toHaveLength(1);
    expect(avisos[0]?.nivel).toBe("nota");
    expect(avisos[0]?.detalle).toContain("$1,000,000");
    expect(avisos[0]?.detalle).toContain("hoja cobranza");
    // No afirma ningun saldo: dice que no se sabe.
    expect(avisos[0]?.detalle).not.toMatch(/saldo por cobrar es/i);
  });

  it("con cobranza capturada, el aviso desaparece y las reglas vuelven a evaluar", () => {
    const conCobranza = { ...sinCobranza, cobranza: [abono({ folio_venta: "V-1", monto: 1_000_000 })] };
    const ids = insights(conCobranza).map((i) => i.id);
    expect(ids).not.toContain("cartera-no-disponible");
    expect(ids).toContain("cartera-mas-180");
    expect(ids).toContain("cartera-sin-fecha");
  });

  it("sin venta tampoco hay aviso: no hay cartera que analizar", () => {
    expect(insights(dataset({})).map((i) => i.id)).not.toContain("cartera-no-disponible");
  });
});

describe("regla: el costo parece derivado del precio", () => {
  it("se dispara con margen identico en mas del 80% de las filas", () => {
    const ventas = Array.from({ length: 10 }, (_, n) =>
      venta({ folio: `V-${n}`, costo_unitario: 40_000_000, precio_venta: 50_000_000 }),
    );
    const i = buscar(dataset({ ventas }), "margen-derivado");
    expect(i?.nivel).toBe("advertencia");
    expect(i?.detalle).toContain("20.0%");
    expect(i?.detalle).toContain("10 de 10");
  });

  it("no se dispara cuando los margenes son variados", () => {
    const ventas = [
      venta({ folio: "V-1", costo_unitario: 40_000_000, precio_venta: 50_000_000 }),
      venta({ folio: "V-2", costo_unitario: 30_000_000, precio_venta: 50_000_000 }),
      venta({ folio: "V-3", costo_unitario: 20_000_000, precio_venta: 50_000_000 }),
    ];
    expect(buscar(dataset({ ventas }), "margen-derivado")).toBeUndefined();
  });

  it("ignora la fila Demo al medir la uniformidad", () => {
    const ventas = [
      venta({ folio: "V-1", costo_unitario: 40_000_000, precio_venta: 50_000_000 }),
      venta({ folio: "V-2", costo_unitario: 40_000_000, precio_venta: 50_000_000 }),
      venta({ folio: "V-D", linea: "Demo", costo_unitario: 1, precio_venta: 99_999 }),
    ];
    const i = buscar(dataset({ ventas }), "margen-derivado");
    expect(i?.detalle).toContain("2 de 2");
  });
});

describe("regla: attach rate bajo", () => {
  it("se dispara bajo 40% y nombra a quien no compro accesorios", () => {
    const ventas = [
      venta({ folio: "V-1", cliente: "Cliente A", linea: "Equipo" }),
      venta({ folio: "V-2", cliente: "Cliente B", linea: "Equipo" }),
      venta({ folio: "V-3", cliente: "Cliente C", linea: "Equipo" }),
      venta({ folio: "V-4", cliente: "Cliente A", linea: "Accesorios" }),
    ];
    const i = buscar(dataset({ ventas }), "attach-rate-bajo");
    expect(i?.nivel).toBe("oportunidad");
    expect(i?.detalle).toContain("1 de 3");
    expect(i?.detalle).toContain("33%");
    expect(i?.involucrados).toEqual(["Cliente B", "Cliente C"]);
    expect(i?.involucrados).not.toContain("Cliente A");
  });

  it("no se dispara con attach rate alto", () => {
    const ventas = [
      venta({ folio: "V-1", cliente: "Cliente A", linea: "Equipo" }),
      venta({ folio: "V-2", cliente: "Cliente A", linea: "Accesorios" }),
    ];
    expect(buscar(dataset({ ventas }), "attach-rate-bajo")).toBeUndefined();
  });

  // AUSENCIA DE LINEA NO ES ATTACH RATE BAJO. Mismo error que ya se corrigio en
  // cartera: un cero por falta de dato no es un cero medido.
  it("NO se dispara si el negocio no vende accesorios en absoluto", () => {
    const ventas = [
      venta({ folio: "V-1", cliente: "Cliente A", linea: "Equipo" }),
      venta({ folio: "V-2", cliente: "Cliente B", linea: "Equipo" }),
      venta({ folio: "V-3", cliente: "Cliente C", linea: "Servicio" }),
    ];
    const d = dataset({ ventas });
    // La tasa es 0 y esta por debajo del umbral, pero no significa nada.
    expect(calcularClientes(d).attachRate.tasa).toBe(0);
    expect(calcularClientes(d).attachRate.operacionesAccesorio).toBe(0);
    expect(buscar(d, "attach-rate-bajo")).toBeUndefined();
  });

  it("con una sola operacion de accesorios el cero si es un cero medido", () => {
    const ventas = [
      venta({ folio: "V-1", cliente: "Cliente A", linea: "Equipo" }),
      venta({ folio: "V-2", cliente: "Cliente B", linea: "Equipo" }),
      // El accesorio lo compro alguien que NO compro equipo: el attach sigue en 0,
      // pero ahora porque nadie lo combino, no porque no exista el producto.
      venta({ folio: "V-3", cliente: "Cliente C", linea: "Accesorios" }),
    ];
    const d = dataset({ ventas });
    expect(calcularClientes(d).attachRate.operacionesAccesorio).toBe(1);
    const i = buscar(d, "attach-rate-bajo");
    expect(i?.nivel).toBe("oportunidad");
    expect(i?.detalle).toContain("0 de 2");
  });

  it("las Demo no cuentan como operacion de accesorios", () => {
    const ventas = [
      venta({ folio: "V-1", cliente: "Cliente A", linea: "Equipo" }),
      venta({ folio: "V-D", cliente: "Interno", linea: "Demo", precio_venta: null }),
    ];
    const d = dataset({ ventas });
    expect(calcularClientes(d).attachRate.operacionesAccesorio).toBe(0);
    expect(buscar(d, "attach-rate-bajo")).toBeUndefined();
  });
});

describe("regla: concentracion de clientes", () => {
  /** Un cliente por monto, cada uno con una sola venta. */
  const conMontos = (montos: readonly number[]) =>
    dataset({
      ventas: montos.map((precio, n) =>
        venta({ folio: `V-${n}`, cliente: `Cliente ${n}`, precio_venta: precio, costo_unitario: 0 }),
      ),
    });

  it("se dispara sobre el 50% y nombra a los cinco mayores con su peso", () => {
    // Top 5 = 1,000,000 de 1,100,000: 91%.
    const d = conMontos([10_000_000, 60_000_000, 10_000_000, 10_000_000, 10_000_000, 10_000_000]);
    const i = buscar(d, "concentracion-clientes");
    expect(i?.nivel).toBe("advertencia");
    expect(i?.detalle).toContain("91%");
    // El mayor va primero, con su monto y su participacion.
    expect(i?.detalle).toContain("Cliente 1 $600,000 (54.5%)");
    expect(i?.involucrados).toHaveLength(5);
    expect(i?.involucrados[0]).toBe("Cliente 1");
  });

  it("no se dispara con el ingreso repartido", () => {
    // Doce clientes iguales: el top 5 es 5/12 = 42%.
    const d = conMontos(Array.from({ length: 12 }, () => 10_000_000));
    expect(buscar(d, "concentracion-clientes")).toBeUndefined();
  });

  it("con el archivo de demostracion se dispara: el top 5 es 69%", () => {
    const i = insights(cargarFixture()).find((x) => x.id === "concentracion-clientes");
    expect(i?.detalle).toContain("69%");
    expect(i?.involucrados).toHaveLength(5);
  });
});

describe("regla: estacionalidad", () => {
  it("nombra los meses sin ventas", () => {
    const d = dataset({
      ventas: [
        venta({ folio: "V-1", fecha: new Date(Date.UTC(2026, 0, 10)) }),
        venta({ folio: "V-2", fecha: new Date(Date.UTC(2026, 3, 10)) }),
      ],
    });
    const i = buscar(d, "meses-sin-venta");
    expect(i?.nivel).toBe("nota");
    expect(i?.detalle).toContain("feb 2026");
    expect(i?.detalle).toContain("mar 2026");
    expect(i?.detalle).toContain("2 meses");
  });

  it("no se dispara cuando se vendio todos los meses", () => {
    const d = dataset({
      ventas: [
        venta({ folio: "V-1", fecha: new Date(Date.UTC(2026, 0, 10)) }),
        venta({ folio: "V-2", fecha: new Date(Date.UTC(2026, 1, 10)) }),
      ],
    });
    expect(buscar(d, "meses-sin-venta")).toBeUndefined();
  });
});

describe("regla: mes de mayor venta", () => {
  it("nombra el mes, sus operaciones y su peso sobre toda la venta", () => {
    const d = dataset({
      ventas: [
        venta({ folio: "V-1", fecha: new Date(Date.UTC(2026, 0, 10)) }),
        venta({ folio: "V-2", fecha: new Date(Date.UTC(2026, 6, 10)) }),
        venta({ folio: "V-3", fecha: new Date(Date.UTC(2026, 6, 20)) }),
        venta({ folio: "V-4", fecha: null }),
      ],
    });
    const i = buscar(d, "mes-pico");
    expect(i?.nivel).toBe("nota");
    expect(i?.detalle).toContain("jul 2026");
    expect(i?.detalle).toContain("2 de 4 operaciones");
    expect(i?.detalle).toContain("$1,000,000");
    // 1M de 2M: la venta sin fecha cuenta en el denominador.
    expect(i?.detalle).toContain("50%");
    expect(i?.involucrados).toEqual(["2026-07"]);
  });

  it("con un solo mes no hay concentracion que senalar", () => {
    const d = dataset({
      ventas: [
        venta({ folio: "V-1", fecha: new Date(Date.UTC(2026, 6, 10)) }),
        venta({ folio: "V-2", fecha: new Date(Date.UTC(2026, 6, 20)) }),
      ],
    });
    expect(buscar(d, "mes-pico")).toBeUndefined();
  });

  it("si dos meses empatan gana el primero", () => {
    const d = dataset({
      ventas: [
        venta({ folio: "V-1", fecha: new Date(Date.UTC(2026, 1, 10)) }),
        venta({ folio: "V-2", fecha: new Date(Date.UTC(2026, 4, 10)) }),
      ],
    });
    expect(buscar(d, "mes-pico")?.involucrados).toEqual(["2026-02"]);
  });
});

describe("regla: importes con IVA", () => {
  const ventas = [venta({ folio: "V-1", costo_unitario: 40_000_000, precio_venta: 116_000_000 })];
  const conIva = (valor: boolean | null) =>
    dataset({ ventas, parametros: ParametrosSchema.parse({ importes_incluyen_iva: valor }) });

  it("sin respuesta en parametros avisa cuanto estaria inflado", () => {
    const i = buscar(conIva(null), "importes-iva");
    expect(i?.nivel).toBe("advertencia");
    expect(i?.titulo).toBe("No se sabe si los importes incluyen IVA");
    expect(i?.detalle).toContain("13.8%");
    expect(i?.detalle).toContain("$1,160,000");
    // 1,160,000 / 1.16 = 1,000,000 exactos.
    expect(i?.detalle).toContain("$1,000,000");
    expect(i?.detalle).toContain("importes_incluyen_iva");
  });

  it("si parametros dice que si, lo afirma en lugar de suponerlo", () => {
    const i = buscar(conIva(true), "importes-iva");
    expect(i?.titulo).toBe("Los importes incluyen IVA");
    expect(i?.detalle).toContain("$1,000,000 sin IVA");
  });

  it("si parametros dice que no, no hay nada que advertir", () => {
    expect(buscar(conIva(false), "importes-iva")).toBeUndefined();
  });

  it("sin venta no hay importe que pueda estar inflado", () => {
    const d = dataset({ parametros: ParametrosSchema.parse({ importes_incluyen_iva: true }) });
    expect(buscar(d, "importes-iva")).toBeUndefined();
  });
});

describe("reglas de apoyo", () => {
  it("reporta ventas sin fecha con su importe", () => {
    const d = dataset({
      ventas: [venta({ folio: "V-1", fecha: null }), venta({ folio: "V-2" })],
    });
    const i = buscar(d, "ventas-sin-fecha");
    expect(i?.detalle).toContain("$500,000");
    expect(i?.detalle).toContain("1 venta");
  });

  it("reporta cartera sin antiguedad determinable con sus folios", () => {
    const d = dataset({
      ventas: [venta({ folio: "V-9", fecha: null })],
      cobranza: [abono({ folio_venta: "V-9", monto: 10_000_000 })],
    });
    const i = buscar(d, "cartera-sin-fecha");
    expect(i?.detalle).toContain("V-9");
    expect(i?.involucrados).toEqual(["V-9"]);
  });

  it("reporta las unidades Demo con su costo", () => {
    const d = dataset({
      ventas: [
        venta({ folio: "V-1" }),
        venta({ folio: "V-D", linea: "Demo", precio_venta: null, costo_unitario: 39_520_000 }),
      ],
    });
    const i = buscar(d, "filas-demo");
    expect(i?.detalle).toContain("V-D");
    expect(i?.detalle).toContain("$395,200");
    expect(i?.involucrados).toEqual(["V-D"]);
  });

  it("avisa cuando la venta no cubre el punto de equilibrio", () => {
    const d = dataset({
      ventas: [venta({ folio: "V-1", costo_unitario: 45_000_000, precio_venta: 50_000_000 })],
      gastos: [
        {
          folio_gasto: "G-1",
          fecha: new Date(Date.UTC(2026, 0, 31)),
          categoria: "Renta",
          subcategoria: null,
          descripcion: null,
          monto: 20_000_000,
          tipo: "Fijo",
          proveedor: null,
          notas: null,
        },
      ],
    });
    const i = buscar(d, "punto-equilibrio");
    expect(i?.nivel).toBe("advertencia");
    expect(i?.detalle).toContain("$200,000");
  });
});

describe("insights sobre el archivo de demostracion", () => {
  const encontrados = () => insights(cargarFixture());

  it("dispara las reglas que este archivo justifica, y ninguna mas", () => {
    expect(encontrados().map((i) => i.id)).toEqual([
      "utilidad-en-cartera",
      "cartera-mas-180",
      "ventas-sin-fecha",
      "attach-rate-bajo",
      "concentracion-clientes",
      "mes-pico",
      "filas-demo",
    ]);
  });

  it("callan las reglas cuya condicion este archivo no cumple", () => {
    const ids = encontrados().map((i) => i.id);
    // Los costos del archivo son de proveedor, no un porcentaje del precio.
    expect(ids).not.toContain("margen-derivado");
    // Se vendio los nueve meses del periodo capturado.
    expect(ids).not.toContain("meses-sin-venta");
    // parametros contesta que NO hay IVA incluido: no hay nada que advertir.
    expect(ids).not.toContain("importes-iva");
    // La venta cubre de sobra el punto de equilibrio.
    expect(ids).not.toContain("punto-equilibrio");
    // Hay cobranza capturada, asi que el aviso de "no disponible" no aplica.
    expect(ids).not.toContain("cartera-no-disponible");
    // La unica venta sin fecha esta pagada: no deja saldo sin antiguedad.
    expect(ids).not.toContain("cartera-sin-fecha");
  });

  it("ningun hallazgo es generico: todos llevan cifras y ninguno se rompe", () => {
    for (const i of encontrados()) {
      expect(i.titulo).toBeTruthy();
      expect(i.detalle.length).toBeGreaterThan(40);
      expect(i.detalle).toMatch(/\d/);
      expect(i.detalle).not.toContain("NaN");
      expect(i.detalle).not.toContain("undefined");
      expect(i.detalle).not.toContain("Infinity");
      // Ningun texto muestra la clave cruda de mes ("2026-03"): todos los meses
      // pasan por la capa de formato y se leen igual ("mar 2026").
      expect(i.detalle, i.id).not.toMatch(/\d{4}-\d{2}/);
    }
  });

  it("la alerta de cartera vencida cita el monto, el peso y a los clientes", () => {
    const i = encontrados().find((x) => x.id === "cartera-mas-180");
    expect(i?.nivel).toBe("alerta");
    expect(i?.detalle).toContain("$670,000");
    expect(i?.detalle).toContain("34%");
    expect(i?.detalle).toContain("folio V-001");
    expect(i?.involucrados.length).toBeGreaterThan(0);
  });

  it("la utilidad en cartera compara saldo contra utilidad bruta", () => {
    const i = encontrados().find((x) => x.id === "utilidad-en-cartera");
    expect(i?.detalle).toContain("$1,955,800");
    expect(i?.detalle).toContain("$1,218,900");
    expect(i?.detalle).toContain("1.6 veces");
  });

  it("el mes pico es julio, con el formato de mes de la capa de formato", () => {
    const i = encontrados().find((x) => x.id === "mes-pico");
    expect(i?.detalle).toMatch(/^jul 2026 concentra/);
    expect(i?.detalle).toContain("5 de 24 operaciones");
    expect(i?.detalle).toContain("$1,187,400");
    expect(i?.detalle).toContain("26%");
  });

  it("la oportunidad de venta cruzada cita el 3 de 10 del archivo", () => {
    const i = encontrados().find((x) => x.id === "attach-rate-bajo");
    expect(i?.detalle).toContain("3 de 10");
    expect(i?.detalle).toContain("30%");
  });

  it("reporta la unidad Demo con su folio y su costo sin venta", () => {
    const i = encontrados().find((x) => x.id === "filas-demo");
    expect(i?.detalle).toContain(FOLIO_DEMO);
    expect(i?.detalle).toContain("$295,000");
    expect(i?.involucrados).toEqual([FOLIO_DEMO]);
  });

  it("reporta la unica venta sin fecha con su importe", () => {
    const i = encontrados().find((x) => x.id === "ventas-sin-fecha");
    expect(i?.detalle).toContain("1 venta");
    expect(i?.detalle).toContain("$3,600");
  });
});
