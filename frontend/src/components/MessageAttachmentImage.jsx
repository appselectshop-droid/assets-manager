import { useEffect, useState } from 'react';
import PdfViewerModal from './PdfViewerModal';

// Miniatura de un adjunto (imagen, video, o cualquier otro archivo) — usado
// tanto para la conversación con el empleado (mensajes de un ticket) como
// para Notas internas (imagen/video, 2026-07-24). La ruta que sirve el
// archivo exige sesión (ver backend/src/routes/tickets.js: GET
// /:id/messages/:messageId/attachment y GET
// /:id/internal-notes/:noteId/attachment), así que no puede ser un
// <img src="..."> directo — se pide como blob con la instancia de axios que
// sí manda el Bearer token (api o employeeApi, según la página) y se
// muestra desde ahí. `url` es la ruta completa del adjunto — cada llamador
// arma la suya según de qué adjunto se trate.
export default function MessageAttachmentImage({ api, url, mimeType, fileName }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  // Ventana emergente en vez de pestaña nueva (2026-08-05) — pedido
  // explícito del usuario: al hacerle clic a una imagen del chat se
  // navegaba fuera de la app (nueva pestaña del navegador); ahora se abre
  // en un modal dentro de la misma página.
  const [showLightbox, setShowLightbox] = useState(false);
  // Mismo criterio que la imagen de abajo, pero para el caso "adjunto que
  // no es imagen ni video" (típicamente un PDF) — antes abría en pestaña
  // nueva del navegador con <a target="_blank"> (2026-08-31, pedido
  // explícito del usuario: "una ventana emergente de visualización, no
  // como navegador externo", mismo criterio que ya usan las Responsivas).
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  // Contador para forzar un reintento manual — pedido explícito del
  // usuario (2026-07-31), tras un caso real donde la descarga falló en
  // silencio (sin este cambio, `failed` solo devolvía `null`: no había
  // forma de saber, desde la UI, que algo había tronado ni de reintentar
  // sin recargar toda la página).
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let objectUrl;
    let cancelled = false;
    setFailed(false);
    setBlobUrl(null);
    api.get(url, { responseType: 'blob' })
      .then((resp) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([resp.data], { type: resp.headers['content-type'] || mimeType }));
        setBlobUrl(objectUrl);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [api, url, mimeType, retryCount]);

  if (failed) {
    return (
      <span style={{ fontSize: '0.78rem', color: '#b91c1c', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
        ⚠️ No se pudo cargar {fileName ? `"${fileName}"` : 'el adjunto'}.
        <button
          type="button"
          onClick={() => setRetryCount((c) => c + 1)}
          style={{ background: 'none', border: 'none', color: '#0d9488', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: '0.78rem', textDecoration: 'underline' }}
        >
          Reintentar
        </button>
      </span>
    );
  }

  const isImage = (mimeType || '').startsWith('image/');
  const isVideo = (mimeType || '').startsWith('video/');

  if (isVideo) {
    return blobUrl ? (
      <video controls src={blobUrl} style={{ maxWidth: '280px', maxHeight: '280px', borderRadius: '10px', display: 'block' }} />
    ) : (
      <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Cargando video...</span>
    );
  }

  if (!isImage) {
    if (!blobUrl) return null;
    return (
      <>
        <button
          type="button"
          onClick={() => setShowPdfViewer(true)}
          style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
        >
          📎 {fileName || 'Ver adjunto'}
        </button>
        {showPdfViewer && (
          <PdfViewerModal url={blobUrl} title={fileName || 'Adjunto'} mimeType={mimeType} onClose={() => setShowPdfViewer(false)} />
        )}
      </>
    );
  }

  return (
    <>
      {blobUrl ? (
        <img
          src={blobUrl}
          alt={fileName || 'Imagen adjunta'}
          onClick={() => setShowLightbox(true)}
          style={{ maxWidth: '220px', maxHeight: '220px', borderRadius: '10px', display: 'block', cursor: 'zoom-in' }}
        />
      ) : (
        <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Cargando imagen...</span>
      )}
      {showLightbox && blobUrl && (
        <div
          onClick={() => setShowLightbox(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', cursor: 'zoom-out',
          }}
        >
          <button
            type="button"
            onClick={() => setShowLightbox(false)}
            aria-label="Cerrar"
            style={{
              position: 'absolute', top: '1rem', right: '1.2rem', background: 'none', border: 'none',
              color: '#fff', fontSize: '1.8rem', lineHeight: 1, cursor: 'pointer',
            }}
          >
            ✕
          </button>
          <img
            src={blobUrl}
            alt={fileName || 'Imagen adjunta'}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '95vw', maxHeight: '90vh', borderRadius: '8px', cursor: 'default' }}
          />
        </div>
      )}
    </>
  );
}
