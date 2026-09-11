import { describe, expect, it } from "vitest";

import {
  type Insight,
  calcularCartera,
  calcularClientes,
  calcularFlujo,
  calcularInsights,
  calcularProducto,
  calcularResultados,
} from "../../../lib/calc";
import { CORTE, ESPERADO, cargarFixture } from "../../../lib/calc/__tests__/fixture";
import {
  type Cobranza,
  type Dataset,
  ParametrosSchema,
  type Venta,
  capacidades,
} from "../../../lib/schema";
import type { Calculos } from "../../../store/useAppStore";
import {
  alcanceDelReporte,
  cuentasMayores,
  graficaResumen,
  kpisResumen,
  periodoDelReporte,
  porSeveridad,
  textoPeriodo,
} from "../selectores";

/** Lo mismo que hace el store al cargar, sin el store. */
function calcular(d: Dataset): Calculos {
  const opciones = { fechaCorte: CORTE };
  return {
    resultados: calcularResultados(d),
    cartera: calcularCartera(d, opciones),
    producto: calcularProducto(d),
    clientes: calcularClientes(d),
    flujo: calcularFlujo(d),
    insights: calcularInsights(d, opciones),
    capacidades: capacidades(d),
  };
}

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
const calculos = calcular(fixture);

describe("los ocho indicadores", () => {
  const kpis = kpisResumen(calculos);
  const valor = (clave: string) => kpis.find((k) => k.clave === clave)?.valor;

  it("son los ocho de la portada, en su orden y con las cifras del archivo", () => {
    expect(kpis.map((k) => [k.etiqueta, k.valor])).toEqual([
      ["Venta total", "$4,496,900"],
      ["Utilidad bruta", "$1,218,900"],
      ["Margen bruto", "27.1%"],
      ["Saldo por cobrar", "$1,955,800"],
      ["Operaciones", "24"],
      ["Ticket promedio", "$187,371"],
      ["Efectivo cobrado", "$2,541,100"],
      ["Cartera +180 días", "$670,000"],
    ]);
  });

  it("marcan en riesgo lo que el reporte marca en rojo", () => {
    const tono = (clave: string) => kpis.find((k) => k.clave === clave)?.tono;
    expect(tono("saldo")).toBe("riesgo");
    // 34% de la cartera a +180: sobre el 30% tolerable.
    expect(tono("mas180")).toBe("riesgo");
    expect(tono("utilidad")).toBe("positivo");
  });

  it("sin hoja cobranza no inventan saldo: el valor falta y la nota dice por que", () => {
    const soloVentas = calcular(dataset({ ventas: [venta({ folio: "V-1" })] }));
    const k = kpisResumen(soloVentas);
    for (const clave of ["saldo", "cobrado", "mas180"]) {
      const kpi = k.find((x) => x.clave === clave);
      expect(kpi?.valor, clave).toBeNull();
      expect(kpi?.nota).toBe("Requiere la hoja cobranza.");
    }
    // Los de venta siguen ahi.
    expect(k.find((x) => x.clave === "venta")?.valor).toBe("$500,000");
  });

  it("ninguna nota ni valor lleva NaN, Infinity ni undefined, ni con un dataset vacio", () => {
    for (const c of [calculos, calcular(dataset({}))]) {
      for (const k of kpisResumen(c)) {
        expect(`${k.valor ?? ""} ${k.nota}`).not.toMatch(/NaN|Infinity|undefined/);
      }
    }
    expect(valor("ticket")).toBe("$187,371");
  });
});

describe("hallazgos por severidad", () => {
  const h = (id: string, nivel: Insight["nivel"]): Insight => ({
    id,
    nivel,
    titulo: id,
    detalle: id,
    involucrados: [],
  });

  it("alertas primero, luego advertencias, oportunidades y notas", () => {
    const ordenados = porSeveridad([
      h("n1", "nota"),
      h("o1", "oportunidad"),
      h("a1", "alerta"),
      h("w1", "advertencia"),
      h("a2", "alerta"),
    ]);
    expect(ordenados.map((i) => i.id)).toEqual(["a1", "a2", "w1", "o1", "n1"]);
  });

  it("dentro de un nivel respeta el orden del motor, y no muta la entrada", () => {
    const entrada = [h("w2", "advertencia"), h("w1", "advertencia")];
    expect(porSeveridad(entrada).map((i) => i.id)).toEqual(["w2", "w1"]);
    expect(entrada.map((i) => i.id)).toEqual(["w2", "w1"]);
  });

  it("con el archivo de demostracion, los de riesgo encabezan la lista", () => {
    const niveles = porSeveridad(calculos.insights).map((i) => i.nivel);
    expect(niveles[0]).toBe("alerta");
    expect(niveles.indexOf("nota")).toBeGreaterThan(niveles.lastIndexOf("alerta"));
  });
});

describe("cuentas mayores", () => {
  it("son las tres de mayor saldo del archivo", () => {
    const tres = cuentasMayores(calculos.cartera);
    expect(tres.map((c) => [c.nombre, c.saldo])).toEqual([
      ["Agricola San Lorenzo", 43_480_000],
      ["Semillas del Norte", 26_000_000],
      ["Campos de Altamira", 22_500_000],
    ]);
  });

  it("no rellena con clientes sin saldo", () => {
    const d = dataset({
      ventas: [venta({ folio: "V-1" })],
      cobranza: [abono({ folio_venta: "V-1", monto: 50_000_000 })],
    });
    expect(cuentasMayores(calcular(d).cartera)).toEqual([]);
  });
});

describe("la grafica del resumen", () => {
  it("con el archivo de demostracion muestra facturado contra cobrado", () => {
    // Todos sus abonos traen fecha_pago, asi que el flujo si es calculable y
    // la grafica no necesita sustituto.
    const g = graficaResumen(calculos);
    expect(g.tipo).toBe("flujo");
    if (g.tipo !== "flujo") return;
    expect(g.puntos).toHaveLength(9);
    expect(g.puntos[0]?.valores).toEqual({ facturado: 78_500_000, cobrado: 12_000_000 });
  });

  it("sin fechas de pago sustituye por ingreso por modelo y dice por que", () => {
    const d = dataset({
      ventas: [venta({ folio: "V-1" })],
      cobranza: [abono({ folio_venta: "V-1", monto: 10_000_000, fecha_pago: null })],
    });
    const g = graficaResumen(calcular(d));
    expect(g.tipo).toBe("producto");
    if (g.tipo !== "producto") return;
    expect(g.puntos[0]?.categoria).toBe("T70P");
    expect(g.motivo).toContain("no traen fecha de pago");
  });

  it("con fechas de pago muestra facturado contra cobrado", () => {
    const d = dataset({
      ventas: [venta({ folio: "V-1" })],
      cobranza: [abono({ folio_venta: "V-1", monto: 10_000_000, fecha_pago: new Date(Date.UTC(2026, 1, 1)) })],
    });
    const g = graficaResumen(calcular(d));
    expect(g.tipo).toBe("flujo");
    if (g.tipo !== "flujo") return;
    expect(g.puntos.map((p) => p.valores)).toEqual([
      { facturado: 50_000_000, cobrado: 0 },
      { facturado: 0, cobrado: 10_000_000 },
    ]);
  });

  it("sin hoja cobranza tambien sustituye, con su propio motivo", () => {
    const g = graficaResumen(calcular(dataset({ ventas: [venta({ folio: "V-1" })] })));
    expect(g.tipo).toBe("producto");
    if (g.tipo !== "producto") return;
    expect(g.motivo).toContain("Sin hoja cobranza");
  });
});

describe("periodo y alcance", () => {
  it("toma el periodo de la hoja parametros cuando viene", () => {
    const p = periodoDelReporte(fixture);
    expect(p?.origen).toBe("parametros");
    expect(textoPeriodo(p)).toBe("01/01/2026 al 31/12/2026, según la hoja parámetros");
  });

  it("si parametros no lo trae, lo deduce de las ventas computables y lo dice", () => {
    const d = dataset({
      ventas: [
        venta({ folio: "V-1", fecha: new Date(Date.UTC(2026, 1, 3)) }),
        venta({ folio: "V-2", fecha: new Date(Date.UTC(2026, 6, 9)) }),
        // La Demo no amplia el periodo.
        venta({ folio: "V-D", linea: "Demo", fecha: new Date(Date.UTC(2025, 0, 1)) }),
      ],
    });
    const p = periodoDelReporte(d);
    expect(p?.origen).toBe("ventas");
    expect(textoPeriodo(p)).toContain("03/02/2026 al 09/07/2026");
  });

  it("sin fechas en ningun lado lo dice en vez de inventar", () => {
    expect(periodoDelReporte(dataset({ ventas: [venta({ folio: "V-1", fecha: null })] }))).toBeNull();
    expect(textoPeriodo(null)).toContain("Sin periodo");
  });

  it("el alcance nombra la Demo excluida y lo que si entra en el reporte", () => {
    const a = alcanceDelReporte(fixture, calculos);
    expect(a.incluye[0]).toBe(`${ESPERADO.operaciones} operaciones de venta computables.`);
    expect(a.incluye.join(" ")).toContain("V-006 (Demo)");
    expect(a.incluye.join(" ")).toContain("30 abonos de cobranza");
    expect(a.incluye.join(" ")).toContain("82 registros de gastos operativos, tal como se capturaron.");
    // Este archivo trae fecha en todos los abonos: esa limitacion ya no aplica.
    expect(a.noIncluye.join(" ")).not.toContain("no traen fecha de pago");
    expect(a.noIncluye.join(" ")).toContain("Utilidad neta auditada");
  });

  it("sin hojas de cobranza ni gastos, lo dice en lo que no incluye", () => {
    const d = dataset({ ventas: [venta({ folio: "V-1", dias_credito: 30 })] });
    const a = alcanceDelReporte(d, calcular(d));
    expect(a.noIncluye.join(" ")).toContain("sin hoja cobranza");
    expect(a.noIncluye.join(" ")).toContain("sin hoja gastos");
    expect(a.noIncluye.join(" ")).not.toContain("Días de crédito");
  });
});
