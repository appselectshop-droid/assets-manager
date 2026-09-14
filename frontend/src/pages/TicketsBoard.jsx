import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import TicketCard from './TicketCard';
import { useTicketsContext } from './TicketsLayout';
import { TICKET_TYPE_CONFIG, COLUMNS, PRIORITY_ORDER, oneAssetLabel } from './ticketShared';
import styles from './Tickets.module.css';

// Tablero general (kanban) — pedido explícito del usuario: mantenerlo tal
// cual estaba. El toggle "Todos / Mis Tickets" ya no vive en esta página —
// pedido explícito del usuario: se despliega en la MISMA barra lateral al
// presionar "Tickets" (ver TicketsLayout.jsx), así que aquí solo se LEE el
// scope elegido desde el query string (`?scope=`), no se decide aquí.
export default function TicketsBoard() {
  const { tickets, loading, currentUser, setDetailTarget, assetIdFilter, clearAssetFilter } = useTicketsContext();
  const [typeFilter, setTypeFilter] = useState('');
  const [searchParams] = useSearchParams();
  const scope = searchParams.get('scope') === 'mios' ? 'mios' : 'todos';

  const filteredAsset = assetIdFilter
    ? tickets.flatMap((t) => t.assetRefs || []).find((a) => a._id === assetIdFilter)
    : null;

  const scopedTickets = scope === 'mios' ? tickets.filter((t) => t.assignedTo?._id === currentUser.id) : tickets;
  const visibleTickets = typeFilter ? scopedTickets.filter((t) => t.ticketType === typeFilter) : scopedTickets;

  // Descargar resueltos (2026-09-14, pedido relayado por el usuario: "dicen
  // los de erp que si les puedes hacer un botón de descargar todos los
  // tickets que han resuelto") — mismo patrón EXACTO ya usado en
  // TicketsSLA.jsx/TicketsCalificaciones.jsx (xlsx client-side, sin
  // endpoint nuevo en el backend: los datos ya están en `tickets`, que ya
  // viene acotado a solo ERP para un usuario ERP-only, ver GET /tickets).
  // Respeta los filtros de tipo/alcance que ya están puestos en el
  // tablero — si quieren "todos", solo hay que quitar los filtros antes.
  const resolvedTickets = useMemo(
    () => visibleTickets.filter((t) => t.status === 'resuelto' || t.status === 'cerrado'),
    [visibleTickets]
  );

  const handleExportResolved = () => {
    const rows = resolvedTickets.map((t) => ({
      'Folio': t.folio,
      'Asunto': t.subject,
      'Reportado por': t.employeeName,
      'Tipo': TICKET_TYPE_CONFIG[t.ticketType]?.label || t.ticketType,
      'Sistema ERP': t.erpSystem || '',
      'Estatus': t.status === 'cerrado' ? 'Cerrado' : 'Resuelto',
      'Resolución': t.resolution || '',
      'Resuelto por': t.resolvedByName || '',
      'Fecha de creación': new Date(t.createdAt).toLocaleString('es-MX'),
      'Fecha de resolución': t.resolvedAt ? new Date(t.resolvedAt).toLocaleString('es-MX') : '',
      'Calificación': t.satisfactionRating || '',
    }));
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const dataRows = rows.map((r) => headers.map((h) => r[h]));
    const meta = [
      ['TICKETS RESUELTOS'],
      ['Fecha de exportación:', new Date().toLocaleDateString('es-MX', { dateStyle: 'long' })],
      ['Total:', resolvedTickets.length],
      [],
      headers,
      ...dataRows,
    ];
    const ws = XLSX.utils.aoa_to_sheet(meta);
    ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length, ...rows.map((r) => String(r[h] ?? '').length), 12) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tickets resueltos');
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `tickets_resueltos_${date}.xlsx`);
  };

  const board = useMemo(() => {
    const out = {};
    COLUMNS.forEach((c) => {
      out[c.key] = visibleTickets
        .filter((t) => t.status === c.key)
        .sort((a, b) => {
          const pDiff = PRIORITY_ORDER.indexOf(a.priority || 'media') - PRIORITY_ORDER.indexOf(b.priority || 'media');
          if (pDiff !== 0) return pDiff;
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
    });
    return out;
  }, [visibleTickets]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>🎫</div>
          <div>
            <h1 className={styles.title}>Tickets</h1>
            <p className={styles.subtitle}>Soporte reportado por el equipo — ligado al equipo específico, no a la persona.</p>
          </div>
        </div>
        <button type="button" className={styles.btnPrimary} onClick={handleExportResolved} disabled={resolvedTickets.length === 0}>
          📊 Descargar resueltos ({resolvedTickets.length})
        </button>
      </div>

      {assetIdFilter && (
        <div className={styles.assetFilterBar}>
          🎫 Filtrando por activo{filteredAsset ? `: ${oneAssetLabel(filteredAsset)}` : ''} ({tickets.length})
          <button type="button" className={styles.btnLink} onClick={clearAssetFilter}>✕ Quitar filtro</button>
        </div>
      )}

      <div className={styles.controlsRow}>
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${!typeFilter ? styles.tabActive : ''}`} onClick={() => setTypeFilter('')}>Todos los tipos</button>
          {Object.entries(TICKET_TYPE_CONFIG).map(([key, cfg]) => (
            <button key={key} className={`${styles.tab} ${typeFilter === key ? styles.tabActive : ''}`} onClick={() => setTypeFilter(key)}>
              {cfg.icon} {cfg.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className={styles.empty}>Cargando...</p>
      ) : (
        <div className={styles.board}>
          {COLUMNS.map((col) => (
            <div key={col.key} className={styles.column} style={{ '--col-accent': col.accent }}>
              <div className={styles.columnHeader}>
                <span className={styles.columnTitle}>{col.label}</span>
                <span className={styles.columnCount}>{board[col.key].length}</span>
              </div>
              <div className={styles.columnList}>
                {board[col.key].length === 0 ? (
                  <p className={styles.columnEmpty}>Sin tickets</p>
                ) : (
                  board[col.key].map((t) => (
                    <TicketCard key={t._id} ticket={t} onClick={() => setDetailTarget(t)} />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
