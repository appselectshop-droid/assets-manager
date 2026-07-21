import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTicketsContext } from './TicketsLayout';
import { SEVERITY_CONFIG, SEVERITY_ORDER, assetSeverity } from './ticketShared';
import styles from './Tickets.module.css';

// "Monitoreo" de equipos (antes llamado "Zabbix — Equipos" dentro del
// tablero) — pedido explícito del usuario: renombrarlo porque no es un
// Zabbix real, solo lo simula, y darle su propia página en el sidebar.
export default function TicketsMonitoreo() {
  const { tickets } = useTicketsContext();
  const navigate = useNavigate();

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

  const summary = SEVERITY_ORDER.map((key) => ({
    key,
    count: assetHealth.filter((a) => a.severity === key).length,
  }));

  const onViewAsset = (assetId) => navigate(`/tickets/general?assetId=${assetId}`);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>🛰️</div>
          <div>
            <h1 className={styles.title}>Monitoreo</h1>
            <p className={styles.subtitle}>Estado de salud de los equipos según los tickets que tienen encima.</p>
          </div>
        </div>
      </div>

      <div className={styles.zabbixIntro}>
        <span className={styles.zabbixIntroIcon}>🛰️</span>
        <p className={styles.zabbixIntroText}>
          Monitoreo de equipos por problemas reportados — igual que un monitoreo de red vigila la infraestructura, esto vigila qué máquinas físicas dan lata, sin tener que revisar ticket por ticket.
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
    </div>
  );
}
