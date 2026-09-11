import clsx from "clsx";

/**
 * Campo de formulario con su etiqueta. Generico: no sabe de ventas ni de
 * cobranza; recibe el tipo de control y lo escrito como texto.
 *
 * Los importes y porcentajes van en un campo de texto con teclado decimal, no
 * en `type="number"`: el control numerico del navegador descarta en silencio
 * lo que no entiende ("$1,200" se vuelve vacio), y aqui lo que no se entiende
 * tiene que llegar al validador para que diga por que.
 */

export type ControlCampo = "texto" | "decimal" | "entero" | "fecha" | "opcion";

export function Campo({
  id,
  etiqueta,
  control,
  valor,
  onChange,
  opciones,
  sugerencias,
  obligatorio = false,
  ayuda,
  marcado = "normal",
}: {
  readonly id: string;
  readonly etiqueta: string;
  readonly control: ControlCampo;
  /** Siempre texto: lo que el usuario escribio, sin convertir. */
  readonly valor: string;
  readonly onChange: (valor: string) => void;
  /** Solo para `opcion`. Se agrega una opcion vacia al inicio. */
  readonly opciones?: readonly string[];
  /** Autocompletado sugerido para campos de texto, p. ej. folios existentes. */
  readonly sugerencias?: readonly string[];
  readonly obligatorio?: boolean;
  readonly ayuda?: string;
  /** Resalta el borde cuando el validador tiene algo que decir del campo. */
  readonly marcado?: "normal" | "error" | "advertencia";
}) {
  const clases = clsx(
    "w-full rounded-sm border px-1.5 py-1 text-xs",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-marino",
    control === "decimal" || control === "entero" ? "cifras text-right" : "",
    marcado === "error"
      ? "border-riesgo"
      : marcado === "advertencia"
        ? "border-advertencia"
        : "border-slate-300",
  );
  const idLista = sugerencias === undefined ? undefined : `${id}-sugerencias`;

  return (
    <label htmlFor={id} className="flex min-w-0 flex-col gap-0.5 text-xs text-slate-700">
      <span className="font-medium">
        {etiqueta}
        {obligatorio && (
          <span className="ml-0.5 text-riesgo" aria-hidden="true">
            *
          </span>
        )}
      </span>

      {control === "opcion" ? (
        <select id={id} value={valor} onChange={(e) => onChange(e.target.value)} className={clases}>
          <option value="">—</option>
          {(opciones ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={control === "fecha" ? "date" : "text"}
          inputMode={control === "decimal" ? "decimal" : control === "entero" ? "numeric" : undefined}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          aria-required={obligatorio}
          list={idLista}
          className={clases}
        />
      )}

      {sugerencias !== undefined && idLista !== undefined && (
        <datalist id={idLista}>
          {sugerencias.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}

      {ayuda !== undefined && <span className="text-[10px] leading-snug text-slate-500">{ayuda}</span>}
    </label>
  );
}
