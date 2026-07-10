import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import PublicLinkBanner from '../components/PublicLinkBanner';
// Mismos estilos que las demás bandejas de revisión (Solicitudes de
// Cuentas/Ingreso/Recursos) — misma tabla/modal, contenido distinto.
import styles from './AccountRequests.module.css';

const TICKET_TYPE_CONFIG = {
  hardware:      { label: 'Hardware', icon: '🖥️' },
  software:      { label: 'Software', icon: '💾' },
  red:           { label: 'Red / Conectividad', icon: '📶' },
  cuenta_acceso: { label: 'Cuenta / Acceso', icon: '🔐' },
  otro:          { label: 'Otro', icon: '❓' },
};

const STATUS_CONFIG = {
  abierto:    { label: 'Abierto',     color: '#d97706', bg: '#fffbeb' },
  en_proceso: { label: 'En proceso',  color: '#2563eb', bg: '#eff6ff' },
  resuelto:   { label: 'Resuelto',    color: '#16a34a', bg: '#f0fdf4' },
  cerrado:    { label: 'Cerrado',     color: '#6b7280', bg: '#f5f5f5' },
};

function assetLabel(a) {
  if (!a) return null;
  return `${a.brand || ''} ${a.model || ''}`.trim() + (a.serialNumber ? ` (${a.serialNumber})` : '');
}

function daysOpen(ticket) {
  const end = ticket.resolvedAt ? new Date(ticket.resolvedAt) : new Date();
  const start = new Date(ticket.createdAt);
  return Math.max(0, Math.floor((end - start) / 86400000));
}

function DetailModal({ ticket, currentUser, users, resolutionOptions, onClose, onDone }) {
  const [assignedTo, setAssignedTo] = useState(ticket.assignedTo?._id || '');
  const [assigning, setAssigning] = useState(false);
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [resolution, setResolution] = useState('');
  const [otherResolution, setOtherResolution] = useState('');
  const [addToCatalog, setAddToCatalog] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [openingAttachment, setOpeningAttachment] = useState(false);

  const tc = TICKET_TYPE_CONFIG[ticket.ticketType] || { label: ticket.ticketType, icon: '❓' };
  const sc = STATUS_CONFIG[ticket.status];
  const asset = assetLabel(ticket.assetRef);

  // No es un <a href> directo porque la ruta pide sesión (Bearer token) —
  // hay que pedirla con axios (que sí manda el header) y abrir el blob.
  const openAttachment = async () => {
    setOpeningAttachment(true);
    try {
      const resp = await api.get(`/tickets/${ticket._id}/attachment`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([resp.data], { type: resp.headers['content-type'] }));
      window.open(url, '_blank');
    } catch (err) {
      setError('No se pudo abrir la evidencia');
    } finally {
      setOpeningAttachment(false);
    }
  };

  const handleAssign = async (userId) => {
    const user = users.find((u) => u._id === userId);
    setAssigning(true);
    try {
      await api.put(`/tickets/${ticket._id}/assign`, { userId: userId || null, userName: user?.name || '' });
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo asignar el ticket');
    } finally {
      setAssigning(false);
    }
  };

  const handleStatusChange = async (status, extra = {}) => {
    setSaving(true);
    setError('');
    try {
      await api.put(`/tickets/${ticket._id}/status`, { status, ...extra });
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo actualizar el ticket');
      setSaving(false);
    }
  };

  const handleResolve = () => {
    const finalResolution = resolution === 'Otro (especifica)' ? otherResolution.trim() : resolution;
    if (!finalResolution) { setError('Selecciona o especifica cómo se resolvió.'); return; }
    handleStatusChange('resuelto', {
      resolution: finalResolution,
      resolutionNotes,
      addToCatalog: resolution === 'Otro (especifica)' && addToCatalog,
    });
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>{tc.icon}</span>
          <h2 className={styles.modalTitle}>{ticket.folio}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          {error && <p className={styles.formError}>{error}</p>}

          <span className={styles.statusBadge} style={{ color: sc.color, background: sc.bg }}>{sc.label}</span>

          <p className={styles.modalHint}>
            Reportado por <strong>{ticket.employeeName}</strong> · {tc.label}{ticket.blocksWork && ' · ⚠️ le impide trabajar'}
          </p>
          {asset && <p className={styles.modalHint}>Equipo: <strong>{asset}</strong></p>}

          <div className={styles.field}>
            <label>Asunto</label>
            <p>{ticket.subject}</p>
          </div>
          {ticket.description && (
            <div className={styles.field}>
              <label>Descripción</label>
              <p style={{ whiteSpace: 'pre-wrap' }}>{ticket.description}</p>
            </div>
          )}
          {ticket.attachmentMimeType && (
            <div className={styles.field}>
              <label>Evidencia</label>
              <button type="button" className={styles.btnChange} onClick={openAttachment} disabled={openingAttachment}>
                {openingAttachment ? 'Abriendo...' : 'Ver adjunto ↗'}
              </button>
            </div>
          )}

          {['abierto', 'en_proceso'].includes(ticket.status) && (
            <>
              <div className={styles.field}>
                <label>Asignado a</label>
                <select className={styles.input} value={assignedTo} onChange={(e) => { setAssignedTo(e.target.value); handleAssign(e.target.value); }} disabled={assigning}>
                  <option value="">Sin asignar</option>
                  {users.map((u) => (
                    <option key={u._id} value={u._id}>{u.name}{u._id === currentUser.id ? ' (yo)' : ''}</option>
                  ))}
                </select>
                <button type="button" className={styles.btnChange} onClick={() => { setAssignedTo(currentUser.id); handleAssign(currentUser.id); }} disabled={assigning}>
                  Asignarme
                </button>
              </div>

              {!showResolveForm ? (
                <div className={styles.modalActions} style={{ justifyContent: 'flex-start' }}>
                  <button type="button" className={styles.btnApprove} onClick={() => setShowResolveForm(true)}>Marcar resuelto</button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className={styles.field}>
                    <label>¿Cómo se resolvió? *</label>
                    <select className={styles.input} value={resolution} onChange={(e) => setResolution(e.target.value)}>
                      <option value="">Selecciona una opción...</option>
                      {resolutionOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                      <option value="Otro (especifica)">Otro (especifica)</option>
                    </select>
                  </div>
                  {resolution === 'Otro (especifica)' && (
                    <div className={styles.field}>
                      <label>Especifica *</label>
                      <input className={styles.input} value={otherResolution} onChange={(e) => setOtherResolution(e.target.value)} />
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 400, fontSize: '0.78rem', marginTop: '0.3rem' }}>
                        <input type="checkbox" checked={addToCatalog} onChange={(e) => setAddToCatalog(e.target.checked)} />
                        Agregar al catálogo de resoluciones
                      </label>
                    </div>
                  )}
                  <div className={styles.field}>
                    <label>Notas (opcional)</label>
                    <input className={styles.input} value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} />
                  </div>
                  <div className={styles.modalActions}>
                    <button type="button" className={styles.btnCancel} onClick={() => setShowResolveForm(false)}>Cancelar</button>
                    <button type="button" className={styles.btnPrimary} onClick={handleResolve} disabled={saving}>
                      {saving ? 'Guardando...' : 'Confirmar resolución'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {['resuelto', 'cerrado'].includes(ticket.status) && (
            <>
              <div className={styles.field}>
                <label>Resolución</label>
                <p>{ticket.resolution}</p>
                {ticket.resolutionNotes && <p style={{ fontSize: '0.82rem', color: '#666' }}>{ticket.resolutionNotes}</p>}
                <p className={styles.muted}>{ticket.resolvedByName} — {new Date(ticket.resolvedAt).toLocaleString('es-MX')}</p>
              </div>
              <div className={styles.modalActions} style={{ justifyContent: 'flex-start' }}>
                <button type="button" className={styles.btnReject} onClick={() => handleStatusChange('abierto')} disabled={saving}>
                  Reabrir
                </button>
              </div>
            </>
          )}

          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Tickets() {
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const [searchParams, setSearchParams] = useSearchParams();
  const assetIdFilter = searchParams.get('assetId') || '';
  const [tickets, setTickets] = useState([]);
  const [users, setUsers] = useState([]);
  const [resolutionOptions, setResolutionOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  // Si se llega con ?assetId= (desde el badge de Activos), se quiere ver el
  // historial completo de ese equipo, no solo lo activo — arranca en "Todos".
  const [filterStatus, setFilterStatus] = useState(assetIdFilter ? '' : 'abierto,en_proceso');
  const [detailTarget, setDetailTarget] = useState(null);

  const load = async () => {
    setLoading(true);
    const params = {};
    if (filterStatus) params.status = filterStatus;
    if (assetIdFilter) params.assetRef = assetIdFilter;
    const { data } = await api.get('/tickets', { params });
    setTickets(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterStatus, assetIdFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.get('/users').then(({ data }) => setUsers(data)).catch(() => setUsers([]));
    api.get('/tickets/resolution-options').then(({ data }) => setResolutionOptions(data)).catch(() => setResolutionOptions([]));
  }, []);

  const handleDelete = async (t) => {
    if (!confirm(`¿Eliminar el ticket "${t.subject}"? Esta acción no se puede deshacer.`)) return;
    await api.delete(`/tickets/${t._id}`);
    load();
  };

  const TABS = [
    ['abierto,en_proceso', 'Activos'],
    ['abierto', 'Abiertos'],
    ['en_proceso', 'En proceso'],
    ['resuelto', 'Resueltos'],
    ['cerrado', 'Cerrados'],
    ['', 'Todos'],
  ];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Tickets</h1>
          <p className={styles.subtitle}>Soporte reportado por el equipo — ligado al equipo específico, no a la persona.</p>
        </div>
      </div>

      <PublicLinkBanner path="/reportar-ticket" />

      {assetIdFilter && (
        <div className={styles.tabs} style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#92400e', padding: '0.4rem 0.6rem' }}>
            🎫 Filtrando por activo{tickets[0]?.assetRef ? `: ${assetLabel(tickets[0].assetRef)}` : ''} ({tickets.length})
          </span>
          <button
            type="button"
            className={styles.tab}
            onClick={() => { searchParams.delete('assetId'); setSearchParams(searchParams); setFilterStatus('abierto,en_proceso'); }}
          >
            ✕ Quitar filtro
          </button>
        </div>
      )}

      <div className={styles.tabs}>
        {TABS.map(([val, label]) => (
          <button
            key={val || 'todos'}
            className={`${styles.tab} ${filterStatus === val ? styles.tabActive : ''}`}
            onClick={() => setFilterStatus(val)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Reportado por</th>
              <th>Equipo</th>
              <th>Asunto</th>
              <th>Asignado</th>
              <th>Días abierto</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className={styles.empty}>Cargando...</td></tr>}
            {!loading && tickets.length === 0 && (
              <tr><td colSpan={8} className={styles.empty}>Sin tickets</td></tr>
            )}
            {tickets.map((t) => {
              const tc = TICKET_TYPE_CONFIG[t.ticketType] || { label: t.ticketType, icon: '❓' };
              const sc = STATUS_CONFIG[t.status];
              const asset = assetLabel(t.assetRef);
              return (
                <tr key={t._id}>
                  <td><span className={styles.typeCell}>{tc.icon} {tc.label}</span></td>
                  <td className={styles.nameCell}>
                    {t.employeeName}
                    {t.blocksWork && <div className={styles.matchedTag} style={{ color: '#dc2626' }}>⚠️ le impide trabajar</div>}
                  </td>
                  <td>{asset || <span className={styles.muted}>—</span>}</td>
                  <td className={styles.reasonCell}>{t.subject}</td>
                  <td>{t.assignedTo?.name || <span className={styles.muted}>Sin asignar</span>}</td>
                  <td className={styles.date}>{daysOpen(t)}d</td>
                  <td>
                    <span className={styles.statusBadge} style={{ color: sc.color, background: sc.bg }}>{sc.label}</span>
                  </td>
                  <td>
                    <div className={styles.actions}>
                      <button className={styles.btnView} onClick={() => setDetailTarget(t)}>Ver</button>
                      {currentUser.role === 'admin' && (
                        <button className={styles.btnReject} onClick={() => handleDelete(t)}>Eliminar</button>
                      )}
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
          ticket={detailTarget}
          currentUser={currentUser}
          users={users}
          resolutionOptions={resolutionOptions}
          onClose={() => setDetailTarget(null)}
          onDone={() => { setDetailTarget(null); load(); }}
        />
      )}
    </div>
  );
}
