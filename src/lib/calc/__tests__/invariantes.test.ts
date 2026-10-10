import { describe, expect, it } from "vitest";

import { type Cobranza, type Dataset, LINEA, ParametrosSchema, type Venta } from "../../schema";
import { contarFolios, particionarVentas } from "../base";
import { calcularCartera } from "../cobranza";
import { calcularClientes } from "../clientes";
import { calcularFlujo } from "../flujo";
import { calcularInsights } from "../insights";
import { calcularProducto } from "../producto";
import { calcularResultados } from "../resultados";
import { calcularVenta } from "../venta";
import { CORTE, cargarFixture, rutasInvalidas } from "./fixture";

/**
 * Invariantes del motor, como PROPIEDADES.
 *
 * Las pruebas contra el archivo de demostracion dicen que el motor acierta en
 * un archivo. Estas dicen que ciertas igualdades se cumplen en cualquiera: se
 * generan cientos de datasets —folios de una a cuatro partidas, entregas en
 * fechas distintas o sin fecha, partidas Demo y sin precio, sobrecobros, notas
 * de credito, abonos a folios que no existen— y en todos se exige lo mismo.
 *
 * El generador es determinista: una semilla produce siempre el mismo dataset,
 * asi que un fallo se reproduce con su numero de semilla.
 */

/** Generador congruencial: suficiente para variar casos, y reproducible. */
function generador(semilla: number): () => number {
  let estado = semilla >>> 0 || 1;
  return () => {
    estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0;
    return estado / 0x1_0000_0000;
  };
}

const CLIENTES = ["Cliente Uno", "Cliente Dos", "Cliente Tres", "Cliente Cuatro"] as const;
const MODELOS = ["Modelo A", "Modelo B", "Modelo C", "Modelo D", "Modelo E"] as const;
const BASES = ["Venta", "Utilidad", "No aplica", null] as const;

function datasetAleatorio(semilla: number): Dataset {
  const azar = generador(semilla);
  const entero = (min: number, max: number): number => min + Math.floor(azar() * (max - min + 1));
  const uno = <T,>(opciones: readonly T[]): T => opciones[entero(0, opciones.length - 1)] as T;
  const fecha = (): Date | null => (azar() < 0.12 ? null : new Date(Date.UTC(2025, entero(6, 20), entero(1, 28))));

  const ventas: Venta[] = [];
  const cobranza: Cobranza[] = [];
  const folios = entero(1, 14);

  for (let f = 1; f <= folios; f += 1) {
    const folio = `V-${f}`;
    // La cabecera es del folio: llega resuelta, igual en todas sus partidas.
    const cliente = uno(CLIENTES);
    const dias_credito = azar() < 0.5 ? null : uno([0, 30, 60, 90]);
    const partidas = entero(1, 4);
    let precioFolio = 0;

    for (let p = 0; p < partidas; p += 1) {
      const precio = azar() < 0.08 ? null : entero(1, 600) * 100_000;
      const costo = azar() < 0.05 ? null : entero(0, 500) * 100_000;
      const linea = uno(LINEA);
      if (precio !== null && linea !== "Demo") precioFolio += precio;
      ventas.push({
        folio,
        fecha: fecha(),
        linea,
        cliente,
        modelo: uno(MODELOS),
        serie: null,
        costo_unitario: costo,
        precio_venta: precio,
        comision_pct: azar() < 0.4 ? null : entero(0, 15) / 100,
        comision_base: uno(BASES),
        dias_credito,
        condicion: "Credito",
        vendedor: null,
        notas: null,
      });
    }

    // Abonos: ninguno, parciales, exactos, de mas, y alguna nota de credito.
    const abonos = entero(0, 3);
    for (let a = 0; a < abonos; a += 1) {
      const tope = Math.max(precioFolio, 100_000);
      const monto = azar() < 0.07 ? -entero(1, 20) * 10_000 : Math.round(tope * azar() * 0.7);
      cobranza.push({
        folio_pago: `P-${f}-${a}`,
        folio_venta: folio,
        fecha_pago: fecha(),
        monto: azar() < 0.04 ? null : monto,
        metodo: "Transferencia",
        cliente_ref: null,
        notas: null,
      });
    }
  }

  // Un abono a un folio que no existe: no debe aplicarse a nada.
  if (azar() < 0.3) {
    cobranza.push({
      folio_pago: "P-X",
      folio_venta: "V-999",
      fecha_pago: fecha(),
      monto: 12_345_600,
      metodo: null,
      cliente_ref: null,
      notas: null,
    });
  }

  return { ventas, cobranza, gastos: [], parametros: ParametrosSchema.parse({}) };
}

const SEMILLAS = Array.from({ length: 400 }, (_, i) => i + 1);

/** Corre la comprobacion en todos los datasets y junta las semillas que la violan. */
function enTodos(comprobar: (d: Dataset) => string | null): string[] {
  const fallos: string[] = [];
  for (const semilla of SEMILLAS) {
    const motivo = comprobar(datasetAleatorio(semilla));
    if (motivo !== null) fallos.push(`semilla ${semilla}: ${motivo}`);
  }
  return fallos;
}

const distinto = (nombre: string, a: number, b: number): string | null => (a === b ? null : `${nombre}: ${a} !== ${b}`);
const suma = <T,>(lista: readonly T[], de: (x: T) => number): number => lista.reduce((t, x) => t + de(x), 0);

describe("el generador produce los casos que importan", () => {
  // Una propiedad que nunca ve un sobrecobro no dice nada de los sobrecobros.
  const todos = SEMILLAS.map(datasetAleatorio);
  const carteras = todos.map((d) => calcularCartera(d, { fechaCorte: CORTE }));

  it("folios con varias partidas, sobrecobros, saldos en dos tramos, Demo y sin fecha", () => {
    const hay = (de: (c: (typeof carteras)[number]) => boolean): number => carteras.filter(de).length;
    expect(hay((c) => c.detalle.some((s) => s.partidas.length > 1))).toBeGreaterThan(300);
    expect(hay((c) => c.detalle.some((s) => s.saldo < 0))).toBeGreaterThan(20);
    expect(hay((c) => c.detalle.some((s) => new Set(s.partidas.filter((p) => p.saldo !== 0).map((p) => p.bucket)).size > 1))).toBeGreaterThan(100);
    expect(hay((c) => c.excluidas.some((e) => e.motivo === "demo"))).toBeGreaterThan(100);
    expect(hay((c) => c.aging.porBucket["sin-fecha"] !== 0)).toBeGreaterThan(50);
  });
});

describe("invariantes de la cartera", () => {
  it("la suma de los tramos de antiguedad es el saldo total", () => {
    expect(
      enTodos((d) => {
        const c = calcularCartera(d, { fechaCorte: CORTE });
        const tramos = Object.values(c.aging.porBucket).reduce((t, v) => t + v, 0);
        return distinto("tramos", tramos, c.saldoTotal) ?? distinto("aging.saldoTotal", c.aging.saldoTotal, c.saldoTotal);
      }),
    ).toEqual([]);
  });

  it("cobrado + saldo = venta total", () => {
    expect(
      enTodos((d) => {
        const c = calcularCartera(d, { fechaCorte: CORTE });
        return distinto("cobrado + saldo", c.cobradoTotal + c.saldoTotal, c.ventaTotal);
      }),
    ).toEqual([]);
  });

  it("en cada folio: lo aplicado suma lo cobrado, lo pendiente suma el saldo, y cobrado + saldo es su precio", () => {
    expect(
      enTodos((d) => {
        for (const s of calcularCartera(d, { fechaCorte: CORTE }).detalle) {
          const fallo =
            distinto(`${s.folio} aplicado`, suma(s.partidas, (p) => p.aplicado), s.cobrado) ??
            distinto(`${s.folio} pendiente`, suma(s.partidas, (p) => p.saldo), s.saldo) ??
            distinto(`${s.folio} precio`, suma(s.partidas, (p) => p.precioVenta), s.precioVenta) ??
            distinto(`${s.folio} cobrado + saldo`, s.cobrado + s.saldo, s.precioVenta);
          if (fallo !== null) return fallo;
        }
        return null;
      }),
    ).toEqual([]);
  });

  it("los tramos de cada folio suman su saldo, y sumados entre folios son el aging", () => {
    expect(
      enTodos((d) => {
        const c = calcularCartera(d, { fechaCorte: CORTE });
        const porBucket = new Map<string, number>();
        for (const s of c.detalle) {
          const fallo = distinto(`${s.folio} tramos`, suma(s.tramos, (t) => t.saldo), s.saldo);
          if (fallo !== null) return fallo;
          if (s.tramos.some((t) => t.saldo === 0)) return `${s.folio}: tramo en cero`;
          if (new Set(s.tramos.map((t) => t.bucket)).size !== s.tramos.length) return `${s.folio}: tramo repetido`;
          for (const t of s.tramos) porBucket.set(t.bucket, (porBucket.get(t.bucket) ?? 0) + t.saldo);
        }
        for (const [bucket, saldo] of Object.entries(c.aging.porBucket)) {
          const fallo = distinto(`aging ${bucket}`, porBucket.get(bucket) ?? 0, saldo);
          if (fallo !== null) return fallo;
        }
        return null;
      }),
    ).toEqual([]);
  });

  it("solo la partida que carga un sobrecobro queda en negativo, y ninguna se cubre de mas", () => {
    expect(
      enTodos((d) => {
        for (const s of calcularCartera(d, { fechaCorte: CORTE }).detalle) {
          const negativas = s.partidas.filter((p) => p.saldo < 0).length;
          if (negativas > 1) return `${s.folio}: ${negativas} partidas en negativo`;
          if (negativas === 1 && s.saldo >= 0) return `${s.folio}: partida en negativo sin sobrecobro`;
          // Si el folio debe, nadie debe mas que su precio salvo por una nota de credito.
          if (s.cobrado >= 0 && s.partidas.some((p) => p.saldo > p.precioVenta)) return `${s.folio}: pendiente mayor que el precio`;
        }
        return null;
      }),
    ).toEqual([]);
  });

  it("lo pendiente es lo ULTIMO entregado: ninguna partida fechada debe mientras una posterior esta pagada", () => {
    expect(
      enTodos((d) => {
        for (const s of calcularCartera(d, { fechaCorte: CORTE }).detalle) {
          if (s.saldo <= 0) continue;
          const fechadas = s.partidas.filter((p) => p.fecha !== null && p.precioVenta > 0);
          for (const antes of fechadas) {
            for (const despues of fechadas) {
              if ((antes.fecha?.getTime() ?? 0) >= (despues.fecha?.getTime() ?? 0)) continue;
              if (antes.saldo > 0 && despues.aplicado > 0) return `${s.folio}: se pago una entrega posterior antes que una anterior`;
            }
          }
        }
        return null;
      }),
    ).toEqual([]);
  });
});

describe("invariantes entre modulos", () => {
  it("la suma de la utilidad por partida es la utilidad total, en resultados, producto y clientes", () => {
    expect(
      enTodos((d) => {
        const { incluidas } = particionarVentas(d.ventas);
        const porPartida = suma(incluidas, (p) => calcularVenta(p, d.parametros).utilidadBruta);
        const resultados = calcularResultados(d);
        const producto = calcularProducto(d);
        return (
          distinto("resultados", resultados.total.utilidadBruta, porPartida) ??
          distinto("por mes", suma(resultados.meses, (m) => m.utilidadBruta), porPartida) ??
          distinto("por linea", suma(producto.porLinea, (l) => l.utilidadBruta), porPartida) ??
          distinto("por modelo", suma(producto.porModelo, (m) => m.utilidadBruta), porPartida) ??
          distinto("por cliente", suma(calcularClientes(d).detalle, (c) => c.utilidadBruta), porPartida)
        );
      }),
    ).toEqual([]);
  });

  it("la venta, lo cobrado y el saldo son los mismos en cartera, resultados, clientes y flujo", () => {
    expect(
      enTodos((d) => {
        const c = calcularCartera(d, { fechaCorte: CORTE });
        const clientes = calcularClientes(d).detalle;
        const flujo = calcularFlujo(d);
        return (
          distinto("venta resultados", calcularResultados(d).total.ventaTotal, c.ventaTotal) ??
          distinto("venta clientes", suma(clientes, (x) => x.ingreso), c.ventaTotal) ??
          distinto("venta flujo", flujo.facturadoTotal, c.ventaTotal) ??
          distinto("cobrado clientes", suma(clientes, (x) => x.cobrado), c.cobradoTotal) ??
          distinto("cobrado flujo", flujo.cobradoTotal, c.cobradoTotal) ??
          distinto("saldo clientes", suma(clientes, (x) => x.saldo), c.saldoTotal)
        );
      }),
    ).toEqual([]);
  });

  it("las operaciones son los folios con alguna partida computable, y las unidades son las partidas", () => {
    expect(
      enTodos((d) => {
        const { incluidas } = particionarVentas(d.ventas);
        const { total, meses } = calcularResultados(d);
        return (
          distinto("operaciones", total.operaciones, contarFolios(incluidas)) ??
          distinto("renglones de cartera", calcularCartera(d, { fechaCorte: CORTE }).detalle.length, total.operaciones) ??
          distinto("operaciones por cliente", suma(calcularClientes(d).detalle, (c) => c.operaciones), total.operaciones) ??
          distinto("partidas", total.partidas, incluidas.length) ??
          distinto("entregas por mes", suma(meses, (m) => m.operaciones), incluidas.length) ??
          distinto("unidades por linea", suma(calcularProducto(d).porLinea, (l) => l.unidades), incluidas.length)
        );
      }),
    ).toEqual([]);
  });
});

describe("ningun resultado contiene NaN, Infinity ni undefined", () => {
  const todo = (d: Dataset) => ({
    resultados: calcularResultados(d),
    cartera: calcularCartera(d, { fechaCorte: CORTE }),
    clientes: calcularClientes(d),
    producto: calcularProducto(d),
    flujo: calcularFlujo(d),
    insights: calcularInsights(d, { fechaCorte: CORTE }),
  });

  it("en ninguno de los datasets generados", () => {
    expect(
      enTodos((d) => {
        const invalidas = rutasInvalidas(todo(d));
        if (invalidas.length > 0) return invalidas.slice(0, 3).join("; ");
        const texto = JSON.stringify(todo(d).insights);
        return /NaN|Infinity|undefined/.test(texto) ? `texto de hallazgo: ${texto.slice(0, 120)}` : null;
      }),
    ).toEqual([]);
  });

  it("ni en el archivo de demostracion, ni en un dataset vacio", () => {
    const vacio: Dataset = { ventas: [], cobranza: [], gastos: [], parametros: ParametrosSchema.parse({}) };
    expect(rutasInvalidas(todo(cargarFixture()))).toEqual([]);
    expect(rutasInvalidas(todo(vacio))).toEqual([]);
  });
});
