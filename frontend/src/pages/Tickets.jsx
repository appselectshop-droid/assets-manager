import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import PublicLinkBanner from '../components/PublicLinkBanner';
// Estilos propios — a propósito NO comparte AccountRequests.module.css: el
// usuario pidió que este módulo se sintiera como su propia aplicación de
// tickets (dashboard, tablero, alertas, reportes), no una tabla más.
import styles from './Tickets.module.css';

const TICKET_TYPE_CONFIG = {
  hardware:      { label: 'Hardware', icon: '🖥️' },
  software:      { label: 'Software', icon: '💾' },
  red:           { label: 'Red / Conectividad', icon: '📶' },
  cuenta_acceso: { label: 'Cuenta / Acceso', icon: '🔐' },
  otro:          { label: 'Otro', icon: '❓' },
};

const COLUMNS = [
  { key: 'abierto',    label: 'Abierto',    accent: '#d97706' },
  { key: 'en_proceso', label: 'En proceso', accent: '#2563eb' },
  { key: 'resuelto',   label: 'Resuelto',   accent: '#16a34a' },
  { key: 'cerrado',    label: 'Cerrado',    accent: '#6b7280' },
];

const STATUS_CONFIG = {
  abierto:    { label: 'Abierto',     color: '#d97706', bg: '#fffbeb' },
  en_proceso: { label: 'En proceso',  color: '#2563eb', bg: '#eff6ff' },
  resuelto:   { label: 'Resuelto',    color: '#16a34a', bg: '#f0fdf4' },
  cerrado:    { label: 'Cerrado',     color: '#6b7280', bg: '#f5f5f5' },
};

function oneAssetLabel(a) {
  if (!a) return null;
  return `${a.brand || ''} ${a.model || ''}`.trim() + (a.serialNumber ? ` (${a.serialNumber})` : '');
}

// El ticket nunca elige un solo equipo (a propósito — quien reporta no
// escoge) — assetRefs trae todo lo que la persona tenía asignado activo al
// reportar, puede ser uno, varios o ninguno.
function assetsLabel(assetRefs) {
  if (!assetRefs || assetRefs.length === 0) return null;
  return assetRefs.map(oneAssetLabel).join(' · ');
}

function daysOpen(ticket) {
  const end = ticket.resolvedAt ? new Date(ticket.resolvedAt) : new Date();
  const start = new Date(ticket.createdAt);
  return Math.max(0, Math.floor((end - start) / 86400000));
}

// Heurística simple de "vencido" (no es un SLA formal, es un umbral fijo
// para llamar la atención) — un ticket que bloquea el trabajo de alguien no
// debería tardar más de 1 día en atenderse; uno normal, no más de 5. Solo
// aplica mientras sigue abierto/en proceso — uno ya resuelto no "vence".
function isOverdue(ticket) {
  if (!['abierto', 'en_proceso'].includes(ticket.status)) return false;
  const threshold = ticket.blocksWork ? 1 : 5;
  return daysOpen(ticket) > threshold;
}

function initials(name = '') {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

// ── "Zabbix" de equipos ───────────────────────────────────────────
// A pedido del usuario: un apartado inspirado en Zabbix (monitoreo de
// redes) pero para EQUIPOS — no lista tickets, lista ACTIVOS y su estado de
// salud según los tickets que tienen encima, con la misma paleta de
// severidad que usa Zabbix de verdad (Desastre/Alta/Promedio/Advertencia).
const SEVERITY_CONFIG = {
  disaster: { label: 'Desastre',    color: '#E45959', bg: '#fef2f2' },
  high:     { label: 'Alta',        color: '#E97659', bg: '#fff1ec' },
  average:  { label: 'Promedio',    color: '#FFA059', bg: '#fff7ed' },
  warning:  { label: 'Advertencia', color: '#c9960c', bg: '#fffbeb' },
  ok:       { label: 'OK',          color: '#16a34a', bg: '#f0fdf4' },
};
const SEVERITY_ORDER = ['disaster', 'high', 'average', 'warning', 'ok'];

// Heurística de severidad por activo (no es el motor real de Zabbix, es un
// equivalente simple): si tiene un ticket abierto que bloquea trabajo Y ya
// está vencido, es un "Desastre"; si tiene algo bloqueante o vencido, "Alta";
// 2+ tickets abiertos sin lo anterior, "Promedio"; 1 ticket abierto normal,
// "Advertencia"; sin nada abierto (aunque tenga historial), "OK".
function assetSeverity(assetTickets) {
  const open = assetTickets.filter((t) => ['abierto', 'en_proceso'].includes(t.status));
  if (open.length === 0) return 'ok';
  if (open.some((t) => t.blocksWork && isOverdue(t))) return 'disaster';
  if (open.some((t) => t.blocksWork || isOverdue(t))) return 'high';
  if (open.length >= 2) return 'average';
  return 'warning';
}

function ZabbixTable({ assetHealth, onViewAsset }) {
  const summary = SEVERITY_ORDER.map((key) => ({
    key,
    count: assetHealth.filter((a) => a.severity === key).length,
  }));

  return (
    <>
      <div className={styles.zabbixIntro}>
        <span className={styles.zabbixIntroIcon}>🛰️</span>
        <p className={styles.zabbixIntroText}>
          Monitoreo de equipos por problemas reportados — igual que Zabbix monitorea la red, esto monitorea qué máquinas físicas dan lata, sin tener que revisar ticket por ticket.
        </p>
      </div>

      <div className={styles.kpiRow}>
        {summary.map(({ key, count }) => {
          const cfg = SEVERITY_CONFIG[key];
          return (
            <div key={key} className={styles.kpi} style={{ '--accent': cfg.color }}>
              <div className={styles.kpiTop}>
                <span className={styles.severityDot} style={{ background: cfg.color }} />
                <span className={styles.kpiValue} style={{ color: cfg.color }}>{count}</span>
              </div>
              <p className={styles.kpiLabel}>{cfg.label}</p>
            </div>
          );
        })}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.zabbixTable}>
          <thead>
            <tr>
              <th>Severidad</th>
              <th>Equipo</th>
              <th>Tickets abiertos</th>
              <th>Total histórico</th>
              <th>Último problema</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {assetHealth.length === 0 && (
              <tr><td colSpan={6} className={styles.empty}>Sin equipos con tickets registrados</td></tr>
            )}
            {assetHealth.map(({ asset, severity, openCount, totalCount, lastProblem }) => {
              const cfg = SEVERITY_CONFIG[severity];
              return (
                <tr key={asset._id}>
                  <td>
                    <span className={styles.severityBadge} style={{ color: cfg.color, background: cfg.bg }}>
                      <span className={styles.severityDot} style={{ background: cfg.color }} />
                      {cfg.label}
                    </span>
                  </td>
                  <td>
                    <strong>{asset.brand} {asset.model}</strong>
                    <div className={styles.muted}>{asset.serialNumber || asset.inventoryTag || '—'}</div>
                  </td>
                  <td>{openCount}</td>
                  <td>{totalCount}</td>
                  <td className={styles.muted}>{lastProblem ? lastProblem.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                  <td>
                    <button type="button" className={styles.btnLink} onClick={() => onViewAsset(asset._id)}>Ver tickets →</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DetailModal({ ticket, currentUser, users, resolutionOptions, canDelete, onDelete, onClose, onDone }) {
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
  const asset = assetsLabel(ticket.assetRefs);
  const overdue = isOverdue(ticket);

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

          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span className={styles.statusBadge} style={{ color: sc.color, background: sc.bg }}>{sc.label}</span>
            {overdue && <span className={styles.statusBadge} style={{ color: '#dc2626', background: '#fef2f2' }}>⚠️ Vencido</span>}
            {ticket.blocksWork && <span className={styles.statusBadge} style={{ color: '#b91c1c', background: '#fef2f2' }}>Impide trabajar</span>}
          </div>

          <p className={styles.modalHint}>
            Reportado por <strong>{ticket.employeeName}</strong> · {tc.label}{ticket.otherTypeDetail && `: ${ticket.otherTypeDetail}`}
          </p>
          {asset && <p className={styles.modalHint}>Equipo{ticket.assetRefs.length > 1 ? 's' : ''}: <strong>{asset}</strong></p>}
          {ticket.appRef && (
            <p className={styles.modalHint} style={{ color: '#0369a1' }}>
              🗂️ Aplicación: <strong>{ticket.appRef.name}</strong>
              {(ticket.appRef.responsibleName || ticket.appRef.responsibleArea) && (
                <> — enrutar a {[ticket.appRef.responsibleName, ticket.appRef.responsibleArea].filter(Boolean).join(' / ')}</>
              )}
            </p>
          )}
          <p className={styles.modalHint}>{daysOpen(ticket)} día{daysOpen(ticket) !== 1 ? 's' : ''} {ticket.resolvedAt ? 'para resolverse' : 'abierto'}</p>

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
              <button type="button" className={styles.btnLink} onClick={openAttachment} disabled={openingAttachment}>
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
                <button type="button" className={styles.btnLink} onClick={() => { setAssignedTo(currentUser.id); handleAssign(currentUser.id); }} disabled={assigning}>
                  Asignarme
                </button>
              </div>

              {!showResolveForm ? (
                <div className={styles.modalActions} style={{ justifyContent: 'flex-start' }}>
                  <button type="button" className={styles.btnPrimary} onClick={() => setShowResolveForm(true)}>Marcar resuelto</button>
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
                <button type="button" className={styles.btnDanger} onClick={() => handleStatusChange('abierto')} disabled={saving}>
                  Reabrir
                </button>
              </div>
            </>
          )}

          <div className={styles.modalActions}>
            {canDelete && <button type="button" className={styles.btnDanger} onClick={onDelete}>Eliminar</button>}
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TicketCard({ ticket, onClick }) {
  const tc = TICKET_TYPE_CONFIG[ticket.ticketType] || { label: ticket.ticketType, icon: '❓' };
  const asset = assetsLabel(ticket.assetRefs);
  const overdue = isOverdue(ticket);
  const days = daysOpen(ticket);
  return (
    <div className={`${styles.ticketCard} ${overdue ? styles.ticketCardOverdue : ''}`} onClick={onClick}>
      <div className={styles.cardTop}>
        <span className={styles.cardFolio}>{ticket.folio}</span>
        <div className={styles.cardBadges}>
          {ticket.blocksWork && <span className={styles.cardBadge} title="Le impide trabajar a alguien">⚠️</span>}
          {overdue && <span className={styles.cardBadge} title="Vencido">⏰</span>}
          {ticket.attachmentMimeType && <span className={styles.cardBadge} title="Tiene evidencia adjunta">📎</span>}
          {ticket.appRef && <span className={styles.cardBadge} title={`Aplicación: ${ticket.appRef.name}`}>🗂️</span>}
        </div>
      </div>
      <p className={styles.cardSubject}>{tc.icon} {ticket.subject}</p>
      <div className={styles.cardMeta}>
        <div>
          <p className={styles.cardEmployee}>{ticket.employeeName}</p>
          {asset && <p className={styles.cardAsset}>{asset}</p>}
        </div>
        {ticket.assignedTo && <div className={styles.cardAvatar} title={ticket.assignedTo.name}>{initials(ticket.assignedTo.name)}</div>}
      </div>
      <div className={styles.cardFooter}>
        <span className={`${styles.cardDays} ${overdue ? styles.cardDaysOverdue : ''}`}>
          {days === 0 ? 'Hoy' : `${days}d`}{ticket.resolvedAt ? ' (resuelto)' : ''}
        </span>
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
  const [detailTarget, setDetailTarget] = useState(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [view, setView] = useState('board'); // 'board' | 'zabbix'

  // A diferencia de la versión anterior (una pestaña de estatus a la vez),
  // el tablero muestra las 4 columnas de golpe — así que aquí se trae todo
  // (o todo lo de un activo específico) en un solo jalón; los conteos y
  // reportes de abajo salen del mismo set, sin pedir nada aparte.
  const load = async () => {
    setLoading(true);
    const params = {};
    if (assetIdFilter) params.assetRef = assetIdFilter;
    const { data } = await api.get('/tickets', { params });
    setTickets(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [assetIdFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.get('/users').then(({ data }) => setUsers(data)).catch(() => setUsers([]));
    api.get('/tickets/resolution-options').then(({ data }) => setResolutionOptions(data)).catch(() => setResolutionOptions([]));
  }, []);

  const handleDelete = async (t) => {
    if (!confirm(`¿Eliminar el ticket "${t.subject}"? Esta acción no se puede deshacer.`)) return;
    await api.delete(`/tickets/${t._id}`);
    load();
  };

  // El equipo específico que se está filtrando (para el mensaje "Filtrando
  // por activo: ...") — se busca dentro de cualquier ticket ya cargado.
  const filteredAsset = assetIdFilter
    ? tickets.flatMap((t) => t.assetRefs || []).find((a) => a._id === assetIdFilter)
    : null;

  const visibleTickets = typeFilter ? tickets.filter((t) => t.ticketType === typeFilter) : tickets;

  const stats = useMemo(() => {
    const open = tickets.filter((t) => t.status === 'abierto');
    const inProgress = tickets.filter((t) => t.status === 'en_proceso');
    const active = [...open, ...inProgress];
    const overdueList = active.filter(isOverdue);
    const blocking = active.filter((t) => t.blocksWork);

    const sevenDaysAgo = Date.now() - 7 * 86400000;
    const resolvedThisWeek = tickets.filter((t) => t.resolvedAt && new Date(t.resolvedAt).getTime() >= sevenDaysAgo);
    const allResolved = tickets.filter((t) => t.resolvedAt);
    const avgResolutionDays = allResolved.length
      ? (allResolved.reduce((sum, t) => sum + daysOpen(t), 0) / allResolved.length).toFixed(1)
      : null;

    const byType = {};
    active.forEach((t) => { byType[t.ticketType] = (byType[t.ticketType] || 0) + 1; });
    const typeBreakdown = Object.entries(byType).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);

    const byResolution = {};
    allResolved.forEach((t) => { if (t.resolution) byResolution[t.resolution] = (byResolution[t.resolution] || 0) + 1; });
    const topResolutions = Object.entries(byResolution).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 5);

    return {
      openCount: open.length,
      inProgressCount: inProgress.length,
      overdueList,
      blockingCount: blocking.length,
      resolvedThisWeekCount: resolvedThisWeek.length,
      avgResolutionDays,
      typeBreakdown,
      topResolutions,
    };
  }, [tickets]);

  const board = useMemo(() => {
    const out = {};
    COLUMNS.forEach((c) => { out[c.key] = visibleTickets.filter((t) => t.status === c.key).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); });
    return out;
  }, [visibleTickets]);

  // "Zabbix" de equipos — agrupa TODOS los tickets (histórico completo, no
  // solo los activos) por cada activo en su assetRefs, para saber qué
  // máquina física acumula más problemas sin importar quién la reportó.
  const assetHealth = useMemo(() => {
    const byAsset = {};
    tickets.forEach((t) => {
      (t.assetRefs || []).forEach((a) => {
        if (!byAsset[a._id]) byAsset[a._id] = { asset: a, tickets: [] };
        byAsset[a._id].tickets.push(t);
      });
    });
    return Object.values(byAsset)
      .map(({ asset, tickets: assetTickets }) => {
        const open = assetTickets.filter((t) => ['abierto', 'en_proceso'].includes(t.status));
        const lastProblem = assetTickets.reduce((latest, t) => {
          const d = new Date(t.createdAt);
          return !latest || d > latest ? d : latest;
        }, null);
        return {
          asset,
          severity: assetSeverity(assetTickets),
          openCount: open.length,
          totalCount: assetTickets.length,
          lastProblem,
        };
      })
      .sort((a, b) => {
        const sevDiff = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
        return sevDiff !== 0 ? sevDiff : b.openCount - a.openCount;
      });
  }, [tickets]);

  const goToAssetTickets = (assetId) => {
    setSearchParams({ assetId });
    setView('board');
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>🎫</div>
          <div>
            <h1 className={styles.title}>Tickets</h1>
            <p className={styles.subtitle}>Soporte reportado por el equipo — ligado al equipo específico, no a la persona.</p>
          </div>
        </div>
      </div>

      <PublicLinkBanner path="/reportar-ticket" />

      {assetIdFilter && (
        <div className={styles.assetFilterBar}>
          🎫 Filtrando por activo{filteredAsset ? `: ${oneAssetLabel(filteredAsset)}` : ''} ({tickets.length})
          <button type="button" className={styles.btnLink} onClick={() => { searchParams.delete('assetId'); setSearchParams(searchParams); }}>
            ✕ Quitar filtro
          </button>
        </div>
      )}

      {/* Tablero de tickets vs. Zabbix de equipos — dos formas de ver lo
          mismo: por ticket, o por qué máquina física está dando lata. */}
      <div className={styles.viewToggle}>
        <button className={`${styles.viewToggleBtn} ${view === 'board' ? styles.viewToggleActive : ''}`} onClick={() => setView('board')}>
          🎫 Tickets
        </button>
        <button className={`${styles.viewToggleBtn} ${view === 'zabbix' ? styles.viewToggleActive : ''}`} onClick={() => setView('zabbix')}>
          🛰️ Zabbix — Equipos
        </button>
      </div>

      {view === 'zabbix' ? (
        <ZabbixTable assetHealth={assetHealth} onViewAsset={goToAssetTickets} />
      ) : (
        <>
      {/* KPIs */}
      <div className={styles.kpiRow}>
        <div className={styles.kpi} style={{ '--accent': '#d97706' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>📬</span><span className={styles.kpiValue}>{stats.openCount}</span></div>
          <p className={styles.kpiLabel}>Abiertos</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#2563eb' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>🔧</span><span className={styles.kpiValue}>{stats.inProgressCount}</span></div>
          <p className={styles.kpiLabel}>En proceso</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#dc2626' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>⏰</span><span className={styles.kpiValue}>{stats.overdueList.length}</span></div>
          <p className={styles.kpiLabel}>Vencidos</p>
          <p className={styles.kpiSub}>bloqueante &gt;1d · normal &gt;5d</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#b91c1c' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>⚠️</span><span className={styles.kpiValue}>{stats.blockingCount}</span></div>
          <p className={styles.kpiLabel}>Impiden trabajar</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#16a34a' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>✅</span><span className={styles.kpiValue}>{stats.resolvedThisWeekCount}</span></div>
          <p className={styles.kpiLabel}>Resueltos</p>
          <p className={styles.kpiSub}>últimos 7 días</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#0d9488' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>⌛</span><span className={styles.kpiValue}>{stats.avgResolutionDays ?? '—'}</span></div>
          <p className={styles.kpiLabel}>Días promedio</p>
          <p className={styles.kpiSub}>para resolver</p>
        </div>
      </div>

      {stats.overdueList.length > 0 && (
        <div className={styles.alertBanner}>
          <span className={styles.alertIcon}>⏰</span>
          <p className={styles.alertText}>
            <span>{stats.overdueList.length}</span> ticket{stats.overdueList.length !== 1 ? 's' : ''} lleva{stats.overdueList.length === 1 ? '' : 'n'} más de lo normal sin atenderse.
          </p>
        </div>
      )}

      {/* Desglose + reportes */}
      <div className={styles.panelRow}>
        <div className={styles.panel}>
          <p className={styles.panelTitle}>Por tipo de soporte (activos)</p>
          {stats.typeBreakdown.length === 0 ? (
            <p className={styles.empty}>Sin tickets abiertos ni en proceso</p>
          ) : (
            stats.typeBreakdown.map(({ type, count }) => {
              const cfg = TICKET_TYPE_CONFIG[type] || { label: type, icon: '❓' };
              const max = Math.max(...stats.typeBreakdown.map((t) => t.count), 1);
              return (
                <div key={type} className={styles.barItem}>
                  <div className={styles.barHeader}>
                    <span className={styles.barIcon}>{cfg.icon}</span>
                    <span className={styles.barLabel}>{cfg.label}</span>
                    <span className={styles.barCount}>{count}</span>
                  </div>
                  <div className={styles.barTrack}><div className={styles.barFill} style={{ width: `${(count / max) * 100}%` }} /></div>
                </div>
              );
            })
          )}
        </div>

        <div className={styles.panel}>
          <p className={styles.panelTitle}>Reporte rápido</p>
          <div className={styles.reportStat}><span className={styles.reportLabel}>Total histórico</span><span className={styles.reportValue}>{tickets.length}</span></div>
          <div className={styles.reportStat}><span className={styles.reportLabel}>Resueltos (todo el tiempo)</span><span className={styles.reportValue}>{tickets.filter((t) => t.resolvedAt).length}</span></div>
          <div className={styles.reportStat}><span className={styles.reportLabel}>Cerrados</span><span className={styles.reportValue}>{tickets.filter((t) => t.status === 'cerrado').length}</span></div>
          <div className={styles.reportStat}><span className={styles.reportLabel}>Sin asignar (activos)</span><span className={styles.reportValue}>{[...board.abierto, ...board.en_proceso].filter((t) => !t.assignedTo).length}</span></div>
        </div>

        <div className={styles.panel}>
          <p className={styles.panelTitle}>Resoluciones más comunes</p>
          {stats.topResolutions.length === 0 ? (
            <p className={styles.empty}>Aún no hay tickets resueltos</p>
          ) : (
            stats.topResolutions.map(({ label, count }) => (
              <div key={label} className={styles.resolutionItem}><span>{label}</span><span>{count}</span></div>
            ))
          )}
        </div>
      </div>

      {/* Filtro por tipo para el tablero */}
      <div className={styles.controlsRow}>
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${!typeFilter ? styles.tabActive : ''}`} onClick={() => setTypeFilter('')}>Todos los tipos</button>
          {Object.entries(TICKET_TYPE_CONFIG).map(([key, cfg]) => (
            <button key={key} className={`${styles.tab} ${typeFilter === key ? styles.tabActive : ''}`} onClick={() => setTypeFilter(key)}>
              {cfg.icon} {cfg.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tablero */}
      {loading ? (
        <p className={styles.empty}>Cargando...</p>
      ) : (
        <div className={styles.board}>
          {COLUMNS.map((col) => (
            <div key={col.key} className={styles.column} style={{ '--col-accent': col.accent }}>
              <div className={styles.columnHeader}>
                <span className={styles.columnTitle}>{col.label}</span>
                <span className={styles.columnCount}>{board[col.key].length}</span>
              </div>
              <div className={styles.columnList}>
                {board[col.key].length === 0 ? (
                  <p className={styles.columnEmpty}>Sin tickets</p>
                ) : (
                  board[col.key].map((t) => (
                    <TicketCard key={t._id} ticket={t} onClick={() => setDetailTarget(t)} />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      )}

      {detailTarget && (
        <DetailModal
          ticket={detailTarget}
          currentUser={currentUser}
          users={users}
          resolutionOptions={resolutionOptions}
          canDelete={currentUser.role === 'admin'}
          onDelete={() => { handleDelete(detailTarget); setDetailTarget(null); }}
          onClose={() => setDetailTarget(null)}
          onDone={() => { setDetailTarget(null); load(); }}
        />
      )}
    </div>
  );
}
