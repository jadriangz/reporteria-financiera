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

  it("hoy es la 1.2.0: el folio agrupa partidas, y ningun archivo de un folio por fila cambia una cifra", () => {
    // MENOR (GOBERNANZA.md §3): quitar la unicidad del folio es relajar una
    // restriccion del contrato. `operaciones` y `ticket_promedio` pasan a contar
    // folios, pero con un folio por fila —todo archivo que cargaba sin error— dan
    // lo mismo. Solo cambian los archivos con folios repetidos, que se calculaban
    // mal. La anterior, 1.1.5, fue un parche de presentacion.
    expect(VERSION).toBe("1.2.0");
  });

  it("es un semver de tres numeros, sin sufijos", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("la etiqueta de los pies de pagina lleva la v delante", () => {
    expect(ETIQUETA_VERSION).toBe(`v${paquete.version}`);
  });
});
