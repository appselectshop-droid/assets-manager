import { useEffect, useState } from 'react';
import api from '../services/api';
import CreateAssetBajaModal from '../components/CreateAssetBajaModal';
import usePdfViewer from '../hooks/usePdfViewer';
import PdfViewerModal from '../components/PdfViewerModal';
import { ASSET_TYPE_LABELS } from '../config/assetFields';
// Mismos estilos que Solicitudes de Cuentas — misma tabla/modal, contenido
// distinto (mismo criterio ya usado por Shipments.jsx).
import styles from './AccountRequests.module.css';

const REASON_ICON = {
  'Venta': '💰',
  'Robo o extravío': '🚨',
  'Descompuesto sin reparación posible': '🛠️',
  'Obsolescencia': '📉',
  'Otro': '❓',
};

function DetailModal({ baja, onClose }) {
  const a = baja.assetSnapshot || {};
  const isVenta = baja.reason === 'Venta';
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>{REASON_ICON[baja.reason] || '🗑️'}</span>
          <h2 className={styles.modalTitle}>{baja.folio}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          <p className={styles.modalHint}>
            {ASSET_TYPE_LABELS[a.type] || a.type} — {[a.brand, a.model].filter(Boolean).join(' ')} — {a.serialNumber || a.inventoryTag || 'sin serie'}
          </p>
          <div className={styles.field}>
            <label>Motivo</label>
            <p>{baja.reason}{baja.reasonOther ? `: ${baja.reasonOther}` : ''}</p>
          </div>
          <div className={styles.field}>
            <label>Condición</label>
            <p>{baja.condition}{baja.conditionNotes ? ` — ${baja.conditionNotes}` : ''}</p>
          </div>
          <div className={styles.field}>
            <label>Datos corporativos borrados</label>
            <p>{baja.dataWiped ? 'Sí' : 'No'}</p>
          </div>
          {isVenta && (
            <>
              <div className={styles.field}>
                <label>Comprador</label>
                <p>{baja.buyerName} ({baja.buyerType === 'empleado' ? 'Empleado de SelectShop' : 'Externo / tercero'})</p>
              </div>
              <div className={styles.field}>
                <label>Venta</label>
                <p>
                  ${Number(baja.saleAmount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  {' — '}{baja.paymentMethod === 'Otro' ? baja.paymentMethodOther : baja.paymentMethod}
                  {baja.paymentDate && ` — ${new Date(baja.paymentDate).toLocaleDateString('es-MX')}`}
                </p>
                {baja.saleReference && <p style={{ fontSize: '0.82rem', color: '#666' }}>Ref: {baja.saleReference}</p>}
              </div>
            </>
          )}
          <div className={styles.field}>
            <label>Registrada por</label>
            <p>{baja.createdByName} — {new Date(baja.createdAt).toLocaleString('es-MX')}</p>
          </div>
          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AssetBajas() {
  const [bajas, setBajas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterReason, setFilterReason] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [detailTarget, setDetailTarget] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const { pdf, showPdf, closePdf } = usePdfViewer();

  const load = async () => {
    setLoading(true);
    const params = filterReason ? { reason: filterReason } : {};
    const { data } = await api.get('/asset-bajas', { params });
    setBajas(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterReason]); // eslint-disable-line react-hooks/exhaustive-deps

  const downloadPdf = async (b) => {
    setDownloadingId(b._id);
    try {
      const resp = await api.get(`/asset-bajas/${b._id}/pdf`, { responseType: 'blob' });
      const blob = new Blob([resp.data], { type: 'application/pdf' });
      showPdf(blob, `Baja_${b.folio}`);
    } catch (err) {
      alert(err.response?.data?.message || 'No se pudo descargar el PDF');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (b) => {
    if (!confirm(`¿Eliminar el registro de baja ${b.folio}? El activo vuelve a estar disponible. Esta acción no se puede deshacer.`)) return;
    await api.delete(`/asset-bajas/${b._id}`);
    load();
  };

  const totalVendido = bajas.filter((b) => b.reason === 'Venta').reduce((sum, b) => sum + (b.saleAmount || 0), 0);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Bajas de Activos</h1>
          <p className={styles.subtitle}>Baja de inventario por venta u otro motivo — genera el Formato de Salida por Baja de Activo en PDF.</p>
        </div>
        <button className={styles.btnPrimary} onClick={() => setShowCreate(true)}>+ Nueva baja</button>
      </div>

      <div className={styles.tabs}>
        {['', ...['Venta', 'Robo o extravío', 'Descompuesto sin reparación posible', 'Obsolescencia', 'Otro']].map((r) => (
          <button
            key={r || 'todos'}
            className={`${styles.tab} ${filterReason === r ? styles.tabActive : ''}`}
            onClick={() => setFilterReason(r)}
          >
            {r ? `${REASON_ICON[r]} ${r}` : 'Todos'}
          </button>
        ))}
      </div>

      {totalVendido > 0 && (
        <p className={styles.subtitle} style={{ marginBottom: '0.5rem' }}>
          Total vendido (según filtro actual): <strong>${totalVendido.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong>
        </p>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Folio</th>
              <th>Activo</th>
              <th>Motivo</th>
              <th>Comprador / Monto</th>
              <th>Fecha</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className={styles.empty}>Cargando...</td></tr>}
            {!loading && bajas.length === 0 && (
              <tr><td colSpan={6} className={styles.empty}>Sin bajas registradas</td></tr>
            )}
            {bajas.map((b) => {
              const a = b.assetSnapshot || {};
              return (
                <tr key={b._id}>
                  <td className={styles.nameCell}>{b.folio}</td>
                  <td>{ASSET_TYPE_LABELS[a.type] || a.type} — {[a.brand, a.model].filter(Boolean).join(' ')}</td>
                  <td className={styles.reasonCell}>{REASON_ICON[b.reason]} {b.reason}</td>
                  <td>{b.reason === 'Venta' ? `${b.buyerName} — $${Number(b.saleAmount || 0).toLocaleString('es-MX')}` : '—'}</td>
                  <td className={styles.date}>{new Date(b.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td>
                    <div className={styles.actions}>
                      <button className={styles.btnView} onClick={() => setDetailTarget(b)}>Ver</button>
                      <button className={styles.btnView} onClick={() => downloadPdf(b)} disabled={downloadingId === b._id}>
                        {downloadingId === b._id ? '...' : '⬇ Formato'}
                      </button>
                      <button className={styles.btnReject} onClick={() => handleDelete(b)}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateAssetBajaModal onClose={() => setShowCreate(false)} onDone={() => { setShowCreate(false); load(); }} />
      )}
      {detailTarget && (
        <DetailModal baja={detailTarget} onClose={() => setDetailTarget(null)} />
      )}
      {pdf && <PdfViewerModal url={pdf.url} title={pdf.title} onClose={closePdf} />}
    </div>
  );
}
