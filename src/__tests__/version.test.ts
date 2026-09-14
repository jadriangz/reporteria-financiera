import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ETIQUETA_VERSION, VERSION } from "../version";

/**
 * La version que se pinta en el pie de la pantalla y del PDF tiene que ser la
 * de `package.json`, siempre.
 *
 * Si se escribiera a mano en algun componente, tarde o temprano el PDF diria
 * una version y el repositorio otra, y el reporte dejaria de ser auditable
 * (GOBERNANZA.md, seccion 3). Esta prueba existe para que eso no pueda pasar
 * sin ponerse en rojo.
 */
const paquete = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8"),
) as { version: string };

describe("version de la aplicacion", () => {
  it("es exactamente la de package.json", () => {
    expect(VERSION).toBe(paquete.version);
  });

  it("hoy es la 1.1.1: parche del motor, sin cambio de definiciones", () => {
    // PARCHE y no MAYOR: el motor por fin excluye las filas Demo escritas «demo»
    // o «DEMO», como CLAUDE.md siempre especifico. Mueve las cifras de quien las
    // escribio asi, pero la definicion de calculo no cambio: el codigo la cumple
    // (GOBERNANZA.md §3; docs/decisiones.md, 2026-09-13). La 1.1.0 fue MENOR.
    expect(VERSION).toBe("1.1.1");
  });

  it("es un semver de tres numeros, sin sufijos", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("la etiqueta de los pies de pagina lleva la v delante", () => {
    expect(ETIQUETA_VERSION).toBe(`v${paquete.version}`);
  });
});
