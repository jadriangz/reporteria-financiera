/**
 * El nombre del cliente (`parametros.nombre_cliente`), o el aviso de donde
 * capturarlo. Lo usan la portada del PDF y el pie del Resumen: un renglon en
 * blanco no dice que falta un dato; este aviso si.
 */
export function NombreCliente({ nombre }: { nombre: string | null }) {
  if (nombre !== null) return <>{nombre}</>;
  return (
    <span className="text-advertencia">
      No capturado: escríbalo en nombre_cliente, en la hoja parámetros.
    </span>
  );
}
