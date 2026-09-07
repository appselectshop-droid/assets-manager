import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import styles from '../pages/Assets.module.css';
import ImageLightbox from './ImageLightbox';

// Miniatura de foto en la tabla — pedido explícito del usuario (2026-09-04):
// "dame las fotos en la tabla de accesorios/activos, tipo ERP". El listado
// (GET /assets) excluye a propósito el binario de la foto por rendimiento
// (ver LIST_EXCLUDE_FIELDS en routes/assets.js) — aquí solo se pide el
// binario, uno por fila, para las filas que de verdad tienen foto
// (`photoMimeType` truthy, ese sí viene en el listado).
//
// Carga perezosa por scroll (2026-09-08, fix real de rendimiento): la tabla
// de Activos no pagina — muestra las 700+ filas de golpe, y con 767 de 773
// activos con foto, el primer intento pedía todas las fotos apenas se
// montaba la tabla (cientos de peticiones simultáneas contra un EC2 chico,
// t3.small/2GB compartido con Mongo) — eso era el "tarda mucho en cargar"
// que reportó el usuario. Con IntersectionObserver, cada miniatura solo
// pide su foto cuando la fila entra en pantalla (con 200px de margen para
// que ya esté lista al llegar ahí scrolleando).
export default function AssetThumbnail({ asset }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!asset.photoMimeType || visible || !ref.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { rootMargin: '200px' }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [asset.photoMimeType, visible]);

  useEffect(() => {
    if (!visible) return;
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
  }, [visible, asset._id]);

  if (!asset.photoMimeType || failed) {
    return <div ref={ref} className={styles.thumbPlaceholder}>📦</div>;
  }
  if (!url) {
    return <div ref={ref} className={styles.thumbPlaceholder} />;
  }
  return (
    <>
      <img ref={ref} src={url} alt="" className={styles.thumbImage} onClick={() => setOpen(true)} />
      {open && <ImageLightbox src={url} onClose={() => setOpen(false)} />}
    </>
  );
}
