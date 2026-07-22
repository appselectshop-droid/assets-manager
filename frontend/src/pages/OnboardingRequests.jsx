import { useEffect, useState } from 'react';
import api from '../services/api';
import { ASSET_TYPE_LABELS, ACCESSORY_TYPE_LABELS, TYPE_ICONS } from '../config/assetFields';
// Mismos estilos que Solicitudes de Cuentas — misma tabla/modal, contenido distinto.
import styles from './AccountRequests.module.css';

const STATUS_CONFIG = {
  pendiente: { label: 'Pendiente', color: '#d97706', bg: '#fffbeb' },
  aprobada:  { label: 'Aprobada',  color: '#16a34a', bg: '#f0fdf4' },
  rechazada: { label: 'Rechazada', color: '#dc2626', bg: '#fef2f2' },
};

// Las etiquetas que capturó RH ("Laptop", "Celular", "Monitor"...) son las
// mismas que ya usan Activos/Accesorios — se revierte a la clave interna
// (type) para poder buscar en Disponibilidad qué hay libre de cada una.
const LABEL_TO_TYPE = {};
Object.entries(ASSET_TYPE_LABELS).forEach(([key, label]) => { LABEL_TO_TYPE[label] = key; });
Object.entries(ACCESSORY_TYPE_LABELS).forEach(([key, label]) => { if (!LABEL_TO_TYPE[label]) LABEL_TO_TYPE[label] = key; });

function AssignEquipmentModal({ request, onClose, onAssigned }) {
  const neededLabels = [
    ...(request.computerTypes || []),
    ...(request.phoneTypes || []),
    ...(request.accessoryTypes || []),
  ];
  const [groups, setGroups] = useState([]); // [{ type, label, icon, items: [] }]
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [assignedIds, setAssignedIds] = useState(new Set());
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    const results = await Promise.all(
      neededLabels.map(async (label) => {
        const type = LABEL_TO_TYPE[label];
        if (!type) return null;
        const { data } = await api.get('/assets', { params: { status: 'disponible', type } });
        return { type, label, icon: TYPE_ICONS[type] || '📦', items: data };
      })
    );
    setGroups(results.filter(Boolean));
    setLoading(false);
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAssign = async (item) => {
    setBusyId(item._id);
    setError('');
    try {
      await api.post('/assignments', {
        employee: request.createdEmployee._id || request.createdEmployee,
        asset: item._id,
        quantity: item.stockTotal != null ? 1 : undefined,
        notes: 'Asignado desde Solicitud de Ingreso',
      });
      setAssignedIds((prev) => new Set(prev).add(item._id));
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo asignar');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>🔗</span>
          <h2 className={styles.modalTitle}>Asignar equipo disponible</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          {error && <p className={styles.formError}>{error}</p>}
          <p className={styles.modalHint}>
            Para <strong>{request.createdEmployee?.name || request.employeeName}</strong> — solo se muestra lo que ya está disponible en Disponibilidad.
          </p>
          {loading && <p className={styles.modalHint}>Buscando disponibles...</p>}
          {!loading && groups.length === 0 && (
            <p className={styles.modalHint}>Esta solicitud no pidió equipo, teléfono ni accesorios.</p>
          )}
          {!loading && groups.map((g) => (
            <div key={g.type}>
              <p className={styles.field} style={{ marginBottom: '0.4rem' }}>
                <label>{g.icon} {g.label} ({g.items.length} disponibles)</label>
              </p>
              {g.items.length === 0 && <p className={styles.modalHint}>Sin stock disponible de {g.label.toLowerCase()} ahorita.</p>}
              {g.items.map((item) => {
                const name = [item.brand, item.model].filter(Boolean).join(' ') || g.label;
                const tag = item.inventoryTag || item.serialNumber;
                const done = assignedIds.has(item._id);
                return (
                  <div key={item._id} className={styles.empSelected} style={{ marginBottom: '0.4rem' }}>
                    <div>
                      <p className={styles.empSelName}>{name}</p>
                      <p className={styles.empSelSub}>{tag}{item.location && ` · ${item.location}`}</p>
                    </div>
                    <button
                      type="button"
                      className={done ? styles.btnCancel : styles.btnPrimary}
                      onClick={() => !done && handleAssign(item)}
                      disabled={done || busyId === item._id}
                    >
                      {done ? '✓ Asignado' : busyId === item._id ? '...' : 'Asignar'}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={() => { onAssigned(); onClose(); }}>Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ApproveModal({ request, onClose, onDone }) {
  const [form, setForm] = useState({
    employeeId: '',
    // Mayúsculas siempre desde que se precarga (normaliza también las
    // solicitudes pendientes de antes de este fix, capturadas mixtas).
    name: (request.employeeName || '').toUpperCase(),
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
            <input className={styles.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toUpperCase() })} />
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
  const [assignTarget, setAssignTarget] = useState(null);

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
    if (r.needsComputer) parts.push(`Computadora${r.computerTypes?.length ? ` (${r.computerTypes.join(', ')})` : ''}`);
    if (r.needsPhone) parts.push(`Teléfono${r.phoneTypes?.length ? ` (${r.phoneTypes.join(', ')})` : ''}`);
    if (r.needsAccessories) {
      const list = [...(r.accessoryTypes || []), ...(r.accessoryOther ? [`Otro: ${r.accessoryOther}`] : [])];
      parts.push(`Accesorios${list.length ? ` (${list.join(', ')})` : ''}`);
    }
    return parts.length ? parts.join(' · ') : '—';
  };

  const handleDelete = async (r) => {
    if (!confirm(`¿Eliminar la solicitud de ingreso de "${r.employeeName}"? Esta acción no se puede deshacer.`)) return;
    await api.delete(`/onboarding-requests/${r._id}`);
    load();
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
                    <div className={styles.actions}>
                      {r.status === 'pendiente' ? (
                        <>
                          <button className={styles.btnApprove} onClick={() => setApproveTarget(r)}>Aprobar</button>
                          <button className={styles.btnReject} onClick={() => setRejectTarget(r)}>Rechazar</button>
                        </>
                      ) : (
                        <span className={styles.muted}>{r.reviewedByName || '—'}</span>
                      )}
                      {r.status === 'aprobada' && r.createdEmployee && (r.needsComputer || r.needsPhone || r.needsAccessories) && (
                        <button className={styles.btnView} onClick={() => setAssignTarget(r)}>🔗 Asignar equipo</button>
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
      {assignTarget && (
        <AssignEquipmentModal
          request={assignTarget}
          onClose={() => setAssignTarget(null)}
          onAssigned={load}
        />
      )}
    </div>
  );
}
