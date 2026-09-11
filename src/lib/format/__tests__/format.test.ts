import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  SIN_DATO,
  dias,
  entero,
  fecha,
  fechaCorta,
  mes,
  moneda,
  monedaCompacta,
  nulo,
  porcentaje,
} from "../index";

describe("moneda", () => {
  it("convierte centavos a pesos con separador de miles", () => {
    expect(moneda(110_023_100)).toBe("$1,100,231");
    expect(moneda(549_880_000)).toBe("$5,498,800");
    expect(moneda(0)).toBe("$0");
  });

  it("muestra decimales solo si se piden", () => {
    expect(moneda(110_023_100, { decimales: true })).toBe("$1,100,231.00");
    expect(moneda(123_456, { decimales: true })).toBe("$1,234.56");
    expect(moneda(123_456)).toBe("$1,235");
  });

  it("usa parentesis para los negativos, convencion contable", () => {
    expect(moneda(-3_800_000)).toBe("($38,000)");
    expect(moneda(-123_456, { decimales: true })).toBe("($1,234.56)");
  });

  it("antepone + solo si se pide explicitamente", () => {
    expect(moneda(3_800_000, { signoExplicito: true })).toBe("+$38,000");
    expect(moneda(3_800_000)).toBe("$38,000");
  });

  it("pinta raya para null, nunca 0 ni vacio", () => {
    expect(moneda(null)).toBe(SIN_DATO);
    expect(moneda(null)).not.toBe("$0");
    expect(moneda(Number.NaN)).toBe(SIN_DATO);
    expect(moneda(Number.POSITIVE_INFINITY)).toBe(SIN_DATO);
  });

  it("distingue el cero real de la ausencia de dato", () => {
    expect(moneda(0)).toBe("$0");
    expect(moneda(null)).toBe(SIN_DATO);
  });
});

describe("monedaCompacta", () => {
  it("abrevia millones y miles", () => {
    expect(monedaCompacta(110_023_100)).toBe("$1.1M");
    expect(monedaCompacta(43_800_000)).toBe("$438k");
    expect(monedaCompacta(549_880_000)).toBe("$5.5M");
  });

  it("no abrevia por debajo de mil", () => {
    expect(monedaCompacta(38_000)).toBe("$380");
  });

  it("recorta el decimal cuando es cero", () => {
    expect(monedaCompacta(100_000_000)).toBe("$1M");
    expect(monedaCompacta(500_000)).toBe("$5k");
  });

  it("respeta negativos y null", () => {
    expect(monedaCompacta(-110_023_100)).toBe("($1.1M)");
    expect(monedaCompacta(null)).toBe(SIN_DATO);
  });
});

describe("porcentaje", () => {
  it("convierte el ratio con un decimal por omision", () => {
    expect(porcentaje(0.2)).toBe("20.0%");
    expect(porcentaje(3 / 14)).toBe("21.4%");
    expect(porcentaje(1)).toBe("100.0%");
  });

  it("acepta otra precision", () => {
    expect(porcentaje(0.2, 0)).toBe("20%");
    expect(porcentaje(0.2, 2)).toBe("20.00%");
  });

  it("distingue el cero de la ausencia", () => {
    expect(porcentaje(0)).toBe("0.0%");
    expect(porcentaje(null)).toBe(SIN_DATO);
  });
});

describe("fecha", () => {
  it("usa dd/mm/aaaa, el mismo formato de captura", () => {
    expect(fecha(new Date(Date.UTC(2026, 8, 9)))).toBe("09/09/2026");
    expect(fecha(new Date(Date.UTC(2026, 0, 31)))).toBe("31/01/2026");
  });

  it("no invierte dia y mes", () => {
    // 1 de marzo, no 3 de enero.
    expect(fecha(new Date(Date.UTC(2026, 2, 1)))).toBe("01/03/2026");
  });

  it("pinta raya para null y para fechas invalidas", () => {
    expect(fecha(null)).toBe(SIN_DATO);
    expect(fecha(new Date("no es fecha"))).toBe(SIN_DATO);
  });
});

describe("fechaCorta y mes", () => {
  it("abrevia a mes y anio", () => {
    expect(fechaCorta(new Date(Date.UTC(2026, 8, 9)))).toBe("sep 2026");
    expect(fechaCorta(new Date(Date.UTC(2026, 0, 1)))).toBe("ene 2026");
  });

  it("traduce las claves de mes del motor", () => {
    expect(mes("2026-01")).toBe("ene 2026");
    expect(mes("2026-12")).toBe("dic 2026");
  });

  it("nombra el grupo sin fecha en vez de dejarlo pasar como mes", () => {
    expect(mes("sin-fecha")).toBe("Sin fecha");
  });

  it("la clave y la fecha del mismo mes se leen identico, los doce meses", () => {
    for (let m = 0; m < 12; m += 1) {
      const clave = `2026-${String(m + 1).padStart(2, "0")}`;
      expect(mes(clave)).toBe(fechaCorta(new Date(Date.UTC(2026, m, 15))));
    }
  });

  it("una clave irreconocible se devuelve cruda, no como un mes inventado", () => {
    expect(mes("2026-13")).toBe("2026-13");
    expect(mes("julio")).toBe("julio");
  });
});

describe("ninguna cadena de mes se construye fuera de la capa de formato", () => {
  /**
   * Guardia de la regla: si alguien vuelve a declarar nombres de mes en otro
   * archivo, dos partes del reporte volveran a escribir el mismo mes distinto.
   * Busca literales que sean exactamente un nombre de mes, largo o corto.
   */
  const LITERAL_DE_MES =
    /["'`](enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)["'`]/i;

  function archivosFuente(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const ruta = join(dir, e.name);
      if (e.isDirectory()) return e.name === "__tests__" ? [] : archivosFuente(ruta);
      return /\.(ts|tsx)$/.test(e.name) ? [ruta] : [];
    });
  }

  it("solo src/lib/format declara nombres de mes", () => {
    const src = fileURLToPath(new URL("../../../", import.meta.url));
    const formato = join(src, "lib", "format");
    const infractores = archivosFuente(src)
      .filter((ruta) => !ruta.startsWith(formato))
      .filter((ruta) => LITERAL_DE_MES.test(readFileSync(ruta, "utf8")));
    expect(infractores).toEqual([]);
  });
});

describe("dias", () => {
  it("resuelve el singular", () => {
    expect(dias(204)).toBe("204 días");
    expect(dias(1)).toBe("1 día");
    expect(dias(0)).toBe("0 días");
  });

  it("distingue cero de ausencia", () => {
    expect(dias(0)).toBe("0 días");
    expect(dias(null)).toBe(SIN_DATO);
  });
});

describe("entero", () => {
  it("agrupa miles", () => {
    expect(entero(20)).toBe("20");
    expect(entero(1_234)).toBe("1,234");
    expect(entero(null)).toBe(SIN_DATO);
  });
});

describe("nulo", () => {
  it("respalda null, undefined y cadena vacia", () => {
    expect(nulo(null)).toBe(SIN_DATO);
    expect(nulo(undefined)).toBe(SIN_DATO);
    expect(nulo("   ")).toBe(SIN_DATO);
  });

  it("NO respalda el cero: cero es un dato", () => {
    expect(nulo(0)).toBe("0");
    expect(nulo(false)).toBe("false");
  });

  it("acepta un respaldo propio", () => {
    expect(nulo(null, "sin capturar")).toBe("sin capturar");
  });

  it("deja pasar el valor cuando existe", () => {
    expect(nulo("Rene Barraza")).toBe("Rene Barraza");
  });
});

describe("regla general: null nunca se pinta como 0, NaN ni vacio", () => {
  it("toda funcion de formato devuelve la raya ante null", () => {
    const salidas = [
      moneda(null),
      monedaCompacta(null),
      porcentaje(null),
      fecha(null),
      fechaCorta(null),
      dias(null),
      entero(null),
      nulo(null),
    ];
    for (const s of salidas) {
      expect(s).toBe(SIN_DATO);
      expect(s).not.toBe("");
      expect(s).not.toContain("NaN");
      expect(s).not.toContain("0");
    }
  });
});
