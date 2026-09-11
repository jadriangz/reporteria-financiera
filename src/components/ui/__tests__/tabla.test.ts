import { describe, expect, it } from "vitest";

import {
  type ColumnaTabla,
  type FilaTabla,
  compararValores,
  ordenarFilas,
  siguienteOrden,
} from "../tabla";

interface Registro {
  readonly nombre: string;
  readonly monto: number;
  readonly dias: number | null;
}

const COLUMNAS: readonly ColumnaTabla<Registro>[] = [
  { clave: "nombre", encabezado: "Nombre", celda: (r) => r.nombre, ordenar: (r) => r.nombre },
  { clave: "monto", encabezado: "Monto", celda: (r) => r.monto, ordenar: (r) => r.monto },
  { clave: "dias", encabezado: "Días", celda: (r) => r.dias, ordenar: (r) => r.dias },
  { clave: "fija", encabezado: "Fija", celda: () => "-" },
];

const filas: readonly FilaTabla<Registro>[] = [
  { id: "b", datos: { nombre: "Beta", monto: 200, dias: 10 } },
  { id: "a", datos: { nombre: "alfa", monto: 300, dias: null } },
  { id: "c", datos: { nombre: "Ceta", monto: 100, dias: 50 } },
];

const ids = (fs: readonly FilaTabla<Registro>[]) => fs.map((f) => f.id);

describe("compararValores", () => {
  it("compara numeros por magnitud", () => {
    expect(compararValores(1, 2, 1)).toBeLessThan(0);
    expect(compararValores(2, 1, 1)).toBeGreaterThan(0);
    expect(compararValores(1, 1, 1)).toBe(0);
  });

  it("invierte con el signo", () => {
    expect(compararValores(1, 2, -1)).toBeGreaterThan(0);
  });

  it("compara texto con reglas de es-MX", () => {
    // Sin locale, "alfa" iria despues de "Beta" por comparar codigos ASCII.
    expect(compararValores("alfa", "Beta", 1)).toBeLessThan(0);
    expect(compararValores("año", "azul", 1)).toBeLessThan(0);
  });

  it("manda los nulos al final SIN IMPORTAR la direccion", () => {
    // Un dato que falta no es "el mas pequeno": ponerlo primero al ordenar
    // descendente haria creer que ahi esta el valor mas alto.
    expect(compararValores(null, 5, 1)).toBeGreaterThan(0);
    expect(compararValores(null, 5, -1)).toBeGreaterThan(0);
    expect(compararValores(5, null, 1)).toBeLessThan(0);
    expect(compararValores(5, null, -1)).toBeLessThan(0);
    expect(compararValores(null, null, 1)).toBe(0);
  });
});

describe("ordenarFilas", () => {
  it("sin orden devuelve las filas como llegaron", () => {
    expect(ordenarFilas(filas, COLUMNAS, null)).toBe(filas);
  });

  it("ordena por numero ascendente y descendente", () => {
    expect(ids(ordenarFilas(filas, COLUMNAS, { clave: "monto", direccion: "asc" })))
      .toEqual(["c", "b", "a"]);
    expect(ids(ordenarFilas(filas, COLUMNAS, { clave: "monto", direccion: "desc" })))
      .toEqual(["a", "b", "c"]);
  });

  it("ordena por texto respetando acentos y mayusculas", () => {
    expect(ids(ordenarFilas(filas, COLUMNAS, { clave: "nombre", direccion: "asc" })))
      .toEqual(["a", "b", "c"]);
  });

  it("deja la fila sin dato al final en ambas direcciones", () => {
    expect(ids(ordenarFilas(filas, COLUMNAS, { clave: "dias", direccion: "desc" })))
      .toEqual(["c", "b", "a"]);
    expect(ids(ordenarFilas(filas, COLUMNAS, { clave: "dias", direccion: "asc" })))
      .toEqual(["b", "c", "a"]);
  });

  it("ignora columnas que no declaran como ordenar", () => {
    expect(ordenarFilas(filas, COLUMNAS, { clave: "fija", direccion: "asc" })).toBe(filas);
  });

  it("ignora una clave que no existe", () => {
    expect(ordenarFilas(filas, COLUMNAS, { clave: "inventada", direccion: "asc" })).toBe(filas);
  });

  it("no muta el arreglo original", () => {
    const copia = [...filas];
    ordenarFilas(filas, COLUMNAS, { clave: "monto", direccion: "asc" });
    expect(filas).toEqual(copia);
  });
});

describe("siguienteOrden", () => {
  it("una columna nueva arranca descendente", () => {
    // En un reporte financiero lo primero que se busca es lo mas grande.
    expect(siguienteOrden(null, "monto")).toEqual({ clave: "monto", direccion: "desc" });
    expect(siguienteOrden({ clave: "otra", direccion: "asc" }, "monto")).toEqual({
      clave: "monto",
      direccion: "desc",
    });
  });

  it("la misma columna alterna la direccion", () => {
    expect(siguienteOrden({ clave: "monto", direccion: "desc" }, "monto")).toEqual({
      clave: "monto",
      direccion: "asc",
    });
    expect(siguienteOrden({ clave: "monto", direccion: "asc" }, "monto")).toEqual({
      clave: "monto",
      direccion: "desc",
    });
  });
});
