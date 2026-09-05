import styles from '../pages/Assets.module.css';

// Ver la foto en grande — pedido explícito del usuario (2026-09-05): "en la
// tabla casi ni se ven... si toco la imagen se abra en grande y un tache
// para salir". Se usa tanto en AssetThumbnail (tabla) como en la vista
// previa del modal de alta/edición.
export default function ImageLightbox({ src, onClose }) {
  return (
    <div className={styles.lightboxOverlay} onClick={onClose}>
      <button type="button" className={styles.lightboxClose} onClick={onClose}>✕</button>
      <img src={src} alt="" className={styles.lightboxImage} onClick={(e) => e.stopPropagation()} />
    </div>
  );
}
