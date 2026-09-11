import { describe, expect, it } from "vitest";

import { calcularProducto, calcularResultados } from "../../../lib/calc";
import { ESPERADO, cargarFixture } from "../../../lib/calc/__tests__/fixture";
import { type Dataset, ParametrosSchema, type Venta } from "../../../lib/schema";
import { type FilaProducto, filasProducto, puntosProducto, totalProducto } from "../selectores";

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

const dataset = (ventas: Venta[]): Dataset => ({
  ventas,
  cobranza: [],
  gastos: [],
  parametros: ParametrosSchema.parse({}),
});

const fixture = cargarFixture();
const filas = filasProducto(calcularProducto(fixture));
const total = totalProducto(calcularResultados(fixture).total);

const CAMPOS = ["unidades", "ingreso", "costo", "utilidadBruta"] as const;

describe("tabla por linea y modelo", () => {
  it("los subtotales por linea suman el total, campo por campo", () => {
    const subtotales = filas.filter((f) => f.nivel === "subtotal");
    for (const campo of CAMPOS) {
      const suma = subtotales.reduce((t, f) => t + f[campo], 0);
      expect(suma, campo).toBe(total[campo]);
    }
    const part = subtotales.reduce((t, f) => t + (f.participacion ?? 0), 0);
    expect(part).toBeCloseTo(1, 9);
  });

  it("los modelos de cada linea suman su subtotal", () => {
    // Recorre la tabla como la leeria una persona: acumula hasta topar el subtotal.
    let grupo: FilaProducto[] = [];
    for (const f of filas) {
      if (f.nivel === "modelo") {
        grupo.push(f);
        continue;
      }
      for (const campo of CAMPOS) {
        expect(grupo.reduce((t, m) => t + m[campo], 0), `${f.linea}.${campo}`).toBe(f[campo]);
      }
      grupo = [];
    }
    // Ningun modelo queda despues del ultimo subtotal.
    expect(grupo).toEqual([]);
  });

  it("todas las filas suman el total del motor: nada se pierde ni se duplica al agrupar", () => {
    const modelos = filas.filter((f) => f.nivel === "modelo");
    expect(modelos.reduce((t, f) => t + f.ingreso, 0)).toBe(ESPERADO.ventaTotal);
    expect(modelos.reduce((t, f) => t + f.costo, 0)).toBe(ESPERADO.costoTotal);
    expect(modelos.reduce((t, f) => t + f.unidades, 0)).toBe(ESPERADO.operaciones);
  });

  it("reproduce el archivo: Equipo primero y las cinco lineas computables", () => {
    const subtotales = filas.filter((f) => f.nivel === "subtotal").map((f) => [f.linea, f.ingreso]);
    expect(subtotales).toEqual([
      ["Subtotal Equipo", 430_900_000],
      ["Subtotal Accesorios", 9_490_000],
      ["Subtotal Servicio", 6_400_000],
      ["Subtotal Refacciones", 1_700_000],
      ["Subtotal Capacitacion", 1_200_000],
    ]);
    // Dentro de Equipo, el modelo de mayor ingreso va primero.
    expect(filas[0]?.modelo).toBe("AX-100");
  });

  it("el total es el del motor y marca el 100%", () => {
    expect(total.ingreso).toBe(ESPERADO.ventaTotal);
    expect(total.utilidadBruta).toBe(ESPERADO.utilidadBruta);
    expect(total.participacion).toBe(1);
    expect(total.enfasis).toBe("total");
  });

  it("T70p y T70P son un solo renglon", () => {
    const d = dataset([
      venta({ folio: "V-1", modelo: "T70p" }),
      venta({ folio: "V-2", modelo: " T70P " }),
    ]);
    const f = filasProducto(calcularProducto(d)).filter((x) => x.nivel === "modelo");
    expect(f).toHaveLength(1);
    expect(f[0]?.unidades).toBe(2);
  });

  it("la Demo no aparece en ninguna linea", () => {
    const d = dataset([
      venta({ folio: "V-1" }),
      venta({ folio: "V-D", linea: "Demo", precio_venta: null }),
    ]);
    expect(filasProducto(calcularProducto(d)).map((f) => f.linea)).not.toContain("Subtotal Demo");
  });

  it("sin ventas no hay filas, y el total queda en cero con porcentajes nulos", () => {
    const d = dataset([]);
    expect(filasProducto(calcularProducto(d))).toEqual([]);
    const t = totalProducto(calcularResultados(d).total);
    expect(t.ingreso).toBe(0);
    expect(t.margenPct).toBeNull();
    expect(t.participacion).toBeNull();
  });
});

describe("grafica por modelo", () => {
  it("un punto por modelo, de mayor a menor ingreso, con ingreso y utilidad", () => {
    const { puntos, omitidos } = puntosProducto(calcularProducto(fixture));
    expect(omitidos).toBe(0);
    expect(puntos.map((p) => p.categoria).slice(0, 4)).toEqual(["AX-100", "AX-70", "AX-55", "AX-25"]);
    expect(puntos[0]?.valores).toEqual({ ingreso: 156_000_000, utilidad: 42_000_000 });
  });

  it("recorta a los de mayor ingreso y dice cuantos quedaron fuera", () => {
    const ventas = Array.from({ length: 5 }, (_, n) =>
      venta({ folio: `V-${n}`, modelo: `M${n}`, precio_venta: (n + 1) * 10_000_000 }),
    );
    const { puntos, omitidos } = puntosProducto(calcularProducto(dataset(ventas)), 3);
    expect(puntos.map((p) => p.categoria)).toEqual(["M4", "M3", "M2"]);
    expect(omitidos).toBe(2);
  });
});
