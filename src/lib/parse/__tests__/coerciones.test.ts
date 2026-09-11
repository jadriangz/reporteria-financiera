import { describe, expect, it } from "vitest";

import { norm, parseBool, parseFecha, parseMonto, parseNumero, parsePct } from "../../schema";

describe("parseMonto", () => {
  it("interpreta el formato europeo: punto de miles, coma decimal", () => {
    expect(parseMonto("$ 444.800,00")).toBe(44480000);
  });

  it("devuelve centavos como entero, nunca flotante", () => {
    expect(parseMonto(444800)).toBe(44480000);
    expect(Number.isInteger(parseMonto("1.234,56"))).toBe(true);
    expect(parseMonto("1.234,56")).toBe(123456);
  });

  it("trata la basura conocida como celda vacia", () => {
    expect(parseMonto("N/a")).toBeNull();
    expect(parseMonto("N/A")).toBeNull();
    expect(parseMonto(" $ -   ")).toBeNull();
    expect(parseMonto("-")).toBeNull();
    expect(parseMonto("")).toBeNull();
    expect(parseMonto(null)).toBeNull();
  });
});

describe("parseFecha", () => {
  it("lee dd/mm/aaaa y NO lo confunde con mm/dd", () => {
    const d = parseFecha("31/1/2026");
    expect(d).not.toBeNull();
    // 31 de enero. Si se hubiera interpretado como mm/dd seria 1 de marzo.
    expect(d?.getUTCDate()).toBe(31);
    expect(d?.getUTCMonth()).toBe(0);
    expect(d?.getUTCFullYear()).toBe(2026);
  });

  it("lee el serial de Excel con base 1899-12-30", () => {
    const d = parseFecha(46023);
    expect(d).not.toBeNull();
    expect(d?.toISOString().slice(0, 10)).toBe("2026-01-01");
  });

  it("rechaza fechas imposibles en vez de desbordarlas al mes siguiente", () => {
    expect(parseFecha("31/02/2026")).toBeNull();
  });

  it("trata la basura como celda vacia", () => {
    expect(parseFecha("N/a")).toBeNull();
    expect(parseFecha("")).toBeNull();
    expect(parseFecha(null)).toBeNull();
    expect(parseFecha("manana")).toBeNull();
  });
});

describe("parsePct", () => {
  it("acepta texto con coma decimal, entero y fraccion", () => {
    expect(parsePct("20,00%")).toBe(0.2);
    expect(parsePct(20)).toBe(0.2);
    expect(parsePct(0.2)).toBe(0.2);
    expect(parsePct("20%")).toBe(0.2);
  });

  it("trata la basura como celda vacia", () => {
    expect(parsePct("N/a")).toBeNull();
    expect(parsePct(null)).toBeNull();
  });
});

describe("norm", () => {
  it("recorta, colapsa espacios y sube a mayusculas para agrupar", () => {
    expect(norm("  t70p ")).toBe("T70P");
    expect(norm("T70P")).toBe("T70P");
    expect(norm("  rene   barraza ")).toBe("RENE BARRAZA");
  });
});

describe("parseBool", () => {
  it("lee el SI/NO de la hoja parametros", () => {
    expect(parseBool("SI")).toBe(true);
    expect(parseBool("Si")).toBe(true);
    expect(parseBool("NO")).toBe(false);
    expect(parseBool(true)).toBe(true);
  });

  it("devuelve null cuando el cliente no contesto", () => {
    expect(parseBool(null)).toBeNull();
    expect(parseBool("")).toBeNull();
    expect(parseBool("N/a")).toBeNull();
  });
});

describe("parseNumero", () => {
  it("no convierte a centavos ni divide entre 100", () => {
    expect(parseNumero(0.16)).toBe(0.16);
    expect(parseNumero(0.5)).toBe(0.5);
    // El caso que descarta usar parsePct aqui: un tipo de cambio no es un %.
    expect(parseNumero(17.5)).toBe(17.5);
    expect(parseNumero(90)).toBe(90);
  });

  it("acepta coma decimal y trata la basura como vacio", () => {
    expect(parseNumero("0,25")).toBe(0.25);
    expect(parseNumero("N/a")).toBeNull();
    expect(parseNumero(null)).toBeNull();
  });
});
