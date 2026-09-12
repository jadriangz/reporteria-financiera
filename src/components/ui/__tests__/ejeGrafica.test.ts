import { describe, expect, it } from "vitest";

import { ALTO_MINIMO, abreviar, anchoUtil, rotuloEje } from "../ejeGrafica";

/**
 * El orden de las medidas cuando el eje no cabe: bajar densidad, rotar,
 * abreviar, y superponer nunca. Estas pruebas fijan ese orden, que es lo que
 * distingue una gráfica apretada de una gráfica rota.
 */

const eje = (ancho: number, categorias: number, categorica: boolean) =>
  rotuloEje({ ancho, categorias, categorica });

describe("eje de tiempo", () => {
  it("con espacio de sobra pinta las marcas horizontales y sin recortar", () => {
    const r = eje(1200, 9, false);
    expect(r.angulo).toBe(0);
    expect(r.maximoCaracteres).toBeNull();
    expect(r.separacionMinima).toBe(8);
  });

  it("al apretarse EXIGE más separación, o sea pinta menos meses", () => {
    // Saltarse un mes no pierde información: el eje es continuo y el lector
    // interpola. Es la primera medida, antes de tocar el texto.
    //
    // La exigencia es MONÓTONA, no estrictamente creciente en cada paso: entre
    // 1200 y 600 px nueve meses siguen cabiendo holgados y no hay nada que
    // apretar todavía. Lo que no puede pasar es que a menos ancho se pida
    // menos separación.
    const anchos = [1200, 900, 600, 420, 360, 296, 200];
    const exigido = anchos.map((a) => eje(a, 9, false).separacionMinima);
    for (let i = 1; i < exigido.length; i += 1) {
      expect(exigido[i] ?? 0, `${anchos[i]}px`).toBeGreaterThanOrEqual(exigido[i - 1] ?? 0);
    }
    expect(exigido[exigido.length - 1] ?? 0).toBeGreaterThan(exigido[0] ?? 0);
  });

  it("nunca rota ni abrevia un mes: se quitan marcas, no se estropean", () => {
    for (const ancho of [1200, 600, 360, 200, 0]) {
      const r = eje(ancho, 12, false);
      expect(r.angulo, `${ancho}px`).toBe(0);
      expect(r.maximoCaracteres, `${ancho}px`).toBeNull();
    }
  });
});

describe("eje de categorías", () => {
  it("con espacio de sobra, horizontal y completo", () => {
    const r = eje(1200, 5, true);
    expect(r.angulo).toBe(0);
    expect(r.maximoCaracteres).toBeNull();
    expect(r.todasLasMarcas).toBe(true);
  });

  it("SIEMPRE pinta todas las marcas, por apretado que esté", () => {
    // Saltarse un modelo deja una barra sin nombre, y una barra sin nombre no
    // se puede leer. Aquí no se baja la densidad: se ajusta el texto.
    for (const ancho of [1200, 600, 360, 200, 0]) {
      expect(eje(ancho, 12, true).todasLasMarcas, `${ancho}px`).toBe(true);
    }
  });

  it("cuando el texto horizontal ya no cabe, rota antes que recortar", () => {
    const r = eje(700, 12, true);
    expect(r.angulo).toBeLessThan(0);
    expect(r.maximoCaracteres).toBeNull();
  });

  it("y solo cuando ni rotado alcanza, abrevia", () => {
    const apretado = eje(296, 12, true);
    expect(apretado.angulo).toBeLessThan(0);
    expect(apretado.maximoCaracteres).not.toBeNull();
    expect(apretado.maximoCaracteres ?? 99).toBeLessThanOrEqual(12);
  });

  it("cuanto menos espacio, más corto el recorte: la escalera no retrocede", () => {
    const anchos = [900, 700, 500, 360, 250];
    const cortes = anchos.map((a) => eje(a, 12, true).maximoCaracteres ?? Infinity);
    for (let i = 1; i < cortes.length; i += 1) {
      expect(cortes[i] ?? 0, `${anchos[i]}px`).toBeLessThanOrEqual(cortes[i - 1] ?? 0);
    }
  });

  it("rotado reserva más alto para las etiquetas", () => {
    expect(eje(296, 12, true).alto).toBeGreaterThan(eje(1200, 3, true).alto);
  });
});

describe("casos límite", () => {
  it("sin medir todavía (ancho 0) no se rompe ni supone espacio de sobra", () => {
    const r = eje(0, 10, true);
    expect(r.todasLasMarcas).toBe(true);
    expect(Number.isFinite(r.alto)).toBe(true);
  });

  it("sin categorías no divide entre cero", () => {
    expect(() => eje(500, 0, true)).not.toThrow();
    expect(eje(500, 0, true).angulo).toBe(0);
  });

  it("el ancho útil nunca es negativo aunque el eje Y no quepa", () => {
    // Se descuentan el eje Y (60) y los márgenes del dibujo (16).
    expect(anchoUtil(0)).toBe(0);
    expect(anchoUtil(30)).toBe(0);
    expect(anchoUtil(200)).toBe(124);
  });

  it("hay un alto mínimo por debajo del cual la gráfica deja de comunicar", () => {
    expect(ALTO_MINIMO).toBeGreaterThanOrEqual(160);
  });
});

describe("abreviar", () => {
  it("sin límite devuelve el texto tal cual", () => {
    expect(abreviar("Curso piloto certificado", null)).toBe("Curso piloto certificado");
  });

  it("no toca lo que ya cabe", () => {
    expect(abreviar("AX-100", 8)).toBe("AX-100");
  });

  it("conserva el principio, que es lo que distingue una categoría de otra", () => {
    expect(abreviar("Curso piloto certificado", 8)).toBe("Curso p…");
    expect(abreviar("Bomba de aspersion", 8)).toBe("Bomba d…");
  });

  it("nunca devuelve algo más largo que el límite, ni con límites absurdos", () => {
    for (const max of [1, 2, 5, 8, 12]) {
      expect(abreviar("Cargador rapido 80W", max).length, `max ${max}`).toBeLessThanOrEqual(max);
    }
  });

  it("no deja un espacio colgando antes de los puntos suspensivos", () => {
    expect(abreviar("Antena RTK larga", 8)).toBe("Antena…");
  });
});
