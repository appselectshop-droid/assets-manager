import { useEffect, useState } from 'react';
import api from '../services/api';
import styles from '../pages/Assets.module.css';
import ImageLightbox from './ImageLightbox';

// Miniatura de foto en la tabla — pedido explícito del usuario (2026-09-04):
// "dame las fotos en la tabla de accesorios/activos, tipo ERP". El listado
// (GET /assets) excluye a propósito el binario de la foto por rendimiento
// (ver LIST_EXCLUDE_FIELDS en routes/assets.js) — aquí solo se pide el
// binario, uno por fila, para las filas que de verdad tienen foto
// (`photoMimeType` truthy, ese sí viene en el listado).
export default function AssetThumbnail({ asset }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!asset.photoMimeType) return;
    let objectUrl;
    let cancelled = false;
    api.get(`/assets/${asset._id}/photo`, { responseType: 'blob' })
      .then(({ data }) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(data);
        setUrl(objectUrl);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset._id, asset.photoMimeType]);

  if (!asset.photoMimeType || failed) {
    return <div className={styles.thumbPlaceholder}>📦</div>;
  }
  if (!url) {
    return <div className={styles.thumbPlaceholder} />;
  }
  return (
    <>
      <img src={url} alt="" className={styles.thumbImage} onClick={() => setOpen(true)} />
      {open && <ImageLightbox src={url} onClose={() => setOpen(false)} />}
    </>
  );
}
