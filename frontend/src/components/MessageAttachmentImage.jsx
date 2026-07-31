import { useEffect, useState } from 'react';

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
    return blobUrl ? <a href={blobUrl} target="_blank" rel="noreferrer">📎 {fileName || 'Ver adjunto'} ↗</a> : null;
  }

  return (
    <a href={blobUrl || undefined} target="_blank" rel="noreferrer" style={{ display: 'inline-block' }}>
      {blobUrl ? (
        <img
          src={blobUrl}
          alt={fileName || 'Imagen adjunta'}
          style={{ maxWidth: '220px', maxHeight: '220px', borderRadius: '10px', display: 'block', cursor: 'zoom-in' }}
        />
      ) : (
        <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Cargando imagen...</span>
      )}
    </a>
  );
}
