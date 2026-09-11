import { describe, expect, it } from "vitest";

import {
  type SerieGrafica,
  VARIABLE_COLOR,
  dataKeyDe,
  esCategorica,
  etiquetasEje,
  filasRecharts,
} from "../datosGrafica";

const SERIES: readonly SerieGrafica[] = [
  { clave: "facturado", etiqueta: "Facturado", color: "marino" },
  { clave: "cobrado", etiqueta: "Cobrado", color: "positivo" },
];

const ENE = new Date(Date.UTC(2026, 0, 1));
const FEB = new Date(Date.UTC(2026, 1, 1));

describe("filas de recharts", () => {
  it("usa la posicion como categoria y un dataKey por serie, en orden", () => {
    const filas = filasRecharts(
      [
        { fecha: ENE, valores: { facturado: 100, cobrado: 40 } },
        { fecha: FEB, valores: { facturado: 0, cobrado: 60 } },
      ],
      SERIES,
    );
    expect(filas).toEqual([
      { x: 0, s0: 100, s1: 40 },
      { x: 1, s0: 0, s1: 60 },
    ]);
  });

  it("un null se conserva como hueco, nunca se vuelve cero", () => {
    const [fila] = filasRecharts([{ fecha: ENE, valores: { facturado: null, cobrado: 0 } }], SERIES);
    expect(fila?.[dataKeyDe(0)]).toBeNull();
    // El cero real sigue siendo cero.
    expect(fila?.[dataKeyDe(1)]).toBe(0);
  });

  it("una serie ausente o un NaN llegan como hueco explicito", () => {
    const [fila] = filasRecharts([{ fecha: ENE, valores: { facturado: Number.NaN } }], SERIES);
    expect(fila).toEqual({ x: 0, s0: null, s1: null });
  });

  it("una serie llamada x no pisa la categoria del eje", () => {
    const [fila] = filasRecharts(
      [{ fecha: ENE, valores: { x: 5 } }],
      [{ clave: "x", etiqueta: "X", color: "marino" }],
    );
    expect(fila?.x).toBe(0);
    expect(fila?.[dataKeyDe(0)]).toBe(5);
  });

  it("dos categorias con el mismo nombre siguen siendo dos barras", () => {
    const filas = filasRecharts(
      [
        { categoria: "T55", valores: { facturado: 1 } },
        { categoria: "T55", valores: { facturado: 2 } },
      ],
      SERIES,
    );
    expect(filas.map((f) => f.x)).toEqual([0, 1]);
  });

  it("sin puntos no hay filas", () => {
    expect(filasRecharts([], SERIES)).toEqual([]);
  });
});

describe("etiquetas del eje", () => {
  it("los meses usan el formato de mes de todo el reporte", () => {
    expect(etiquetasEje([{ fecha: ENE, valores: {} }, { fecha: FEB, valores: {} }])).toEqual([
      "ene 2026",
      "feb 2026",
    ]);
    expect(esCategorica([{ fecha: ENE, valores: {} }])).toBe(false);
  });

  it("las categorias se muestran tal cual, en el orden recibido", () => {
    const puntos = [
      { categoria: "T70P", valores: {} },
      { categoria: "Antena RTK", valores: {} },
    ];
    expect(etiquetasEje(puntos)).toEqual(["T70P", "Antena RTK"]);
    expect(esCategorica(puntos)).toBe(true);
  });

  it("un eje vacio no truena", () => {
    expect(etiquetasEje([])).toEqual([]);
    expect(esCategorica([])).toBe(false);
  });
});

describe("colores", () => {
  it("todos salen de variables del @theme, ninguno es un hexadecimal suelto", () => {
    for (const valor of Object.values(VARIABLE_COLOR)) {
      expect(valor).toMatch(/^var\(--color-[a-z0-9-]+\)$/);
    }
  });
});
