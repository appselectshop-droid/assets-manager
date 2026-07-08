import { useEffect, useState } from 'react';
import api from '../services/api';
// Mismos estilos que Solicitudes de Cuentas/Ingreso — misma tabla/modal, contenido distinto.
import styles from './AccountRequests.module.css';

const STATUS_CONFIG = {
  pendiente: { label: 'Pendiente', color: '#d97706', bg: '#fffbeb' },
  aprobada:  { label: 'Aprobada',  color: '#16a34a', bg: '#f0fdf4' },
  rechazada: { label: 'Rechazada', color: '#dc2626', bg: '#fef2f2' },
};

function ApproveModal({ request, onClose, onDone }) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleApprove = async () => {
    setSaving(true);
    try {
      await api.put(`/resource-requests/${request._id}/approve`, { resolutionNotes: notes });
      onDone();
    } catch (err) {
      alert(err.response?.data?.message || 'Error al aprobar la solicitud');
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>📦</span>
          <h2 className={styles.modalTitle}>Aprobar solicitud</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          <p className={styles.modalHint}>
            {request.employeeName} — {request.resourceItems?.join(', ')}
          </p>
          <div className={styles.field}>
            <label>Notas de resolución (opcional)</label>
            <textarea className={styles.input} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Entregado desde stock, pendiente de reponer..." />
          </div>
          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
            <button type="button" className={styles.btnPrimary} onClick={handleApprove} disabled={saving}>
              {saving ? 'Aprobando...' : 'Aprobar solicitud'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RejectModal({ request, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleReject = async () => {
    setSaving(true);
    try {
      await api.put(`/resource-requests/${request._id}/reject`, { reason });
      onDone();
    } catch (err) {
      alert(err.response?.data?.message || 'Error al rechazar la solicitud');
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Rechazar solicitud</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          <p className={styles.modalHint}>Solicitud de <strong>{request.employeeName}</strong> — {request.resourceItems?.join(', ')}</p>
          <div className={styles.field}>
            <label>Motivo (opcional)</label>
            <input className={styles.input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. no aplica, duplicada, sin presupuesto..." />
          </div>
          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
            <button type="button" className={styles.btnDanger} onClick={handleReject} disabled={saving}>
              {saving ? 'Rechazando...' : 'Sí, rechazar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailModal({ request, onClose }) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>📦</span>
          <h2 className={styles.modalTitle}>{request.employeeName}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          <p className={styles.modalHint}>{request.position || '—'} · {request.department || '—'}</p>
          <div className={styles.field}>
            <label>Recursos solicitados</label>
            <p>{request.resourceItems?.join(', ') || '—'}</p>
          </div>
          <div className={styles.field}>
            <label>Justificación</label>
            <p>{request.justification || '—'}</p>
          </div>
          {request.status !== 'pendiente' && (
            <div className={styles.field}>
              <label>{request.status === 'aprobada' ? 'Notas de resolución' : 'Motivo de rechazo'}</label>
              <p>{(request.status === 'aprobada' ? request.resolutionNotes : request.rejectionReason) || '—'}</p>
            </div>
          )}
          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResourceRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('pendiente');
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [detailTarget, setDetailTarget] = useState(null);

  const load = async () => {
    setLoading(true);
    const params = filterStatus ? { status: filterStatus } : {};
    const { data } = await api.get('/resource-requests', { params });
    setRequests(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (r) => {
    if (!confirm(`¿Eliminar la solicitud de "${r.employeeName}"? Esta acción no se puede deshacer.`)) return;
    await api.delete(`/resource-requests/${r._id}`);
    load();
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Solicitudes de Recursos</h1>
          <p className={styles.subtitle}>Accesorios y línea telefónica — revisa y aprueba o rechaza cada solicitud.</p>
        </div>
      </div>

      <div className={styles.tabs}>
        {['pendiente', 'aprobada', 'rechazada', ''].map((st) => (
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
              <th>Solicitante</th>
              <th>Puesto / Depto.</th>
              <th>Recursos solicitados</th>
              <th>Fecha</th>
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
                  <td className={styles.nameCell}>{r.employeeName}</td>
                  <td>{r.position || '—'}{r.department ? ` · ${r.department}` : ''}</td>
                  <td>{r.resourceItems?.join(', ') || '—'}</td>
                  <td className={styles.date}>{new Date(r.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td>
                    <span className={styles.statusBadge} style={{ color: sc.color, background: sc.bg }}>{sc.label}</span>
                  </td>
                  <td>
                    <div className={styles.actions}>
                      <button className={styles.btnView} onClick={() => setDetailTarget(r)}>Ver</button>
                      {r.status === 'pendiente' ? (
                        <>
                          <button className={styles.btnApprove} onClick={() => setApproveTarget(r)}>Aprobar</button>
                          <button className={styles.btnReject} onClick={() => setRejectTarget(r)}>Rechazar</button>
                        </>
                      ) : (
                        <span className={styles.muted}>{r.reviewedByName || '—'}</span>
                      )}
                      <button className={styles.btnReject} onClick={() => handleDelete(r)}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {approveTarget && (
        <ApproveModal
          request={approveTarget}
          onClose={() => setApproveTarget(null)}
          onDone={() => { setApproveTarget(null); load(); }}
        />
      )}
      {rejectTarget && (
        <RejectModal
          request={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onDone={() => { setRejectTarget(null); load(); }}
        />
      )}
      {detailTarget && (
        <DetailModal request={detailTarget} onClose={() => setDetailTarget(null)} />
      )}
    </div>
  );
}
