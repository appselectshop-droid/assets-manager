import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import api from '../services/api';
import { useTicketsContext } from './TicketsLayout';
import { CSAT_OPTIONS, TICKET_TYPE_CONFIG, timeAgo } from './ticketShared';
import styles from './Tickets.module.css';

// Ventana dentro de la cual se avisa "ya se mandó hace poco" antes de
// reenviar (2026-08-17) — pedido explícito del usuario tras un caso real:
// Miguel Garcia y Felipe Gomez mandaron el mismo recordatorio 40 segundos
// aparte sin saber uno del otro, duplicando el push a cada empleado
// pendiente (y antes, 2026-08-06, Lilly Arroyo lo mandó 8 veces en 4
// segundos). No bloquea el reenvío — a veces sí hace falta repetirlo — solo
// exige una confirmación extra cuando el último envío fue muy reciente.
const RECENT_SEND_WARNING_MINUTES = 15;

// "Calificaciones" — pedido explícito del usuario (pensando en que el
// director de Finanzas lo pida): un solo lugar con la encuesta de
// satisfacción (CSAT) que responde quien reportó el ticket, exportable a
// Excel. Es de solo lectura — la respuesta se captura del lado del
// empleado (ver MisTickets.jsx), aquí solo se consulta.
export default function TicketsCalificaciones() {
  const { tickets, loading } = useTicketsContext();
  const [reminding, setReminding] = useState(false);
  const [remindResult, setRemindResult] = useState('');
  const [lastRemind, setLastRemind] = useState(null); // { userName, sentAt } | null

  const loadLastRemind = () => api.get('/tickets/remind-pending-ratings/last')
    .then(({ data }) => setLastRemind(data))
    .catch(() => {});

  useEffect(() => { loadLastRemind(); }, []);

  const rated = useMemo(() => (
    tickets
      .filter((t) => t.satisfactionRating)
      .sort((a, b) => new Date(b.resolvedAt || b.createdAt) - new Date(a.resolvedAt || a.createdAt))
  ), [tickets]);

  // "Recordar a todos" (2026-08-05) — pedido explícito del usuario: mismo
  // criterio que /mine/pending-rating-count (resuelto + sin calificar) —
  // un empleado con varios tickets pendientes cuenta una sola vez.
  const pendingCount = useMemo(() => (
    new Set(
      tickets.filter((t) => t.status === 'resuelto' && !t.satisfactionRating).map((t) => t.employeeName)
    ).size
  ), [tickets]);

  const handleRemindAll = async () => {
    if (lastRemind) {
      const minutesAgo = (Date.now() - new Date(lastRemind.sentAt).getTime()) / 60000;
      if (minutesAgo < RECENT_SEND_WARNING_MINUTES) {
        const who = lastRemind.userName ? ` (${lastRemind.userName})` : '';
        const ok = window.confirm(
          `Ya se mandó este recordatorio — ${timeAgo(lastRemind.sentAt)}${who} — ` +
          `¿seguro que quieres mandarlo otra vez? Cada empleado con algo pendiente va a recibir el push duplicado.`
        );
        if (!ok) return;
      }
    }
    setReminding(true);
    setRemindResult('');
    try {
      const { data } = await api.post('/tickets/remind-pending-ratings');
      setRemindResult(`Se mandó el recordatorio a ${data.notified} empleado(s).`);
      loadLastRemind();
    } catch (err) {
      setRemindResult(err.response?.data?.message || 'No se pudo mandar el recordatorio.');
    } finally {
      setReminding(false);
    }
  };

  const summary = useMemo(() => (
    CSAT_OPTIONS.map((opt) => ({ ...opt, count: rated.filter((t) => t.satisfactionRating === opt.value).length }))
  ), [rated]);

  const avgScore = useMemo(() => {
    if (rated.length === 0) return null;
    const total = rated.reduce((sum, t) => {
      const opt = CSAT_OPTIONS.find((o) => o.value === t.satisfactionRating);
      return sum + (opt?.score || 0);
    }, 0);
    return (total / rated.length).toFixed(1);
  }, [rated]);

  const handleExport = () => {
    const rows = rated.map((t) => {
      const opt = CSAT_OPTIONS.find((o) => o.value === t.satisfactionRating);
      return {
        'Folio': t.folio,
        'Asunto': t.subject,
        'Reportado por': t.employeeName,
        'Tipo': TICKET_TYPE_CONFIG[t.ticketType]?.label || t.ticketType,
        'Calificación': t.satisfactionRating,
        'Puntaje (1-5)': opt?.score || '',
        'Atendido por': t.resolvedByName || '',
        'Fecha de resolución': t.resolvedAt ? new Date(t.resolvedAt).toLocaleString('es-MX') : '',
      };
    });

    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const dataRows = rows.map((r) => headers.map((h) => r[h]));
    const meta = [
      ['CALIFICACIONES DE SATISFACCIÓN (CSAT) — SISTEMA DE TICKETS'],
      ['Fecha de exportación:', new Date().toLocaleDateString('es-MX', { dateStyle: 'long' })],
      ['Total de tickets calificados:', rated.length],
      ['Promedio (escala 1-5):', avgScore ?? 'N/A'],
      [],
      headers,
      ...dataRows,
    ];
    const ws = XLSX.utils.aoa_to_sheet(meta);
    ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length, ...rows.map((r) => String(r[h] ?? '').length), 12) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Calificaciones');
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `calificaciones_tickets_${date}.xlsx`);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>⭐</div>
          <div>
            <h1 className={styles.title}>Calificaciones</h1>
            <p className={styles.subtitle}>Encuesta de satisfacción (CSAT) que responde quien reportó el ticket.</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          {remindResult ? (
            <span className={styles.muted} style={{ fontSize: '0.8rem' }}>{remindResult}</span>
          ) : lastRemind && (
            <span className={styles.muted} style={{ fontSize: '0.8rem' }}>
              Último envío: {timeAgo(lastRemind.sentAt)}{lastRemind.userName ? ` (${lastRemind.userName})` : ''}
            </span>
          )}
          <button
            type="button"
            className={styles.btnCancel}
            onClick={handleRemindAll}
            disabled={reminding || pendingCount === 0}
            title="Manda un push a cada empleado con al menos un ticket resuelto sin calificar"
          >
            {reminding ? 'Mandando...' : `🔔 Recordar a todos (${pendingCount})`}
          </button>
          <button type="button" className={styles.btnPrimary} onClick={handleExport} disabled={rated.length === 0}>
            📊 Exportar Excel
          </button>
        </div>
      </div>

      {loading ? (
        <p className={styles.empty}>Cargando...</p>
      ) : (
        <>
          <div className={styles.kpiRow}>
            <div className={styles.kpi} style={{ '--accent': '#0d9488' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>⭐</span><span className={styles.kpiValue}>{rated.length}</span></div>
              <p className={styles.kpiLabel}>Tickets calificados</p>
            </div>
            <div className={styles.kpi} style={{ '--accent': '#16a34a' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>📈</span><span className={styles.kpiValue}>{avgScore ?? '—'}</span></div>
              <p className={styles.kpiLabel}>Promedio</p>
              <p className={styles.kpiSub}>escala 1 a 5</p>
            </div>
            <div className={styles.kpi} style={{ '--accent': '#d97706' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>⏳</span><span className={styles.kpiValue}>{pendingCount}</span></div>
              <p className={styles.kpiLabel}>Empleados con calificación pendiente</p>
            </div>
          </div>

          <div className={styles.panel}>
            <p className={styles.panelTitle}>Distribución de respuestas</p>
            {rated.length === 0 ? (
              <p className={styles.empty}>Todavía nadie ha respondido la encuesta de satisfacción</p>
            ) : (
              summary.map(({ value, emoji, count, color }) => {
                const max = Math.max(...summary.map((s) => s.count), 1);
                return (
                  <div key={value} className={styles.barItem}>
                    <div className={styles.barHeader}>
                      <span className={styles.barIcon}>{emoji}</span>
                      <span className={styles.barLabel}>{value}</span>
                      <span className={styles.barCount}>{count}</span>
                    </div>
                    <div className={styles.barTrack}><div className={styles.barFill} style={{ width: `${(count / max) * 100}%`, background: color }} /></div>
                  </div>
                );
              })
            )}
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.zabbixTable}>
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Asunto</th>
                  <th>Reportado por</th>
                  <th>Calificación</th>
                  <th>Atendido por</th>
                  <th>Fecha de resolución</th>
                </tr>
              </thead>
              <tbody>
                {rated.length === 0 && (
                  <tr><td colSpan={6} className={styles.empty}>Todavía no hay tickets calificados</td></tr>
                )}
                {rated.map((t) => {
                  const opt = CSAT_OPTIONS.find((o) => o.value === t.satisfactionRating);
                  return (
                    <tr key={t._id}>
                      <td><strong>{t.folio}</strong></td>
                      <td>{t.subject}</td>
                      <td>{t.employeeName}</td>
                      <td>{opt?.emoji} {t.satisfactionRating}</td>
                      <td>{t.resolvedByName || '—'}</td>
                      <td className={styles.muted}>{t.resolvedAt ? new Date(t.resolvedAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
