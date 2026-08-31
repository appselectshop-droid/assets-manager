import styles from './PdfViewerModal.module.css';

// Visor embebido de PDF, usado en conjunto con hooks/usePdfViewer.js.
// El <iframe> apunta al object URL del blob ya descargado — el propio
// visor de PDF del navegador (Chrome/Edge) dibuja su barra con imprimir,
// guardar, buscar y zoom, así que no hay que construir ninguno de esos
// controles a mano.
//
// `mimeType` (opcional, 2026-08-31, pedido explícito del usuario): la
// evidencia/adjuntos de Tickets pueden ser imagen O PDF según lo que suba
// quien reporta — antes esos casos abrían en pestaña nueva del navegador
// (`window.open`) en vez del visor embebido que ya usan las Responsivas.
// Con `mimeType` empezando en "image/" se muestra la imagen centrada en
// vez del `<iframe>` de PDF — mismo modal, mismo criterio visual. Si se
// omite `mimeType` (todos los usos previos: Responsivas, Solicitudes de
// Cuenta, etc.), el comportamiento es IDÉNTICO a antes — siempre `<iframe>`.
export default function PdfViewerModal({ url, title = 'Documento', mimeType = '', onClose }) {
  if (!url) return null;
  const isImage = mimeType.startsWith('image/');

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.headerIcon}>{isImage ? '🖼️' : '📄'}</span>
            <div>
              <p className={styles.title}>{title}</p>
              <p className={styles.subtitle}>{isImage ? 'Clic en ✕ o afuera de la imagen para cerrar' : 'Usa los íconos del visor para imprimir o guardar'}</p>
            </div>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className={`${styles.body} ${isImage ? styles.bodyImage : ''}`}>
          {isImage
            ? <img src={url} alt={title} className={styles.image} />
            : <iframe src={url} title={title} className={styles.frame} />}
        </div>
      </div>
    </div>
  );
}
