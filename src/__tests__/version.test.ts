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

  it("hoy es la 1.1.0: interfaz, sin cambios de contrato ni de cifras", () => {
    // MENOR y no PARCHE porque v1.1 agrega capacidades compatibles hacia atras
    // —temas, layout responsivo—; MENOR y no MAYOR porque ninguna definicion de
    // calculo cambio y ninguna cifra reportada se mueve (GOBERNANZA.md §3).
    expect(VERSION).toBe("1.1.0");
  });

  it("es un semver de tres numeros, sin sufijos", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("la etiqueta de los pies de pagina lleva la v delante", () => {
    expect(ETIQUETA_VERSION).toBe(`v${paquete.version}`);
  });
});
