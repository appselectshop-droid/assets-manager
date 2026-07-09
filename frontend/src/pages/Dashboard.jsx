import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { TYPE_ICONS, ASSET_TYPE_LABELS } from '../config/assetFields';
import styles from './Dashboard.module.css';

const CATEGORIES = [
  { key: 'computo',     label: 'Cómputo',        icon: '💻', types: ['laptop', 'escritorio', 'all_in_one'] },
  { key: 'celulares',   label: 'Móviles',         icon: '📱', types: ['celular', 'tablet', 'cargador_celular'] },
  { key: 'perifericos', label: 'Periféricos',     icon: '🖱️', types: ['monitor', 'mouse', 'teclado', 'cargador_laptop'] },
  { key: 'infra',       label: 'Infraestructura', icon: '🌐', types: ['router', 'switch', 'camara_ip', 'nvr', 'poe_injector', 'ups', 'insumo_red'] },
  { key: 'otros',       label: 'Otros',           icon: '📦', types: ['accesorio', 'disco_duro', 'adaptador', 'otro'] },
];

const ACTION_LABELS = { crear: 'Altas', editar: 'Ediciones', eliminar: 'Bajas', asignar: 'Asignaciones', devolver: 'Devoluciones', aprobar: 'Aprobaciones', rechazar: 'Rechazos' };
const ACTION_ICONS  = { crear: '➕', editar: '✏️', eliminar: '🗑️', asignar: '🔗', devolver: '↩️', aprobar: '✅', rechazar: '❌' };

// Pesos manuales para el score de actividad (no aprendidos — una crear/asignar cuenta más
// que una edición/devolución porque implica más pasos de captura). Ajustables a mano.
const ACTION_WEIGHTS = { crear: 1, asignar: 1, editar: 0.5, eliminar: 0.5, devolver: 0.5, aprobar: 1, rechazar: 0.5 };

const ACTIVITY_LEVELS = {
  alto:  { label: 'Actividad alta',  color: '#16a34a', bg: '#f0fdf4' },
  medio: { label: 'Actividad media', color: '#d97706', bg: '#fffbeb' },
  bajo:  { label: 'Actividad baja',  color: '#6b7280', bg: '#f5f5f5' },
};

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

export default function Dashboard() {
  const [raw, setRaw]               = useState(null);
  const [auditRaw, setAuditRaw]     = useState(null);
  const [usersRaw, setUsersRaw]     = useState(null);
  const [filterOffice, setFilterOffice] = useState('');
  const [filterDept,   setFilterDept]   = useState('');
  const [selectedCat,  setSelectedCat]  = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const navigate = useNavigate();
  const user     = JSON.parse(localStorage.getItem('user') || '{}');
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const today    = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  useEffect(() => { setSelectedCat(null); setSelectedType(null); }, [filterOffice, filterDept]);

  useEffect(() => {
    Promise.all([
      api.get('/employees'),
      api.get('/assets'),
      api.get('/assignments'),
    ]).then(([empRes, assetsRes, assignRes]) => {
      setRaw({ employees: empRes.data, assets: assetsRes.data, assignments: assignRes.data });
    });
  }, []);

  // Actividad real del equipo (diagnóstico): solo admin ve el detalle de auditoría completo
  useEffect(() => {
    if (user.role !== 'admin') return;
    const from = new Date(Date.now() - 7 * 86400000).toISOString();
    api.get('/audit', { params: { from, limit: 1000 } })
      .then((res) => setAuditRaw(res.data))
      .catch(() => setAuditRaw([]));
    api.get('/users')
      .then((res) => setUsersRaw(res.data))
      .catch(() => setUsersRaw([]));
  }, []);

  const derived = useMemo(() => {
    if (!raw) return null;
    const { employees: allEmpsRaw, assets: allAssets, assignments: allAssign } = raw;
    // Los empleados dados de baja ya no son parte del equipo — no deben contar
    // en headcount, desgloses por sucursal/departamento ni filtros del Dashboard.
    const allEmps = allEmpsRaw.filter((e) => e.active !== false);
    const isFiltered = !!(filterOffice || filterDept);

    /* ── Empleados filtrados ─────────────────────── */
    const filteredEmps = allEmps.filter((e) => {
      const office = e.office || e.businessName || '';
      return (!filterOffice || office === filterOffice) &&
             (!filterDept   || e.department === filterDept);
    });
    const filteredEmpIds = new Set(filteredEmps.map((e) => e._id));

    /* ── Asignaciones filtradas ──────────────────── */
    const filteredAssign = isFiltered
      ? allAssign.filter((a) => filteredEmpIds.has(a.employee?._id))
      : allAssign;

    const usedAssetIds = new Set(filteredAssign.map((a) => a.asset?._id).filter(Boolean));

    /* ── KPIs globales ───────────────────────────── */
    const totalGlobal     = allAssets.length;
    const assignedGlobal  = allAssets.filter((a) => a.status === 'asignado').length;
    const availableGlobal = allAssets.filter((a) => a.status === 'disponible').length;
    const bajaGlobal      = allAssets.filter((a) => a.status === 'baja').length;

    /* ── Category bars (filtradas si hay filtro) ─── */
    const assetsForCat = isFiltered
      ? allAssets.filter((a) => usedAssetIds.has(a._id))
      : allAssets;
    const byCategory = CATEGORIES.map((c) => ({
      ...c,
      count: assetsForCat.filter((a) => c.types.includes(a.type)).length,
    }));

    const byType = {};
    assetsForCat.forEach((a) => {
      if (a.type) byType[a.type] = (byType[a.type] || 0) + 1;
    });

    /* ── Dónde están físicamente (drill-down interactivo por tipo) ─ */
    const byTypeLocation = {};
    assetsForCat.forEach((a) => {
      if (!a.type) return;
      const loc = a.location || 'Sin sucursal';
      if (!byTypeLocation[a.type]) byTypeLocation[a.type] = {};
      byTypeLocation[a.type][loc] = (byTypeLocation[a.type][loc] || 0) + 1;
    });

    /* ── Tarjeta de desglose (adaptativa) ────────── */
    let breakdownTitle, breakdownData, breakdownType;
    if (filterOffice && !filterDept) {
      const deptMap = {};
      filteredEmps.forEach((e) => {
        const d = e.department || 'Sin departamento';
        deptMap[d] = (deptMap[d] || 0) + 1;
      });
      breakdownData  = Object.entries(deptMap).map(([n, c]) => ({ name: n, count: c })).sort((a, b) => b.count - a.count).slice(0, 5);
      breakdownTitle = `Departamentos · ${filterOffice}`;
      breakdownType  = 'department';
    } else if (filterDept && !filterOffice) {
      const officeMap = {};
      filteredEmps.forEach((e) => {
        const o = e.office || e.businessName || 'Sin sucursal';
        officeMap[o] = (officeMap[o] || 0) + 1;
      });
      breakdownData  = Object.entries(officeMap).map(([n, c]) => ({ name: n, count: c })).sort((a, b) => b.count - a.count).slice(0, 5);
      breakdownTitle = `Sucursales · ${filterDept}`;
      breakdownType  = 'office';
    } else if (!isFiltered) {
      const officeMap = {};
      allEmps.forEach((e) => {
        const k = e.office || e.businessName || 'Sin sucursal';
        officeMap[k] = (officeMap[k] || 0) + 1;
      });
      breakdownData  = Object.entries(officeMap).map(([n, c]) => ({ name: n, count: c })).sort((a, b) => b.count - a.count).slice(0, 5);
      breakdownTitle = 'Empleados por sucursal';
      breakdownType  = 'office';
    } else {
      breakdownData  = [];
      breakdownTitle = '';
      breakdownType  = null;
    }

    /* ── Assets físicamente en la sucursal filtrada ─
       A diferencia de assetsForCat (que sigue la sucursal del EMPLEADO vía sus
       asignaciones), esto usa Asset.location directo — incluye también los
       disponibles/de baja que están en esa sucursal sin estar asignados. */
    const assetsInOffice = filterOffice
      ? allAssets.filter((a) => (a.location || '') === filterOffice)
      : allAssets;

    /* ── Propiedad de cómputo (respeta el filtro de sucursal) ──── */
    const COMPUTO_TYPES = ['laptop', 'escritorio', 'all_in_one'];
    const computoAll      = assetsInOffice.filter((a) => COMPUTO_TYPES.includes(a.type));
    const computoTotal    = computoAll.length;
    const ownerArrendam   = computoAll.filter((a) => a.specs?.ownership === 'Arrendamiento').length;
    const ownerPropia     = computoAll.filter((a) => a.specs?.ownership === 'Propia').length;
    const ownerSinDef     = computoTotal - ownerArrendam - ownerPropia;

    // desglose por tipo
    const ownerByType = COMPUTO_TYPES.map((t) => {
      const sub = computoAll.filter((a) => a.type === t);
      return {
        type: t,
        total:       sub.length,
        arrendamiento: sub.filter((a) => a.specs?.ownership === 'Arrendamiento').length,
        propia:        sub.filter((a) => a.specs?.ownership === 'Propia').length,
      };
    }).filter((r) => r.total > 0);

    /* ── Donut (respeta el filtro de sucursal) ──── */
    const donutTotalCount     = assetsInOffice.length;
    const donutAssignedCount  = assetsInOffice.filter((a) => a.status === 'asignado').length;
    const donutAvailableCount = assetsInOffice.filter((a) => a.status === 'disponible').length;
    const donutBajaCount      = assetsInOffice.filter((a) => a.status === 'baja').length;

    /* ── Recientes y top ─────────────────────────── */
    const recent = filteredAssign.slice(0, 6);

    const empCountMap = {};
    const empMetaMap  = {};
    filteredAssign.forEach((a) => {
      const id = a.employee?._id;
      if (!id) return;
      empCountMap[id] = (empCountMap[id] || 0) + 1;
      empMetaMap[id]  = a.employee;
    });
    const topEmployees = Object.entries(empCountMap)
      .map(([id, count]) => ({ ...empMetaMap[id], count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    /* ── Opciones de filtro disponibles ──────────── */
    const allOffices = [...new Set(allEmps.map((e) => e.office || e.businessName).filter(Boolean))].sort();
    const deptsInView = [...new Set(
      (filterOffice
        ? allEmps.filter((e) => (e.office || e.businessName) === filterOffice)
        : allEmps
      ).map((e) => e.department).filter(Boolean)
    )].sort();

    /* ── Actividad real del equipo (diagnóstico) ───
       Las "asignaciones nuevas" son solo una parte del trabajo de Sistemas
       (como las ventas de un vendedor) — el AuditLog captura también altas,
       ediciones, bajas y devoluciones que no generan una asignación nueva. */
    let activity = null;
    if (auditRaw && usersRaw) {
      // AuditLog nunca borra su rastro aunque el usuario que hizo la acción se
      // elimine después (correcto para no perder historial) — pero eso significa
      // que cuentas de prueba ya borradas ("Tester Import", "Verify Test", etc.,
      // de pruebas de features anteriores) seguían apareciendo aquí. Se filtran
      // para que el Dashboard solo muestre actividad de gente que existe hoy.
      const knownUserIds = new Set(usersRaw.map((u) => u._id));
      const realAudit = auditRaw.filter((l) => knownUserIds.has(String(l.userId)));

      const byAction = {};
      realAudit.forEach((l) => { byAction[l.action] = (byAction[l.action] || 0) + 1; });
      const totalActions = realAudit.length;
      const otherActions = totalActions - (byAction.asignar || 0);

      const sevenDaysAgo = Date.now() - 7 * 86400000;
      const assignmentsLast7 = allAssign.filter((a) => new Date(a.assignedDate).getTime() >= sevenDaysAgo).length;

      const actionBreakdown = Object.entries(byAction)
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count);

      /* ── Score de actividad por persona ─────────
         "Lógica de modelo" sin modelo: se combinan varias señales (features) por
         persona en un solo score con pesos fijos (ACTION_WEIGHTS), y se clasifica
         en Alto/Medio/Bajo de forma relativa al máximo del propio equipo en el
         periodo — no son umbrales absolutos ni nada aprendido de datos históricos. */
      const officeByUserId = {};
      (usersRaw || []).forEach((u) => { officeByUserId[u._id] = u.office || ''; });

      const byPerson = {};
      realAudit.forEach((l) => {
        const key = l.userId || l.userName;
        if (!byPerson[key]) {
          byPerson[key] = { id: l.userId, name: l.userName, office: officeByUserId[l.userId] || '', counts: {}, score: 0 };
        }
        byPerson[key].counts[l.action] = (byPerson[key].counts[l.action] || 0) + 1;
        byPerson[key].score += ACTION_WEIGHTS[l.action] ?? 1;
      });

      const maxScore = Math.max(...Object.values(byPerson).map((p) => p.score), 1);
      const people = Object.values(byPerson)
        .map((p) => {
          const ratio = p.score / maxScore;
          const level = ratio >= 0.66 ? 'alto' : ratio >= 0.33 ? 'medio' : 'bajo';
          return { ...p, level };
        })
        .sort((a, b) => b.score - a.score);

      /* Todo, todo separado por sucursal: se agrupa el score por persona bajo
         la sucursal de cada quién (User.office); si hay un filtro de sucursal
         activo en el Dashboard, solo se muestra ese grupo. */
      const peopleByOffice = {};
      people.forEach((p) => {
        const office = p.office || 'Sin sucursal asignada';
        if (!peopleByOffice[office]) peopleByOffice[office] = [];
        peopleByOffice[office].push(p);
      });
      let peopleGroups = Object.entries(peopleByOffice)
        .map(([office, ppl]) => ({ office, people: ppl }))
        .sort((a, b) => b.people.length - a.people.length);
      if (filterOffice) peopleGroups = peopleGroups.filter((g) => g.office === filterOffice);

      activity = {
        totalActions,
        assignmentsLast7,
        actionBreakdown,
        peopleGroups,
        insight: (totalActions > 0 && otherActions > assignmentsLast7)
          ? `Solo hubo ${assignmentsLast7} asignación${assignmentsLast7 !== 1 ? 'es' : ''} nueva${assignmentsLast7 !== 1 ? 's' : ''} esta semana, pero el equipo registró ${otherActions} acción${otherActions !== 1 ? 'es' : ''} más en el sistema (altas, ediciones, bajas, devoluciones) — la actividad real no se ve solo en las asignaciones.`
          : null,
      };
    }

    return {
      empCount: filteredEmps.length,
      assignedInCtx: usedAssetIds.size,
      totalGlobal, assignedGlobal, availableGlobal, bajaGlobal,
      byCategory, byType, byTypeLocation, breakdownTitle, breakdownData, breakdownType,
      computoTotal, ownerArrendam, ownerPropia, ownerSinDef, ownerByType,
      donutTotalCount, donutAssignedCount, donutAvailableCount, donutBajaCount,
      recent, topEmployees,
      allOffices, deptsInView,
      isFiltered, activity,
    };
  }, [raw, filterOffice, filterDept, auditRaw, usersRaw]);

  if (!derived) return (
    <div className={styles.loadingWrap}>
      <div className={styles.spinner} />
    </div>
  );

  const {
    empCount, assignedInCtx,
    totalGlobal, assignedGlobal, availableGlobal, bajaGlobal,
    byCategory, byType, byTypeLocation, breakdownTitle, breakdownData, breakdownType,
    computoTotal, ownerArrendam, ownerPropia, ownerSinDef, ownerByType,
    donutTotalCount, donutAssignedCount, donutAvailableCount, donutBajaCount,
    recent, topEmployees,
    allOffices, deptsInView, isFiltered, activity,
  } = derived;

  /* ── Donut: respeta el filtro de sucursal (Asset.location) ─── */
  const donutTotal   = donutTotalCount;
  const assignedDeg  = donutTotal > 0 ? (donutAssignedCount  / donutTotal) * 360 : 0;
  const availableDeg = donutTotal > 0 ? (donutAvailableCount / donutTotal) * 360 : 0;
  const bajaDeg      = donutTotal > 0 ? (donutBajaCount      / donutTotal) * 360 : 0;
  const donutStyle   = {
    background: `conic-gradient(
      #E8431A 0deg ${assignedDeg}deg,
      #16a34a ${assignedDeg}deg ${assignedDeg + availableDeg}deg,
      #dc2626 ${assignedDeg + availableDeg}deg ${assignedDeg + availableDeg + bajaDeg}deg,
      #e5e7eb ${assignedDeg + availableDeg + bajaDeg}deg 360deg
    )`,
  };

  const maxCat = Math.max(...byCategory.map((c) => c.count), 1);

  /* ── KPIs ─────────────────────────────────────── */
  const kpis = isFiltered ? [
    { label: 'Empleados',         value: empCount,        icon: '👥', color: '#E8431A', sub: [filterOffice, filterDept].filter(Boolean).join(' · ') || 'filtrado', path: '/employees' },
    { label: 'Activos en uso',    value: assignedInCtx,  icon: '🔗', color: '#d97706', sub: 'asignados al grupo',  path: '/assets' },
    { label: 'Disponibles',       value: availableGlobal, icon: '✅', color: '#16a34a', sub: 'global',             path: '/assets' },
    { label: 'De baja',           value: bajaGlobal,      icon: '🚫', color: '#dc2626', sub: 'global',             path: '/assets' },
    { label: 'Total inventario',  value: totalGlobal,     icon: '💻', color: '#2563eb', sub: 'todos los activos',  path: '/assets' },
  ] : [
    { label: 'Empleados',       value: empCount,        icon: '👥', color: '#E8431A', sub: 'registrados',   path: '/employees' },
    { label: 'Activos totales', value: totalGlobal,     icon: '💻', color: '#2563eb', sub: 'en inventario', path: '/assets' },
    { label: 'Asignados',       value: assignedGlobal,  icon: '🔗', color: '#d97706', sub: `${totalGlobal > 0 ? Math.round(assignedGlobal  / totalGlobal * 100) : 0}% del total`, path: '/assets' },
    { label: 'Disponibles',     value: availableGlobal, icon: '✅', color: '#16a34a', sub: `${totalGlobal > 0 ? Math.round(availableGlobal / totalGlobal * 100) : 0}% del total`, path: '/assets' },
    { label: 'De baja',         value: bajaGlobal,      icon: '🚫', color: '#dc2626', sub: `${totalGlobal > 0 ? Math.round(bajaGlobal      / totalGlobal * 100) : 0}% del total`, path: '/assets' },
  ];

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

      {/* Filter Bar */}
      {(allOffices.length > 0 || deptsInView.length > 0) && (
        <div className={styles.filterBar}>
          {allOffices.length > 0 && (
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Sucursal</span>
              <div className={styles.filterChips}>
                <button
                  className={`${styles.chip} ${!filterOffice ? styles.chipActive : ''}`}
                  onClick={() => { setFilterOffice(''); setFilterDept(''); }}
                >
                  Todas
                </button>
                {allOffices.map((o) => (
                  <button
                    key={o}
                    className={`${styles.chip} ${filterOffice === o ? styles.chipActive : ''}`}
                    onClick={() => { setFilterOffice(filterOffice === o ? '' : o); setFilterDept(''); }}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          )}

          {deptsInView.length > 0 && (
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Departamento</span>
              <div className={styles.filterChips}>
                <button
                  className={`${styles.chip} ${!filterDept ? styles.chipActive : ''}`}
                  onClick={() => setFilterDept('')}
                >
                  Todos
                </button>
                {deptsInView.map((d) => (
                  <button
                    key={d}
                    className={`${styles.chip} ${filterDept === d ? styles.chipActive : ''}`}
                    onClick={() => setFilterDept(filterDept === d ? '' : d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isFiltered && (
            <button
              className={styles.clearFilters}
              onClick={() => { setFilterOffice(''); setFilterDept(''); }}
            >
              ✕ Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* KPIs */}
      <div className={styles.kpiRow}>
        {kpis.map((k) => (
          <div key={k.label} className={styles.kpi} onClick={() => navigate(k.path)} style={{ '--accent': k.color }}>
            <div className={styles.kpiTop}>
              <span className={styles.kpiIcon}>{k.icon}</span>
              <span className={styles.kpiValue} style={{ color: k.color }}>{k.value}</span>
            </div>
            <p className={styles.kpiLabel}>{k.label}</p>
            <p className={styles.kpiSub}>{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Mid row */}
      <div className={styles.midRow}>

        {/* Categorías */}
        <div className={styles.card}>
          <div className={styles.cardHeaderRow}>
            <div className={styles.cardHeaderLeft}>
              {(selectedCat || selectedType) && (
                <button
                  className={styles.backBtn}
                  onClick={() => selectedType ? setSelectedType(null) : setSelectedCat(null)}
                  title="Volver"
                >
                  ←
                </button>
              )}
              <h2 className={styles.cardTitle}>
                {selectedType
                  ? `📍 ${TYPE_ICONS[selectedType] || ''} ${ASSET_TYPE_LABELS[selectedType] || selectedType} — por sucursal`
                  : selectedCat
                  ? `${CATEGORIES.find(c => c.key === selectedCat)?.icon} ${CATEGORIES.find(c => c.key === selectedCat)?.label}`
                  : 'Activos por categoría'}
              </h2>
            </div>
            {isFiltered && <span className={styles.badge}>filtrado</span>}
          </div>

          {selectedType ? (() => {
            const locMap = byTypeLocation[selectedType] || {};
            const locData = Object.entries(locMap)
              .map(([name, count]) => ({ name, count }))
              .sort((a, b) => b.count - a.count);
            const maxLoc = Math.max(...locData.map((l) => l.count), 1);
            return locData.length === 0 ? (
              <p className={styles.empty}>Sin ubicación registrada para este tipo</p>
            ) : (
              <div className={styles.catList}>
                {locData.map((l) => (
                  <div key={l.name} className={styles.catItem}>
                    <div className={styles.catHeader}>
                      <span className={styles.catIcon}>📍</span>
                      <span className={styles.catLabel}>{l.name}</span>
                      <span className={styles.catCount}>{l.count}</span>
                    </div>
                    <div className={styles.barTrack}>
                      <div className={styles.barFill} style={{ width: `${(l.count / maxLoc) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            );
          })() : selectedCat ? (() => {
            const cat = CATEGORIES.find(c => c.key === selectedCat);
            const maxSub = Math.max(...cat.types.map(t => byType[t] || 0), 1);
            return (
              <div className={styles.catList}>
                {cat.types.map((t) => {
                  const count = byType[t] || 0;
                  return (
                    <div
                      key={t}
                      className={`${styles.catItem} ${styles.catItemClickable}`}
                      onClick={() => setSelectedType(t)}
                    >
                      <div className={styles.catHeader}>
                        <span className={styles.catIcon}>{TYPE_ICONS[t] || '📦'}</span>
                        <span className={styles.catLabel}>{ASSET_TYPE_LABELS[t] || t}</span>
                        <span className={styles.catCount}>{count}</span>
                        <span className={styles.catArrow}>›</span>
                      </div>
                      <div className={styles.barTrack}>
                        <div
                          className={styles.barFill}
                          style={{ width: `${count > 0 ? (count / maxSub) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })() : (
            <div className={styles.catList}>
              {byCategory.map((c) => (
                <div
                  key={c.key}
                  className={`${styles.catItem} ${styles.catItemClickable}`}
                  onClick={() => setSelectedCat(c.key)}
                >
                  <div className={styles.catHeader}>
                    <span className={styles.catIcon}>{c.icon}</span>
                    <span className={styles.catLabel}>{c.label}</span>
                    <span className={styles.catCount}>{c.count}</span>
                    <span className={styles.catArrow}>›</span>
                  </div>
                  <div className={styles.barTrack}>
                    <div
                      className={styles.barFill}
                      style={{ width: `${c.count > 0 ? (c.count / maxCat) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Donut estado (respeta sucursal si hay una seleccionada) */}
        <div className={styles.card}>
          <div className={styles.cardHeaderRow}>
            <h2 className={styles.cardTitle}>Estado del inventario</h2>
            {filterOffice
              ? <span className={styles.badge}>filtrado</span>
              : isFiltered && <span className={styles.badge}>global</span>}
          </div>
          <div className={styles.donutWrap}>
            <div className={styles.donut} style={donutStyle}>
              <div className={styles.donutHole}>
                <span className={styles.donutTotal}>{donutTotal}</span>
                <span className={styles.donutSub}>activos</span>
              </div>
            </div>
            <div className={styles.donutLegend}>
              <div
                className={`${styles.legendItem} ${styles.legendItemClickable}`}
                onClick={() => navigate('/assignments')}
                title="Ver asignaciones"
              >
                <span className={styles.legendDot} style={{ background: '#E8431A' }} />
                <span className={styles.legendLabel}>Asignados</span>
                <span className={styles.legendVal}>{donutAssignedCount}</span>
              </div>
              <div
                className={`${styles.legendItem} ${styles.legendItemClickable}`}
                onClick={() => navigate('/stock')}
                title="Ver disponibilidad por sucursal"
              >
                <span className={styles.legendDot} style={{ background: '#16a34a' }} />
                <span className={styles.legendLabel}>Disponibles</span>
                <span className={styles.legendVal}>{donutAvailableCount}</span>
              </div>
              <div
                className={`${styles.legendItem} ${styles.legendItemClickable}`}
                onClick={() => navigate('/assets')}
                title="Ver activos"
              >
                <span className={styles.legendDot} style={{ background: '#dc2626' }} />
                <span className={styles.legendLabel}>De baja</span>
                <span className={styles.legendVal}>{donutBajaCount}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Desglose adaptativo */}
        {breakdownData.length > 0 && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>{breakdownTitle}</h2>
            <div className={styles.officeList}>
              {breakdownData.map((o, i) => (
                <div
                  key={o.name}
                  className={`${styles.officeItem} ${styles.officeItemClickable}`}
                  title={breakdownType === 'office' ? `Filtrar por ${o.name}` : `Filtrar por ${o.name}`}
                  onClick={() => {
                    if (breakdownType === 'office') setFilterOffice(o.name);
                    else if (breakdownType === 'department') setFilterDept(o.name);
                  }}
                >
                  <div className={styles.officeRank}>{i + 1}</div>
                  <div className={styles.officeInfo}>
                    <span className={styles.officeName}>{o.name}</span>
                    <span className={styles.officeCount}>{o.count} empleado{o.count !== 1 ? 's' : ''}</span>
                  </div>
                  <div className={styles.officeDot} style={{ background: `hsl(${i * 60}, 65%, 50%)` }} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom row */}
      <div className={styles.bottomRow}>

        {/* Últimas asignaciones */}
        <div className={styles.card}>
          <div className={styles.cardHeaderRow}>
            <div className={styles.cardHeaderLeft}>
              <h2 className={styles.cardTitle}>Últimas asignaciones</h2>
              {isFiltered && <span className={styles.badge}>filtrado</span>}
            </div>
            <button className={styles.cardLink} onClick={() => navigate('/assignments')}>Ver todas →</button>
          </div>
          {recent.length === 0 ? (
            <p className={styles.empty}>Sin asignaciones recientes</p>
          ) : (
            <div className={styles.assignList}>
              {recent.map((a) => (
                <div
                  key={a._id}
                  className={styles.assignItem}
                  style={{ cursor: a.employee?._id ? 'pointer' : 'default' }}
                  onClick={() => a.employee?._id && navigate(`/employees/${a.employee._id}`)}
                >
                  <div className={styles.assignAvatar}>{initials(a.employee?.name)}</div>
                  <div className={styles.assignInfo}>
                    <p className={styles.assignEmp}>{a.employee?.name || '—'}</p>
                    <p className={styles.assignAsset}>
                      {TYPE_ICONS[a.asset?.type]} {a.asset?.brand} {a.asset?.model}
                    </p>
                  </div>
                  <span className={styles.assignTime}>{timeAgo(a.assignedDate)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top empleados */}
        <div className={styles.card}>
          <div className={styles.cardHeaderRow}>
            <div className={styles.cardHeaderLeft}>
              <h2 className={styles.cardTitle}>Top empleados</h2>
              {isFiltered && <span className={styles.badge}>filtrado</span>}
            </div>
            <button className={styles.cardLink} onClick={() => navigate('/employees')}>Ver todos →</button>
          </div>
          {topEmployees.length === 0 ? (
            <p className={styles.empty}>Sin datos de asignaciones</p>
          ) : (
            <div className={styles.topList}>
              {topEmployees.map((e, i) => (
                <div
                  key={e._id}
                  className={styles.topItem}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/employees/${e._id}`)}
                >
                  <span className={styles.topRank}>#{i + 1}</span>
                  <div className={styles.topAvatar}>{initials(e.name)}</div>
                  <div className={styles.topInfo}>
                    <p className={styles.topName}>{e.name}</p>
                    <p className={styles.topDept}>{e.department || e.position || 'Sin departamento'}</p>
                  </div>
                  <div className={styles.topBadge}>{e.count} activo{e.count !== 1 ? 's' : ''}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Propiedad cómputo */}
        <div className={styles.card}>
          <div className={styles.cardHeaderRow}>
            <h2 className={styles.cardTitle}>Propiedad — Cómputo</h2>
            <span className={styles.badge}>{computoTotal} equipos</span>
          </div>
          {computoTotal === 0 ? (
            <p className={styles.empty}>Sin equipos de cómputo registrados</p>
          ) : (
            <div className={styles.ownerList}>
              {[
                { label: 'Arrendamiento', count: ownerArrendam, color: '#d97706', fill: 'linear-gradient(90deg,#d97706,#f59e0b)' },
                { label: 'Propia',        count: ownerPropia,   color: '#2563eb', fill: 'linear-gradient(90deg,#2563eb,#60a5fa)' },
                ...(ownerSinDef > 0 ? [{ label: 'Sin definir', count: ownerSinDef, color: '#9ca3af', fill: 'linear-gradient(90deg,#d1d5db,#e5e7eb)' }] : []),
              ].map(({ label, count, color, fill }) => (
                <div
                  key={label}
                  className={`${styles.ownerItem} ${styles.ownerItemClickable}`}
                  onClick={() => navigate('/assets')}
                  title="Ver activos de cómputo"
                >
                  <div className={styles.ownerHeader}>
                    <span className={styles.ownerLabel}>{label}</span>
                    <span className={styles.ownerCount} style={{ color }}>{count}</span>
                    <span className={styles.ownerPct}>{Math.round(count / computoTotal * 100)}%</span>
                  </div>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${(count / computoTotal) * 100}%`, background: fill }} />
                  </div>
                </div>
              ))}

              {ownerByType.length > 0 && (
                <div className={styles.ownerTypeGrid}>
                  {ownerByType.map((r) => (
                    <div key={r.type} className={styles.ownerTypeRow}>
                      <span className={styles.ownerTypeLabel}>{ASSET_TYPE_LABELS[r.type]}</span>
                      <span className={styles.ownerTypePill} style={{ color: '#d97706', background: '#fffbeb' }}>
                        {r.arrendamiento} arrend.
                      </span>
                      <span className={styles.ownerTypePill} style={{ color: '#2563eb', background: '#eff6ff' }}>
                        {r.propia} propias
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Actividad real del equipo — diagnóstico (más allá de las asignaciones) */}
      {activity && (
        <div className={styles.card}>
          <div className={styles.cardHeaderRow}>
            <div className={styles.cardHeaderLeft}>
              <h2 className={styles.cardTitle}>Actividad real del equipo</h2>
              <span className={styles.badge}>diagnóstico · 7 días</span>
            </div>
            <button className={styles.cardLink} onClick={() => navigate('/audit')}>Ver auditoría →</button>
          </div>

          {activity.insight && <p className={styles.insightText}>{activity.insight}</p>}

          <div className={styles.activityCompare}>
            <div className={styles.activityStat}>
              <span className={styles.activityStatValue}>{activity.assignmentsLast7}</span>
              <span className={styles.activityStatLabel}>Asignaciones nuevas</span>
            </div>
            <div className={styles.activityStat}>
              <span className={styles.activityStatValue}>{activity.totalActions}</span>
              <span className={styles.activityStatLabel}>Acciones totales registradas</span>
            </div>
          </div>

          {activity.actionBreakdown.length === 0 ? (
            <p className={styles.empty}>Sin actividad registrada en los últimos 7 días</p>
          ) : (
            <div className={styles.catList}>
              {activity.actionBreakdown.map(({ action, count }) => {
                const maxAction = Math.max(...activity.actionBreakdown.map((a) => a.count), 1);
                return (
                  <div key={action} className={styles.catItem}>
                    <div className={styles.catHeader}>
                      <span className={styles.catIcon}>{ACTION_ICONS[action] || '•'}</span>
                      <span className={styles.catLabel}>{ACTION_LABELS[action] || action}</span>
                      <span className={styles.catCount}>{count}</span>
                    </div>
                    <div className={styles.barTrack}>
                      <div className={styles.barFill} style={{ width: `${(count / maxAction) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activity.peopleGroups.length > 0 && (
            <>
              <div className={styles.scoreHeader}>
                <h3 className={styles.scoreTitle}>Score de actividad por persona · por sucursal</h3>
                <span className={styles.scoreHint}>combina altas/ediciones/bajas/devoluciones/asignaciones con pesos fijos — no es una evaluación de desempeño, es una señal relativa dentro del equipo</span>
              </div>
              <div className={styles.scoreGroups}>
                {activity.peopleGroups.map((g) => (
                  <div key={g.office} className={styles.scoreGroup}>
                    <p className={styles.scoreGroupTitle}>📍 {g.office}</p>
                    <div className={styles.scoreList}>
                      {g.people.map((p) => {
                        const lvl = ACTIVITY_LEVELS[p.level];
                        const detail = Object.entries(p.counts)
                          .sort((a, b) => b[1] - a[1])
                          .map(([action, count]) => `${count} ${(ACTION_LABELS[action] || action).toLowerCase()}`)
                          .join(' · ');
                        return (
                          <div
                            key={p.name}
                            className={`${styles.scoreItem} ${styles.scoreItemClickable}`}
                            onClick={() => navigate(`/audit?userId=${p.id}`)}
                            title={`Ver auditoría de ${p.name}`}
                          >
                            <div className={styles.scoreItemTop}>
                              <span className={styles.scoreName}>{p.name}</span>
                              <span className={styles.scoreBadge} style={{ color: lvl.color, background: lvl.bg }}>{lvl.label}</span>
                            </div>
                            <p className={styles.scoreDetail}>{detail}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
