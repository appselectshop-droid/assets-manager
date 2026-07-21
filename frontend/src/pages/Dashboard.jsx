import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import styles from './Dashboard.module.css';

// Pedido explícito: que el Inicio se sienta como el home de FB/LinkedIn — un
// feed visual de TODA la app (no solo inventario), con la misma lógica de
// tarjetas/KPIs/barras que ya se usa en Indicadores.jsx. Indicadores se deja
// intacto como la vista analítica a fondo de Catálogos y Activos (con
// filtros, drill-down y el score de actividad); aquí se resume eso en una
// fila de KPIs con link "Ver Indicadores completos →", y se agregan
// secciones nuevas para Cuentas y Plataformas, Operación y Recursos Humanos
// que hoy no tenían ningún resumen visual en ningún lado.

const TICKET_TYPE_CONFIG = {
  hardware:      { label: 'Hardware', icon: '🖥️' },
  software:      { label: 'Software', icon: '💾' },
  red:           { label: 'Red / Conectividad', icon: '📶' },
  cuenta_acceso: { label: 'Cuenta / Acceso', icon: '🔐' },
  otro:          { label: 'Otro', icon: '❓' },
};

const SHIPMENT_STATUS_CONFIG = {
  enviado:      { label: 'Enviado', icon: '📤' },
  en_transito:  { label: 'En tránsito', icon: '🚚' },
  recibido:     { label: 'Recibido', icon: '✅' },
};

const REQUEST_STATUS_CONFIG = {
  pendiente: { label: 'Pendiente', color: '#d97706', bg: '#fffbeb' },
  aprobada:  { label: 'Aprobada',  color: '#16a34a', bg: '#f0fdf4' },
  rechazada: { label: 'Rechazada', color: '#dc2626', bg: '#fef2f2' },
};

const ACTION_ICONS  = { crear: '➕', editar: '✏️', eliminar: '🗑️', asignar: '🔗', devolver: '↩️', aprobar: '✅', rechazar: '❌', resolver: '🎫' };
const ACTION_LABELS = { crear: 'creó', editar: 'editó', eliminar: 'eliminó', asignar: 'asignó', devolver: 'devolvió', aprobar: 'aprobó', rechazar: 'rechazó', resolver: 'resolvió' };

function initials(name = '') {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

function timeAgo(date) {
  const diff = Math.floor((Date.now() - new Date(date)) / 1000);
  if (diff < 60)    return 'Hace un momento';
  if (diff < 3600)  return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`;
  return new Date(date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

const officeOf = (e) => e?.office || e?.businessName || '';

export default function Dashboard() {
  const [opsRaw, setOpsRaw]         = useState(null);
  const [raw, setRaw]               = useState(null);
  const [acctsRaw, setAcctsRaw]     = useState(null);
  const [auditFeed, setAuditFeed]   = useState(null);
  const [filterOffice, setFilterOffice] = useState('');
  const [filterDept, setFilterDept]     = useState('');
  const navigate = useNavigate();
  const user     = JSON.parse(localStorage.getItem('user') || '{}');
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const today    = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const canAccounts = user.canManageGmailAccounts || user.canManagePlatformAccounts;
  const canGmail    = !!user.canManageGmailAccounts;
  const canPlatform = !!user.canManagePlatformAccounts;
  const canErp      = !!user.canManagePlatformAccountsErp;
  const isAdmin     = user.role === 'admin';

  // Catálogos y Activos — mismo dato base que Indicadores, resumido en 4 KPIs.
  // Antes esto no tenía .catch(): si CUALQUIERA de las 3 llamadas fallaba, la
  // sección se quedaba vacía para siempre sin avisar nada — se registra el
  // error y se cae a listas vacías en vez de dejar la sección muda.
  useEffect(() => {
    Promise.all([
      api.get('/employees'),
      api.get('/assets'),
      api.get('/assignments'),
    ]).then(([empRes, assetsRes, assignRes]) => {
      setRaw({ employees: empRes.data, assets: assetsRes.data, assignments: assignRes.data });
    }).catch((err) => {
      console.error('Dashboard: error cargando Catálogos y Activos', err);
      setRaw({ employees: [], assets: [], assignments: [] });
    });
  }, []);

  // Pendientes de revisión + datos completos (todos los estatus, no solo
  // "pendiente") de Envíos/Tickets/Ingresos RH/Solicitudes de Recursos, para
  // alimentar tanto la fila de "Pendientes" de siempre como las secciones
  // nuevas de Operación y Recursos Humanos sin duplicar llamadas.
  useEffect(() => {
    const jobs = {};
    if (canAccounts) jobs.accountRequests = api.get('/account-requests', { params: { type: 'gmail,platform', status: 'pendiente' } });
    if (canErp)      jobs.erpRequests     = api.get('/account-requests', { params: { type: 'platform_erp', status: 'pendiente' } });
    if (isAdmin)      jobs.onboarding     = api.get('/onboarding-requests');
    if (isAdmin)      jobs.offboarding    = api.get('/offboarding-requests');
    if (isAdmin)      jobs.resource       = api.get('/resource-requests');
    if (isAdmin)      jobs.shipments      = api.get('/shipments');
    if (isAdmin)      jobs.tickets        = api.get('/tickets', { params: { status: 'abierto,en_proceso' } });

    const keys = Object.keys(jobs);
    if (keys.length === 0) { setOpsRaw({}); return; }
    Promise.allSettled(Object.values(jobs)).then((results) => {
      const out = {};
      keys.forEach((key, i) => {
        if (results[i].status === 'fulfilled') {
          out[key] = results[i].value.data;
        } else {
          console.error(`Dashboard: error cargando "${key}" para Operación/RH`, results[i].reason);
          out[key] = [];
        }
      });
      setOpsRaw(out);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cuentas y Plataformas — solo se pide lo que el usuario ya puede ver.
  useEffect(() => {
    const jobs = {};
    if (canGmail)    jobs.gmail    = api.get('/gmail-accounts');
    if (canPlatform) jobs.platform = api.get('/platform-accounts');
    if (canErp)      jobs.erp      = api.get('/platform-accounts-erp');
    const keys = Object.keys(jobs);
    if (keys.length === 0) { setAcctsRaw({}); return; }
    Promise.allSettled(Object.values(jobs)).then((results) => {
      const out = {};
      keys.forEach((key, i) => {
        if (results[i].status === 'fulfilled') {
          out[key] = results[i].value.data;
        } else {
          console.error(`Dashboard: error cargando "${key}" para Cuentas y Plataformas`, results[i].reason);
          out[key] = [];
        }
      });
      setAcctsRaw(out);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Actividad reciente (feed tipo "línea de tiempo") — solo admin, como en
  // Auditoría, pero acotado a lo último para que se sienta como el resto del
  // feed en vez de una tabla completa.
  useEffect(() => {
    if (!isAdmin) { setAuditFeed([]); return; }
    api.get('/audit', { params: { limit: 8 } })
      .then((res) => setAuditFeed(res.data))
      .catch(() => setAuditFeed([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Pendientes de revisión (sin filtrar — son pendientes de acción, no
     analítica; ocultar uno por el filtro de sucursal podría esconder algo
     que sí necesita atención). ──────────────────────────────────────── */
  let pendingCards = [];
  if (opsRaw) {
    if (opsRaw.accountRequests) {
      pendingCards.push({ key: 'accounts', label: 'Solicitudes de Cuentas', icon: '📝', color: '#2563eb', count: opsRaw.accountRequests.length, sub: 'pendientes', path: '/account-requests' });
    }
    if (opsRaw.erpRequests) {
      pendingCards.push({ key: 'erp', label: 'Solicitudes ERP', icon: '🏭', color: '#7c3aed', count: opsRaw.erpRequests.length, sub: 'pendientes', path: '/account-requests-erp' });
    }
    if (opsRaw.onboarding) {
      pendingCards.push({ key: 'onboarding', label: 'Ingresos RH', icon: '🧑‍💼', color: '#16a34a', count: opsRaw.onboarding.filter((r) => r.status === 'pendiente').length, sub: 'pendientes', path: '/onboarding-requests' });
    }
    if (opsRaw.offboarding) {
      // 'pendiente_rh' le toca a RH, no a Sistemas — solo 'pendiente_sistemas'
      // es lo que de verdad espera acción de este lado (mismo criterio que ya
      // usa OffboardingRequests.jsx como su filtro/vista default).
      pendingCards.push({ key: 'offboarding', label: 'Bajas RH', icon: '📤', color: '#dc2626', count: opsRaw.offboarding.filter((r) => r.status === 'pendiente_sistemas').length, sub: 'pendientes', path: '/offboarding-requests' });
    }
    if (opsRaw.resource) {
      pendingCards.push({ key: 'resource', label: 'Solicitudes de Recursos', icon: '📦', color: '#d97706', count: opsRaw.resource.filter((r) => r.status === 'pendiente').length, sub: 'pendientes', path: '/resource-requests' });
    }
    if (opsRaw.shipments) {
      const enCurso = opsRaw.shipments.filter((s) => s.status !== 'recibido').length;
      pendingCards.push({ key: 'shipments', label: 'Envíos entre Sucursales', icon: '🚚', color: '#E8431A', count: enCurso, sub: 'en curso', path: '/shipments' });
    }
    if (opsRaw.tickets) {
      pendingCards.push({ key: 'tickets', label: 'Tickets', icon: '🎫', color: '#0d9488', count: opsRaw.tickets.length, sub: 'abiertos', path: '/tickets' });
    }
  }

  /* ── Catálogos y Activos (filtrado por sucursal/depto vía asignaciones,
     mismo criterio que Indicadores) ───────────────────────────────────── */
  const catalogStats = useMemo(() => {
    if (!raw) return null;
    const allEmps   = raw.employees.filter((e) => e.active !== false);
    const allAssets = raw.assets.filter((a) => a.companyOwned !== false);
    const isFiltered = !!(filterOffice || filterDept);
    const filteredEmps = allEmps.filter((e) => {
      const office = officeOf(e);
      return (!filterOffice || office === filterOffice) && (!filterDept || e.department === filterDept);
    });
    const filteredEmpIds = new Set(filteredEmps.map((e) => e._id));
    const filteredAssign = isFiltered
      ? raw.assignments.filter((a) => filteredEmpIds.has(a.employee?._id))
      : raw.assignments;
    const usedAssetIds = new Set(filteredAssign.map((a) => a.asset?._id).filter(Boolean));
    const allOffices = [...new Set(allEmps.map(officeOf).filter(Boolean))].sort();
    const deptsInView = [...new Set(
      (filterOffice ? allEmps.filter((e) => officeOf(e) === filterOffice) : allEmps)
        .map((e) => e.department).filter(Boolean)
    )].sort();
    return {
      empCount: filteredEmps.length,
      totalGlobal: allAssets.length,
      assignedInCtx: isFiltered ? usedAssetIds.size : allAssets.filter((a) => a.status === 'asignado').length,
      availableGlobal: allAssets.filter((a) => a.status === 'disponible').length,
      allOffices, deptsInView, isFiltered,
    };
  }, [raw, filterOffice, filterDept]);

  /* ── Cuentas y Plataformas (filtrado por empleado dueño de la cuenta) ── */
  const acctStats = useMemo(() => {
    if (!acctsRaw) return null;
    const matches = (acc) => {
      const office = officeOf(acc.employee);
      return (!filterOffice || office === filterOffice) && (!filterDept || acc.employee?.department === filterDept);
    };
    const gmail    = (acctsRaw.gmail    || []).filter(matches);
    const platform = (acctsRaw.platform || []).filter(matches);
    const erp      = (acctsRaw.erp      || []).filter(matches);

    const byPlatform = {};
    platform.forEach((a) => { byPlatform[a.platform] = (byPlatform[a.platform] || 0) + 1; });
    const platformBreakdown = Object.entries(byPlatform)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    return { gmailCount: gmail.length, platformCount: platform.length, erpCount: erp.length, platformBreakdown };
  }, [acctsRaw, filterOffice, filterDept]);

  /* ── Operación: Envíos (filtrado por sucursal origen/destino — no hay
     departamento aplicable a un envío) + Tickets (sin filtro: hoy no se
     guarda oficina/departamento del empleado en el ticket). ──────────── */
  const opsStats = useMemo(() => {
    if (!opsRaw) return null;
    const shipments = (opsRaw.shipments || []).filter((s) =>
      !filterOffice || s.originOffice === filterOffice || s.destinationOffice === filterOffice
    );
    const shipmentsByStatus = ['enviado', 'en_transito', 'recibido'].map((status) => ({
      status, count: shipments.filter((s) => s.status === status).length,
    }));
    const tickets = opsRaw.tickets || [];
    const byType = {};
    tickets.forEach((t) => { byType[t.ticketType] = (byType[t.ticketType] || 0) + 1; });
    const ticketsByType = Object.entries(byType).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
    return {
      shipmentsEnCurso: shipments.filter((s) => s.status !== 'recibido').length,
      shipmentsRecibidos: shipments.filter((s) => s.status === 'recibido').length,
      shipmentsByStatus,
      ticketsAbiertos: tickets.filter((t) => t.status === 'abierto').length,
      ticketsBloqueantes: tickets.filter((t) => t.blocksWork).length,
      ticketsByType,
    };
  }, [opsRaw, filterOffice]);

  /* ── Recursos Humanos: Ingresos (filtrado, tiene office/department
     directos) + Solicitudes de Recursos (solo depto, no guarda oficina). ── */
  const rhStats = useMemo(() => {
    if (!opsRaw) return null;
    const onboarding = (opsRaw.onboarding || []).filter((r) =>
      (!filterOffice || r.office === filterOffice) && (!filterDept || r.department === filterDept)
    );
    const resource = (opsRaw.resource || []).filter((r) => !filterDept || r.department === filterDept);
    return {
      onboardingPending: onboarding.filter((r) => r.status === 'pendiente').length,
      onboardingAprobadas: onboarding.filter((r) => r.status === 'aprobada').length,
      resourcePending: resource.filter((r) => r.status === 'pendiente').length,
      resourceAprobadas: resource.filter((r) => r.status === 'aprobada').length,
      recentOnboarding: [...onboarding].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5),
      recentResource: [...resource].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5),
    };
  }, [opsRaw, filterOffice, filterDept]);

  const showAccountsSection = canGmail || canPlatform || canErp;

  return (
    <div className={styles.page}>

      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.greeting}>{greeting}, <span>{user.name?.split(' ')[0]}</span> 👋</h1>
          <p className={styles.date}>{today.charAt(0).toUpperCase() + today.slice(1)}</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.btnAction} onClick={() => navigate('/assets')}>+ Nuevo activo</button>
          <button className={styles.btnActionSecondary} onClick={() => navigate('/employees')}>+ Empleado</button>
        </div>
      </div>

      {/* Accesos directos — mismas categorías y colores que la barra superior
          (Layout.jsx), para que se sienta consistente. Mesa de Ayuda no
          aparece aquí a propósito: es el portal del EMPLEADO, Sistemas no
          navega hacia allá desde su panel. */}
      <div className={styles.quickRow}>
        <div className={styles.quickCard} style={{ '--accent': '#2563eb' }} onClick={() => navigate('/employees')}>
          <span className={styles.quickIcon}>🗂️</span>
          <div>
            <p className={styles.quickTitle}>Catálogos y Activos</p>
            <p className={styles.quickSub}>Empleados, activos, asignaciones</p>
          </div>
        </div>
        {(canAccounts || canErp) && (
          <div className={styles.quickCard} style={{ '--accent': '#7c3aed' }}
            onClick={() => navigate(canAccounts ? '/gmail-accounts' : '/platform-accounts-erp')}>
            <span className={styles.quickIcon}>🔑</span>
            <div>
              <p className={styles.quickTitle}>Cuentas y Plataformas</p>
              <p className={styles.quickSub}>Gmail, plataformas, ERP</p>
            </div>
          </div>
        )}
        {isAdmin && (
          <div className={styles.quickCard} style={{ '--accent': '#16a34a' }} onClick={() => navigate('/shipments')}>
            <span className={styles.quickIcon}>🚚</span>
            <div>
              <p className={styles.quickTitle}>Operación</p>
              <p className={styles.quickSub}>Envíos, tickets, auditoría</p>
            </div>
          </div>
        )}
        <div className={styles.quickCard} style={{ '--accent': '#E8431A' }} onClick={() => navigate('/indicadores')}>
          <span className={styles.quickIcon}>🎯</span>
          <div>
            <p className={styles.quickTitle}>Indicadores</p>
            <p className={styles.quickSub}>KPIs de servicio del área</p>
          </div>
        </div>
      </div>

      {/* Filtro global — afecta a todas las secciones de abajo que tengan
          oficina/departamento disponible (se avisa con "sin filtro aplicable"
          donde no aplica, en vez de fingir que sí filtra). */}
      {catalogStats && (catalogStats.allOffices.length > 0 || catalogStats.deptsInView.length > 0) && (
        <div className={styles.filterBar}>
          {catalogStats.allOffices.length > 0 && (
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Sucursal</span>
              <div className={styles.filterChips}>
                <button className={`${styles.chip} ${!filterOffice ? styles.chipActive : ''}`} onClick={() => { setFilterOffice(''); setFilterDept(''); }}>Todas</button>
                {catalogStats.allOffices.map((o) => (
                  <button key={o} className={`${styles.chip} ${filterOffice === o ? styles.chipActive : ''}`}
                    onClick={() => { setFilterOffice(filterOffice === o ? '' : o); setFilterDept(''); }}>{o}</button>
                ))}
              </div>
            </div>
          )}
          {catalogStats.deptsInView.length > 0 && (
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Departamento</span>
              <div className={styles.filterChips}>
                <button className={`${styles.chip} ${!filterDept ? styles.chipActive : ''}`} onClick={() => setFilterDept('')}>Todos</button>
                {catalogStats.deptsInView.map((d) => (
                  <button key={d} className={`${styles.chip} ${filterDept === d ? styles.chipActive : ''}`}
                    onClick={() => setFilterDept(filterDept === d ? '' : d)}>{d}</button>
                ))}
              </div>
            </div>
          )}
          {(filterOffice || filterDept) && (
            <button className={styles.clearFilters} onClick={() => { setFilterOffice(''); setFilterDept(''); }}>✕ Limpiar filtros</button>
          )}
        </div>
      )}

      {/* Pendientes de revisión */}
      {pendingCards.length > 0 && (
        <>
          <h2 className={styles.sectionHeading}>Pendientes de revisión</h2>
          <div className={styles.pendingRow}>
            {pendingCards.map((c) => (
              <div key={c.key} className={styles.kpi} onClick={() => navigate(c.path)} style={{ '--accent': c.color }}>
                <div className={styles.kpiTop}>
                  <span className={styles.kpiIcon}>{c.icon}</span>
                  <span className={styles.kpiValue} style={{ color: c.color }}>{c.count}</span>
                </div>
                <p className={styles.kpiLabel}>{c.label}</p>
                <p className={styles.kpiSub}>{c.sub}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Catálogos y Activos — resumen; el detalle a fondo vive en Indicadores */}
      {catalogStats && (
        <>
          <div className={styles.cardHeaderRow} style={{ marginBottom: '-0.5rem' }}>
            <h2 className={styles.sectionHeading}>Catálogos y Activos</h2>
            <button className={styles.cardLink} onClick={() => navigate('/indicadores')}>Ver Indicadores completos →</button>
          </div>
          <div className={styles.kpiRow}>
            <div className={styles.kpi} onClick={() => navigate('/employees')} style={{ '--accent': '#E8431A' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>👥</span><span className={styles.kpiValue} style={{ color: '#E8431A' }}>{catalogStats.empCount}</span></div>
              <p className={styles.kpiLabel}>Empleados</p>
              <p className={styles.kpiSub}>{catalogStats.isFiltered ? [filterOffice, filterDept].filter(Boolean).join(' · ') : 'registrados'}</p>
            </div>
            <div className={styles.kpi} onClick={() => navigate('/assets')} style={{ '--accent': '#2563eb' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>💻</span><span className={styles.kpiValue} style={{ color: '#2563eb' }}>{catalogStats.totalGlobal}</span></div>
              <p className={styles.kpiLabel}>Activos totales</p>
              <p className={styles.kpiSub}>en inventario</p>
            </div>
            <div className={styles.kpi} onClick={() => navigate('/assignments')} style={{ '--accent': '#d97706' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>🔗</span><span className={styles.kpiValue} style={{ color: '#d97706' }}>{catalogStats.assignedInCtx}</span></div>
              <p className={styles.kpiLabel}>Asignados</p>
              <p className={styles.kpiSub}>{catalogStats.isFiltered ? 'al grupo filtrado' : 'activos en uso'}</p>
            </div>
            <div className={styles.kpi} onClick={() => navigate('/stock')} style={{ '--accent': '#16a34a' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>✅</span><span className={styles.kpiValue} style={{ color: '#16a34a' }}>{catalogStats.availableGlobal}</span></div>
              <p className={styles.kpiLabel}>Disponibles</p>
              <p className={styles.kpiSub}>global</p>
            </div>
          </div>
        </>
      )}

      {/* Cuentas y Plataformas */}
      {showAccountsSection && acctStats && (
        <>
          <h2 className={styles.sectionHeading}>Cuentas y Plataformas</h2>
          <div className={styles.kpiRow}>
            {canGmail && (
              <div className={styles.kpi} onClick={() => navigate('/gmail-accounts')} style={{ '--accent': '#2563eb' }}>
                <div className={styles.kpiTop}><span className={styles.kpiIcon}>📧</span><span className={styles.kpiValue} style={{ color: '#2563eb' }}>{acctStats.gmailCount}</span></div>
                <p className={styles.kpiLabel}>Cuentas Gmail</p>
                <p className={styles.kpiSub}>activas + inactivas</p>
              </div>
            )}
            {canPlatform && (
              <div className={styles.kpi} onClick={() => navigate('/platform-accounts')} style={{ '--accent': '#7c3aed' }}>
                <div className={styles.kpiTop}><span className={styles.kpiIcon}>🔑</span><span className={styles.kpiValue} style={{ color: '#7c3aed' }}>{acctStats.platformCount}</span></div>
                <p className={styles.kpiLabel}>Cuentas Plataformas</p>
                <p className={styles.kpiSub}>Amazon, Microsoft, etc.</p>
              </div>
            )}
            {canErp && (
              <div className={styles.kpi} onClick={() => navigate('/platform-accounts-erp')} style={{ '--accent': '#0d9488' }}>
                <div className={styles.kpiTop}><span className={styles.kpiIcon}>🏭</span><span className={styles.kpiValue} style={{ color: '#0d9488' }}>{acctStats.erpCount}</span></div>
                <p className={styles.kpiLabel}>Cuentas ERP</p>
                <p className={styles.kpiSub}>acceso a plataforma interna</p>
              </div>
            )}
          </div>
          {canPlatform && acctStats.platformBreakdown.length > 0 && (
            <div className={styles.card}>
              <div className={styles.cardHeaderRow}>
                <h2 className={styles.cardTitle}>Cuentas por plataforma</h2>
                <button className={styles.cardLink} onClick={() => navigate('/platform-accounts')}>Ver todas →</button>
              </div>
              <div className={styles.catList}>
                {acctStats.platformBreakdown.map((p) => {
                  const maxP = Math.max(...acctStats.platformBreakdown.map((x) => x.count), 1);
                  return (
                    <div key={p.name} className={styles.catItem}>
                      <div className={styles.catHeader}>
                        <span className={styles.catIcon}>🔑</span>
                        <span className={styles.catLabel}>{p.name}</span>
                        <span className={styles.catCount}>{p.count}</span>
                      </div>
                      <div className={styles.barTrack}><div className={styles.barFill} style={{ width: `${(p.count / maxP) * 100}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Operación */}
      {isAdmin && opsStats && (
        <>
          <h2 className={styles.sectionHeading}>Operación</h2>
          <div className={styles.kpiRow}>
            <div className={styles.kpi} onClick={() => navigate('/shipments')} style={{ '--accent': '#E8431A' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>🚚</span><span className={styles.kpiValue} style={{ color: '#E8431A' }}>{opsStats.shipmentsEnCurso}</span></div>
              <p className={styles.kpiLabel}>Envíos en curso</p>
              <p className={styles.kpiSub}>{filterOffice ? `desde/hacia ${filterOffice}` : 'entre sucursales'}</p>
            </div>
            <div className={styles.kpi} onClick={() => navigate('/shipments')} style={{ '--accent': '#16a34a' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>✅</span><span className={styles.kpiValue} style={{ color: '#16a34a' }}>{opsStats.shipmentsRecibidos}</span></div>
              <p className={styles.kpiLabel}>Envíos recibidos</p>
              <p className={styles.kpiSub}>confirmados</p>
            </div>
            <div className={styles.kpi} onClick={() => navigate('/tickets')} style={{ '--accent': '#0d9488' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>🎫</span><span className={styles.kpiValue} style={{ color: '#0d9488' }}>{opsStats.ticketsAbiertos}</span></div>
              <p className={styles.kpiLabel}>Tickets abiertos</p>
              <p className={styles.kpiSub}>sin tomar</p>
            </div>
            <div className={styles.kpi} onClick={() => navigate('/tickets')} style={{ '--accent': '#dc2626' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>⚠️</span><span className={styles.kpiValue} style={{ color: '#dc2626' }}>{opsStats.ticketsBloqueantes}</span></div>
              <p className={styles.kpiLabel}>Tickets bloqueantes</p>
              <p className={styles.kpiSub}>le impiden trabajar a alguien</p>
            </div>
          </div>

          <div className={styles.bottomRow}>
            <div className={styles.card}>
              <div className={styles.cardHeaderRow}>
                <h2 className={styles.cardTitle}>Envíos por estatus</h2>
                <button className={styles.cardLink} onClick={() => navigate('/shipments')}>Ver todos →</button>
              </div>
              {opsStats.shipmentsByStatus.every((s) => s.count === 0) ? (
                <p className={styles.empty}>Sin envíos registrados</p>
              ) : (
                <div className={styles.catList}>
                  {opsStats.shipmentsByStatus.map(({ status, count }) => {
                    const cfg = SHIPMENT_STATUS_CONFIG[status];
                    const maxS = Math.max(...opsStats.shipmentsByStatus.map((s) => s.count), 1);
                    return (
                      <div key={status} className={styles.catItem}>
                        <div className={styles.catHeader}>
                          <span className={styles.catIcon}>{cfg.icon}</span>
                          <span className={styles.catLabel}>{cfg.label}</span>
                          <span className={styles.catCount}>{count}</span>
                        </div>
                        <div className={styles.barTrack}><div className={styles.barFill} style={{ width: `${(count / maxS) * 100}%` }} /></div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeaderRow}>
                <h2 className={styles.cardTitle}>Tickets por tipo</h2>
                <button className={styles.cardLink} onClick={() => navigate('/tickets')}>Ver todos →</button>
              </div>
              {opsStats.ticketsByType.length === 0 ? (
                <p className={styles.empty}>Sin tickets abiertos ni en proceso</p>
              ) : (
                <div className={styles.catList}>
                  {opsStats.ticketsByType.map(({ type, count }) => {
                    const cfg = TICKET_TYPE_CONFIG[type] || { label: type, icon: '❓' };
                    const maxT = Math.max(...opsStats.ticketsByType.map((t) => t.count), 1);
                    return (
                      <div key={type} className={styles.catItem}>
                        <div className={styles.catHeader}>
                          <span className={styles.catIcon}>{cfg.icon}</span>
                          <span className={styles.catLabel}>{cfg.label}</span>
                          <span className={styles.catCount}>{count}</span>
                        </div>
                        <div className={styles.barTrack}><div className={styles.barFill} style={{ width: `${(count / maxT) * 100}%` }} /></div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeaderRow}>
                <h2 className={styles.cardTitle}>Actividad reciente</h2>
                <button className={styles.cardLink} onClick={() => navigate('/audit')}>Ver auditoría →</button>
              </div>
              {!auditFeed || auditFeed.length === 0 ? (
                <p className={styles.empty}>Sin actividad registrada</p>
              ) : (
                <div className={styles.assignList}>
                  {auditFeed.map((l) => (
                    <div key={l._id} className={styles.assignItem}>
                      <div className={styles.assignAvatar}>{ACTION_ICONS[l.action] || '•'}</div>
                      <div className={styles.assignInfo}>
                        <p className={styles.assignEmp}>{l.userName} {ACTION_LABELS[l.action] || l.action}</p>
                        <p className={styles.assignAsset}>{l.entityName || l.details || '—'}</p>
                      </div>
                      <span className={styles.assignTime}>{timeAgo(l.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Recursos Humanos */}
      {isAdmin && rhStats && (
        <>
          <h2 className={styles.sectionHeading}>Recursos Humanos</h2>
          <div className={styles.kpiRow}>
            <div className={styles.kpi} onClick={() => navigate('/onboarding-requests')} style={{ '--accent': '#16a34a' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>🧑‍💼</span><span className={styles.kpiValue} style={{ color: '#16a34a' }}>{rhStats.onboardingPending}</span></div>
              <p className={styles.kpiLabel}>Ingresos pendientes</p>
              <p className={styles.kpiSub}>por revisar</p>
            </div>
            <div className={styles.kpi} onClick={() => navigate('/onboarding-requests')} style={{ '--accent': '#2563eb' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>✅</span><span className={styles.kpiValue} style={{ color: '#2563eb' }}>{rhStats.onboardingAprobadas}</span></div>
              <p className={styles.kpiLabel}>Ingresos aprobados</p>
              <p className={styles.kpiSub}>{filterOffice || filterDept ? [filterOffice, filterDept].filter(Boolean).join(' · ') : 'total'}</p>
            </div>
            <div className={styles.kpi} onClick={() => navigate('/resource-requests')} style={{ '--accent': '#d97706' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>📦</span><span className={styles.kpiValue} style={{ color: '#d97706' }}>{rhStats.resourcePending}</span></div>
              <p className={styles.kpiLabel}>Recursos pendientes</p>
              <p className={styles.kpiSub}>por revisar</p>
            </div>
            <div className={styles.kpi} onClick={() => navigate('/resource-requests')} style={{ '--accent': '#7c3aed' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>✅</span><span className={styles.kpiValue} style={{ color: '#7c3aed' }}>{rhStats.resourceAprobadas}</span></div>
              <p className={styles.kpiLabel}>Recursos aprobados</p>
              <p className={styles.kpiSub}>{filterDept || 'total'}</p>
            </div>
          </div>

          <div className={styles.bottomRow}>
            <div className={styles.card}>
              <div className={styles.cardHeaderRow}>
                <h2 className={styles.cardTitle}>Últimos ingresos RH</h2>
                <button className={styles.cardLink} onClick={() => navigate('/onboarding-requests')}>Ver todos →</button>
              </div>
              {rhStats.recentOnboarding.length === 0 ? (
                <p className={styles.empty}>Sin ingresos registrados</p>
              ) : (
                <div className={styles.assignList}>
                  {rhStats.recentOnboarding.map((r) => {
                    const cfg = REQUEST_STATUS_CONFIG[r.status];
                    return (
                      <div key={r._id} className={styles.assignItem} onClick={() => navigate('/onboarding-requests')} style={{ cursor: 'pointer' }}>
                        <div className={styles.assignAvatar}>{initials(r.employeeName)}</div>
                        <div className={styles.assignInfo}>
                          <p className={styles.assignEmp}>{r.employeeName}</p>
                          <p className={styles.assignAsset}>{[r.office, r.department].filter(Boolean).join(' · ') || '—'}</p>
                        </div>
                        <span className={styles.scoreBadge} style={{ color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeaderRow}>
                <h2 className={styles.cardTitle}>Últimas solicitudes de recursos</h2>
                <button className={styles.cardLink} onClick={() => navigate('/resource-requests')}>Ver todas →</button>
              </div>
              {rhStats.recentResource.length === 0 ? (
                <p className={styles.empty}>Sin solicitudes registradas</p>
              ) : (
                <div className={styles.assignList}>
                  {rhStats.recentResource.map((r) => {
                    const cfg = REQUEST_STATUS_CONFIG[r.status];
                    return (
                      <div key={r._id} className={styles.assignItem} onClick={() => navigate('/resource-requests')} style={{ cursor: 'pointer' }}>
                        <div className={styles.assignAvatar}>{initials(r.employeeName)}</div>
                        <div className={styles.assignInfo}>
                          <p className={styles.assignEmp}>{r.employeeName}</p>
                          <p className={styles.assignAsset}>{(r.resourceItems || []).join(', ') || r.department || '—'}</p>
                        </div>
                        <span className={styles.scoreBadge} style={{ color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
