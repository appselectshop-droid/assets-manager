import { useCallback, useEffect, useRef, useState } from 'react';

// Reemplaza la descarga forzada de PDFs (responsivas/solicitudes) por un
// visor embebido en la app — pedido explícito del usuario (2026-08-17):
// "en lugar de descargarlas automáticamente, me abras una ventana emergente
// donde me dejes tipo imprimir o guardar, así como se abre en Edge pero ahí
// mismo en la app". `showPdf(blob, title)` arma el object URL una sola vez
// (revocando el anterior si había uno abierto) y `<PdfViewerModal>` lo
// renderiza en un `<iframe>` — el visor nativo de PDF del navegador trae su
// propio botón de imprimir/guardar, sin que este código tenga que construir
// ninguno.
export default function usePdfViewer() {
  const [pdf, setPdf] = useState(null); // { url, title } | null
  const urlRef = useRef(null);

  const showPdf = useCallback((blob, title = 'Documento') => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(blob);
    urlRef.current = url;
    setPdf({ url, title });
  }, []);

  const closePdf = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setPdf(null);
  }, []);

  // Libera el último object URL si el componente se desmonta con el visor abierto.
  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  return { pdf, showPdf, closePdf };
}
