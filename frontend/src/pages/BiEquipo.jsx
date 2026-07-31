import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useBiContext } from './BiLayout';
import { isOverdue, daysOpen, CSAT_OPTIONS } from './ticketShared';
// Reutiliza Dashboard.module.css a propósito — mismo criterio que
// Gerencia.jsx, del que este panel es la versión acotada a BI: el mismo
// lenguaje visual de KPIs/panel/score-por-persona.
import styles from './Dashboard.module.css';

// Panel "Mi Equipo" del líder de BI — pedido explícito del usuario
// (2026-07-31), solo visible para el líder (ver canViewBiTeamDashboard).
// Dos ángulos distintos, aclarados por el usuario en la misma
// conversación:
// 1. Qué hace/cómo resuelve su equipo las solicitudes de BI (Bases de
//    Datos/Proyectos/Soporte) — reusa el contexto de BiLayout.jsx
//    (tickets soporte_bi, ya scoped por el backend para cualquier
//    BI-only), mismo cálculo por persona que Gerencia.jsx.
// 2. "Cómo nos reportan a Sistemas" — aclarado explícito por el usuario:
//    son los tickets que SU EQUIPO reporta COMO EMPLEADOS (ej. se les
//    descompuso su equipo), no cómo le responden a quien les pide algo.
//    Esa información el backend se la oculta a cualquier BI-only por
//    diseño (ver isBiOnlyUser en tickets.js) — de ahí la ruta nueva
//    GET /tickets/bi-team/reports, gateada a canViewBiTeamDashboard.
const NEGATIVE_RATINGS = ['Mayormente insatisfecho', 'Extremadamente insatisfecho'];

function csatScore(t) {
  return CSAT_OPTIONS.find((o) => o.value === t.satisfactionRating)?.score || 0;
}

function avg(nums) {
  return nums.length ? (nums.reduce((s, n) => s + n, 0) / nums.length) : null;
}

function fmt(n) {
  return n === null || n === undefined ? null : n.toFixed(1);
}

function timeAgo(date) {
  const diff = Math.floor((Date.now() - new Date(date)) / 1000);
  if (diff < 60)    return 'Hace un momento';
  if (diff < 3600)  return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`;
  return new Date(date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

const PersonList = ({ items, renderDetail }) => (
  <div className={styles.scoreList}>
    {items.length === 0 && <p className={styles.empty}>Sin datos todavía</p>}
    {items.map((p) => (
      <div key={p.name} className={styles.scoreItem}>
        <div className={styles.scoreItemTop}>
          <span className={styles.scoreName}>{p.name}</span>
          <span className={styles.scoreBadge} style={{ color: '#7c3aed', background: '#f5f3ff' }}>{p.count}</span>
        </div>
        <p className={styles.scoreDetail}>{renderDetail(p)}</p>
      </div>
    ))}
  </div>
);

export default function BiEquipo() {
  const { tickets: biTickets, loading: biLoading } = useBiContext();
  const [employeeReports, setEmployeeReports] = useState(null);

  useEffect(() => {
    api.get('/tickets/bi-team/reports').then(({ data }) => setEmployeeReports(data)).catch(() => setEmployeeReports([]));
  }, []);

  const loading = biLoading || employeeReports === null;

  /* ── 1. Qué hace / cómo resuelve el equipo ── */
  const biData = useMemo(() => {
    const byAgent = new Map();
    (biTickets || []).forEach((t) => {
      const id = t.assignedTo?._id || 'sin_asignar';
      const name = t.assignedTo?.name || 'Sin asignar';
      if (!byAgent.has(id)) byAgent.set(id, { id, name, tickets: [] });
      byAgent.get(id).tickets.push(t);
    });
    const perAgent = Array.from(byAgent.values()).map((agent) => {
      const resolved = agent.tickets.filter((t) => t.resolvedAt);
      const rated = agent.tickets.filter((t) => t.satisfactionRating);
      const negative = rated.filter((t) => NEGATIVE_RATINGS.includes(t.satisfactionRating));
      return {
        id: agent.id,
        name: agent.name,
        count: agent.tickets.length,
        overdueCount: agent.tickets.filter(isOverdue).length,
        resolvedCount: resolved.length,
        avgResDays: fmt(avg(resolved.map(daysOpen))),
        ratedCount: rated.length,
        avgCsat: fmt(avg(rated.map(csatScore))),
        negativeCount: negative.length,
      };
    }).sort((a, b) => b.count - a.count);

    const byKind = { proyecto: 0, bases_datos: 0, soporte: 0 };
    (biTickets || []).forEach((t) => { if (byKind[t.biRequestKind] !== undefined) byKind[t.biRequestKind] += 1; });

    return {
      perAgent,
      total: (biTickets || []).length,
      overdueCount: (biTickets || []).filter(isOverdue).length,
      byKind,
    };
  }, [biTickets]);

  /* ── 2. Cómo reportan a Sistemas ── */
  const reportsData = useMemo(() => {
    const reports = employeeReports || [];
    const byPerson = new Map();
    reports.forEach((t) => {
      const name = t.employeeName;
      if (!byPerson.has(name)) byPerson.set(name, { name, tickets: [] });
      byPerson.get(name).tickets.push(t);
    });
    const perPerson = Array.from(byPerson.values()).map((p) => {
      const reassigned = p.tickets.filter((t) => t.originalTicketType);
      return {
        name: p.name,
        count: p.tickets.length,
        reassignedCount: reassigned.length,
        recent: p.tickets.slice(0, 5),
      };
    }).sort((a, b) => b.count - a.count);

    return {
      perPerson,
      total: reports.length,
      reassignedTotal: reports.filter((t) => t.originalTicketType).length,
    };
  }, [employeeReports]);

  if (loading) return (
    <div className={styles.loadingWrap}>
      <div className={styles.spinner} />
    </div>
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.greeting}>Mi Equipo</h1>
          <p className={styles.date}>Supervisión de BI: qué hace tu equipo, cómo resuelve, y cómo le reporta a Sistemas.</p>
        </div>
      </div>

      {/* ── Qué hace / cómo resuelve ── */}
      <h2 className={styles.sectionHeading}>Solicitudes de BI</h2>
      <div className={styles.kpiRow}>
        <div className={styles.kpi} style={{ '--accent': '#7c3aed' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>🗄️</span><span className={styles.kpiValue} style={{ color: '#7c3aed' }}>{biData.total}</span></div>
          <p className={styles.kpiLabel}>Total</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#dc2626' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>⏰</span><span className={styles.kpiValue} style={{ color: '#dc2626' }}>{biData.overdueCount}</span></div>
          <p className={styles.kpiLabel}>Vencidas ahora</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#2563eb' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>📊</span><span className={styles.kpiValue} style={{ color: '#2563eb' }}>{biData.byKind.proyecto}</span></div>
          <p className={styles.kpiLabel}>Proyectos</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#0d9488' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>🗄️</span><span className={styles.kpiValue} style={{ color: '#0d9488' }}>{biData.byKind.bases_datos}</span></div>
          <p className={styles.kpiLabel}>Bases de Datos</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#d97706' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>💬</span><span className={styles.kpiValue} style={{ color: '#d97706' }}>{biData.byKind.soporte}</span></div>
          <p className={styles.kpiLabel}>Dudas / Soporte</p>
        </div>
      </div>
      <div className={styles.scoreHeader}>
        <h3 className={styles.scoreTitle}>Por persona</h3>
      </div>
      <PersonList
        items={biData.perAgent}
        renderDetail={(a) => `${a.resolvedCount} resueltas · ${a.overdueCount} vencidas · ${a.avgResDays ?? '—'}d prom. · CSAT ${a.avgCsat ?? '—'} (${a.ratedCount}) · ${a.negativeCount} negativas`}
      />

      {/* ── Cómo reportan a Sistemas ── */}
      <h2 className={styles.sectionHeading}>Cómo le reportan a Sistemas</h2>
      <p className={styles.date} style={{ marginTop: '-0.5rem', marginBottom: '1rem' }}>
        Tickets que tu equipo reportó COMO EMPLEADOS (ej. una falla de su equipo), no solicitudes que ellos atienden.
      </p>
      <div className={styles.kpiRow}>
        <div className={styles.kpi} style={{ '--accent': '#7c3aed' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>🎫</span><span className={styles.kpiValue} style={{ color: '#7c3aed' }}>{reportsData.total}</span></div>
          <p className={styles.kpiLabel}>Tickets reportados</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#dc2626' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>🔁</span><span className={styles.kpiValue} style={{ color: '#dc2626' }}>{reportsData.reassignedTotal}</span></div>
          <p className={styles.kpiLabel}>Reclasificados por Sistemas</p>
          <p className={styles.kpiSub}>Sistemas tuvo que corregir la categoría — señal de que se reportó mal</p>
        </div>
      </div>
      <div className={styles.scoreHeader}><h3 className={styles.scoreTitle}>Por persona</h3></div>
      <PersonList
        items={reportsData.perPerson}
        renderDetail={(p) => `${p.reassignedCount} de ${p.count} reclasificados`}
      />
      {reportsData.perPerson.map((p) => (
        <div key={p.name} className={styles.card} style={{ marginTop: '0.75rem' }}>
          <div className={styles.cardHeaderRow}><h2 className={styles.cardTitle}>{p.name} — últimos reportes</h2></div>
          <div className={styles.assignList}>
            {p.recent.map((t) => (
              <div key={t._id} className={styles.assignItem}>
                <div className={styles.assignAvatar}>{t.originalTicketType ? '🔁' : '🎫'}</div>
                <div className={styles.assignInfo}>
                  <p className={styles.assignEmp}>{t.subject}</p>
                  <p className={styles.assignAsset}>
                    {t.originalTicketType ? `Reclasificado de "${t.originalTicketType}" por ${t.reassignedByName}` : t.ticketType}
                  </p>
                </div>
                <span className={styles.assignTime}>{timeAgo(t.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* ── Actividad reciente ── */}
      <h2 className={styles.sectionHeading}>Actividad reciente</h2>
      <div className={styles.card}>
        {(biTickets || []).filter((t) => t.resolvedAt).length === 0 ? (
          <p className={styles.empty}>Sin actividad registrada</p>
        ) : (
          <div className={styles.assignList}>
            {(biTickets || [])
              .filter((t) => t.resolvedAt)
              .sort((a, b) => new Date(b.resolvedAt) - new Date(a.resolvedAt))
              .slice(0, 15)
              .map((t) => (
                <div key={t._id} className={styles.assignItem}>
                  <div className={styles.assignAvatar}>✅</div>
                  <div className={styles.assignInfo}>
                    <p className={styles.assignEmp}>{t.resolvedByName || 'Alguien'} resolvió {t.folio}</p>
                    <p className={styles.assignAsset}>{t.subject}</p>
                  </div>
                  <span className={styles.assignTime}>{timeAgo(t.resolvedAt)}</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
