import { describe, expect, it } from "vitest";

import { SIN_FECHA } from "../../../lib/calc";
import { ejeContinuo, fechaDeMes, mesesFechados } from "../ejeMensual";

describe("fecha de un mes", () => {
  it("devuelve el primer dia del mes en UTC", () => {
    expect(fechaDeMes("2026-07")?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("el grupo sin fecha no se convierte en ninguna fecha", () => {
    expect(fechaDeMes(SIN_FECHA)).toBeNull();
  });

  it("rechaza claves que no son meses", () => {
    expect(fechaDeMes("2026-13")).toBeNull();
    expect(fechaDeMes("julio")).toBeNull();
  });
});

describe("eje continuo", () => {
  it("rellena los meses sin actividad entre el primero y el ultimo", () => {
    expect(ejeContinuo(["2026-01", "2026-04"])).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
  });

  it("ordena aunque las claves lleguen desordenadas", () => {
    expect(ejeContinuo(["2026-03", "2026-01"])).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("cruza el cambio de año", () => {
    expect(ejeContinuo(["2025-11", "2026-02"])).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("pone el grupo sin fecha al final, una sola vez", () => {
    expect(ejeContinuo([SIN_FECHA, "2026-02", "2026-01"])).toEqual(["2026-01", "2026-02", SIN_FECHA]);
  });

  it("solo sin fecha, o nada, no inventa meses", () => {
    expect(ejeContinuo([SIN_FECHA])).toEqual([SIN_FECHA]);
    expect(ejeContinuo([])).toEqual([]);
  });

  it("cuenta como meses solo los fechados", () => {
    expect(mesesFechados(["2026-01", "2026-02", SIN_FECHA])).toBe(2);
  });
});
