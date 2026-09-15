import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { TemaResuelto } from "../index";
import {
  PARES,
  contraste,
  evaluarPares,
  luminancia,
  reglasDeCss,
  tokensDeBloque,
  tokensDeTema,
} from "../contraste";

/**
 * Contraste WCAG AA de los dos temas, medido sobre `src/index.css`.
 *
 * En un reporte financiero el color es información: rojo significa cartera en
 * riesgo. Si el rojo del tema oscuro no llega al contraste mínimo, deja de
 * leerse como alarma y el reporte comunica algo distinto de lo que calcula. Por
 * eso esto es una prueba y no una revisión visual.
 *
 * De paso escribe `docs/contraste.md`, que es la tabla que se entrega.
 */
const RAIZ = new URL("../../../../", import.meta.url);
const CSS = readFileSync(fileURLToPath(new URL("src/index.css", RAIZ)), "utf8");

const TEMAS: readonly TemaResuelto[] = ["claro", "oscuro"];

describe("fórmulas de la norma", () => {
  it("reproduce los casos extremos conocidos", () => {
    expect(contraste("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contraste("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    expect(luminancia("#FFFFFF")).toBeCloseTo(1, 5);
    expect(luminancia("#000000")).toBeCloseTo(0, 5);
  });

  it("es simétrica: el orden de los colores no cambia el ratio", () => {
    expect(contraste("#1F3864", "#FFFFFF")).toBeCloseTo(contraste("#FFFFFF", "#1F3864"), 9);
  });

  it("reproduce un valor verificable a mano: #767676 sobre blanco roza el 4.5", () => {
    expect(contraste("#767676", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(contraste("#777777", "#FFFFFF")).toBeLessThan(4.5);
  });
});

describe("los dos temas declaran los mismos tokens", () => {
  const tokens = tokensDeTema(CSS);

  it("ninguno se queda sin variante en el otro tema", () => {
    expect(Object.keys(tokens.oscuro).sort()).toEqual(Object.keys(tokens.claro).sort());
  });

  it("los tonos semánticos SÍ cambian de valor entre temas", () => {
    // Reusar el mismo hexadecimal es justo el error que esta sesión corrige:
    // #C0392B sobre fondo oscuro pierde contraste y deja de leerse como alarma.
    for (const token of ["riesgo", "advertencia", "positivo", "marino"]) {
      expect(tokens.oscuro[token], token).not.toBe(tokens.claro[token]);
    }
  });

  it("el fondo y el texto se invierten de verdad", () => {
    expect(luminancia(tokens.claro["papel"] ?? "")).toBeGreaterThan(0.8);
    expect(luminancia(tokens.oscuro["papel"] ?? "")).toBeLessThan(0.1);
    expect(luminancia(tokens.claro["tinta"] ?? "")).toBeLessThan(0.1);
    expect(luminancia(tokens.oscuro["tinta"] ?? "")).toBeGreaterThan(0.7);
  });

  it("el texto sobre color sólido se invierte con el tema", () => {
    // Blanco sobre un rojo aclarado no se lee: en oscuro la marca va en negro.
    expect(luminancia(tokens.claro["sobre-color"] ?? "")).toBeGreaterThan(0.8);
    expect(luminancia(tokens.oscuro["sobre-color"] ?? "")).toBeLessThan(0.1);
  });
});

describe("la impresión va en claro sin tener que ganarle al tema oscuro", () => {
  const reglas = reglasDeCss(CSS);

  it("el bloque de @media print es idéntico al de [data-tema=claro]", () => {
    // Los valores están escritos dos veces por una limitación de CSS (no hay
    // forma de reaplicar un bloque a otro selector). Esta prueba convierte esa
    // duplicación en un invariante verificado en vez de en una bomba de tiempo.
    const claro = tokensDeBloque(CSS, '[data-tema="claro"]');
    const impresion = tokensDeBloque(CSS, ":root,\n[data-tema]");
    expect(impresion).toEqual(claro);
  });

  it("el tema oscuro solo existe en pantalla", () => {
    // Antes esta sección solo exigía que `@media print` dijera
    // `color-scheme: light`, y pasaba mientras un estilo en línea le ganaba y
    // Chrome imprimía la hoja completa en oscuro. Lo que se fija ahora es la
    // estructura: en papel no hay ninguna regla oscura contra la que competir.
    const oscuras = reglas.filter((r) => r.selector.includes('data-tema="oscuro"'));
    expect(oscuras.length).toBeGreaterThan(0);
    for (const r of oscuras) expect(r.envolturas, r.selector).toEqual(["@media screen"]);
  });

  it("ningún color-scheme: dark vive fuera de @media screen", () => {
    const conOscuro = reglas.filter(
      (r) => !r.selector.startsWith("@") && /color-scheme\s*:\s*dark/.test(r.cuerpo),
    );
    expect(conOscuro.length).toBeGreaterThan(0);
    for (const r of conOscuro) expect(r.envolturas, r.selector).toContain("@media screen");
  });

  it("la impresión deja el esquema en claro y no menciona el tema oscuro", () => {
    const impresion = reglas.filter((r) => r.envolturas.includes("@media print"));
    expect(impresion.some((r) => /color-scheme\s*:\s*light/.test(r.cuerpo))).toBe(true);
    expect(impresion.filter((r) => r.selector.includes('data-tema="oscuro"'))).toEqual([]);
  });
});

describe("contraste WCAG AA", () => {
  const tokens = tokensDeTema(CSS);

  for (const tema of TEMAS) {
    describe(`tema ${tema}`, () => {
      const resultados = evaluarPares(tema, tokens[tema]);

      it("cada par de la interfaz llega a su umbral", () => {
        const fallan = resultados
          .filter((r) => !r.cumple)
          .map((r) => `${r.frente}/${r.fondo} = ${r.ratio} (mínimo ${r.minimo}) — ${r.descripcion}`);
        expect(fallan, `pares por debajo del umbral en tema ${tema}`).toEqual([]);
      });

      it("evalúa todos los pares declarados, sin saltarse ninguno", () => {
        expect(resultados).toHaveLength(PARES.length);
      });
    });
  }

  it("escribe docs/contraste.md con la tabla de los dos temas", () => {
    const lineas: string[] = [
      "# Contraste de los temas",
      "",
      "Generado por `src/lib/tema/__tests__/contraste.test.ts` a partir de los tokens",
      "de `src/index.css`. No se edita a mano: se regenera con `npm run test`.",
      "",
      "Umbrales WCAG 2.1 AA: **4.5:1** texto normal, **3:1** objetos gráficos.",
      "",
    ];
    for (const tema of TEMAS) {
      lineas.push(`## Tema ${tema}`, "");
      lineas.push("| Combinación | Texto | Fondo | Ratio | Mínimo | |");
      lineas.push("|---|---|---|---|---|---|");
      for (const r of evaluarPares(tema, tokens[tema])) {
        lineas.push(
          `| ${r.descripcion} | \`${r.frente}\` ${r.hexFrente} | \`${r.fondo}\` ${r.hexFondo} | ${r.ratio.toFixed(2)}:1 | ${r.minimo}:1 | ${r.cumple ? "✅" : "❌"} |`,
        );
      }
      lineas.push("");
    }
    lineas.push(
      "## Qué queda fuera, y por qué",
      "",
      "- **Bordes, separadores y rejilla de las gráficas** (`slate-200`, `slate-300`).",
      "  La 1.4.11 cubre los objetos gráficos necesarios para entender el contenido; la",
      "  rejilla no lo es —cada eje va rotulado y el tooltip da la cifra exacta— y un",
      "  borde estructural tampoco. Exigirles 3:1 obligaría a bordes casi negros.",
      "- **`slate-400` como texto.** Solo se usa en marcas decorativas (`aria-hidden`) y",
      "  en controles deshabilitados, que la 1.4.3 exceptúa. Todo texto tenue con",
      "  significado usa `slate-500`, que sí se verifica.",
      "",
    );
    writeFileSync(fileURLToPath(new URL("docs/contraste.md", RAIZ)), lineas.join("\n"), "utf8");
    expect(lineas.length).toBeGreaterThan(20);
  });
});
