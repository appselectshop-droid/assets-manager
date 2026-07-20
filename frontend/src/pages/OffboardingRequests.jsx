import { useEffect, useState } from 'react';
import api from '../services/api';
import { ASSET_TYPE_LABELS, TYPE_ICONS } from '../config/assetFields';
// Mismos estilos que Solicitudes de Ingreso/Cuentas — misma tabla/modal, contenido distinto.
import styles from './AccountRequests.module.css';

const STATUS_CONFIG = {
  pendiente_rh:        { label: 'Con RH',                color: '#d97706', bg: '#fffbeb' },
  rechazada_rh:        { label: 'Rechazada por RH',       color: '#6b7280', bg: '#f9fafb' },
  pendiente_sistemas:  { label: 'Pendiente de Sistemas',  color: '#d97706', bg: '#fffbeb' },
  rechazada_sistemas:  { label: 'Rechazada por Sistemas', color: '#dc2626', bg: '#fef2f2' },
  completada:          { label: 'Baja procesada',         color: '#16a34a', bg: '#f0fdf4' },
};

function assetLabel(a) {
  const label = ASSET_TYPE_LABELS[a.type] || a.type;
  const icon = TYPE_ICONS[a.type] || '📦';
  const detail = [a.brand, a.model].filter(Boolean).join(' ');
  const tag = a.inventoryTag || a.serialNumber;
  return `${icon} ${label}${detail ? ` — ${detail}` : ''}${tag ? ` (${tag})` : ''}`;
}

function formatDate(d) {
  return d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

function reasonsList(r) {
  return [...(r.reasons || []).filter((x) => x !== 'Otro (especifica)'), r.reasonOther].filter(Boolean).join(', ') || '—';
}

// El detalle + las 2 acciones (procesar/rechazar) viven en un solo modal —
// pedido implícito por el flujo: Sistemas necesita ver qué activos hay que
// recoger ANTES de decidir si procesa la baja.
function DetailModal({ request, onClose, onDone }) {
  const [processing, setProcessing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleComplete = async () => {
    setProcessing(true);
    setError('');
    try {
      const { data } = await api.put(`/offboarding-requests/${request._id}/complete`);
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo procesar la baja.');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    setRejecting(true);
    setError('');
    try {
      await api.put(`/offboarding-requests/${request._id}/sistemas-reject`, { reason: rejectReason });
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo rechazar la solicitud.');
      setRejecting(false);
    }
  };

  if (result) {
    return (
      <div className={styles.overlay} onClick={onDone}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div className={styles.modalHeader}>
            <h2 className={styles.modalTitle}>✅ Baja procesada</h2>
            <button className={styles.closeBtn} onClick={onDone}>✕</button>
          </div>
          <div className={styles.modalBody}>
            <p className={styles.modalHint}>
              {request.employeeName} quedó marcado como inactivo y se liberaron {result.freedCount} activo(s) — ya se ven disponibles en Disponibilidad.
            </p>
            <button className={styles.btnApprove} onClick={onDone}>Listo</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>📤</span>
          <h2 className={styles.modalTitle}>{request.employeeName}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          {error && <p className={styles.formError}>{error}</p>}
          <p className={styles.modalHint}>
            {request.employeePosition || 'Sin puesto'} · {request.employeeOffice || 'Sin sucursal'}<br />
            <strong>Motivo:</strong> {reasonsList(request)}<br />
            <strong>Fecha de baja:</strong> {formatDate(request.bajaDate)}<br />
            <strong>Reportó:</strong> {request.requestedByName || '—'}<br />
            <strong>Aprobó RH:</strong> {request.rhReviewedByName || '—'} ({formatDate(request.rhReviewedAt)})
            {request.notes && <><br /><strong>Notas:</strong> {request.notes}</>}
          </p>

          <div className={styles.field}>
            <label>Activos asignados al momento del reporte ({request.assetsSnapshot.length})</label>
            {request.assetsSnapshot.length === 0 ? (
              <p className={styles.modalHint}>No tenía ningún activo asignado.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {request.assetsSnapshot.map((a) => (
                  <li key={a.assetId} style={{ fontSize: '0.85rem', color: '#333', marginBottom: '0.2rem' }}>{assetLabel(a)}</li>
                ))}
              </ul>
            )}
            <p className={styles.modalHint}>Al procesar, se libera lo que tenga asignado EN ESE MOMENTO (puede diferir de esta lista si algo cambió mientras esperaba).</p>
          </div>

          {showRejectBox && (
            <div className={styles.field}>
              <label>Motivo del rechazo (opcional)</label>
              <input className={styles.input} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Ej. la persona ya no causa baja..." />
            </div>
          )}

          <div className={styles.actions}>
            {!showRejectBox ? (
              <>
                <button className={styles.btnApprove} onClick={handleComplete} disabled={processing}>
                  {processing ? 'Procesando...' : 'Procesar baja y liberar activos'}
                </button>
                <button className={styles.btnReject} onClick={() => setShowRejectBox(true)}>Rechazar</button>
              </>
            ) : (
              <>
                <button className={styles.btnReject} onClick={handleReject} disabled={rejecting}>
                  {rejecting ? 'Rechazando...' : 'Sí, rechazar'}
                </button>
                <button className={styles.btnView} onClick={() => setShowRejectBox(false)}>Cancelar</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OffboardingRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('pendiente_sistemas');
  const [detailTarget, setDetailTarget] = useState(null);

  const load = async () => {
    setLoading(true);
    const params = filterStatus ? { status: filterStatus } : {};
    const { data } = await api.get('/offboarding-requests', { params });
    setRequests(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (r) => {
    if (!confirm(`¿Eliminar la solicitud de baja de "${r.employeeName}"? Esta acción no se puede deshacer.`)) return;
    await api.delete(`/offboarding-requests/${r._id}`);
    load();
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Bajas RH</h1>
          <p className={styles.subtitle}>Un jefe reporta la baja, RH la revisa y aquí llega el aviso para liberar el equipo asignado.</p>
        </div>
      </div>

      <div className={styles.tabs}>
        {['pendiente_rh', 'pendiente_sistemas', 'completada', 'rechazada_rh', 'rechazada_sistemas', ''].map((st) => (
          <button
            key={st || 'todas'}
            className={`${styles.tab} ${filterStatus === st ? styles.tabActive : ''}`}
            onClick={() => setFilterStatus(st)}
          >
            {st ? STATUS_CONFIG[st].label : 'Todas'}
          </button>
        ))}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Empleado</th>
              <th>Motivo</th>
              <th>Fecha de baja</th>
              <th>Activos</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className={styles.empty}>Cargando...</td></tr>}
            {!loading && requests.length === 0 && (
              <tr><td colSpan={6} className={styles.empty}>Sin solicitudes</td></tr>
            )}
            {requests.map((r) => {
              const sc = STATUS_CONFIG[r.status];
              return (
                <tr key={r._id}>
                  <td className={styles.nameCell}>
                    {r.employeeName}
                    <div className={styles.matchedTag} style={{ color: '#888' }}>{r.employeePosition || 'Sin puesto'}</div>
                  </td>
                  <td className={styles.reasonCell}>{reasonsList(r)}</td>
                  <td className={styles.date}>{formatDate(r.bajaDate)}</td>
                  <td>{r.assetsSnapshot.length}</td>
                  <td>
                    <span className={styles.statusBadge} style={{ color: sc.color, background: sc.bg }}>{sc.label}</span>
                  </td>
                  <td>
                    <div className={styles.actions}>
                      <button className={styles.btnView} onClick={() => setDetailTarget(r)}>Ver detalle</button>
                      <button className={styles.btnReject} onClick={() => handleDelete(r)}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {detailTarget && (
        <DetailModal
          request={detailTarget}
          onClose={() => setDetailTarget(null)}
          onDone={() => { setDetailTarget(null); load(); }}
        />
      )}
    </div>
  );
}
