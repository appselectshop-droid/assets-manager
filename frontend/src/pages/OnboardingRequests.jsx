import { useEffect, useState } from 'react';
import api from '../services/api';
// Mismos estilos que Solicitudes de Cuentas — misma tabla/modal, contenido distinto.
import styles from './AccountRequests.module.css';

const STATUS_CONFIG = {
  pendiente: { label: 'Pendiente', color: '#d97706', bg: '#fffbeb' },
  aprobada:  { label: 'Aprobada',  color: '#16a34a', bg: '#f0fdf4' },
  rechazada: { label: 'Rechazada', color: '#dc2626', bg: '#fef2f2' },
};

function ApproveModal({ request, onClose, onDone }) {
  const [form, setForm] = useState({
    employeeId: '',
    name: request.employeeName || '',
    position: request.position || '',
    department: request.department || '',
    area: request.area || '',
    businessName: request.businessName || '',
    office: request.office || '',
    phone: '',
    corporateEmail: request.desiredCorporateEmail || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const handleApprove = async () => {
    if (!form.employeeId.trim()) { setError('Captura el número de empleado.'); return; }
    if (!form.name.trim()) { setError('Falta el nombre.'); return; }
    setSaving(true);
    setError('');
    try {
      await api.put(`/onboarding-requests/${request._id}/approve`, form);
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al aprobar la solicitud');
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className={styles.overlay} onClick={onDone}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div className={styles.modalHeader}>
            <h2 className={styles.modalTitle}>✅ Empleado creado</h2>
            <button className={styles.closeBtn} onClick={onDone}>✕</button>
          </div>
          <div className={styles.modalBody}>
            <p className={styles.modalHint}>{form.name} ya quedó registrado en Empleados. Continúa desde ahí para asignarle equipo, cuentas, etc.</p>
            <div className={styles.modalActions}>
              <button className={styles.btnPrimary} onClick={onDone}>Listo</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>🧑‍💼</span>
          <h2 className={styles.modalTitle}>Aprobar ingreso</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          {error && <p className={styles.formError}>{error}</p>}
          <p className={styles.modalHint}>Confirma o corrige los datos antes de crear el empleado real.</p>

          <div className={styles.field}>
            <label>No. de empleado *</label>
            <input className={styles.input} value={form.employeeId} onChange={set('employeeId')} autoFocus />
          </div>
          <div className={styles.field}>
            <label>Nombre completo *</label>
            <input className={styles.input} value={form.name} onChange={set('name')} />
          </div>
          <div className={styles.field}>
            <label>Puesto</label>
            <input className={styles.input} value={form.position} onChange={set('position')} />
          </div>
          <div className={styles.field}>
            <label>Área</label>
            <input className={styles.input} value={form.area} onChange={set('area')} />
          </div>
          <div className={styles.field}>
            <label>Departamento</label>
            <input className={styles.input} value={form.department} onChange={set('department')} />
          </div>
          <div className={styles.field}>
            <label>Empresa / Razón social</label>
            <input className={styles.input} value={form.businessName} onChange={set('businessName')} />
          </div>
          <div className={styles.field}>
            <label>Oficina / Sucursal</label>
            <input className={styles.input} value={form.office} onChange={set('office')} />
          </div>
          <div className={styles.field}>
            <label>Teléfono</label>
            <input className={styles.input} value={form.phone} onChange={set('phone')} />
          </div>
          <div className={styles.field}>
            <label>Correo corporativo</label>
            <input className={styles.input} value={form.corporateEmail} onChange={set('corporateEmail')} />
          </div>

          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
            <button type="button" className={styles.btnPrimary} onClick={handleApprove} disabled={saving}>
              {saving ? 'Creando...' : 'Aprobar y crear empleado'}
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
      await api.put(`/onboarding-requests/${request._id}/reject`, { reason });
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
          <p className={styles.modalHint}>Solicitud de ingreso de <strong>{request.employeeName}</strong> — esta acción no crea ningún empleado.</p>
          <div className={styles.field}>
            <label>Motivo (opcional)</label>
            <input className={styles.input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. duplicada, cancelado el ingreso..." />
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

export default function OnboardingRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('pendiente');
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);

  const load = async () => {
    setLoading(true);
    const params = filterStatus ? { status: filterStatus } : {};
    const { data } = await api.get('/onboarding-requests', { params });
    setRequests(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterStatus]);

  const needsList = (r) => {
    const parts = [];
    if (r.needsEmail) parts.push('Correo');
    if (r.needsComputer) parts.push('Computadora');
    if (r.needsPhone) parts.push('Teléfono');
    if (r.needsAccessories) parts.push('Accesorios');
    if (r.needsWelcomeKit) parts.push('Kit bienvenida');
    return parts.length ? parts.join(', ') : '—';
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Solicitudes de Ingreso</h1>
          <p className={styles.subtitle}>Avisos de RH sobre nuevos ingresos — revisa y aprueba antes de dar de alta al empleado.</p>
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
              <th>Nuevo ingreso</th>
              <th>Puesto</th>
              <th>Fecha de ingreso</th>
              <th>Necesita</th>
              <th>Solicitado por</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className={styles.empty}>Cargando...</td></tr>}
            {!loading && requests.length === 0 && (
              <tr><td colSpan={7} className={styles.empty}>Sin solicitudes</td></tr>
            )}
            {requests.map((r) => {
              const sc = STATUS_CONFIG[r.status];
              return (
                <tr key={r._id}>
                  <td className={styles.nameCell}>
                    {r.employeeName}
                    {r.createdEmployee && <div className={styles.matchedTag}>→ {r.createdEmployee.name} ({r.createdEmployee.employeeId})</div>}
                  </td>
                  <td>{r.position || '—'}</td>
                  <td className={styles.date}>{r.startDate ? new Date(r.startDate).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                  <td className={styles.reasonCell}>{needsList(r)}</td>
                  <td>{r.requestedByName || '—'}</td>
                  <td>
                    <span className={styles.statusBadge} style={{ color: sc.color, background: sc.bg }}>{sc.label}</span>
                  </td>
                  <td>
                    {r.status === 'pendiente' ? (
                      <div className={styles.actions}>
                        <button className={styles.btnApprove} onClick={() => setApproveTarget(r)}>Aprobar</button>
                        <button className={styles.btnReject} onClick={() => setRejectTarget(r)}>Rechazar</button>
                      </div>
                    ) : (
                      <span className={styles.muted}>{r.reviewedByName || '—'}</span>
                    )}
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
    </div>
  );
}
