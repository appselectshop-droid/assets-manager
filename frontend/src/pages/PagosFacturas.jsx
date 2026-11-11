import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import page from './Page.module.css';
import styles from './Pagos.module.css';

// Facturas de un pago (2026-11-11, pedido explícito del usuario: "que deje
// importar las facturas en vez de palomear solamente, y visualizarlas ahí
// mismo... es pdf y xml siempre, luego vienen varias en un pago"). Se
// suben arrastrando o eligiendo archivos; el PDF se ve en un visor
// embebido y el XML con los datos del CFDI ya leídos por el backend.

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fecha(s) {
  if (!s) return '—';
  const [, m, d] = s.split('-').map(Number);
  return `${d} ${MESES[m - 1]}`;
}
function money(n, moneda = 'MXN') {
  if (n === null || n === undefined || n === '') return '—';
  return `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${moneda !== 'MXN' ? ` ${moneda}` : ''}`;
}
function fileSize(n) {
  if (!n) return '';
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}
const errMsg = (err, fallback) => err.response?.data?.message || err.message || fallback;

// Resultado de la verificación de cada archivo (ver backend utils/invoiceCheck.js).
const VERIF = {
  ok:             { icon: '✅', label: 'Verificada', cls: 'vOk' },
  revisar:        { icon: '⚠️', label: 'Revisar', cls: 'vWarn' },
  no_corresponde: { icon: '⛔', label: 'No corresponde', cls: 'vBad' },
  forzada:        { icon: '⛔', label: 'Subida de todos modos', cls: 'vBad' },
};
const CHECK_LABEL = { proveedor: 'Proveedor', compania: 'Compañía', cuenta: 'Cuenta', duplicado: 'Duplicado', fecha: 'Fecha', par: 'PDF' };

function Checks({ checks }) {
  if (!checks?.length) return null;
  return (
    <ul className={styles.checkList}>
      {checks.map((c, i) => (
        <li key={i}>
          <span>{c.ok === true ? '✅' : c.ok === false ? '⛔' : c.ok === 'info' ? 'ℹ️' : '⚠️'}</span>
          <b>{CHECK_LABEL[c.key] || c.key}:</b> {c.msg}
        </li>
      ))}
    </ul>
  );
}

export function FacturasButton({ cycle, onClick }) {
  const n = cycle.facturas?.length || 0;
  return (
    <button
      className={n ? styles.actFacturaHas : styles.actFactura}
      onClick={onClick}
      title={n ? 'Ver o agregar facturas' : 'Subir factura (PDF y XML)'}
    >
      📎 {n ? `Facturas (${n})` : 'Subir factura'}
    </button>
  );
}

export default function FacturasModal({ cycle, onClose, onChanged }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [viewing, setViewing] = useState(null); // { factura, url?, text? }
  const [blocked, setBlocked] = useState(null); // { files, results } cuando algo no corresponde
  const facturas = cycle.facturas || [];

  useEffect(() => () => { if (viewing?.url) URL.revokeObjectURL(viewing.url); }, [viewing]);

  const open = async (f) => {
    setError('');
    try {
      const { data } = await api.get(`/payments/facturas/${f.fileId}`, { responseType: 'blob' });
      if (f.kind === 'xml') setViewing({ factura: f, text: await data.text() });
      else setViewing({ factura: f, url: URL.createObjectURL(new Blob([data], { type: 'application/pdf' })) });
    } catch (err) {
      setError(errMsg(err, 'No se pudo abrir la factura'));
    }
  };

  // Al entrar abre la primera factura (PDF primero) para que se vea de una.
  useEffect(() => {
    if (facturas.length) open(facturas.find((f) => f.kind === 'pdf') || facturas[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle._id]);

  const upload = async (fileList, force = false) => {
    const files = [...fileList].filter((f) => /\.(pdf|xml)$/i.test(f.name));
    if (!files.length) { setError('Solo se aceptan archivos PDF o XML.'); return; }
    setUploading(true);
    setError('');
    setBlocked(null);
    try {
      const form = new FormData();
      files.forEach((f) => form.append('files', f));
      let data;
      try {
        ({ data } = await api.post(`/payments/cycles/${cycle._id}/facturas${force ? '?force=1' : ''}`, form));
      } catch (err) {
        if (err.response?.status === 409) { setBlocked({ files, results: err.response.data.results || [] }); return; }
        throw err;
      }
      onChanged(data);
      const nuevas = data.facturas.slice(-files.length);
      const mostrar = nuevas.find((f) => f.kind === 'pdf') || nuevas[0];
      if (mostrar) open(mostrar);
    } catch (err) {
      setError(errMsg(err, 'No se pudieron subir'));
    } finally {
      setUploading(false);
    }
  };

  const download = async (f) => {
    try {
      const { data } = await api.get(`/payments/facturas/${f.fileId}`, { responseType: 'blob' });
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
      const { data } = await api.delete(`/payments/cycles/${cycle._id}/facturas/${f.fileId}`);
      if (viewing?.factura.fileId === f.fileId) setViewing(null);
      onChanged(data);
    } catch (err) {
      setError(errMsg(err, 'No se pudo quitar'));
    }
  };

  const xmlTotal = facturas
    .filter((f) => f.kind === 'xml' && f.cfdi?.total != null && (!f.cfdi.tipo || f.cfdi.tipo === 'I'))
    .reduce((a, f) => a + f.cfdi.total, 0);

  return (
    <div className={page.overlay} onClick={onClose}>
      <div className={`${page.modal} ${styles.invoiceModal}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.invoiceHead}>
          <div>
            <h2 className={page.modalTitle}>Facturas · {cycle.service.proveedor}</h2>
            <p className={styles.modalLead}>
              {cycle.service.cuenta || '—'} · {cycle.service.compania} · periodo {cycle.periodo} · vence {fecha(cycle.fechaLimite)} · corte {fecha(cycle.fechaMeter)} (Semana {cycle.semana})
            </p>
          </div>
          <button className={styles.closeX} onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div className={styles.invoiceBody}>
          <aside className={styles.invoiceSide}>
            <label
              className={`${styles.dropZone} ${dragging ? styles.dropZoneOn : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}
            >
              <input type="file" accept=".pdf,.xml" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
              <strong>{uploading ? 'Subiendo…' : 'Arrastra aquí el PDF y el XML'}</strong>
              <span>o haz clic para elegirlos · puedes subir varios a la vez</span>
            </label>

            {error && <div className={styles.errorBox}>{error}</div>}

            {blocked && (
              <div className={styles.blockedBox}>
                <strong>⛔ No se subió nada: algo no parece ser de este pago.</strong>
                {blocked.results.map((r) => (
                  <div key={r.filename} className={styles.blockedItem}>
                    <span>{VERIF[r.status]?.icon} {r.filename}</span>
                    <Checks checks={r.checks.filter((c) => c.ok !== true)} />
                  </div>
                ))}
                <div className={styles.blockedActions}>
                  <button className={page.btnCancel} onClick={() => setBlocked(null)}>Cancelar</button>
                  <button className={page.btnSecondary} onClick={() => upload(blocked.files, true)}>Subir de todos modos</button>
                </div>
              </div>
            )}

            {facturas.length === 0 ? (
              <p className={styles.emptyLine}>Este pago aún no tiene facturas.</p>
            ) : (
              <ul className={styles.invoiceList}>
                {facturas.map((f) => (
                  <li key={f.fileId} className={`${styles.invoiceItem} ${viewing?.factura.fileId === f.fileId ? styles.invoiceItemOn : ''}`}>
                    <button className={styles.invoiceOpen} onClick={() => open(f)}>
                      <span className={f.kind === 'pdf' ? styles.kindPdf : styles.kindXml}>{f.kind.toUpperCase()}</span>
                      {f.verificacion && <span className={styles.vIcon} title={VERIF[f.verificacion.status]?.label}>{VERIF[f.verificacion.status]?.icon}</span>}
                      <span className={styles.invoiceName}>
                        {f.filename}
                        <small>
                          {f.cfdi?.total != null ? `${money(f.cfdi.total, f.cfdi.moneda || 'MXN')} · ` : ''}
                          {f.cfdi && (f.cfdi.serie || f.cfdi.folio) ? `${f.cfdi.serie || ''}${f.cfdi.folio || ''} · ` : ''}
                          {fileSize(f.size)}
                        </small>
                      </span>
                    </button>
                    <div className={styles.invoiceTools}>
                      <button onClick={() => download(f)} title="Descargar">⬇</button>
                      <button onClick={() => remove(f)} title="Quitar">✕</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {xmlTotal > 0 && cycle.service.montoEstimado > 0 && Math.abs(xmlTotal - cycle.service.montoEstimado) > cycle.service.montoEstimado * 0.3 && (
              <p className={styles.amountWarn}>⚠️ El total de los XML ({money(xmlTotal)}) es muy distinto al monto estimado de este pago ({money(cycle.service.montoEstimado)}).</p>
            )}
            {xmlTotal > 0 && (
              <p className={styles.invoiceTotal}>
                Total según XML: <strong>{money(xmlTotal)}</strong>
                {cycle.montoReal != null && Math.abs(cycle.montoReal - xmlTotal) > 0.01 && <> · monto capturado {money(cycle.montoReal)}</>}
              </p>
            )}
          </aside>

          <section className={styles.viewerCol}>
          {viewing?.factura.verificacion && (
            <div className={`${styles.verifBar} ${styles[VERIF[viewing.factura.verificacion.status]?.cls]}`}>
              <strong>{VERIF[viewing.factura.verificacion.status]?.icon} {VERIF[viewing.factura.verificacion.status]?.label}</strong>
              <Checks checks={viewing.factura.verificacion.checks} />
            </div>
          )}
          <section className={styles.invoiceViewer}>
            {!viewing && <div className={styles.viewerEmpty}>Elige una factura para verla aquí.</div>}
            {viewing?.url && <iframe title={viewing.factura.filename} src={viewing.url} className={styles.pdfFrame} />}
            {viewing && viewing.text !== undefined && <CfdiView factura={viewing.factura} text={viewing.text} />}
          </section>
          </section>
        </div>
      </div>
    </div>
  );
}

function CfdiView({ factura, text }) {
  const c = factura.cfdi;
  const pretty = useMemo(() => text.replace(/>\s*</g, '>\n<'), [text]);
  return (
    <div className={styles.cfdi}>
      {c ? (
        <dl className={styles.cfdiGrid}>
          <dt>Emisor</dt><dd>{c.emisorNombre} <small>{c.emisorRfc}</small></dd>
          <dt>Receptor</dt><dd>{c.receptorNombre} <small>{c.receptorRfc}</small></dd>
          <dt>Serie / folio</dt><dd>{c.serie}{c.folio}</dd>
          <dt>Fecha</dt><dd>{(c.fecha || '').replace('T', ' ')}</dd>
          <dt>Total</dt><dd><strong>{money(c.total, c.moneda || 'MXN')}</strong>{c.tipo && c.tipo !== 'I' ? ` · tipo ${c.tipo}` : ''}</dd>
          <dt>UUID</dt><dd className={styles.mono}>{c.uuid}</dd>
        </dl>
      ) : <p className={styles.hint}>No se reconoció como CFDI; se muestra el XML tal cual.</p>}
      <pre className={styles.xmlRaw}>{pretty}</pre>
    </div>
  );
}
