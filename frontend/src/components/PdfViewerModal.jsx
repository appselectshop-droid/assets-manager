import styles from './PdfViewerModal.module.css';

// Visor embebido de PDF, usado en conjunto con hooks/usePdfViewer.js.
// El <iframe> apunta al object URL del blob ya descargado — el propio
// visor de PDF del navegador (Chrome/Edge) dibuja su barra con imprimir,
// guardar, buscar y zoom, así que no hay que construir ninguno de esos
// controles a mano.
export default function PdfViewerModal({ url, title = 'Documento', onClose }) {
  if (!url) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.headerIcon}>📄</span>
            <div>
              <p className={styles.title}>{title}</p>
              <p className={styles.subtitle}>Usa los íconos del visor para imprimir o guardar</p>
            </div>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className={styles.body}>
          <iframe src={url} title={title} className={styles.frame} />
        </div>
      </div>
    </div>
  );
}
