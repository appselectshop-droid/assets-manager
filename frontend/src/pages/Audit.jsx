import { useEffect, useState, useMemo } from 'react';
import api from '../services/api';
import styles from './Audit.module.css';

const ACTION_CONFIG = {
  crear:    { label: 'Creación',   color: '#16a34a', bg: '#f0fdf4', icon: '➕' },
  editar:   { label: 'Edición',    color: '#2563eb', bg: '#eff6ff', icon: '✏️' },
  eliminar: { label: 'Eliminación',color: '#dc2626', bg: '#fef2f2', icon: '🗑️' },
  asignar:  { label: 'Asignación', color: '#E8431A', bg: '#fff3ee', icon: '🔗' },
  devolver: { label: 'Devolución', color: '#7c3aed', bg: '#f5f3ff', icon: '↩️' },
};

const ENTITY_CONFIG = {
  activo:   { label: 'Activo',    icon: '💻' },
  empleado: { label: 'Empleado',  icon: '👤' },
  usuario:  { label: 'Usuario',   icon: '⚙️' },
};

function timeAgo(date) {
  const diff = Math.floor((Date.now() - new Date(date)) / 1000);
  if (diff < 60)    return 'Hace un momento';
  if (diff < 3600)  return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 7) return `Hace ${Math.floor(diff / 86400)}d`;
  return new Date(date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fullDate(date) {
  return new Date(date).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function Audit() {
  const [logs,      setLogs]      = useState([]);
  const [users,     setUsers]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [filterAction, setFilterAction] = useState('');
  const [filterEntity, setFilterEntity] = useState('');
  const [filterUser,   setFilterUser]   = useState('');
  const [filterFrom,   setFilterFrom]   = useState('');
  const [filterTo,     setFilterTo]     = useState('');
  const [search,       setSearch]       = useState('');

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterAction) params.set('action', filterAction);
    if (filterEntity) params.set('entity', filterEntity);
    if (filterUser)   params.set('userId', filterUser);
    if (filterFrom)   params.set('from', filterFrom);
    if (filterTo)     params.set('to', filterTo);
    params.set('limit', '500');
    const [logsRes, usersRes] = await Promise.all([
      api.get(`/audit?${params}`),
      api.get('/audit/users'),
    ]);
    setLogs(logsRes.data);
    setUsers(usersRes.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterAction, filterEntity, filterUser, filterFrom, filterTo]);

  const filtered = useMemo(() => {
    if (!search.trim()) return logs;
    const q = search.toLowerCase();
    return logs.filter((l) =>
      l.userName?.toLowerCase().includes(q) ||
      l.entityName?.toLowerCase().includes(q) ||
      l.details?.toLowerCase().includes(q)
    );
  }, [logs, search]);

  const hasFilters = filterAction || filterEntity || filterUser || filterFrom || filterTo;

  const clearFilters = () => {
    setFilterAction(''); setFilterEntity('');
    setFilterUser(''); setFilterFrom(''); setFilterTo('');
  };

  // Resumen rápido
  const summary = useMemo(() => {
    const counts = {};
    logs.forEach((l) => { counts[l.action] = (counts[l.action] || 0) + 1; });
    return counts;
  }, [logs]);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Auditoría</h1>
          <p className={styles.subtitle}>{filtered.length} registros{hasFilters ? ' (filtrado)' : ''}</p>
        </div>
      </div>

      {/* Tarjetas resumen */}
      <div className={styles.summaryRow}>
        {Object.entries(ACTION_CONFIG).map(([key, cfg]) => (
          <button
            key={key}
            className={`${styles.summaryCard} ${filterAction === key ? styles.summaryCardActive : ''}`}
            style={{ '--acc': cfg.color, '--acc-bg': cfg.bg }}
            onClick={() => setFilterAction(filterAction === key ? '' : key)}
          >
            <span className={styles.summaryIcon}>{cfg.icon}</span>
            <span className={styles.summaryCount}>{summary[key] || 0}</span>
            <span className={styles.summaryLabel}>{cfg.label}</span>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className={styles.filterBar}>
        <input
          className={styles.search}
          placeholder="Buscar por usuario, activo o detalle..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={styles.select} value={filterEntity} onChange={(e) => setFilterEntity(e.target.value)}>
          <option value="">Todos los módulos</option>
          <option value="activo">Activos</option>
          <option value="empleado">Empleados</option>
          <option value="usuario">Usuarios</option>
        </select>
        <select className={styles.select} value={filterUser} onChange={(e) => setFilterUser(e.target.value)}>
          <option value="">Todos los usuarios</option>
          {users.map((u) => (
            <option key={u._id} value={u._id}>{u.name}</option>
          ))}
        </select>
        <div className={styles.dateRange}>
          <input type="date" className={styles.dateInput} value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} title="Desde" />
          <span className={styles.dateSep}>—</span>
          <input type="date" className={styles.dateInput} value={filterTo}   onChange={(e) => setFilterTo(e.target.value)}   title="Hasta" />
        </div>
        {hasFilters && (
          <button className={styles.clearBtn} onClick={clearFilters}>✕ Limpiar</button>
        )}
      </div>

      {/* Timeline */}
      {loading ? (
        <div className={styles.loadingWrap}><div className={styles.spinner} /></div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>🔍</span>
          <p>Sin registros de auditoría{hasFilters ? ' con los filtros seleccionados' : ''}</p>
        </div>
      ) : (
        <div className={styles.timeline}>
          {filtered.map((log, i) => {
            const ac  = ACTION_CONFIG[log.action]  || { label: log.action,  color: '#888', bg: '#f5f5f5', icon: '•' };
            const ec  = ENTITY_CONFIG[log.entity]  || { label: log.entity,  icon: '📦' };
            const isLast = i === filtered.length - 1;
            return (
              <div key={log._id} className={`${styles.entry} ${isLast ? styles.entryLast : ''}`}>
                {/* Línea vertical */}
                <div className={styles.line} />
                {/* Dot */}
                <div className={styles.dot} style={{ background: ac.color }} title={ac.label}>
                  {ac.icon}
                </div>
                {/* Contenido */}
                <div className={styles.card}>
                  <div className={styles.cardTop}>
                    <span className={styles.badge} style={{ color: ac.color, background: ac.bg }}>
                      {ac.label}
                    </span>
                    <span className={styles.entityBadge}>
                      {ec.icon} {ec.label}
                    </span>
                    <span className={styles.entityName}>{log.entityName}</span>
                    <span className={styles.time} title={fullDate(log.createdAt)}>
                      {timeAgo(log.createdAt)}
                    </span>
                  </div>
                  <div className={styles.cardBottom}>
                    <div className={styles.userPill}>
                      <span className={styles.userAvatar}>
                        {log.userName?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </span>
                      <span className={styles.userName}>{log.userName}</span>
                    </div>
                    <span className={styles.details}>{log.details}</span>
                    <span className={styles.fullDate}>{fullDate(log.createdAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
