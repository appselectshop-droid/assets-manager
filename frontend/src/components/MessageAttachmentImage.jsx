import { useEffect, useState } from 'react';

// Miniatura de una imagen adjunta a un mensaje de la conversación de un
// ticket. La ruta que la sirve exige sesión (empleado o Sistemas, ver
// GET /tickets/:id/messages/:messageId/attachment en el backend), así que no
// puede ser un <img src="..."> directo — se pide como blob con la instancia
// de axios que sí manda el Bearer token (api o employeeApi, según la página)
// y se muestra desde ahí.
export default function MessageAttachmentImage({ api, ticketId, messageId, mimeType, fileName }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl;
    let cancelled = false;
    api.get(`/tickets/${ticketId}/messages/${messageId}/attachment`, { responseType: 'blob' })
      .then((resp) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([resp.data], { type: resp.headers['content-type'] || mimeType }));
        setUrl(objectUrl);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [api, ticketId, messageId, mimeType]);

  if (failed) return null;

  const isImage = (mimeType || '').startsWith('image/');
  if (!isImage) {
    return url ? <a href={url} target="_blank" rel="noreferrer">📎 {fileName || 'Ver adjunto'} ↗</a> : null;
  }

  return (
    <a href={url || undefined} target="_blank" rel="noreferrer" style={{ display: 'inline-block' }}>
      {url ? (
        <img
          src={url}
          alt={fileName || 'Imagen adjunta'}
          style={{ maxWidth: '220px', maxHeight: '220px', borderRadius: '10px', display: 'block', cursor: 'zoom-in' }}
        />
      ) : (
        <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Cargando imagen...</span>
      )}
    </a>
  );
}
