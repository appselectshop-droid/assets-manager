// Detalle de una Solicitud de Recursos del lado del empleado — pedido
// explícito del usuario (2026-08-07): igual que con los tickets, poder dar
// clic a la solicitud en "Mis Solicitudes" y ver el detalle completo por
// activo (no solo el resumen en una línea), incluyendo las notas completas
// que Sistemas dejó al decidir cada uno (ej. "se pidió a compras el
// 06/08, llega en 2 semanas"). Reutiliza MisTickets.module.css (mismo tema
// oscuro del portal) — no hay nada que responder aquí (solo lectura), a
// diferencia de BiSolicitudDetailModal.jsx.
import styles from '../pages/MisTickets.module.css';

const BATTERY_OPTION = 'Pila recargable';

const ITEM_STATUS_CONFIG = {
  pendiente: { label: 'Pendiente',              color: 'var(--p-amber)', bg: 'var(--p-amber-soft)', icon: '🕓' },
  aprobada:  { label: 'Aprobado',                color: 'var(--p-green)', bg: 'var(--p-green-soft)', icon: '✅' },
  rechazada: { label: 'Rechazado',               color: '#ff8080',        bg: 'rgba(255, 128, 128, 0.14)', icon: '❌' },
  en_espera: { label: 'En espera de compras',    color: 'var(--p-blue)',  bg: 'var(--p-blue-soft)', icon: '⏳' },
};

function itemDetailText(request, label) {
  if (label === 'Software o Licencia' && request.licenseDetail) return ` (${request.licenseDetail})`;
  if (label === 'Otro (especifica)' && request.otherDetail) return `: ${request.otherDetail}`;
  if (label === BATTERY_OPTION) return ` (${request.batteryType} x${request.batteryQuantity} — ${request.batteryUse})`;
  return '';
}

function formatDate(d) {
  return d ? new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
}

export default function ResourceRequestDetailModal({ request, onClose }) {
  // Solicitudes de antes del cambio por-activo (2026-08-06) no tienen
  // itemDecisions guardado todavía — se arma aquí igual que el backend
  // (ensureItemDecisions en resourceRequests.js) para no dejar el modal
  // vacío en esas solicitudes viejas.
  const itemDecisions = request.itemDecisions?.length === request.resourceItems?.length
    ? request.itemDecisions
    : (request.resourceItems || []).map((label) => ({ label, status: request.status, notes: request.status === 'rechazada' ? request.rejectionReason : request.resolutionNotes }));

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Cerrar">✕</button>
        <div className={styles.modalScroll}>
          <div className={styles.ticketCard}>
            <div className={styles.ticketHead}>
              <div>
                <p className={styles.folio}>{request._id.toString().slice(-6).toUpperCase()}</p>
                <p className={styles.subject}>📦 Solicitud de Recursos</p>
              </div>
            </div>

            <div style={{ margin: '0.75rem 0' }}>
              <p className={styles.detailLabel} style={{ marginBottom: '0.35rem' }}>Justificación</p>
              <span className={styles.detailValue}>{request.justification || '—'}</span>
            </div>

            <p className={styles.detailLabel} style={{ marginBottom: '0.5rem' }}>Activos pedidos y su estatus</p>
            {itemDecisions.map((d, i) => {
              const cfg = ITEM_STATUS_CONFIG[d.status] || ITEM_STATUS_CONFIG.pendiente;
              return (
                <div
                  key={i}
                  style={{
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '10px',
                    padding: '0.7rem 0.85rem',
                    marginBottom: '0.6rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '0.88rem' }}>{d.label}{itemDetailText(request, d.label)}</strong>
                    <span className={styles.statusBadge} style={{ color: cfg.color, background: cfg.bg }}>{cfg.icon} {cfg.label}</span>
                  </div>
                  {d.notes && (
                    <p className={styles.detailValue} style={{ marginTop: '0.4rem' }}>{d.notes}</p>
                  )}
                  {d.decidedByName && (
                    <p className={styles.bubbleMeta} style={{ marginTop: '0.3rem' }}>
                      {d.decidedByName}{d.decidedAt ? ` — ${formatDate(d.decidedAt)}` : ''}
                    </p>
                  )}
                </div>
              );
            })}

            {request.resourceItems?.includes(BATTERY_OPTION) && request.deliveryConfirmed && (
              <p className={styles.detailValue} style={{ marginTop: '0.3rem' }}>
                🔋 Pila entregada — firmó de recibido: {request.deliveryReceivedByName}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
