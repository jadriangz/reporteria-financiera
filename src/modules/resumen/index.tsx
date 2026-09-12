import type { ReactNode } from "react";

import { NombreCliente } from "../../components/NombreCliente";
import { Callout, TodoEnOrden } from "../../components/ui/Callout";
import { Grafica } from "../../components/ui/Grafica";
import { RejillaKPI, TarjetaKPI } from "../../components/ui/TarjetaKPI";
import { Boton, Cifra, RejillaSecciones, Seccion } from "../../components/ui/primitivas";
import { etiquetaOrigen, totalCapturas } from "../../lib/captura";
import { fecha, moneda } from "../../lib/format";
import { type Calculos, type IdModulo, useAppStore } from "../../store/useAppStore";
import { BarraAntiguedad } from "../cobranza/BarraAntiguedad";
import { ETIQUETA_BUCKET } from "../cobranza/selectores";
import { TablaCascada } from "../estado-resultados/TablaCascada";
import { RECORTE_MODELOS, SERIES_PRODUCTO } from "../producto/selectores";
import { NotaFueraDelEje } from "../ventas-flujo/NotaFueraDelEje";
import { SERIES_MENSUALES } from "../ventas-flujo/selectores";
import {
  alcanceDelReporte,
  cuentasMayores,
  graficaResumen,
  kpisResumen,
  periodoDelReporte,
  porSeveridad,
  textoPeriodo,
} from "./selectores";

/**
 * Modulo 1 — Resumen ejecutivo.
 *
 * Ensamblaje puro: cada pieza es la de otro modulo (la cascada de Estado de
 * resultados, la barra de Cobranza, la grafica de Ventas y flujo o de
 * Producto) y ninguna cifra se calcula aqui. Tiene que poder leerse solo, sin
 * abrir los demas: por eso lleva su propio pie de alcance.
 */
export function ModuloResumen({ calculos }: { calculos: Calculos }) {
  return (
    <div>
      <RejillaKPI>
        {kpisResumen(calculos).map((k) => (
          <TarjetaKPI key={k.clave} etiqueta={k.etiqueta} valor={k.valor} tono={k.tono} nota={k.nota} />
        ))}
      </RejillaKPI>

      <Seccion titulo="Hallazgos" descripcion="Generados por las reglas del motor, los de riesgo primero.">
        <Hallazgos calculos={calculos} />
      </Seccion>

      {/*
        Estos dos bloques comparten renglon cuando hay ancho, y es el caso que
        motivo la rejilla: la cascada pide 440 px y la barra de antiguedad 890,
        asi que apilados dejaban casi mil pixeles vacios a la derecha de la
        cascada en cualquier pantalla de escritorio. Ninguno de los dos gana
        nada con mas ancho; el reporte si gana con menos desplazamiento.

        Quien decide si comparten renglon es el ancho disponible, no una
        consulta de dispositivo: por debajo de unos 1000 px se apilan solos.
      */}
      <RejillaSecciones>
        <Seccion
          titulo="Estado de resultados"
          descripcion="La cascada del periodo, sin desglose mensual."
          minimo="30rem"
          acciones={<EnlaceModulo id="resultados">Ver detalle</EnlaceModulo>}
        >
          <TablaCascada cascada={calculos.resultados.total} />
          {!calculos.capacidades.estadoResultados && (
            <Nota>Sin hoja gastos: el resultado no resta gastos operativos.</Nota>
          )}
        </Seccion>

        <Seccion
          titulo="Antigüedad de cartera"
          descripcion={`Saldo por cobrar al ${fecha(calculos.cartera.fechaCorte)}.`}
          minimo="30rem"
          acciones={<EnlaceModulo id="cobranza">Ver detalle</EnlaceModulo>}
        >
          <Antiguedad calculos={calculos} />
        </Seccion>
      </RejillaSecciones>

      <GraficaDelResumen calculos={calculos} />

      <PieDeAlcance calculos={calculos} />
    </div>
  );
}

// --------------------------- apoyo de navegacion ---------------------------

/** Lleva al modulo con el detalle. No se imprime: en papel no hay a donde ir. */
function EnlaceModulo({ id, children }: { id: IdModulo; children: ReactNode }) {
  const irAModulo = useAppStore((s) => s.irAModulo);
  return <Boton onClick={() => irAModulo(id)}>{children} →</Boton>;
}

// --------------------------- B2: hallazgos ---------------------------

function Hallazgos({ calculos }: { calculos: Calculos }) {
  const hallazgos = porSeveridad(calculos.insights);

  if (hallazgos.length === 0) {
    return (
      <TodoEnOrden titulo="Ninguna regla encontró algo que señalar">
        Cartera, márgenes, concentración y estacionalidad están dentro de los umbrales.
      </TodoEnOrden>
    );
  }

  return (
    <div className="space-y-2">
      {hallazgos.map((i) => (
        <Callout key={i.id} titulo={i.titulo} tono={i.nivel}>
          {i.detalle}
        </Callout>
      ))}
    </div>
  );
}

// --------------------------- B4: antiguedad ---------------------------

function Antiguedad({ calculos }: { calculos: Calculos }) {
  if (!calculos.capacidades.cobranza) {
    return (
      <Callout titulo="Sin cartera que clasificar" tono="nota">
        Requiere la hoja cobranza. Sin abonos capturados, toda la venta aparecería como saldo
        pendiente.
      </Callout>
    );
  }

  const mayores = cuentasMayores(calculos.cartera);

  return (
    <>
      <BarraAntiguedad cartera={calculos.cartera} />
      {mayores.length > 0 && (
        <p className="mt-2 text-xs text-slate-700">
          <span className="font-semibold">
            {mayores.length === 1 ? "Mayor saldo:" : `Las ${mayores.length} cuentas mayores:`}
          </span>{" "}
          {mayores.map((c, i) => (
            <span key={c.clave}>
              {i > 0 && " · "}
              {c.nombre} <Cifra className="font-medium">{moneda(c.saldo)}</Cifra>{" "}
              <span className="text-slate-500">
                ({c.bucketMasAntiguo === null ? "sin tramo" : ETIQUETA_BUCKET[c.bucketMasAntiguo]})
              </span>
            </span>
          ))}
        </p>
      )}
    </>
  );
}

// --------------------------- B5: grafica ---------------------------

function GraficaDelResumen({ calculos }: { calculos: Calculos }) {
  const g = graficaResumen(calculos);

  if (g.tipo === "flujo") {
    return (
      <Seccion
        titulo="Facturado contra cobrado por mes"
        descripcion="Lo facturado por fecha de venta; lo cobrado por fecha de pago real."
        acciones={<EnlaceModulo id="flujo">Ver detalle</EnlaceModulo>}
      >
        <Grafica
          tipo="barras"
          series={SERIES_MENSUALES}
          puntos={g.puntos}
          etiqueta="Facturado y cobrado por mes"
          vacio="No hay meses con fecha que graficar."
        />
        <NotaFueraDelEje fuera={g.fueraDelEje} dondeVer="la fila «Sin fecha» de Ventas y flujo" />
      </Seccion>
    );
  }

  return (
    <Seccion
      titulo="Ingreso contra utilidad por modelo"
      descripcion={g.motivo}
      acciones={<EnlaceModulo id="producto">Ver detalle</EnlaceModulo>}
    >
      <Grafica
        tipo="barras"
        series={SERIES_PRODUCTO}
        puntos={g.puntos}
        etiqueta="Ingreso y utilidad bruta por modelo"
        vacio="No hay ventas computables que graficar."
        recorte={{ ...RECORTE_MODELOS, dondeVerElResto: "en Rendimiento por producto" }}
      />
    </Seccion>
  );
}

// --------------------------- B6: pie ---------------------------

function PieDeAlcance({ calculos }: { calculos: Calculos }) {
  const dataset = useAppStore((s) => s.dataset);
  const nombreArchivo = useAppStore((s) => s.nombreArchivo);
  const capturas = useAppStore((s) => s.capturas);
  const iva = calculos.insights.find((i) => i.id === "importes-iva");

  return (
    <footer className="imp-bloque border-t-2 border-marino pt-3 text-xs text-slate-700">
      <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
        <dt className="font-semibold">Cliente</dt>
        <dd>
          <NombreCliente nombre={dataset?.parametros.nombre_cliente ?? null} />
        </dd>
        <dt className="font-semibold">Fecha de corte</dt>
        <dd className="cifras">{fecha(calculos.cartera.fechaCorte)}</dd>
        <dt className="font-semibold">Periodo</dt>
        <dd className="cifras">{dataset === null ? "—" : textoPeriodo(periodoDelReporte(dataset))}</dd>
        <dt className="font-semibold">Origen de los datos</dt>
        <dd>{etiquetaOrigen(nombreArchivo, totalCapturas(capturas))}</dd>
      </dl>

      {dataset !== null && <ListaAlcance alcance={alcanceDelReporte(dataset, calculos)} />}

      {iva !== undefined && (
        <div className="mt-3">
          <Callout titulo={iva.titulo} tono={iva.nivel}>
            {iva.detalle}
          </Callout>
        </div>
      )}
    </footer>
  );
}

/** Lo que el reporte cubre y lo que no. Lo usan el pie del Resumen y la portada. */
export function ListaAlcance({ alcance }: { alcance: ReturnType<typeof alcanceDelReporte> }) {
  return (
    <div className="mt-3 grid gap-4 sm:grid-cols-2">
      <div>
        <p className="font-semibold text-marino">Incluye</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 cifras">
          {alcance.incluye.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="font-semibold text-advertencia">No incluye</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {alcance.noIncluye.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Nota({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-[11px] leading-snug text-slate-500">{children}</p>;
}
