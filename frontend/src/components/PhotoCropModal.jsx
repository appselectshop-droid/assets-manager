import { useRef, useState } from 'react';
import styles from '../pages/Assets.module.css';

// Recortar la foto del activo/lote antes de guardarla — pedido explícito del
// usuario (2026-09-05): "no quiero que se esté viendo el fondo, entonces las
// quiero recortar". Mismo mecanismo de arrastrar-para-marcar ya usado en
// OcrCaptureModal, aplicado aquí para quedarse solo con el producto.
export default function PhotoCropModal({ src, onConfirm, onCancel }) {
  const imgRef = useRef(null);
  const [drag, setDrag] = useState(null); // { startX, startY, x, y }

  const posFromEvent = (e) => {
    const rect = imgRef.current.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  };
  const handlePointerDown = (e) => {
    const p = posFromEvent(e);
    setDrag({ startX: p.x, startY: p.y, x: p.x, y: p.y });
  };
  const handlePointerMove = (e) => {
    if (!drag) return;
    const p = posFromEvent(e);
    setDrag((d) => ({ ...d, x: p.x, y: p.y }));
  };

  const rectWidth = drag ? Math.abs(drag.x - drag.startX) : 0;
  const rectHeight = drag ? Math.abs(drag.y - drag.startY) : 0;
  const hasSelection = drag && rectWidth > 15 && rectHeight > 15;

  const applyCrop = (useFull) => {
    const img = imgRef.current;
    const canvas = document.createElement('canvas');

    if (!useFull && hasSelection) {
      const scaleX = img.naturalWidth / img.clientWidth;
      const scaleY = img.naturalHeight / img.clientHeight;
      const sx = Math.min(drag.startX, drag.x) * scaleX;
      const sy = Math.min(drag.startY, drag.y) * scaleY;
      const sw = rectWidth * scaleX;
      const sh = rectHeight * scaleY;
      canvas.width = sw;
      canvas.height = sh;
      canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    } else {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
    }
    canvas.toBlob((blob) => onConfirm(blob), 'image/jpeg', 0.92);
  };

  const rectStyle = drag ? {
    left: Math.min(drag.startX, drag.x),
    top: Math.min(drag.startY, drag.y),
    width: rectWidth,
    height: rectHeight,
  } : null;

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>✂️</span>
          <h2 className={styles.modalTitle}>Recortar foto</h2>
          <button className={styles.closeBtn} onClick={onCancel}>✕</button>
        </div>
        <div className={styles.form}>
          <p className={styles.serialProgress}>
            Marca con el dedo/mouse solo el producto, sin el fondo — o toca "Usar foto completa" para dejarla tal cual.
          </p>
          <div
            className={styles.ocrCropWrap}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
          >
            <img ref={imgRef} src={src} alt="" className={styles.ocrPreview} draggable={false} />
            {rectStyle && <div className={styles.ocrCropRect} style={rectStyle} />}
          </div>
          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onCancel}>Cancelar</button>
            <button type="button" className={styles.btnCancel} onClick={() => applyCrop(true)}>Usar foto completa</button>
            <button type="button" className={styles.btnPrimary} disabled={!hasSelection} onClick={() => applyCrop(false)}>
              ✂️ Recortar y usar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
