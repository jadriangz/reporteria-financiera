import { useState } from "react";

import { fecha as formatearFecha } from "../lib/format";
import { COMISION_BASE } from "../lib/schema";
import { etiquetaOrigen, totalCapturas } from "../lib/captura";
import { MODULOS, type ModoImpresion, useAppStore } from "../store/useAppStore";
import { BotonExcel } from "./captura/BotonExcel";
import { Boton } from "./ui/primitivas";

/** Date a "aaaa-mm-dd" para el input nativo, siempre en UTC. */
function aValorInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "aaaa-mm-dd" del input a Date en UTC, sin desfase por zona horaria. */
function deValorInput(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m === null) return null;
  const [, a, me, d] = m;
  if (a === undefined || me === undefined || d === undefined) return null;
  return new Date(Date.UTC(Number(a), Number(me) - 1, Number(d)));
}

/**
 * Barra superior persistente: que archivo esta cargado, con que fecha de corte
 * se esta calculando, y los parametros que mueven el resultado.
 *
 * Mover cualquiera de estos controles recalcula el motor completo una vez, en
 * el store. Los modulos solo vuelven a pintar.
 */
export function BarraSuperior() {
  const nombreArchivo = useAppStore((s) => s.nombreArchivo);
  const capturas = useAppStore((s) => s.capturas);
  const origen = etiquetaOrigen(nombreArchivo, totalCapturas(capturas));
  const parametros = useAppStore((s) => s.parametros);
  const actualizarParametro = useAppStore((s) => s.actualizarParametro);
  const limpiar = useAppStore((s) => s.limpiar);
  const [ajustesAbiertos, setAjustesAbiertos] = useState(false);

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-marino">Reportería financiera</p>
          <p className="truncate text-xs text-slate-500" title={origen}>
            {origen}
          </p>
        </div>

        <label className="ml-auto flex items-center gap-2 text-xs text-slate-600">
          <span>Fecha de corte</span>
          <input
            type="date"
            value={aValorInput(parametros.fechaCorte)}
            onChange={(e) => {
              const d = deValorInput(e.target.value);
              if (d !== null) actualizarParametro("fechaCorte", d);
            }}
            className="cifras rounded-sm border border-slate-300 px-1.5 py-0.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-marino"
          />
        </label>

        <BotonExcel />
        <MenuPdf />
        <Boton onClick={() => setAjustesAbiertos((v) => !v)}>
          {ajustesAbiertos ? "Ocultar parámetros" : "Parámetros"}
        </Boton>
        <Boton variante="peligro" onClick={limpiar}>
          Limpiar
        </Boton>
      </div>

      {ajustesAbiertos && (
        <div className="flex flex-wrap items-end gap-4 border-t border-slate-200 bg-slate-50 px-4 py-2">
          <CampoTasa
            etiqueta="Provisión 91-180 días"
            valor={parametros.provision91180}
            onChange={(v) => actualizarParametro("provision91180", v)}
          />
          <CampoTasa
            etiqueta="Provisión +180 días"
            valor={parametros.provisionMas180}
            onChange={(v) => actualizarParametro("provisionMas180", v)}
          />
          <label className="flex flex-col gap-0.5 text-xs text-slate-600">
            <span>Base de comisión por omisión</span>
            <select
              value={parametros.comisionBaseDefault}
              onChange={(e) => actualizarParametro("comisionBaseDefault", e.target.value)}
              className="rounded-sm border border-slate-300 px-1.5 py-0.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-marino"
            >
              {COMISION_BASE.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <p className="ml-auto max-w-sm text-[11px] text-slate-500">
            La antigüedad de cartera se mide contra el{" "}
            <span className="cifras">{formatearFecha(parametros.fechaCorte)}</span>. Estos
            parámetros solo aplican a las filas que no los traen capturados.
          </p>
        </div>
      )}
    </header>
  );
}

/**
 * "Descargar PDF": pregunta que imprimir y deja la vista imprimible montada; la
 * vista llama a window.print() cuando esta lista.
 *
 * Se llama "Descargar PDF" y no "Imprimir" porque eso es lo que el usuario
 * quiere: en el dialogo del navegador elige "Guardar como PDF". La linea de
 * ayuda existe porque, sin "Graficos de fondo", los fondos de color de las
 * tarjetas y los avisos salen en blanco. Los tonos de riesgo no dependen solo
 * del fondo (tambien el texto y el borde van en color), pero se ven mejor con el.
 */
function MenuPdf() {
  const [abierto, setAbierto] = useState(false);
  const solicitarImpresion = useAppStore((s) => s.solicitarImpresion);
  const moduloActivo = useAppStore((s) => s.moduloActivo);
  const titulo = MODULOS.find((m) => m.id === moduloActivo)?.titulo ?? "";

  const elegir = (modo: ModoImpresion) => {
    setAbierto(false);
    solicitarImpresion(modo);
  };

  return (
    <div
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape") setAbierto(false);
      }}
    >
      <Boton variante="primario" onClick={() => setAbierto((v) => !v)}>
        Descargar PDF
      </Boton>
      {abierto && (
        <div
          role="dialog"
          aria-label="Descargar PDF"
          className="absolute right-0 top-full z-20 mt-1 w-80 border border-slate-200 bg-white p-3 shadow-md"
        >
          <p className="text-xs font-semibold text-marino">¿Qué quiere descargar?</p>
          <div className="mt-2 space-y-2">
            <OpcionPdf titulo="Módulo actual" detalle={`Solo «${titulo}», como se ve ahora.`} onClick={() => elegir("actual")} />
            <OpcionPdf
              titulo="Reporte completo"
              detalle="Portada y los seis módulos, cada uno en hoja nueva. Los que no se pueden calcular se listan al final."
              onClick={() => elegir("completo")}
            />
          </div>
          <p className="mt-3 border-t border-slate-200 pt-2 text-[11px] leading-snug text-slate-600">
            En el diálogo elija <span className="font-semibold">«Guardar como PDF»</span> y active{" "}
            <span className="font-semibold">«Gráficos de fondo»</span>: sin esa opción, los fondos de
            color de tarjetas y avisos salen en blanco.
          </p>
        </div>
      )}
    </div>
  );
}

function OpcionPdf({ titulo, detalle, onClick }: { titulo: string; detalle: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full border border-slate-200 px-2.5 py-1.5 text-left hover:border-marino hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-marino"
    >
      <span className="block text-xs font-semibold text-slate-800">{titulo}</span>
      <span className="block text-[11px] leading-snug text-slate-500">{detalle}</span>
    </button>
  );
}

/** Tasa capturada como porcentaje entero y guardada como ratio 0-1. */
function CampoTasa({
  etiqueta,
  valor,
  onChange,
}: {
  etiqueta: string;
  valor: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5 text-xs text-slate-600">
      <span>{etiqueta}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          max={100}
          step={5}
          value={Math.round(valor * 100)}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(Math.min(100, Math.max(0, n)) / 100);
          }}
          className="cifras w-16 rounded-sm border border-slate-300 px-1.5 py-0.5 text-right text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-marino"
        />
        <span className="text-slate-400">%</span>
      </span>
    </label>
  );
}
