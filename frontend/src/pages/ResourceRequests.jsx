import { useEffect, useState } from 'react';
import api from '../services/api';
import { ACCESSORY_TYPE_LABELS, TYPE_ICONS } from '../config/assetFields';
// Mismos estilos que Solicitudes de Cuentas/Ingreso — misma tabla/modal, contenido distinto.
import styles from './AccountRequests.module.css';

const STATUS_CONFIG = {
  pendiente: { label: 'Pendiente', color: '#d97706', bg: '#fffbeb' },
  aprobada:  { label: 'Aprobada',  color: '#16a34a', bg: '#f0fdf4' },
  rechazada: { label: 'Rechazada', color: '#dc2626', bg: '#fef2f2' },
};

// Las etiquetas que eligió quien solicita ("Kit Teclado+Mouse", "Monitor"...)
// son las mismas que ya usan Activos/Accesorios — se revierte a la clave
// interna (type) para poder consultar en Disponibilidad qué hay libre de
// cada una. "Línea Telefónica" no tiene tipo de activo (es un servicio, no
// se controla como stock aquí), así que queda fuera de este mapa a propósito.
const LABEL_TO_TYPE = {};
Object.entries(ACCESSORY_TYPE_LABELS).forEach(([key, label]) => { LABEL_TO_TYPE[label] = key; });

function formatItems(request) {
  return (request.resourceItems || [])
    .map((it) => {
      if (it === 'Software o Licencia' && request.licenseDetail) return `${it} (${request.licenseDetail})`;
      if (it === 'Otro (especifica)' && request.otherDetail) return `${it}: ${request.otherDetail}`;
      return it;
    })
    .join(', ');
}

function ApproveModal({ request, onClose, onDone }) {
  const [notes, setNotes] = useState('');
  const [addToCatalog, setAddToCatalog] = useState(true);
  const [saving, setSaving] = useState(false);

  const isOther = request.resourceItems?.includes('Otro (especifica)') && request.otherDetail;

  const handleApprove = async () => {
    setSaving(true);
    try {
      await api.put(`/resource-requests/${request._id}/approve`, {
        resolutionNotes: notes,
        addToCatalog: isOther ? addToCatalog : false,
      });
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
            {request.employeeName} — {formatItems(request)}
          </p>
          <div className={styles.field}>
            <label>Notas de resolución (opcional)</label>
            <textarea className={styles.input} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Entregado desde stock, pendiente de reponer..." />
          </div>
          {isOther && (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.82rem', color: '#333' }}>
              <input type="checkbox" checked={addToCatalog} onChange={(e) => setAddToCatalog(e.target.checked)} style={{ marginTop: '0.2rem' }} />
              Agregar "{request.otherDetail}" a la lista de recursos, para que la próxima vez ya salga como casilla
            </label>
          )}
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
          <p className={styles.modalHint}>Solicitud de <strong>{request.employeeName}</strong> — {formatItems(request)}</p>
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

// Consulta Disponibilidad (mismo dato que la página "Disponibilidad") para
// cada recurso pedido y da una recomendación de qué se puede dar — y deja
// asignarlo ahí mismo si el solicitante se encontró en Empleados al enviar
// la solicitud.
function DetailModal({ request, onClose, onAssigned }) {
  const [groups, setGroups] = useState([]); // [{ type, label, icon, items }]
  const [untracked, setUntracked] = useState([]);
  const [loadingAvail, setLoadingAvail] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [assignedIds, setAssignedIds] = useState(new Set());
  const [assignError, setAssignError] = useState('');
  // Si la solicitud no trae employeeRef (ej. se mandó antes de que
  // guardáramos esto, o el buscador no encontró el nombre en su momento),
  // se intenta encontrar al empleado por nombre ahora mismo en vez de
  // asumir que no existe — así no depende de un dato fijado al enviar.
  const [resolvedEmployee, setResolvedEmployee] = useState(null);
  const [resolvingEmployee, setResolvingEmployee] = useState(!request.employeeRef);

  useEffect(() => {
    if (request.employeeRef) { setResolvingEmployee(false); return; }
    setResolvingEmployee(true);
    api.get('/employees').then(({ data }) => {
      const norm = (s) => (s || '').trim().toLowerCase();
      const matches = data.filter((e) => e.active && norm(e.name) === norm(request.employeeName));
      setResolvedEmployee(matches.length === 1 ? matches[0] : null);
    }).catch(() => setResolvedEmployee(null)).finally(() => setResolvingEmployee(false));
  }, [request]);

  const employeeId = request.employeeRef || resolvedEmployee?._id;

  useEffect(() => {
    const trackable = [];
    const notTracked = [];
    (request.resourceItems || []).forEach((label) => {
      const type = LABEL_TO_TYPE[label];
      if (type) trackable.push({ label, type }); else notTracked.push(label);
    });
    setUntracked(notTracked);

    setLoadingAvail(true);
    Promise.all(
      trackable.map(async ({ label, type }) => {
        const { data } = await api.get('/assets', { params: { status: 'disponible', type } });
        return { type, label, icon: TYPE_ICONS[type] || '📦', items: data };
      })
    ).then((results) => { setGroups(results); setLoadingAvail(false); });
  }, [request]);

  const handleAssign = async (item) => {
    if (!employeeId) {
      setAssignError('No encontramos a este empleado en Empleados — verifica que el nombre esté escrito igual, o asígnalo manualmente desde Disponibilidad.');
      return;
    }
    setBusyId(item._id);
    setAssignError('');
    try {
      await api.post('/assignments', {
        employee: employeeId,
        asset: item._id,
        quantity: item.stockTotal != null ? 1 : undefined,
        notes: 'Asignado desde Solicitud de Recursos',
      });
      setAssignedIds((prev) => new Set(prev).add(item._id));
      onAssigned?.();
    } catch (err) {
      setAssignError(err.response?.data?.message || 'No se pudo asignar');
    } finally {
      setBusyId(null);
    }
  };

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
            <label>Justificación</label>
            <p>{request.justification || '—'}</p>
          </div>
          {request.status !== 'pendiente' && (
            <div className={styles.field}>
              <label>{request.status === 'aprobada' ? 'Notas de resolución' : 'Motivo de rechazo'}</label>
              <p>{(request.status === 'aprobada' ? request.resolutionNotes : request.rejectionReason) || '—'}</p>
            </div>
          )}

          <div className={styles.field}>
            <label>Disponibilidad y recomendación</label>
          </div>
          {assignError && <p className={styles.formError}>{assignError}</p>}
          {!request.employeeRef && resolvingEmployee && (
            <p className={styles.modalHint}>Buscando a {request.employeeName} en Empleados...</p>
          )}
          {!request.employeeRef && !resolvingEmployee && resolvedEmployee && (
            <p className={styles.modalHint} style={{ color: '#16a34a' }}>
              ✓ Encontramos a {resolvedEmployee.name} en Empleados ({resolvedEmployee.employeeId}) — se le puede asignar directo.
            </p>
          )}
          {!request.employeeRef && !resolvingEmployee && !resolvedEmployee && (
            <p className={styles.modalHint} style={{ color: '#d97706' }}>
              ⚠️ No encontramos a "{request.employeeName}" en Empleados (activo) — revisa que el nombre esté escrito igual, o asígnalo manualmente desde Disponibilidad.
            </p>
          )}
          {loadingAvail && <p className={styles.modalHint}>Consultando disponibilidad...</p>}
          {!loadingAvail && groups.map((g) => (
            <div key={g.type} style={{ marginBottom: '0.75rem' }}>
              <p className={styles.modalHint} style={{ fontWeight: 700, color: '#333' }}>
                {g.icon} {g.label} —{' '}
                {g.items.length > 0
                  ? <span style={{ color: '#16a34a' }}>✅ {g.items.length} disponible{g.items.length !== 1 ? 's' : ''}, se puede dar</span>
                  : <span style={{ color: '#dc2626' }}>❌ Sin stock disponible ahorita</span>}
              </p>
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
          {!loadingAvail && untracked.length > 0 && (
            <p className={styles.modalHint}>
              📞 {untracked.map((it) => {
                if (it === 'Software o Licencia' && request.licenseDetail) return `${it}: ${request.licenseDetail}`;
                if (it === 'Otro (especifica)' && request.otherDetail) return `${it}: ${request.otherDetail}`;
                return it;
              }).join(' · ')}
              {' '}— no se controla como stock aquí; gestiónalo directo con el operador/proveedor o revisa si aplica agregarlo al catálogo al aprobar.
            </p>
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
                  <td>{formatItems(r) || '—'}</td>
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
        <DetailModal request={detailTarget} onClose={() => setDetailTarget(null)} onAssigned={load} />
      )}
    </div>
  );
}
