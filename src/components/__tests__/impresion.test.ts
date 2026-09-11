import { describe, expect, it } from "vitest";

import type { Capacidades } from "../../lib/schema";
import { ORDEN_REPORTE, nombreArchivoReporte, planImpresion } from "../impresion";

const TODO: Capacidades = {
  resumen: true,
  estadoResultados: true,
  flujo: true,
  cobranza: true,
  producto: true,
  clientes: true,
};

const utc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));

describe("que se imprime", () => {
  it("el reporte completo lleva los seis modulos en el orden pedido", () => {
    expect(planImpresion("completo", "clientes", TODO).imprimir).toEqual([
      "resumen",
      "resultados",
      "cobranza",
      "flujo",
      "producto",
      "clientes",
    ]);
    expect(ORDEN_REPORTE).toHaveLength(6);
  });

  it("los deshabilitados no se imprimen, pero se listan con lo que falta capturar", () => {
    // Un archivo sin fechas de pago: Ventas y flujo no se habilita.
    const plan = planImpresion("completo", "resumen", { ...TODO, flujo: false });
    expect(plan.imprimir).not.toContain("flujo");
    expect(plan.omitidos).toEqual([
      {
        id: "flujo",
        titulo: "Ventas y flujo",
        motivo: "Requiere la hoja cobranza con fecha_pago capturada",
      },
    ]);
  });

  it("el modulo actual imprime exactamente la vista abierta, sin omitidos", () => {
    expect(planImpresion("actual", "cobranza", TODO)).toEqual({ imprimir: ["cobranza"], omitidos: [] });
    // Aunque este deshabilitado: se imprime el aviso que el usuario esta viendo.
    expect(planImpresion("actual", "flujo", { ...TODO, flujo: false }).imprimir).toEqual(["flujo"]);
  });

  it("sin nada habilitado mas que ventas, lista los tres que faltan", () => {
    const soloVentas: Capacidades = { ...TODO, estadoResultados: false, flujo: false, cobranza: false };
    const plan = planImpresion("completo", "resumen", soloVentas);
    expect(plan.imprimir).toEqual(["resumen", "producto", "clientes"]);
    expect(plan.omitidos.map((o) => o.id)).toEqual(["resultados", "cobranza", "flujo"]);
  });
});

describe("nombre sugerido del archivo", () => {
  it("es Reporte_<periodo>_<corte>, con fechas que se ordenan solas", () => {
    const periodo = { inicio: utc(2026, 1, 1), fin: utc(2026, 12, 31), origen: "parametros" as const };
    expect(nombreArchivoReporte(periodo, utc(2026, 9, 9))).toBe("Reporte_2026-01-01-a-2026-12-31_2026-09-09");
  });

  it("no lleva la extension: el dialogo de guardar agrega .pdf", () => {
    expect(nombreArchivoReporte(null, utc(2026, 9, 9))).not.toMatch(/\.pdf$/);
  });

  it("sin periodo lo dice en el nombre, no deja un hueco", () => {
    expect(nombreArchivoReporte(null, utc(2026, 9, 9))).toBe("Reporte_sin-periodo_2026-09-09");
  });

  it("no lleva caracteres que un sistema de archivos rechace", () => {
    const periodo = { inicio: utc(2026, 1, 1), fin: utc(2026, 12, 31), origen: "ventas" as const };
    expect(nombreArchivoReporte(periodo, utc(2026, 9, 9))).toMatch(/^[\w-]+$/);
  });
});
