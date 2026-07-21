import { useMemo } from 'react';
import { useTicketsContext } from './TicketsLayout';
import { TICKET_TYPE_CONFIG, PRIORITY_CONFIG, isOverdue, daysOpen } from './ticketShared';
import styles from './Tickets.module.css';

// "Dashboard" del módulo de Tickets — pedido explícito del usuario: es
// exactamente lo que ya había (KPIs + desgloses por tipo/urgencia + reporte
// rápido + resoluciones más comunes), solo que ahora vive en su propia
// página del sidebar en vez de estar siempre arriba del tablero.
export default function TicketsDashboard() {
  const { tickets, loading } = useTicketsContext();

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

    const byPriority = {};
    active.forEach((t) => { const p = t.priority || 'media'; byPriority[p] = (byPriority[p] || 0) + 1; });
    const priorityBreakdown = ['critica', 'alta', 'media', 'baja']
      .map((priority) => ({ priority, count: byPriority[priority] || 0 }))
      .filter((p) => p.count > 0);
    const highPriorityCount = byPriority.alta || 0;

    const unassignedActive = active.filter((t) => !t.assignedTo).length;

    return {
      openCount: open.length,
      inProgressCount: inProgress.length,
      overdueList,
      blockingCount: blocking.length,
      resolvedThisWeekCount: resolvedThisWeek.length,
      avgResolutionDays,
      typeBreakdown,
      topResolutions,
      priorityBreakdown,
      highPriorityCount,
      unassignedActive,
    };
  }, [tickets]);

  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>📊</div>
          <div>
            <h1 className={styles.title}>Dashboard</h1>
            <p className={styles.subtitle}>Vista general del sistema de tickets.</p>
          </div>
        </div>
      </div>

      {loading ? (
        <p className={styles.empty}>Cargando...</p>
      ) : (
        <>
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
            <div className={styles.kpi} style={{ '--accent': '#dc2626' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>🔴</span><span className={styles.kpiValue}>{stats.highPriorityCount}</span></div>
              <p className={styles.kpiLabel}>Urgentes</p>
              <p className={styles.kpiSub}>prioridad alta</p>
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
              <div className={styles.reportStat}><span className={styles.reportLabel}>Sin asignar (activos)</span><span className={styles.reportValue}>{stats.unassignedActive}</span></div>
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

            <div className={styles.panel} style={{ gridColumn: '1 / -1' }}>
              <p className={styles.panelTitle}>Por urgencia (activos)</p>
              {stats.priorityBreakdown.length === 0 ? (
                <p className={styles.empty}>Sin tickets abiertos ni en proceso</p>
              ) : (
                stats.priorityBreakdown.map(({ priority, count }) => {
                  const cfg = PRIORITY_CONFIG[priority];
                  const max = Math.max(...stats.priorityBreakdown.map((p) => p.count), 1);
                  return (
                    <div key={priority} className={styles.barItem}>
                      <div className={styles.barHeader}>
                        <span className={styles.barIcon}>{cfg.icon}</span>
                        <span className={styles.barLabel}>{cfg.label}</span>
                        <span className={styles.barCount}>{count}</span>
                      </div>
                      <div className={styles.barTrack}><div className={styles.barFill} style={{ width: `${(count / max) * 100}%`, background: cfg.color }} /></div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
