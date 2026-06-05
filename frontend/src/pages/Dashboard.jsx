import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { TYPE_ICONS } from '../config/assetFields';
import styles from './Dashboard.module.css';

const CATEGORIES = [
  { key: 'computo',     label: 'Cómputo',      icon: '💻', types: ['laptop', 'escritorio', 'all_in_one'] },
  { key: 'celulares',   label: 'Móviles',       icon: '📱', types: ['celular', 'tablet', 'cargador_celular'] },
  { key: 'perifericos', label: 'Periféricos',   icon: '🖱️', types: ['monitor', 'mouse', 'teclado', 'cargador_laptop'] },
  { key: 'otros',       label: 'Otros',         icon: '📦', types: ['accesorio', 'otro'] },
];

function initials(name = '') {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

function timeAgo(date) {
  const diff = Math.floor((Date.now() - new Date(date)) / 1000);
  if (diff < 60)   return 'Hace un momento';
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`;
  const d = new Date(date);
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

export default function Dashboard() {
  const [data, setData]   = useState(null);
  const navigate           = useNavigate();
  const user               = JSON.parse(localStorage.getItem('user') || '{}');
  const hour               = new Date().getHours();
  const greeting           = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const today              = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  useEffect(() => {
    (async () => {
      const [empRes, assetsRes, assignRes] = await Promise.all([
        api.get('/employees'),
        api.get('/assets'),
        api.get('/assignments'),
      ]);

      const employees    = empRes.data;
      const assets       = assetsRes.data;
      const assignments  = assignRes.data;

      const assigned   = assets.filter((a) => a.status === 'asignado').length;
      const available  = assets.filter((a) => a.status === 'disponible').length;
      const baja       = assets.filter((a) => a.status === 'baja').length;
      const total      = assets.length;

      const byCategory = CATEGORIES.map((c) => ({
        ...c,
        count: assets.filter((a) => c.types.includes(a.type)).length,
      }));

      // Oficinas con más empleados
      const officeMap = {};
      employees.forEach((e) => {
        const key = e.office || e.businessName || 'Sin oficina';
        officeMap[key] = (officeMap[key] || 0) + 1;
      });
      const byOffice = Object.entries(officeMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Top empleados por activos asignados
      const empCount = {};
      const empMeta  = {};
      assignments.forEach((a) => {
        const id = a.employee?._id;
        if (!id) return;
        empCount[id] = (empCount[id] || 0) + 1;
        empMeta[id]  = a.employee;
      });
      const topEmployees = Object.entries(empCount)
        .map(([id, count]) => ({ ...empMeta[id], count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Recientes
      const recent = assignments.slice(0, 6);

      setData({ employees: employees.length, total, assigned, available, baja, byCategory, byOffice, topEmployees, recent });
    })();
  }, []);

  if (!data) return (
    <div className={styles.loadingWrap}>
      <div className={styles.spinner} />
    </div>
  );

  const { employees, total, assigned, available, baja, byCategory, byOffice, topEmployees, recent } = data;
  const maxCat = Math.max(...byCategory.map((c) => c.count), 1);

  // Donut segments (conic-gradient)
  const assignedDeg  = total > 0 ? (assigned  / total) * 360 : 0;
  const availableDeg = total > 0 ? (available / total) * 360 : 0;
  const bajaDeg      = total > 0 ? (baja      / total) * 360 : 0;
  const donutStyle   = {
    background: `conic-gradient(
      #E8431A 0deg ${assignedDeg}deg,
      #16a34a ${assignedDeg}deg ${assignedDeg + availableDeg}deg,
      #dc2626 ${assignedDeg + availableDeg}deg ${assignedDeg + availableDeg + bajaDeg}deg,
      #e5e7eb ${assignedDeg + availableDeg + bajaDeg}deg 360deg
    )`,
  };

  const kpis = [
    { label: 'Empleados',       value: employees, icon: '👥', color: '#E8431A', sub: 'registrados',  path: '/employees' },
    { label: 'Activos totales', value: total,     icon: '💻', color: '#2563eb', sub: 'en inventario', path: '/assets' },
    { label: 'Asignados',       value: assigned,  icon: '🔗', color: '#d97706', sub: `${total > 0 ? Math.round(assigned / total * 100) : 0}% del total`, path: '/assets' },
    { label: 'Disponibles',     value: available, icon: '✅', color: '#16a34a', sub: `${total > 0 ? Math.round(available / total * 100) : 0}% del total`, path: '/assets' },
    { label: 'De baja',         value: baja,      icon: '🚫', color: '#dc2626', sub: `${total > 0 ? Math.round(baja / total * 100) : 0}% del total`, path: '/assets' },
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

      {/* Middle row */}
      <div className={styles.midRow}>

        {/* Categorías */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Activos por categoría</h2>
          <div className={styles.catList}>
            {byCategory.map((c) => (
              <div key={c.key} className={styles.catItem}>
                <div className={styles.catHeader}>
                  <span className={styles.catIcon}>{c.icon}</span>
                  <span className={styles.catLabel}>{c.label}</span>
                  <span className={styles.catCount}>{c.count}</span>
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
        </div>

        {/* Donut estado */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Estado del inventario</h2>
          <div className={styles.donutWrap}>
            <div className={styles.donut} style={donutStyle}>
              <div className={styles.donutHole}>
                <span className={styles.donutTotal}>{total}</span>
                <span className={styles.donutSub}>activos</span>
              </div>
            </div>
            <div className={styles.donutLegend}>
              <div className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: '#E8431A' }} />
                <span className={styles.legendLabel}>Asignados</span>
                <span className={styles.legendVal}>{assigned}</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: '#16a34a' }} />
                <span className={styles.legendLabel}>Disponibles</span>
                <span className={styles.legendVal}>{available}</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: '#dc2626' }} />
                <span className={styles.legendLabel}>De baja</span>
                <span className={styles.legendVal}>{baja}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Oficinas */}
        {byOffice.length > 0 && byOffice[0].name !== 'Sin oficina' && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Empleados por oficina</h2>
            <div className={styles.officeList}>
              {byOffice.map((o, i) => (
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
            <h2 className={styles.cardTitle}>Últimas asignaciones</h2>
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
            <h2 className={styles.cardTitle}>Top empleados</h2>
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
