import { useCallback, useState } from "react";

import demoUrl from "../../docs/DEMO_Agrodrones_Bajio_FICTICIO.xlsx?url";
import plantillaUrl from "../../docs/Plantilla_Captura_Reporteria_v1.xlsx?url";
import { useAppStore } from "../store/useAppStore";
import { PieAplicacion } from "./PieAplicacion";

/** Extensiones que aceptan los lectores de `src/lib/parse/`. */
const ACEPTADOS = ".xlsx,.csv";

/**
 * Estado vacio: la puerta de entrada de la app.
 *
 * La zona es un `label` que envuelve un `input[type=file]` visualmente oculto
 * pero enfocable. Asi funciona con teclado sin inventar handlers de tecla: Tab
 * lleva al control y Enter o Espacio abren el selector, que es lo que el usuario
 * de teclado ya espera.
 */
export function ZonaCarga() {
  const cargarArchivo = useAppStore((s) => s.cargarArchivo);
  const empezarSinArchivo = useAppStore((s) => s.empezarSinArchivo);
  const estado = useAppStore((s) => s.estado);
  const errorCarga = useAppStore((s) => s.errorCarga);
  const [arrastrando, setArrastrando] = useState(false);

  const recibir = useCallback(
    (archivos: FileList | null) => {
      const archivo = archivos?.[0];
      if (archivo !== undefined) void cargarArchivo(archivo);
    },
    [cargarArchivo],
  );

  const cargando = estado === "cargando";

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-center text-xl font-semibold text-marino">
        Generador de reportería financiera
      </h1>
      <p className="mt-1 text-center text-sm text-slate-600">
        Cargue su archivo de ventas, cobranza y gastos para generar el reporte.
      </p>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          recibir(e.dataTransfer.files);
        }}
        className={[
          "mt-8 flex cursor-pointer flex-col items-center justify-center",
          "border-2 border-dashed p-12 text-center transition-colors",
          "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-marino",
          arrastrando ? "border-marino bg-marino/5" : "border-slate-300 bg-superficie hover:bg-slate-50",
          cargando ? "pointer-events-none opacity-60" : "",
        ].join(" ")}
      >
        <input
          type="file"
          accept={ACEPTADOS}
          disabled={cargando}
          onChange={(e) => recibir(e.target.files)}
          className="sr-only"
        />

        {cargando ? (
          <Procesando />
        ) : (
          <>
            <span className="text-sm font-medium text-marino">
              Arrastre aquí su archivo, o presione para elegirlo
            </span>
            <span className="mt-1 text-xs text-slate-500">Formatos aceptados: .xlsx y .csv</span>
          </>
        )}
      </label>

      <p className="mt-3 text-center text-xs text-slate-600">
        ¿Todavía no tiene archivo?{" "}
        <button
          type="button"
          onClick={empezarSinArchivo}
          disabled={cargando}
          className="font-medium text-marino underline underline-offset-2 hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marino disabled:opacity-40"
        >
          Empiece a capturar sus datos aquí
        </button>
        , fila por fila.
      </p>

      {errorCarga !== null && (
        <p role="alert" className="mt-3 border border-riesgo/30 bg-red-50 p-3 text-xs text-riesgo">
          {errorCarga}
        </p>
      )}

      <p className="mt-6 border-l-2 border-positivo bg-slate-50 py-2 pl-3 text-xs text-slate-700">
        <strong className="text-positivo">Su archivo no se sube a ningún servidor.</strong> Todo el
        procesamiento ocurre dentro de este navegador: los datos financieros no salen de su
        computadora en ningún momento.
      </p>

      <p className="mt-4 text-center text-xs text-slate-500">
        ¿No tiene el formato?{" "}
        <a
          href={plantillaUrl}
          download="Plantilla_Captura_Reporteria.xlsx"
          className="text-marino underline underline-offset-2 hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marino"
        >
          Descargue la plantilla de captura
        </a>{" "}
        (en blanco, lista para capturar).
      </p>

      {/*
        El archivo de demostracion. La etiqueta "empresa ficticia" no es
        decorativa: quien lo abra tiene que saber, sin preguntar, que ningun
        nombre ni importe de ahi corresponde a un cliente real.
      */}
      <p className="mt-2 text-center text-xs text-slate-500">
        ¿Solo quiere ver cómo se ve el reporte?{" "}
        <a
          href={demoUrl}
          download="DEMO_Agrodrones_Bajio_FICTICIO.xlsx"
          className="text-marino underline underline-offset-2 hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marino"
        >
          Descargue el archivo de demostración
        </a>{" "}
        — <strong className="font-medium">empresa ficticia</strong>, datos inventados.
      </p>

      <div className="mt-10">
        <PieAplicacion />
      </div>
    </div>
  );
}

/**
 * Indicador de proceso. El parseo corre en el hilo principal: con 21 filas es
 * imperceptible, con un archivo grande no. Los Web Workers son otra sesion.
 */
function Procesando() {
  return (
    <span role="status" className="flex items-center gap-2 text-sm text-marino">
      <span
        aria-hidden="true"
        className="h-3 w-3 animate-spin rounded-full border-2 border-marino border-t-transparent"
      />
      Procesando el archivo…
    </span>
  );
}
