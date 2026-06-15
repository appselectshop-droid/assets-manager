import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { TYPE_ICONS, ASSET_TYPE_LABELS } from '../config/assetFields';
import styles from './Dashboard.module.css';

const CATEGORIES = [
  { key: 'computo',     label: 'Cómputo',    icon: '💻', types: ['laptop', 'escritorio', 'all_in_one'] },
  { key: 'celulares',   label: 'Móviles',     icon: '📱', types: ['celular', 'tablet', 'cargador_celular'] },
  { key: 'perifericos', label: 'Periféricos', icon: '🖱️', types: ['monitor', 'mouse', 'teclado', 'cargador_laptop'] },
  { key: 'otros',       label: 'Otros',       icon: '📦', types: ['accesorio', 'otro'] },
];

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
  const [filterOffice, setFilterOffice] = useState('');
  const [filterDept,   setFilterDept]   = useState('');
  const [selectedCat,  setSelectedCat]  = useState(null);
  const navigate = useNavigate();
  const user     = JSON.parse(localStorage.getItem('user') || '{}');
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const today    = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  useEffect(() => { setSelectedCat(null); }, [filterOffice, filterDept]);

  useEffect(() => {
    Promise.all([
      api.get('/employees'),
      api.get('/assets'),
      api.get('/assignments'),
    ]).then(([empRes, assetsRes, assignRes]) => {
      setRaw({ employees: empRes.data, assets: assetsRes.data, assignments: assignRes.data });
    });
  }, []);

  const derived = useMemo(() => {
    if (!raw) return null;
    const { employees: allEmps, assets: allAssets, assignments: allAssign } = raw;
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

    /* ── Tarjeta de desglose (adaptativa) ────────── */
    let breakdownTitle, breakdownData;
    if (filterOffice && !filterDept) {
      const deptMap = {};
      filteredEmps.forEach((e) => {
        const d = e.department || 'Sin departamento';
        deptMap[d] = (deptMap[d] || 0) + 1;
      });
      breakdownData  = Object.entries(deptMap).map(([n, c]) => ({ name: n, count: c })).sort((a, b) => b.count - a.count).slice(0, 5);
      breakdownTitle = `Departamentos · ${filterOffice}`;
    } else if (filterDept && !filterOffice) {
      const officeMap = {};
      filteredEmps.forEach((e) => {
        const o = e.office || e.businessName || 'Sin sucursal';
        officeMap[o] = (officeMap[o] || 0) + 1;
      });
      breakdownData  = Object.entries(officeMap).map(([n, c]) => ({ name: n, count: c })).sort((a, b) => b.count - a.count).slice(0, 5);
      breakdownTitle = `Sucursales · ${filterDept}`;
    } else if (!isFiltered) {
      const officeMap = {};
      allEmps.forEach((e) => {
        const k = e.office || e.businessName || 'Sin sucursal';
        officeMap[k] = (officeMap[k] || 0) + 1;
      });
      breakdownData  = Object.entries(officeMap).map(([n, c]) => ({ name: n, count: c })).sort((a, b) => b.count - a.count).slice(0, 5);
      breakdownTitle = 'Empleados por sucursal';
    } else {
      breakdownData  = [];
      breakdownTitle = '';
    }

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

    return {
      empCount: filteredEmps.length,
      assignedInCtx: usedAssetIds.size,
      totalGlobal, assignedGlobal, availableGlobal, bajaGlobal,
      byCategory, byType, breakdownTitle, breakdownData,
      recent, topEmployees,
      allOffices, deptsInView,
      isFiltered,
    };
  }, [raw, filterOffice, filterDept]);

  if (!derived) return (
    <div className={styles.loadingWrap}>
      <div className={styles.spinner} />
    </div>
  );

  const {
    empCount, assignedInCtx,
    totalGlobal, assignedGlobal, availableGlobal, bajaGlobal,
    byCategory, byType, breakdownTitle, breakdownData,
    recent, topEmployees,
    allOffices, deptsInView, isFiltered,
  } = derived;

  /* ── Donut siempre global ──────────────────────── */
  const donutTotal   = totalGlobal;
  const assignedDeg  = donutTotal > 0 ? (assignedGlobal  / donutTotal) * 360 : 0;
  const availableDeg = donutTotal > 0 ? (availableGlobal / donutTotal) * 360 : 0;
  const bajaDeg      = donutTotal > 0 ? (bajaGlobal      / donutTotal) * 360 : 0;
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
              {selectedCat && (
                <button className={styles.backBtn} onClick={() => setSelectedCat(null)} title="Volver">
                  ←
                </button>
              )}
              <h2 className={styles.cardTitle}>
                {selectedCat
                  ? `${CATEGORIES.find(c => c.key === selectedCat)?.icon} ${CATEGORIES.find(c => c.key === selectedCat)?.label}`
                  : 'Activos por categoría'}
              </h2>
            </div>
            {isFiltered && <span className={styles.badge}>filtrado</span>}
          </div>

          {selectedCat ? (() => {
            const cat = CATEGORIES.find(c => c.key === selectedCat);
            const maxSub = Math.max(...cat.types.map(t => byType[t] || 0), 1);
            return (
              <div className={styles.catList}>
                {cat.types.map((t) => {
                  const count = byType[t] || 0;
                  return (
                    <div key={t} className={styles.catItem}>
                      <div className={styles.catHeader}>
                        <span className={styles.catIcon}>{TYPE_ICONS[t] || '📦'}</span>
                        <span className={styles.catLabel}>{ASSET_TYPE_LABELS[t] || t}</span>
                        <span className={styles.catCount}>{count}</span>
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

        {/* Donut estado (siempre global) */}
        <div className={styles.card}>
          <div className={styles.cardHeaderRow}>
            <h2 className={styles.cardTitle}>Estado del inventario</h2>
            {isFiltered && <span className={styles.badge}>global</span>}
          </div>
          <div className={styles.donutWrap}>
            <div className={styles.donut} style={donutStyle}>
              <div className={styles.donutHole}>
                <span className={styles.donutTotal}>{donutTotal}</span>
                <span className={styles.donutSub}>activos</span>
              </div>
            </div>
            <div className={styles.donutLegend}>
              <div className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: '#E8431A' }} />
                <span className={styles.legendLabel}>Asignados</span>
                <span className={styles.legendVal}>{assignedGlobal}</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: '#16a34a' }} />
                <span className={styles.legendLabel}>Disponibles</span>
                <span className={styles.legendVal}>{availableGlobal}</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: '#dc2626' }} />
                <span className={styles.legendLabel}>De baja</span>
                <span className={styles.legendVal}>{bajaGlobal}</span>
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
                <div key={o.name} className={styles.officeItem}>
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
                <div key={a._id} className={styles.assignItem}>
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
                <div key={e._id} className={styles.topItem}>
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

      </div>
    </div>
  );
}
