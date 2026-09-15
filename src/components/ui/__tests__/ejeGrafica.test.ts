import { describe, expect, it } from "vitest";

import {
  AIRE_DIAGONAL,
  ALTO_EJE_HORIZONTAL,
  ALTO_EJE_MAXIMO,
  ALTO_MINIMO,
  ANGULO_GIRO,
  ANCHO_IMPRESION,
  type RotuloMedido,
  TAMANO_ROTULO_IMPRESION,
  TAMANO_ROTULO_PANTALLA,
  abreviar,
  altoEje,
  anchoUtil,
  rotuloEje,
} from "../ejeGrafica";
import { medirRotulos } from "../medirTexto";
import { anchoMinimoCategoria } from "../recorteCategorias";

/**
 * El orden de las medidas cuando el eje no cabe: bajar densidad, rotar,
 * abreviar, y superponer nunca. Y desde la 1.1.5, que cada paso se decide con el
 * LARGO MEDIDO de los rótulos, no solo con los píxeles por categoría.
 *
 * Estas pruebas reemplazan a las de la 1.1.4, que fijaban la regla vieja —rotar
 * a partir de cierto ancho, un alto fijo de 48 px— y con ello el defecto: a 1024
 * px los rótulos largos se encimaban y girados se cortaban.
 */

/** Anchos medidos en Chrome el 2026-09-14, con la tipografía de la aplicación. */
const CURSO_PANTALLA = 113.2; // «Curso piloto certificado» a 11 px
const CURSO_PAPEL = 92.6; // el mismo, a 9 px

/** Doce modelos como los del demo: once cortos y el más largo al final. */
const doceModelos = (largo: number): RotuloMedido[] => [
  ...Array.from({ length: 11 }, (_, i) => ({ texto: `AX-${i}0`, ancho: 30 })),
  { texto: "Curso piloto certificado", ancho: largo },
];

const categorias = (ancho: number, rotulos: readonly RotuloMedido[], tamanoLetra = TAMANO_ROTULO_PANTALLA) =>
  rotuloEje({ ancho, categorica: true, rotulos, tamanoLetra });

const meses = (ancho: number, cuantos: number) =>
  rotuloEje({
    ancho,
    categorica: false,
    tamanoLetra: TAMANO_ROTULO_PANTALLA,
    rotulos: Array.from({ length: cuantos }, (_, i) => ({ texto: `m${i}`, ancho: 20 })),
  });

describe("eje de tiempo", () => {
  it("con espacio de sobra pinta las marcas horizontales y sin recortar", () => {
    const r = meses(1200, 9);
    expect(r.angulo).toBe(0);
    expect(r.maximoCaracteres).toBeNull();
    expect(r.separacionMinima).toBe(8);
  });

  it("al apretarse EXIGE más separación, o sea pinta menos meses", () => {
    // La exigencia es MONÓTONA: a menos ancho nunca se pide menos separación.
    const anchos = [1200, 900, 600, 420, 360, 296, 200];
    const exigido = anchos.map((a) => meses(a, 9).separacionMinima);
    for (let i = 1; i < exigido.length; i += 1) {
      expect(exigido[i] ?? 0, `${anchos[i]}px`).toBeGreaterThanOrEqual(exigido[i - 1] ?? 0);
    }
    expect(exigido[exigido.length - 1] ?? 0).toBeGreaterThan(exigido[0] ?? 0);
  });

  it("nunca rota ni abrevia un mes: se quitan marcas, no se estropean", () => {
    for (const ancho of [1200, 600, 360, 200, 0]) {
      const r = meses(ancho, 12);
      expect(r.angulo, `${ancho}px`).toBe(0);
      expect(r.maximoCaracteres, `${ancho}px`).toBeNull();
    }
  });
});

describe("eje de categorías: la cascada se decide con el largo medido", () => {
  it("horizontal y completo cuando el rótulo más ancho cabe en su columna", () => {
    const r = categorias(1200, doceModelos(60).slice(-5));
    expect(r.angulo).toBe(0);
    expect(r.maximoCaracteres).toBeNull();
    expect(r.alto).toBe(ALTO_EJE_HORIZONTAL);
  });

  it("EL DEFECTO DE LA 1.1.4: con 73 px por modelo gira, porque el rótulo más largo mide 113", () => {
    // A 1024 px la figura mide 951: la regla vieja veía 73 px por modelo y dejaba
    // los rótulos horizontales; «Curso piloto certificado» se encimaba con sus vecinos.
    const r = categorias(951, doceModelos(CURSO_PANTALLA));
    expect(r.angulo).toBe(ANGULO_GIRO);
    expect(r.maximoCaracteres).toBeNull();
  });

  it("el alto sale del rótulo más largo, no de un valor fijo de 48 px", () => {
    // A 768 px (figura de 695) y en papel, la regla vieja reservaba 48 px y el
    // rótulo largo necesitaba 66 y 54: se cortaba por abajo.
    const pantalla = categorias(695, doceModelos(CURSO_PANTALLA));
    const papel = categorias(ANCHO_IMPRESION, doceModelos(CURSO_PAPEL), TAMANO_ROTULO_IMPRESION);
    expect(pantalla.alto).toBe(altoEje(ANGULO_GIRO, CURSO_PANTALLA, TAMANO_ROTULO_PANTALLA));
    expect(papel.alto).toBe(altoEje(ANGULO_GIRO, CURSO_PAPEL, TAMANO_ROTULO_IMPRESION));
    expect(pantalla.alto).toBeGreaterThan(48);
    expect(papel.alto).toBeGreaterThan(48);
    expect(pantalla.alto).toBeLessThanOrEqual(ALTO_EJE_MAXIMO);
    expect(papel.alto).toBeLessThanOrEqual(ALTO_EJE_MAXIMO);
  });

  it("un rótulo más largo pide más alto, nunca menos", () => {
    const altos = [40, 80, 100, 120].map((w) => altoEje(ANGULO_GIRO, w, TAMANO_ROTULO_PANTALLA));
    for (let i = 1; i < altos.length; i += 1) expect(altos[i] ?? 0).toBeGreaterThanOrEqual(altos[i - 1] ?? 0);
    expect(altoEje(0, 500, TAMANO_ROTULO_PANTALLA)).toBe(ALTO_EJE_HORIZONTAL);
  });

  it("solo abrevia cuando ni girado cabe en el alto máximo, y abreviado cabe", () => {
    const r = categorias(951, doceModelos(200));
    expect(r.angulo).toBe(ANGULO_GIRO);
    expect(r.maximoCaracteres).not.toBeNull();
    expect(r.alto).toBeLessThanOrEqual(ALTO_EJE_MAXIMO);
  });

  it("el primer rótulo girado no se sale a la izquierda del eje Y", () => {
    // Girado con `textAnchor="end"`, el rótulo crece hacia la izquierda desde su
    // marca. En primera posición solo tiene el eje Y y media categoría: el mismo
    // rótulo que al final cabe completo, al principio se abrevia.
    const largo = { texto: "Modelo de nombre largo X1", ancho: 110 };
    const cortos = Array.from({ length: 11 }, (_, i) => ({ texto: `AX-${i}0`, ancho: 30 }));
    expect(categorias(695, [...cortos, largo]).maximoCaracteres).toBeNull();
    expect(categorias(695, [largo, ...cortos]).maximoCaracteres).not.toBeNull();
  });

  it("a menos ancho nunca vuelve a horizontal ni abrevia menos", () => {
    const anchos = [1200, 951, 695, 500, 300, 150];
    const decisiones = anchos.map((a) => categorias(a, doceModelos(CURSO_PANTALLA)));
    for (let i = 1; i < decisiones.length; i += 1) {
      const antes = decisiones[i - 1];
      const ahora = decisiones[i];
      if (antes === undefined || ahora === undefined) continue;
      expect(Math.abs(ahora.angulo), `${anchos[i]}px`).toBeGreaterThanOrEqual(Math.abs(antes.angulo));
      expect(ahora.maximoCaracteres ?? Infinity, `${anchos[i]}px`).toBeLessThanOrEqual(
        antes.maximoCaracteres ?? Infinity,
      );
    }
  });

  it("SIEMPRE pinta todas las marcas, por apretado que esté", () => {
    for (const ancho of [1200, 600, 360, 200, 0]) {
      expect(categorias(ancho, doceModelos(CURSO_PANTALLA)).todasLasMarcas, `${ancho}px`).toBe(true);
    }
  });

  it("girados no se enciman en diagonal en la categoría más angosta que deja el recorte", () => {
    const giro = (Math.abs(ANGULO_GIRO) * Math.PI) / 180;
    // Cabe justo: 11 / sen(30°) + 2 = 24, el ancho de la categoría más angosta.
    // La tolerancia es solo para el redondeo de coma flotante del seno.
    expect(TAMANO_ROTULO_PANTALLA / Math.sin(giro) + AIRE_DIAGONAL).toBeLessThanOrEqual(
      anchoMinimoCategoria(1) + 1e-9,
    );
  });
});

describe("casos límite", () => {
  it("sin medir todavía (ancho 0) no se rompe ni supone espacio de sobra", () => {
    const r = categorias(0, doceModelos(CURSO_PANTALLA));
    expect(r.todasLasMarcas).toBe(true);
    expect(Number.isFinite(r.alto)).toBe(true);
    expect(r.angulo).not.toBe(0);
  });

  it("sin categorías no divide entre cero", () => {
    expect(() => categorias(500, [])).not.toThrow();
    expect(categorias(500, []).angulo).toBe(0);
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

  it("fuera del navegador, sin canvas, la medición estima por caracteres", () => {
    // En el navegador mide con canvas; esta rama solo existe para node.
    expect(medirRotulos(["abcd"], 10, "sans-serif")).toEqual([24]);
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
