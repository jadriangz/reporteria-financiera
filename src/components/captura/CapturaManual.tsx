import clsx from "clsx";
import { useMemo, useState } from "react";

import {
  CAMPOS,
  type Entradas,
  type FilaListado,
  type TipoCampo,
  enBlanco,
  entradasVacias,
  filasDeHoja,
  nuevaCaptura,
  siguienteFila,
  tieneErrores,
  totalCapturas,
  validarCandidata,
} from "../../lib/captura";
import { entero, fecha, moneda, nulo } from "../../lib/format";
import { HOJAS_TABULARES, type NombreHoja } from "../../lib/parse/tipos";
import type { Hallazgo } from "../../lib/schema";
import { useAppStore } from "../../store/useAppStore";
import { Callout, type TonoCallout } from "../ui/Callout";
import { Campo, type ControlCampo } from "../ui/Campo";
import { TablaCifras } from "../ui/TablaCifras";
import { Boton, Seccion } from "../ui/primitivas";
import type { ColumnaTabla } from "../ui/tabla";
import { BotonExcel } from "./BotonExcel";

/**
 * Captura manual: agregar filas de ventas, cobranza y gastos desde la interfaz.
 *
 * Escribe al MISMO store que el archivo (ver `lib/captura`): la fila capturada
 * pasa por el mismo validador, con los mismos mensajes, y entra al mismo
 * dataset que consume el motor. Funciona sin archivo (empezar de cero) y sobre
 * un archivo cargado (agregar filas); en el segundo caso las filas a mano se
 * marcan en el listado para distinguirlas del archivo.
 *
 * Solo las filas capturadas aqui se editan o borran. Las del archivo, no: en v1
 * la correccion de un dato del archivo se hace en el Excel, que es la fuente.
 */

const NOMBRE_HOJA: Readonly<Record<NombreHoja, string>> = {
  ventas: "Ventas",
  cobranza: "Cobranza",
  gastos: "Gastos",
};

const CONTROL: Readonly<Record<TipoCampo, ControlCampo>> = {
  texto: "texto",
  fecha: "fecha",
  importe: "decimal",
  porcentaje: "decimal",
  entero: "entero",
  opcion: "opcion",
};

const TONO_SEVERIDAD: Readonly<Record<Hallazgo["severidad"], TonoCallout>> = {
  error: "alerta",
  advertencia: "advertencia",
  info: "nota",
};

export function CapturaManual() {
  const [hoja, setHoja] = useState<NombreHoja>("ventas");
  /** id de la fila capturada que se esta editando; null = fila nueva. */
  const [editando, setEditando] = useState<string | null>(null);

  const cambiarHoja = (h: NombreHoja) => {
    setHoja(h);
    setEditando(null);
  };

  return (
    <div>
      <Encabezado />

      <div role="tablist" aria-label="Hoja a capturar" className="mb-3 flex gap-px border-b border-slate-200">
        {HOJAS_TABULARES.map((h) => (
          <PestanaHoja key={h} hoja={h} activa={h === hoja} onClick={() => cambiarHoja(h)} />
        ))}
      </div>

      <Seccion
        titulo={editando === null ? `Nueva fila de ${NOMBRE_HOJA[hoja].toLowerCase()}` : "Editar fila capturada"}
        descripcion="Se valida mientras escribe, con las mismas reglas y mensajes que el archivo."
      >
        {/* La clave remonta el formulario al cambiar de hoja o de fila en edicion. */}
        <Formulario key={`${hoja}-${editando ?? "nueva"}`} hoja={hoja} editando={editando} onTerminar={() => setEditando(null)} />
      </Seccion>

      <Seccion
        titulo={`Filas de ${NOMBRE_HOJA[hoja].toLowerCase()}`}
        descripcion="Las marcadas «A mano» se capturaron aquí y pueden editarse o borrarse."
      >
        <Listado hoja={hoja} onEditar={setEditando} editando={editando} />
      </Seccion>
    </div>
  );
}

// --------------------------- Encabezado ---------------------------

function Encabezado() {
  const nombreArchivo = useAppStore((s) => s.nombreArchivo);
  const capturas = useAppStore((s) => s.capturas);
  const n = totalCapturas(capturas);

  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 max-w-3xl">
        <h2 className="text-sm font-semibold text-marino">Captura manual</h2>
        <p className="mt-0.5 text-xs text-slate-600">
          {nombreArchivo === null
            ? "Sin archivo: está empezando de cero. Cada fila que guarde entra al reporte al instante."
            : `Agregando filas a ${nombreArchivo}. Lo capturado se suma a lo que trae el archivo en todo el reporte.`}
        </p>
        <p className="mt-1 text-[11px] text-advertencia">
          Las filas capturadas viven solo mientras esta pestaña esté abierta: no se guardan en ningún
          lado. Descargue el Excel para conservarlas
          {n > 0 && (
            <>
              {" "}
              (<span className="cifras">{entero(n)}</span> {n === 1 ? "fila capturada" : "filas capturadas"} hasta
              ahora)
            </>
          )}
          .
        </p>
      </div>
      <BotonExcel />
    </div>
  );
}

function PestanaHoja({ hoja, activa, onClick }: { hoja: NombreHoja; activa: boolean; onClick: () => void }) {
  const raw = useAppStore((s) => s.raw);
  const capturas = useAppStore((s) => s.capturas);
  const delArchivo = raw?.[hoja].filas.length ?? 0;
  const aMano = capturas[hoja].length;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={activa}
      onClick={onClick}
      className={clsx(
        "border-b-2 px-3 py-1.5 text-left text-xs",
        "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-marino",
        activa ? "border-marino font-semibold text-marino" : "border-transparent text-slate-600 hover:bg-slate-50",
      )}
    >
      {NOMBRE_HOJA[hoja]}
      <span className="cifras ml-1.5 font-normal text-slate-500">
        {entero(delArchivo)} del archivo · {entero(aMano)} a mano
      </span>
    </button>
  );
}

// --------------------------- Formulario ---------------------------

function Formulario({
  hoja,
  editando,
  onTerminar,
}: {
  hoja: NombreHoja;
  editando: string | null;
  onTerminar: () => void;
}) {
  const raw = useAppStore((s) => s.raw);
  const capturas = useAppStore((s) => s.capturas);
  const dataset = useAppStore((s) => s.dataset);
  const guardarFila = useAppStore((s) => s.guardarFila);

  const existente = editando === null ? undefined : capturas[hoja].find((c) => c.id === editando);
  const [entradas, setEntradas] = useState<Entradas>(existente?.entradas ?? entradasVacias(hoja));

  // Validacion EN VIVO: en cada tecla, el validador completo sobre archivo +
  // capturas + esta fila. Un folio repetido se dice al escribirlo.
  const hallazgos = useMemo(() => {
    if (raw === null || enBlanco(entradas)) return [];
    const fila = existente?.fila ?? siguienteFila(raw, capturas, hoja);
    return validarCandidata(raw, capturas, hoja, nuevaCaptura("borrador", fila, hoja, entradas), editando);
  }, [raw, capturas, hoja, entradas, existente, editando]);

  const bloqueada = enBlanco(entradas) || tieneErrores(hallazgos);
  const foliosVenta = useMemo(() => (dataset?.ventas ?? []).map((v) => v.folio), [dataset]);

  const marcadoDe = (clave: string): "normal" | "error" | "advertencia" => {
    const delCampo = hallazgos.filter((h) => h.campo === clave);
    if (delCampo.some((h) => h.severidad === "error")) return "error";
    return delCampo.some((h) => h.severidad === "advertencia") ? "advertencia" : "normal";
  };

  const guardar = () => {
    if (bloqueada) return;
    guardarFila(hoja, entradas, editando);
    setEntradas(entradasVacias(hoja));
    onTerminar();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        guardar();
      }}
    >
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 md:grid-cols-4 xl:grid-cols-7">
        {CAMPOS[hoja].map((c) => (
          <Campo
            key={c.clave}
            id={`captura-${hoja}-${c.clave}`}
            etiqueta={c.etiqueta}
            control={CONTROL[c.tipo]}
            valor={entradas[c.clave] ?? ""}
            onChange={(v) => setEntradas((prev) => ({ ...prev, [c.clave]: v }))}
            marcado={marcadoDe(c.clave)}
            {...(c.opciones === undefined ? {} : { opciones: c.opciones })}
            {...(c.obligatorio === true ? { obligatorio: true } : {})}
            {...(c.ayuda === undefined ? {} : { ayuda: c.ayuda })}
            {...(hoja === "cobranza" && c.clave === "folio_venta" ? { sugerencias: foliosVenta } : {})}
          />
        ))}
      </div>

      {hallazgos.length > 0 && (
        <div className="mt-3 space-y-1.5" aria-live="polite">
          {hallazgos.map((h) => (
            <Callout
              // Una fila no repite el mismo mensaje en el mismo campo: esto es unico.
              key={`${h.severidad}|${h.campo ?? ""}|${h.mensaje}`}
              titulo={h.mensaje}
              tono={TONO_SEVERIDAD[h.severidad]}
              {...(h.campo === undefined ? {} : { pie: `Campo: ${h.campo}` })}
            >
              {nulo(h.accion, "")}
            </Callout>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Boton type="submit" variante="primario" disabled={bloqueada}>
          {editando === null ? "Agregar fila" : "Guardar cambios"}
        </Boton>
        {editando !== null && <Boton onClick={onTerminar}>Cancelar edición</Boton>}
        <span className="text-[11px] text-slate-500">
          {enBlanco(entradas)
            ? "Escriba los datos de la fila."
            : tieneErrores(hallazgos)
              ? "Corrija los errores para poder guardar. Las advertencias no bloquean."
              : "Sin errores: puede guardarse."}
        </span>
      </div>
    </form>
  );
}

// --------------------------- Listado ---------------------------

function Listado({
  hoja,
  editando,
  onEditar,
}: {
  hoja: NombreHoja;
  editando: string | null;
  onEditar: (id: string) => void;
}) {
  const raw = useAppStore((s) => s.raw);
  const capturas = useAppStore((s) => s.capturas);
  const hallazgos = useAppStore((s) => s.hallazgos);
  const borrarFila = useAppStore((s) => s.borrarFila);

  const filas = useMemo(
    () => (raw === null ? [] : filasDeHoja(raw, capturas, hoja, hallazgos)),
    [raw, capturas, hoja, hallazgos],
  );

  const columnas = useMemo(
    (): readonly ColumnaTabla<FilaListado>[] => [
      {
        clave: "fila",
        encabezado: "Fila",
        alineacion: "derecha",
        celda: (f) => entero(f.fila),
        ordenar: (f) => f.fila,
        ancho: "4rem",
      },
      {
        clave: "origen",
        encabezado: "Origen",
        celda: (f) => <MarcaOrigen origen={f.origen} />,
        ordenar: (f) => f.origen,
        ancho: "6rem",
      },
      { clave: "folio", encabezado: "Folio", celda: (f) => <span className="cifras">{nulo(f.folio)}</span>, ordenar: (f) => f.folio, ancho: "6rem" },
      { clave: "fecha", encabezado: "Fecha", celda: (f) => <span className="cifras">{fecha(f.fecha)}</span>, ordenar: (f) => f.fecha?.getTime() ?? null, ancho: "6rem" },
      { clave: "detalle", encabezado: "Detalle", celda: (f) => nulo(f.detalle) },
      {
        clave: "importe",
        encabezado: "Importe",
        alineacion: "derecha",
        celda: (f) => moneda(f.importe),
        ordenar: (f) => f.importe,
      },
      {
        clave: "estado",
        encabezado: "Estado",
        celda: (f) => <EstadoFila fila={f} />,
        ordenar: (f) => f.errores * 100 + f.advertencias,
        ancho: "9rem",
      },
      {
        clave: "acciones",
        encabezado: "",
        celda: (f) =>
          f.idCaptura === null ? null : (
            <AccionesCaptura
              activa={f.idCaptura === editando}
              onEditar={() => onEditar(f.idCaptura ?? "")}
              onBorrar={() => borrarFila(hoja, f.idCaptura ?? "")}
            />
          ),
        ancho: "9rem",
      },
    ],
    [hoja, editando, onEditar, borrarFila],
  );

  return (
    <>
      <p className="mb-2 border-l-2 border-slate-300 pl-2 text-[11px] leading-snug text-slate-600">
        Las filas que vienen del archivo no se editan aquí. Para corregir una, corrija el Excel y
        vuelva a cargarlo: el archivo es la fuente de esos datos.
      </p>
      <TablaCifras
        etiquetaTabla={`Filas de ${NOMBRE_HOJA[hoja].toLowerCase()}`}
        columnas={columnas}
        filas={filas.map((f) => ({
          id: f.clave,
          datos: f,
          tono: f.errores > 0 ? ("riesgo" as const) : ("neutro" as const),
        }))}
        vacio="Todavía no hay filas en esta hoja."
      />
    </>
  );
}

/** Distingue a simple vista lo capturado a mano de lo que vino del archivo. */
function MarcaOrigen({ origen }: { origen: FilaListado["origen"] }) {
  return origen === "captura" ? (
    <span className="inline-block rounded-sm bg-marino px-1.5 py-0.5 text-[10px] font-semibold text-sobre-color">
      A mano
    </span>
  ) : (
    <span className="text-[11px] text-slate-500">Archivo</span>
  );
}

function EstadoFila({ fila }: { fila: FilaListado }) {
  if (!fila.valida) return <span className="text-riesgo">Rechazada</span>;
  if (fila.errores > 0) return <span className="text-riesgo">{entero(fila.errores)} error(es)</span>;
  if (fila.advertencias > 0) return <span className="text-advertencia">{entero(fila.advertencias)} aviso(s)</span>;
  return <span className="text-positivo">Correcta</span>;
}

/**
 * Editar y borrar una fila capturada. Borrar pide confirmacion en la misma
 * fila, sin dialogos del navegador: la fila no se puede recuperar.
 */
function AccionesCaptura({
  activa,
  onEditar,
  onBorrar,
}: {
  activa: boolean;
  onEditar: () => void;
  onBorrar: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);

  if (confirmando) {
    return (
      <span className="flex items-center gap-1">
        <span className="text-[11px] text-riesgo">¿Borrar?</span>
        <Boton variante="peligro" onClick={onBorrar}>
          Sí
        </Boton>
        <Boton onClick={() => setConfirmando(false)}>No</Boton>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <Boton onClick={onEditar} disabled={activa}>
        {activa ? "Editando" : "Editar"}
      </Boton>
      <Boton variante="peligro" onClick={() => setConfirmando(true)}>
        Borrar
      </Boton>
    </span>
  );
}
