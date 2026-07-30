import { useMemo } from 'react';
import * as XLSX from 'xlsx';
import { useTicketsContext } from './TicketsLayout';
import { isOverdue, daysOpen, CSAT_OPTIONS } from './ticketShared';
import styles from './Tickets.module.css';

const NEGATIVE_RATINGS = ['Mayormente insatisfecho', 'Extremadamente insatisfecho'];

function csatScore(t) {
  return CSAT_OPTIONS.find((o) => o.value === t.satisfactionRating)?.score || 0;
}

// "Equipo" — pedido explícito del usuario (2026-07-30) al dar de alta a
// gerente.sistemas: un apartado para que el gerente vea, a un nivel más
// alto que el resto de Sistemas, cómo se está trabajando el equipo (carga
// de tickets por persona, tiempos de resolución, calificaciones CSAT) —
// "es como auditoría pero a nivel más alto". Solo visible con el permiso
// canViewManagerDashboard (ver Users.jsx) — el usuario decidió que el
// resto de Sistemas no lo vea, aunque sean admins con acceso a todo lo
// demás. Reutiliza el mismo `tickets` ya cargado por TicketsLayout (igual
// que Dashboard/Calificaciones/SLA) en vez de pedir un endpoint aparte.
export default function TicketsEquipo() {
  const { tickets, loading } = useTicketsContext();

  const perAgent = useMemo(() => {
    const map = new Map();
    tickets.forEach((t) => {
      const id = t.assignedTo?._id || 'sin_asignar';
      const name = t.assignedTo?.name || 'Sin asignar';
      if (!map.has(id)) map.set(id, { id, name, tickets: [] });
      map.get(id).tickets.push(t);
    });

    return Array.from(map.values()).map((agent) => {
      const open = agent.tickets.filter((t) => ['abierto', 'en_proceso'].includes(t.status));
      const overdue = agent.tickets.filter(isOverdue);
      const resolved = agent.tickets.filter((t) => t.resolvedAt);
      const rated = agent.tickets.filter((t) => t.satisfactionRating);
      const negative = rated.filter((t) => NEGATIVE_RATINGS.includes(t.satisfactionRating));
      return {
        id: agent.id,
        name: agent.name,
        total: agent.tickets.length,
        openCount: open.length,
        overdueCount: overdue.length,
        resolvedCount: resolved.length,
        avgDays: resolved.length ? (resolved.reduce((sum, t) => sum + daysOpen(t), 0) / resolved.length).toFixed(1) : null,
        ratedCount: rated.length,
        avgCsat: rated.length ? (rated.reduce((sum, t) => sum + csatScore(t), 0) / rated.length).toFixed(1) : null,
        negativeCount: negative.length,
      };
    }).sort((a, b) => b.total - a.total);
  }, [tickets]);

  const team = useMemo(() => {
    const resolved = tickets.filter((t) => t.resolvedAt);
    const rated = tickets.filter((t) => t.satisfactionRating);
    const negative = rated.filter((t) => NEGATIVE_RATINGS.includes(t.satisfactionRating));
    return {
      total: tickets.length,
      overdueCount: tickets.filter(isOverdue).length,
      avgDays: resolved.length ? (resolved.reduce((sum, t) => sum + daysOpen(t), 0) / resolved.length).toFixed(1) : null,
      ratedCount: rated.length,
      avgCsat: rated.length ? (rated.reduce((sum, t) => sum + csatScore(t), 0) / rated.length).toFixed(1) : null,
      negativePct: rated.length ? Math.round((negative.length / rated.length) * 100) : null,
    };
  }, [tickets]);

  const handleExport = () => {
    if (perAgent.length === 0) return;
    const rows = perAgent.map((a) => ({
      'Persona': a.name,
      'Tickets totales': a.total,
      'Abiertos': a.openCount,
      'Vencidos': a.overdueCount,
      'Resueltos': a.resolvedCount,
      'Días prom. de resolución': a.avgDays ?? '',
      'Calificados': a.ratedCount,
      'Promedio CSAT (1-5)': a.avgCsat ?? '',
      'Calificaciones negativas': a.negativeCount,
    }));
    const headers = Object.keys(rows[0]);
    const dataRows = rows.map((r) => headers.map((h) => r[h]));
    const meta = [
      ['SUPERVISIÓN DEL EQUIPO — SISTEMA DE TICKETS'],
      ['Fecha de exportación:', new Date().toLocaleDateString('es-MX', { dateStyle: 'long' })],
      [],
      headers,
      ...dataRows,
    ];
    const ws = XLSX.utils.aoa_to_sheet(meta);
    ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length, ...rows.map((r) => String(r[h] ?? '').length), 12) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Equipo');
    XLSX.writeFile(wb, `supervision-equipo-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>🧭</div>
          <div>
            <h1 className={styles.title}>Equipo</h1>
            <p className={styles.subtitle}>Supervisión de carga de trabajo, tiempos de atención y calificaciones por persona.</p>
          </div>
        </div>
        <button type="button" className={styles.btnPrimary} onClick={handleExport} disabled={perAgent.length === 0}>
          📊 Exportar Excel
        </button>
      </div>

      {loading ? (
        <p className={styles.empty}>Cargando...</p>
      ) : (
        <>
          <div className={styles.kpiRow}>
            <div className={styles.kpi} style={{ '--accent': '#2563eb' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>🎫</span><span className={styles.kpiValue}>{team.total}</span></div>
              <p className={styles.kpiLabel}>Tickets totales</p>
            </div>
            <div className={styles.kpi} style={{ '--accent': '#dc2626' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>⏰</span><span className={styles.kpiValue}>{team.overdueCount}</span></div>
              <p className={styles.kpiLabel}>Vencidos ahora</p>
            </div>
            <div className={styles.kpi} style={{ '--accent': '#0d9488' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>⌛</span><span className={styles.kpiValue}>{team.avgDays ?? '—'}</span></div>
              <p className={styles.kpiLabel}>Días promedio</p>
              <p className={styles.kpiSub}>para resolver</p>
            </div>
            <div className={styles.kpi} style={{ '--accent': '#16a34a' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>⭐</span><span className={styles.kpiValue}>{team.avgCsat ?? '—'}</span></div>
              <p className={styles.kpiLabel}>CSAT promedio</p>
              <p className={styles.kpiSub}>{team.ratedCount} calificados</p>
            </div>
            <div className={styles.kpi} style={{ '--accent': '#b91c1c' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>🔴</span><span className={styles.kpiValue}>{team.negativePct !== null ? `${team.negativePct}%` : '—'}</span></div>
              <p className={styles.kpiLabel}>Calificaciones negativas</p>
            </div>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.zabbixTable}>
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Total</th>
                  <th>Abiertos</th>
                  <th>Vencidos</th>
                  <th>Resueltos</th>
                  <th>Días prom.</th>
                  <th>CSAT prom.</th>
                  <th>Negativas</th>
                </tr>
              </thead>
              <tbody>
                {perAgent.length === 0 && (
                  <tr><td colSpan={8} className={styles.empty}>Sin tickets registrados todavía</td></tr>
                )}
                {perAgent.map((a) => (
                  <tr key={a.id}>
                    <td><strong>{a.name}</strong></td>
                    <td>{a.total}</td>
                    <td>{a.openCount}</td>
                    <td>
                      {a.overdueCount > 0
                        ? <span className={styles.statusBadge} style={{ color: '#b91c1c', background: '#fef2f2' }}>{a.overdueCount}</span>
                        : a.overdueCount}
                    </td>
                    <td>{a.resolvedCount}</td>
                    <td className={styles.muted}>{a.avgDays ?? '—'}</td>
                    <td className={styles.muted}>{a.avgCsat ?? '—'}{a.ratedCount ? ` (${a.ratedCount})` : ''}</td>
                    <td>
                      {a.negativeCount > 0
                        ? <span className={styles.statusBadge} style={{ color: '#b91c1c', background: '#fef2f2' }}>{a.negativeCount}</span>
                        : a.negativeCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
