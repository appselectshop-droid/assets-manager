import Icon from '../components/Icon';
import { useEffect, useState } from 'react';
import api from '../services/api';
import page from './Page.module.css';
import styles from './Pagos.module.css';

// Archivo de Cuentas por Pagar de un pago (2026-11-18, pedido explícito del
// usuario: "un apartado de adjuntar el archivo que arroja CxP aparte de las
// facturas"). Separado de las facturas: no se verifica ni cambia el estado
// del pago, solo se guarda junto a él para tenerlo a la mano.

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv';
const OK_EXT = /\.(pdf|png|jpe?g|webp|xlsx?|csv)$/i;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fecha(s) {
  if (!s) return '—';
  const [, m, d] = s.split('-').map(Number);
  return `${d} ${MESES[m - 1]}`;
}
function fileSize(n) {
  if (!n) return '';
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}
const kindOf = (f) => {
  if (/\.pdf$/i.test(f.filename)) return 'pdf';
  if (/\.(png|jpe?g|webp)$/i.test(f.filename)) return 'img';
  return 'otro';
};
const KIND_LABEL = { pdf: 'PDF', img: 'IMG' };
const errMsg = (err, fallback) => err.response?.data?.message || err.message || fallback;

export function CxpButton({ cycle, onClick }) {
  const n = cycle.archivosCxp?.length || 0;
  return (
    <button
      className={n ? styles.actCxpHas : styles.actCxp}
      onClick={onClick}
      title={n ? 'Ver o agregar el archivo de CxP' : 'Adjuntar el archivo que genera Cuentas por Pagar'}
    >
      <Icon e="🧾" /> {n ? `CxP (${n})` : 'Archivo CxP'}
    </button>
  );
}

export default function CxpModal({ cycle, onClose, onChanged }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [viewing, setViewing] = useState(null); // { archivo, url, kind }
  const archivos = cycle.archivosCxp || [];

  useEffect(() => () => { if (viewing?.url) URL.revokeObjectURL(viewing.url); }, [viewing]);

  const open = async (f) => {
    setError('');
    const kind = kindOf(f);
    if (kind === 'otro') { setViewing({ archivo: f, kind }); return; }
    try {
      const { data } = await api.get(`/payments/cxp/${f.fileId}`, { responseType: 'blob' });
      setViewing({ archivo: f, kind, url: URL.createObjectURL(new Blob([data], { type: f.contentType || data.type })) });
    } catch (err) {
      setError(errMsg(err, 'No se pudo abrir el archivo'));
    }
  };

  useEffect(() => {
    if (archivos.length) open(archivos[archivos.length - 1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle._id]);

  const upload = async (fileList) => {
    const files = [...fileList].filter((f) => OK_EXT.test(f.name));
    if (!files.length) { setError('Solo se aceptan PDF, imagen (PNG/JPG) o Excel/CSV.'); return; }
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      files.forEach((f) => form.append('files', f));
      const { data } = await api.post(`/payments/cycles/${cycle._id}/cxp`, form);
      onChanged(data);
      const nuevo = data.archivosCxp[data.archivosCxp.length - 1];
      if (nuevo) open(nuevo);
    } catch (err) {
      setError(errMsg(err, 'No se pudo subir'));
    } finally {
      setUploading(false);
    }
  };

  const download = async (f) => {
    try {
      const { data } = await api.get(`/payments/cxp/${f.fileId}`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = f.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(errMsg(err, 'No se pudo descargar'));
    }
  };

  const remove = async (f) => {
    if (!window.confirm(`¿Quitar ${f.filename} de este pago?`)) return;
    try {
      const { data } = await api.delete(`/payments/cycles/${cycle._id}/cxp/${f.fileId}`);
      if (viewing?.archivo.fileId === f.fileId) setViewing(null);
      onChanged(data);
    } catch (err) {
      setError(errMsg(err, 'No se pudo quitar'));
    }
  };

  return (
    <div className={page.overlay} onClick={onClose}>
      <div className={`${page.modal} ${styles.invoiceModal}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.invoiceHead}>
          <div>
            <h2 className={page.modalTitle}>Archivo de CxP · {cycle.service.proveedor}</h2>
            <p className={styles.modalLead}>
              {cycle.service.cuenta || '—'} · {cycle.service.compania} · periodo {cycle.periodo} · vence {fecha(cycle.fechaLimite)}
              {cycle.folioCxp ? ` · folio ${cycle.folioCxp}` : ''}
            </p>
          </div>
          <button className={styles.closeX} onClick={onClose} aria-label="Cerrar"><Icon e="✕" /></button>
        </div>

        <div className={styles.invoiceBody}>
          <aside className={styles.invoiceSide}>
            <label
              className={`${styles.dropZone} ${dragging ? styles.dropZoneOn : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}
            >
              <input type="file" accept={ACCEPT} multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
              <strong>{uploading ? 'Subiendo…' : 'Arrastra aquí el archivo de CxP'}</strong>
              <span>o haz clic para elegirlo · PDF, imagen o Excel</span>
            </label>

            {error && <div className={styles.errorBox}>{error}</div>}

            {archivos.length === 0 ? (
              <p className={styles.emptyLine}>Este pago aún no tiene archivo de CxP. Las facturas van aparte, en su propio botón.</p>
            ) : (
              <ul className={styles.invoiceList}>
                {archivos.map((f) => (
                  <li key={f.fileId} className={`${styles.invoiceItem} ${viewing?.archivo.fileId === f.fileId ? styles.invoiceItemOn : ''}`}>
                    <button className={styles.invoiceOpen} onClick={() => open(f)}>
                      <span className={kindOf(f) === 'pdf' ? styles.kindPdf : styles.kindXml}>{KIND_LABEL[kindOf(f)] || (f.filename.split('.').pop() || '').toUpperCase()}</span>
                      <span className={styles.invoiceName}>
                        {f.filename}
                        <small>{fileSize(f.size)}{f.uploadedBy ? ` · ${f.uploadedBy}` : ''}</small>
                      </span>
                    </button>
                    <div className={styles.invoiceTools}>
                      <button aria-label="Descargar" onClick={() => download(f)} title="Descargar"><Icon e="⬇" /></button>
                      <button aria-label="Quitar" onClick={() => remove(f)} title="Quitar"><Icon e="✕" /></button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section className={styles.viewerCol}>
            <section className={styles.invoiceViewer}>
              {!viewing && <div className={styles.viewerEmpty}>Elige un archivo para verlo aquí.</div>}
              {viewing?.kind === 'pdf' && viewing.url && <iframe title={viewing.archivo.filename} src={viewing.url} className={styles.pdfFrame} />}
              {viewing?.kind === 'img' && viewing.url && <img alt={viewing.archivo.filename} src={viewing.url} className={styles.cxpImg} />}
              {viewing?.kind === 'otro' && (
                <div className={styles.viewerEmpty}>
                  Este tipo de archivo no se puede ver aquí.
                  <button className={page.btnSecondary} onClick={() => download(viewing.archivo)}><Icon e="⬇" /> Descargar {viewing.archivo.filename}</button>
                </div>
              )}
            </section>
          </section>
        </div>
      </div>
    </div>
  );
}
