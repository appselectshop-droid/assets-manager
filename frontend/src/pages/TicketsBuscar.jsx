import { useMemo, useState } from 'react';
import { useTicketsContext } from './TicketsLayout';
import { TICKET_TYPE_CONFIG, STATUS_CONFIG, timeAgo } from './ticketShared';
import styles from './Tickets.module.css';

// "Buscador" — pedido explícito del usuario: su propia página en el
// sidebar para buscar un ticket por folio, asunto o quién lo reportó, sin
// tener que ir columna por columna en el tablero.
export default function TicketsBuscar() {
  const { tickets, loading, setDetailTarget } = useTicketsContext();
  const [q, setQ] = useState('');

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return tickets
      .filter((t) => (
        t.folio?.toLowerCase().includes(query)
        || t.subject?.toLowerCase().includes(query)
        || t.employeeName?.toLowerCase().includes(query)
      ))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [tickets, q]);

  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>🔎</div>
          <div>
            <h1 className={styles.title}>Buscador</h1>
            <p className={styles.subtitle}>Busca un ticket por folio, asunto o quién lo reportó.</p>
          </div>
        </div>
      </div>

      <input
        className={styles.searchInput}
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ej. TCK-0042, impresora, Juan Pérez..."
        autoFocus
      />

      {loading ? (
        <p className={styles.empty}>Cargando...</p>
      ) : q.trim() && results.length === 0 ? (
        <p className={styles.empty}>Sin resultados para "{q.trim()}"</p>
      ) : results.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.zabbixTable}>
            <thead>
              <tr>
                <th>Folio</th>
                <th>Asunto</th>
                <th>Reportado por</th>
                <th>Tipo</th>
                <th>Estatus</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {results.map((t) => {
                const tc = TICKET_TYPE_CONFIG[t.ticketType] || { label: t.ticketType, icon: '❓' };
                const sc = STATUS_CONFIG[t.status];
                return (
                  <tr key={t._id} onClick={() => setDetailTarget(t)} style={{ cursor: 'pointer' }}>
                    <td><strong>{t.folio}</strong></td>
                    <td>{t.subject}</td>
                    <td>{t.employeeName}</td>
                    <td>{tc.icon} {tc.label}</td>
                    <td><span className={styles.statusBadge} style={{ color: sc.color, background: sc.bg }}>{sc.label}</span></td>
                    <td className={styles.muted}>{timeAgo(t.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
