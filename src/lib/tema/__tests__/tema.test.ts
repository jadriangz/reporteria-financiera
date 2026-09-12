import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PREFERENCIAS } from "../../preferencias";
import {
  ATRIBUTO_TEMA,
  CLAVE_TEMA,
  CONSULTA_OSCURO,
  ETIQUETA_TEMA,
  TEMAS,
  TEMA_IMPRESION,
  type Tema,
  atributosTema,
  prefiereOscuroSistema,
  resolverTema,
} from "../index";
import { PALETA_VAR, TOKENS_GRAFICA, paletaDelElemento, resolverPaleta } from "../paleta";

describe("resolver la preferencia", () => {
  it("un tema fijo se resuelve a sí mismo, diga lo que diga el sistema", () => {
    expect(resolverTema("claro", true)).toBe("claro");
    expect(resolverTema("claro", false)).toBe("claro");
    expect(resolverTema("oscuro", false)).toBe("oscuro");
    expect(resolverTema("oscuro", true)).toBe("oscuro");
  });

  it("«sistema» sigue al sistema", () => {
    expect(resolverTema("sistema", true)).toBe("oscuro");
    expect(resolverTema("sistema", false)).toBe("claro");
  });

  it("nunca devuelve «sistema»: lo que se pinta siempre es un color", () => {
    for (const t of TEMAS) {
      for (const prefiere of [true, false]) {
        expect(resolverTema(t, prefiere)).not.toBe("sistema");
      }
    }
  });

  it("son tres estados, y los tres tienen nombre en la interfaz", () => {
    expect(TEMAS).toEqual(["claro", "oscuro", "sistema"]);
    expect(TEMAS).toEqual(PREFERENCIAS.tema.valores);
    for (const t of TEMAS) expect(ETIQUETA_TEMA[t as Tema]).toBeTruthy();
  });

  it("sin matchMedia no supone oscuro: se queda en claro", () => {
    // En node no hay `window`. Suponer oscuro dejaría un reporte negro en
    // cualquier entorno que no sepa contestar.
    expect(prefiereOscuroSistema()).toBe(false);
  });
});

describe("la impresión", () => {
  it("siempre va en claro", () => {
    expect(TEMA_IMPRESION).toBe("claro");
    expect(atributosTema(TEMA_IMPRESION)).toEqual({ "data-tema": "claro" });
  });

  it("el atributo que fija el tema es el que observa el CSS", () => {
    const css = readFileSync(
      fileURLToPath(new URL("../../../index.css", import.meta.url)),
      "utf8",
    );
    expect(ATRIBUTO_TEMA).toBe("data-tema");
    expect(css).toContain(`[${ATRIBUTO_TEMA}="claro"]`);
    expect(css).toContain(`[${ATRIBUTO_TEMA}="oscuro"]`);
  });
});

/**
 * El script en línea de `index.html` es una copia a mano de esta lógica: no
 * puede importar nada porque corre antes que el bundle. Estas pruebas son lo
 * que impide que la copia se quede atrás si aquí se renombra algo.
 */
describe("el script que evita el destello de tema", () => {
  const html = readFileSync(
    fileURLToPath(new URL("../../../../index.html", import.meta.url)),
    "utf8",
  );
  const script = html.slice(html.indexOf("<script>"), html.indexOf("</script>"));

  it("existe y corre en el <head>, antes del módulo de la aplicación", () => {
    expect(script).toBeTruthy();
    expect(html.indexOf("<script>")).toBeLessThan(html.indexOf('type="module"'));
    // Contra `</head>` y no contra `<body>`: el comentario del propio script
    // menciona el body, y `indexOf` encontraría esa prosa antes que la etiqueta.
    expect(html.indexOf("<script>")).toBeLessThan(html.indexOf("</head>"));
  });

  it("usa exactamente la clave, el atributo y la consulta del módulo", () => {
    expect(script).toContain(`"${CLAVE_TEMA}"`);
    expect(script).toContain(`"${ATRIBUTO_TEMA}"`);
    expect(script).toContain(`"${CONSULTA_OSCURO}"`);
  });

  it("solo acepta los temas fijos y delega el resto al sistema", () => {
    expect(script).toContain('"claro"');
    expect(script).toContain('"oscuro"');
    // "sistema" no es un color: el script lo trata como «no hay preferencia».
    expect(script).not.toContain('=== "sistema"');
  });

  it("va envuelto en try/catch: el almacenamiento lanza en ventana privada", () => {
    expect(script).toContain("try");
    expect(script).toContain("catch");
  });

  it("también fija color-scheme, para los controles nativos", () => {
    expect(script).toContain("colorScheme");
  });
});

describe("la paleta de las gráficas", () => {
  it("declara un token para cada parte con color: series, ejes, rejilla, rótulos y cursor", () => {
    expect(Object.keys(TOKENS_GRAFICA).sort()).toEqual([
      "advertencia",
      "cursor",
      "eje",
      "marino",
      "positivo",
      "rejilla",
      "riesgo",
      "rotulo",
      "tenue",
    ]);
  });

  it("resuelve cada token con lo que le da el lector", () => {
    const resuelta = resolverPaleta((variable) =>
      variable === "--color-marino" ? "#8FB3E0" : "#123456",
    );
    expect(resuelta.marino).toBe("#8FB3E0");
    expect(resuelta.rejilla).toBe("#123456");
  });

  it("recorta los espacios que devuelve getComputedStyle", () => {
    expect(resolverPaleta(() => "  #1F3864 ").eje).toBe("#1F3864");
  });

  it("un token que no se puede leer conserva su var(): la gráfica no se queda sin color", () => {
    expect(resolverPaleta(() => "")).toEqual(PALETA_VAR);
    expect(resolverPaleta(() => null)).toEqual(PALETA_VAR);
    expect(resolverPaleta(() => undefined)).toEqual(PALETA_VAR);
  });

  it("sin elemento ni getComputedStyle devuelve la paleta sin resolver", () => {
    expect(paletaDelElemento(null)).toEqual(PALETA_VAR);
  });

  it("los dos temas dan paletas DISTINTAS: es lo que hace que la gráfica cambie", () => {
    const claro = resolverPaleta((v) => (v === "--color-marino" ? "#1F3864" : "#CBD5E1"));
    const oscuro = resolverPaleta((v) => (v === "--color-marino" ? "#8FB3E0" : "#3A4860"));
    expect(oscuro.marino).not.toBe(claro.marino);
    expect(oscuro.eje).not.toBe(claro.eje);
    expect(oscuro.rejilla).not.toBe(claro.rejilla);
    expect(oscuro.rotulo).not.toBe(claro.rotulo);
  });
});
