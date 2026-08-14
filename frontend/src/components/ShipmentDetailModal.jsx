import { useState } from 'react';
import employeeApi from '../services/employeeApi';
// Reutiliza MisTickets.module.css (mismo tema oscuro del portal) — mismo
// criterio que ResourceRequestDetailModal.jsx para la estructura del
// modal/tarjeta; composerBtn/composerError se piden prestados del
// composer de chat porque son exactamente el mismo look de botón/error.
import styles from '../pages/MisTickets.module.css';

// Detalle de una Solicitud de Envío del lado del empleado — pedido
// explícito del usuario (2026-08-14): "necesito que en su mesa de ayuda en
// mis solicitudes le habilites el link de entrega... que haya un botón de
// confirmar entrega y que pueda descargar en PDF su recepción". A
// diferencia del link público (para un mensajero/destinatario sin cuenta,
// ver routes/shipments.js), esto es para cuando quien recibe SÍ tiene
// sesión en el portal — no hace falta pedirle su nombre, ya se sabe quién
// es.
const STATUS_CONFIG = {
  enviado:     { label: 'Enviado',     color: 'var(--p-amber)', bg: 'var(--p-amber-soft)', icon: '📦' },
  en_transito: { label: 'En tránsito', color: 'var(--p-blue)',  bg: 'var(--p-blue-soft)',  icon: '🚚' },
  recibido:    { label: 'Recibido',    color: 'var(--p-green)', bg: 'var(--p-green-soft)', icon: '✅' },
};

function formatDate(d) {
  return d ? new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
}

export default function ShipmentDetailModal({ shipment, onClose, onUpdated }) {
  const [confirming, setConfirming] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const cfg = STATUS_CONFIG[shipment.status] || STATUS_CONFIG.enviado;

  const handleConfirm = async () => {
    if (!window.confirm('¿Confirmas que ya recibiste este envío?')) return;
    setConfirming(true);
    setError('');
    try {
      const { data } = await employeeApi.put(`/shipments/mine/${shipment._id}/confirm`, {});
      onUpdated(data);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo confirmar la recepción');
    } finally {
      setConfirming(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    setError('');
    try {
      const resp = await employeeApi.get(`/shipments/mine/${shipment._id}/reception-pdf`, { responseType: 'blob' });
      const blob = new Blob([resp.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Recepcion_${shipment.folio}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('No se pudo descargar el PDF');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Cerrar">✕</button>
        <div className={styles.modalScroll}>
          <div className={styles.ticketCard}>
            <div className={styles.ticketHead}>
              <div>
                <p className={styles.folio}>{shipment.folio}</p>
                <p className={styles.subject}>🚚 Solicitud de envío</p>
              </div>
              <span className={styles.statusBadge} style={{ color: cfg.color, background: cfg.bg }}>{cfg.icon} {cfg.label}</span>
            </div>

            {error && <p className={styles.composerError}>{error}</p>}

            <div style={{ margin: '0.75rem 0' }}>
              <p className={styles.detailLabel} style={{ marginBottom: '0.35rem' }}>Ruta</p>
              <span className={styles.detailValue}>{shipment.originOffice} → {shipment.destinationOffice}</span>
            </div>

            {shipment.items?.length > 0 && (
              <>
                <p className={styles.detailLabel} style={{ marginBottom: '0.5rem' }}>Equipo/artículos enviados</p>
                {shipment.items.map((item, i) => (
                  <div
                    key={i}
                    style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '0.7rem 0.85rem', marginBottom: '0.5rem' }}
                  >
                    <strong style={{ fontSize: '0.88rem' }}>{[item.type, item.description].filter(Boolean).join(' — ') || 'Artículo'}</strong>
                    {item.serialOrImei && <p className={styles.detailValue} style={{ marginTop: '0.2rem' }}>{item.serialOrImei}</p>}
                  </div>
                ))}
              </>
            )}

            {shipment.status === 'enviado' && (
              <p className={styles.detailValue} style={{ marginTop: '0.5rem' }}>Todavía no sale de {shipment.originOffice}.</p>
            )}

            {shipment.status === 'en_transito' && (
              <button type="button" className={styles.composerBtn} onClick={handleConfirm} disabled={confirming} style={{ marginTop: '0.6rem' }}>
                {confirming ? 'Confirmando...' : '✅ Confirmar entrega'}
              </button>
            )}

            {shipment.status === 'recibido' && (
              <>
                <p className={styles.detailValue} style={{ marginTop: '0.6rem' }}>Recibido el {formatDate(shipment.receivedAt)}</p>
                <button type="button" className={styles.composerBtn} onClick={handleDownload} disabled={downloading} style={{ marginTop: '0.5rem' }}>
                  {downloading ? 'Generando...' : '📄 Descargar PDF de recepción'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
