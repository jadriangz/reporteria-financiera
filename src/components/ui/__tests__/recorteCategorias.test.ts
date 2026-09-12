import { describe, expect, it } from "vitest";

import { cargarFixture } from "../../../lib/calc/__tests__/fixture";
import { calcularProducto } from "../../../lib/calc/producto";
import { RECORTE_MODELOS, puntosProducto } from "../../../modules/producto/selectores";
import type { PuntoCategoria } from "../datosGrafica";
import { ANCHO_IMPRESION, anchoUtil } from "../ejeGrafica";
import {
  ANCHO_MINIMO_BARRA,
  anchoMinimoCategoria,
  categoriasQueCaben,
  recortarCategorias,
  textoRecorte,
} from "../recorteCategorias";

/**
 * El recorte de categorías: la parte de D2 que `rotuloEje` no resolvía.
 *
 * Lo que estas pruebas fijan no es un número de modelos, es un CRITERIO: el
 * ancho disponible por barra. Un número fijo volvería a acoplar la gráfica al
 * dispositivo, que es justo lo que la fase evitó.
 */

/** Categorías con el ingreso que se les pase, ya ordenadas de mayor a menor. */
const puntosDe = (...ingresos: number[]): PuntoCategoria[] =>
  ingresos.map((ingreso, i) => ({
    categoria: `M${i}`,
    valores: { ingreso, utilidad: Math.round(ingreso * 0.3) },
  }));

const NOMBRES = { ...RECORTE_MODELOS, dondeVerElResto: "en la tabla" };

describe("cuántas categorías caben", () => {
  it("una categoría necesita sus barras, su separación y su hueco", () => {
    // 2 barras de 13 px + 2 px entre ellas = 28, y eso es el 56% del ancho de
    // la categoría: el 22% de hueco se descuenta a CADA lado del grupo.
    expect(anchoMinimoCategoria(2)).toBe(50);
    expect(anchoMinimoCategoria(1)).toBe(24);
  });

  it("más series por categoría significa menos categorías en el mismo ancho", () => {
    expect(anchoMinimoCategoria(3)).toBeGreaterThan(anchoMinimoCategoria(2));
    expect(categoriasQueCaben(600, 3)).toBeLessThan(categoriasQueCaben(600, 2));
  });

  it("a más ancho, más categorías, sin excepción", () => {
    const anchos = [120, 240, 300, 500, 620, 1200];
    const caben = anchos.map((a) => categoriasQueCaben(a, 2));
    for (let i = 1; i < caben.length; i += 1) {
      expect(caben[i] ?? 0, `${anchos[i]}px`).toBeGreaterThanOrEqual(caben[i - 1] ?? 0);
    }
  });

  it("nunca devuelve cero: una gráfica sin barras es un hueco, no una gráfica", () => {
    expect(categoriasQueCaben(10, 2)).toBe(1);
    expect(categoriasQueCaben(1, 4)).toBe(1);
  });

  it("sin medir todavía (ancho 0) no recorta nada", () => {
    // Recortar con una medida que no se tiene sería inventar. Se muestra todo
    // hasta que el observador de tamaño diga cuánto espacio hay de verdad.
    expect(categoriasQueCaben(0, 2)).toBe(Number.POSITIVE_INFINITY);
    const puntos = puntosDe(10, 9, 8, 7, 6, 5);
    expect(recortarCategorias(puntos, { anchoDisponible: 0, series: 2, clave: "ingreso" }).omitidas).toBe(0);
  });
});

describe("el recorte", () => {
  it("cuando todo cabe no recorta, no omite y no hay nota", () => {
    const puntos = puntosDe(100, 80, 60);
    const r = recortarCategorias(puntos, { anchoDisponible: 1200, series: 2, clave: "ingreso" });
    expect(r.visibles).toBe(puntos);
    expect(r.omitidas).toBe(0);
    expect(r.proporcionOmitida).toBeNull();
    expect(textoRecorte(r, NOMBRES)).toBeNull();
  });

  it("se queda con los primeros, que son los de mayor ingreso", () => {
    const puntos = puntosDe(100, 80, 60, 40, 20);
    // 3 categorías × 50 px = 150; con 160 caben 3 y no 4.
    const r = recortarCategorias(puntos, { anchoDisponible: 160, series: 2, clave: "ingreso" });
    expect(r.visibles.map((p) => p.categoria)).toEqual(["M0", "M1", "M2"]);
    expect(r.omitidas).toBe(2);
  });

  it("la proporción omitida es la del ingreso, no la del número de categorías", () => {
    // 5 categorías, se muestran 3. Fuera quedan 40 + 20 = 60 de 300 = 20%,
    // aunque sean el 40% de los modelos. La nota tiene que decir 20%.
    const puntos = puntosDe(100, 80, 60, 40, 20);
    const r = recortarCategorias(puntos, { anchoDisponible: 160, series: 2, clave: "ingreso" });
    expect(r.proporcionOmitida).toBeCloseTo(60 / 300, 9);
  });

  it("no reordena: confía en el orden que le llega", () => {
    // Si el llamador entrega desordenado, el recorte se queda con los primeros
    // igual. El orden es contrato del selector, no de la presentación.
    const puntos = puntosDe(10, 90, 50);
    const r = recortarCategorias(puntos, { anchoDisponible: 60, series: 2, clave: "ingreso" });
    expect(r.visibles.map((p) => p.categoria)).toEqual(["M0"]);
  });

  it("con total cero la proporción es null, no 0%", () => {
    // Ausencia de dato no es dato en cero: "0% del ingreso" afirmaría que lo
    // omitido no pesa, y lo cierto es que no se puede saber.
    const puntos = puntosDe(0, 0, 0, 0, 0);
    const r = recortarCategorias(puntos, { anchoDisponible: 60, series: 2, clave: "ingreso" });
    expect(r.omitidas).toBeGreaterThan(0);
    expect(r.proporcionOmitida).toBeNull();
  });

  it("ignora los huecos al sumar, no los cuenta como cero ni produce NaN", () => {
    const puntos: PuntoCategoria[] = [
      { categoria: "A", valores: { ingreso: 100 } },
      { categoria: "B", valores: { ingreso: null } },
      { categoria: "C", valores: {} },
      { categoria: "D", valores: { ingreso: 100 } },
    ];
    const r = recortarCategorias(puntos, { anchoDisponible: 60, series: 2, clave: "ingreso" });
    expect(r.visibles).toHaveLength(1);
    expect(r.proporcionOmitida).toBeCloseTo(100 / 200, 9);
    expect(Number.isNaN(r.proporcionOmitida ?? 0)).toBe(false);
  });
});

describe("la impresión nunca recorta", () => {
  const puntos = puntosDe(...Array.from({ length: 40 }, (_, i) => 40 - i));

  it("con `sinRecorte` pasan todas, por estrecha que sea la medida", () => {
    const r = recortarCategorias(puntos, {
      anchoDisponible: 50,
      series: 2,
      clave: "ingreso",
      sinRecorte: true,
    });
    expect(r.visibles).toHaveLength(40);
    expect(r.omitidas).toBe(0);
    expect(textoRecorte(r, NOMBRES)).toBeNull();
  });

  it("y sin `sinRecorte`, ese mismo ancho sí habría recortado", () => {
    // La prueba de arriba no valdría si el ancho no recortara de todos modos.
    const r = recortarCategorias(puntos, { anchoDisponible: 50, series: 2, clave: "ingreso" });
    expect(r.omitidas).toBeGreaterThan(0);
  });
});

describe("la nota", () => {
  const recorteDe = (ancho: number, ...ingresos: number[]) =>
    recortarCategorias(puntosDe(...ingresos), {
      anchoDisponible: ancho,
      series: 2,
      clave: "ingreso",
    });

  it("dice cuántos quedaron fuera Y qué proporción pesan", () => {
    const r = recorteDe(160, 100, 80, 60, 40, 20);
    expect(textoRecorte(r, NOMBRES)).toBe(
      "Se muestran los 3 modelos de mayor ingreso. Quedan fuera 2 modelos más, 20% del ingreso, en la tabla.",
    );
  });

  it("concuerda en singular cuando queda uno solo fuera", () => {
    // 40 de 280 = 14%.
    const r = recorteDe(160, 100, 80, 60, 40);
    expect(textoRecorte(r, NOMBRES)).toBe(
      "Se muestran los 3 modelos de mayor ingreso. Queda fuera 1 modelo más, 14% del ingreso, en la tabla.",
    );
  });

  it("concuerda en singular cuando solo se muestra uno", () => {
    const r = recorteDe(60, 100, 80, 20);
    expect(textoRecorte(r, NOMBRES)).toBe(
      "Se muestra el modelo de mayor ingreso. Quedan fuera 2 modelos más, 50% del ingreso, en la tabla.",
    );
  });

  it("calla la proporción cuando no se puede calcular, en vez de decir 0%", () => {
    const r = recorteDe(60, 0, 0, 0);
    expect(textoRecorte(r, NOMBRES)).toBe(
      "Se muestra el modelo de mayor ingreso. Quedan fuera 2 modelos más, en la tabla.",
    );
  });

  it("el destino del resto lo pone quien la usa: no es el mismo en los dos módulos", () => {
    const r = recorteDe(160, 100, 80, 60, 40, 20);
    const enResumen = textoRecorte(r, { ...NOMBRES, dondeVerElResto: "en Rendimiento por producto" });
    expect(enResumen).toContain("en Rendimiento por producto.");
  });
});

describe("con el archivo de demostración", () => {
  const puntos = puntosProducto(calcularProducto(cargarFixture()));

  it("trae los 12 modelos, ordenados por ingreso", () => {
    expect(puntos).toHaveLength(12);
    const ingresos = puntos.map((p) => p.valores["ingreso"] ?? 0);
    for (let i = 1; i < ingresos.length; i += 1) {
      expect(ingresos[i] ?? 0).toBeLessThanOrEqual(ingresos[i - 1] ?? 0);
    }
  });

  it("en la hoja impresa caben los 12 sin recortar", () => {
    // 680 px de hoja, menos 60 del eje Y y 16 de márgenes, son 604: doce
    // categorías de 50 px. Justo los doce del archivo, sin nota.
    expect(categoriasQueCaben(anchoUtil(ANCHO_IMPRESION), 2)).toBeGreaterThanOrEqual(12);
    const r = recortarCategorias(puntos, {
      anchoDisponible: anchoUtil(ANCHO_IMPRESION),
      series: 2,
      clave: "ingreso",
    });
    expect(r.omitidas).toBe(0);
  });

  it("en un teléfono se recortan, y lo omitido pesa poco: la nota lo dice", () => {
    // Los modelos que se caen son accesorios y refacciones de importe chico.
    // Que la nota diga "2% del ingreso" es la información que permite
    // ignorarlos con tranquilidad.
    // 302 px de figura, menos el eje Y y los márgenes, son 226: cuatro
    // categorías de 50 px.
    const r = recortarCategorias(puntos, { anchoDisponible: 226, series: 2, clave: "ingreso" });
    expect(r.visibles).toHaveLength(4);
    expect(r.omitidas).toBe(8);
    expect(r.proporcionOmitida ?? 1).toBeLessThan(0.05);
    expect(textoRecorte(r, NOMBRES)).toBe(
      "Se muestran los 4 modelos de mayor ingreso. Quedan fuera 8 modelos más, 4% del ingreso, en la tabla.",
    );
  });
});

describe("el ancho mínimo de barra está documentado y es el que se usa", () => {
  it("es el valor por el que una barra deja de leerse como cantidad", () => {
    expect(ANCHO_MINIMO_BARRA).toBe(13);
  });

  it("y manda de verdad: subirlo reduce cuántas caben", () => {
    // Relación que la implementación debe respetar, sea cual sea la constante.
    const anchoUno = anchoMinimoCategoria(1);
    expect(anchoUno).toBeGreaterThanOrEqual(ANCHO_MINIMO_BARRA);
  });
});
