import { describe, expect, it } from "vitest";

import type { SaldoPartida } from "../../../lib/calc";
import { partidaPrincipal, rotuloDeFolio, sufijoOtras } from "../rotuloFolio";

function partida(p: Partial<SaldoPartida>): SaldoPartida {
  return {
    linea: "Equipo",
    modelo: "AX-55",
    fecha: null,
    precioVenta: 26_500_000,
    aplicado: 0,
    saldo: 26_500_000,
    dias: null,
    base: "sin-fecha",
    bucket: "sin-fecha",
    ...p,
  };
}

const EQUIPO = partida({});
const BATERIA = partida({ linea: "Accesorios", modelo: "Bateria BX-30", precioVenta: 1_150_000 });
const CARGADOR = partida({ linea: "Accesorios", modelo: "Cargador", precioVenta: 590_000 });

describe("rotulo de un folio", () => {
  it("con una partida, su linea y su modelo a secas", () => {
    expect(rotuloDeFolio([BATERIA])).toEqual({ linea: "Accesorios", modelo: "Bateria BX-30", otras: 0 });
  });

  it("con varias, la de mayor precio, y DICE cuantas mas trae", () => {
    // Un «AX-55» a secas en un folio de tres partidas afirmaria que la venta fue solo eso.
    expect(rotuloDeFolio([EQUIPO, BATERIA])).toEqual({ linea: `Equipo${sufijoOtras(1)}`, modelo: `AX-55${sufijoOtras(1)}`, otras: 1 });
    expect(rotuloDeFolio([EQUIPO, BATERIA, CARGADOR]).modelo).toBe(`AX-55${sufijoOtras(2)}`);
  });

  it("no depende del orden de las filas: el accesorio puede ir primero en el archivo", () => {
    expect(rotuloDeFolio([BATERIA, CARGADOR, EQUIPO]).modelo).toBe(`AX-55${sufijoOtras(2)}`);
    expect(partidaPrincipal([BATERIA, EQUIPO])).toBe(EQUIPO);
  });

  it("en un empate de precio manda la primera del archivo, para que el rotulo no cambie entre corridas", () => {
    const otro = partida({ modelo: "AX-70" });
    expect(rotuloDeFolio([EQUIPO, otro]).modelo).toBe(`AX-55${sufijoOtras(1)}`);
    expect(rotuloDeFolio([otro, EQUIPO]).modelo).toBe(`AX-70${sufijoOtras(1)}`);
  });

  it("no mide por lo pendiente: un equipo ya pagado sigue nombrando la venta", () => {
    const pagado = partida({ aplicado: 26_500_000, saldo: 0 });
    expect(rotuloDeFolio([pagado, BATERIA]).modelo).toBe(`AX-55${sufijoOtras(1)}`);
  });

  it("sin partidas no inventa nada", () => {
    expect(rotuloDeFolio([])).toEqual({ linea: null, modelo: null, otras: 0 });
  });
});

describe("el aviso de que hay mas partidas no se parte", () => {
  it("lleva espacios duros: solo se puede partir antes del signo", () => {
    expect(sufijoOtras(1)).toBe(" + 1 más");
    expect(sufijoOtras(0)).toBe("");
    // Un solo espacio normal en todo el rotulo de un modelo de una palabra.
    expect(rotuloDeFolio([EQUIPO, BATERIA]).modelo?.split(" ")).toHaveLength(2);
  });
});
