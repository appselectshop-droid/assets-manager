import { useEffect, useRef, useState } from 'react';
import employeeApi from '../services/employeeApi';
import { ProjectPreview, DatabasePreview } from './BiPreview';
import MessageAttachmentImage from './MessageAttachmentImage';
// Reutiliza MisTickets.module.css (burbujas/overlay/composer) — mismo tema
// oscuro del portal, y ProjectPreview/DatabasePreview de BiPreview.jsx
// (exportadas para esto) para los datos estructurados, ya que aquí sí
// aplican las variables --p-* de portal-theme.css.
import styles from '../pages/MisTickets.module.css';

const STATUS_CONFIG = {
  abierto:    { label: 'Abierto',    color: 'var(--p-amber)',  bg: 'var(--p-amber-soft)' },
  en_proceso: { label: 'En proceso', color: 'var(--p-orange)', bg: 'var(--p-orange-soft)' },
  resuelto:   { label: 'Resuelto',   color: 'var(--p-green)',  bg: 'var(--p-green-soft)' },
  cerrado:    { label: 'Cerrado',    color: 'var(--p-gray)',   bg: 'var(--p-gray-soft)' },
};
const STAGE_CONFIG = {
  recibido:      { label: 'Recibido',       color: 'var(--p-muted)',  bg: 'var(--p-panel-3)' },
  en_definicion: { label: 'En definición',  color: 'var(--p-amber)',  bg: 'var(--p-amber-soft)' },
  en_desarrollo: { label: 'En desarrollo',  color: 'var(--p-orange)', bg: 'var(--p-orange-soft)' },
  en_revision:   { label: 'En revisión',    color: 'var(--p-orange)', bg: 'var(--p-orange-soft)' },
  entregado:     { label: 'Entregado',      color: 'var(--p-green)',  bg: 'var(--p-green-soft)' },
};

// Detalle de una solicitud de Soporte BI del lado del empleado — pedido
// explícito del usuario (2026-07-30): "que cuando abran el ticket ahí
// esté la BD". Antes MisSolicitudes.jsx solo mostraba una fila plana, sin
// clic ni detalle — esto es lo que faltaba. CSAT (encuesta de
// satisfacción) queda fuera de este cambio a propósito, no se pidió y ese
// componente (CsatSurvey) vive privado dentro de MisTickets.jsx.
export default function BiSolicitudDetailModal({ ticket: initialTicket, onClose }) {
  const [ticket, setTicket] = useState(initialTicket);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  // Estilo WhatsApp — pedido explícito del usuario (2026-08-04): al abrir
  // el ticket (o al llegar un mensaje nuevo) debe verse lo último enviado,
  // no quedarse arriba en lo más viejo.
  const modalScrollRef = useRef(null);
  useEffect(() => {
    modalScrollRef.current?.scrollTo({ top: modalScrollRef.current.scrollHeight });
  }, [ticket.messages?.length]);

  const isSupport = ticket.biRequestKind === 'soporte';
  const isDatabase = ticket.biRequestKind === 'bases_datos';
  const isProject = ticket.biRequestKind === 'proyecto';
  const isClosed = ticket.status === 'cerrado';
  const sc = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.abierto;
  const stg = STAGE_CONFIG[ticket.biStage] || STAGE_CONFIG.recibido;

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setError('');
    try {
      const { data } = await employeeApi.post(`/tickets/${ticket._id}/messages`, { text: text.trim() });
      setTicket(data);
      setText('');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo enviar tu mensaje.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Cerrar">✕</button>
        <div className={styles.modalScroll} ref={modalScrollRef}>
          <div className={styles.ticketCard}>
            <div className={styles.ticketHead}>
              <div>
                <p className={styles.folio}>{ticket.folio}</p>
                <p className={styles.subject}>📊 Soporte BI · {ticket.subject}</p>
              </div>
              <div className={styles.badges}>
                {isSupport ? (
                  <span className={styles.statusBadge} style={{ color: sc.color, background: sc.bg }}>{sc.label}</span>
                ) : (
                  <span className={styles.statusBadge} style={{ color: stg.color, background: stg.bg }}>{stg.label}</span>
                )}
              </div>
            </div>

            {isProject && <ProjectPreview data={ticket.biProjectData} />}
            {isDatabase && <DatabasePreview data={ticket.biDatabaseRequest} />}
            {isSupport && (
              <div className={`${styles.bubbleRow} ${styles.bubbleRowRight}`}>
                <div className={`${styles.bubbleGroup} ${styles.bubbleGroupRight}`}>
                  <p className={styles.bubbleAuthor}>Tú</p>
                  <div className={`${styles.bubble} ${styles.bubbleMine}`}>{ticket.description || ticket.subject}</div>
                </div>
              </div>
            )}

            {isDatabase && (
              <div style={{ margin: '0.75rem 0' }}>
                <p className={styles.detailLabel} style={{ marginBottom: '0.35rem' }}>Base de datos entregada</p>
                {ticket.biDeliverableFileName ? (
                  <MessageAttachmentImage api={employeeApi} url={`/tickets/${ticket._id}/bi-deliverable`} mimeType={ticket.biDeliverableMimeType} fileName={ticket.biDeliverableFileName} />
                ) : (
                  <span className={styles.detailValue}>Todavía no se ha entregado.</span>
                )}
              </div>
            )}

            {(ticket.messages || []).map((m) => {
              const isMine = m.from === 'employee';
              return (
                <div key={m._id} className={`${styles.bubbleRow} ${isMine ? styles.bubbleRowRight : ''}`}>
                  <div className={`${styles.bubbleGroup} ${isMine ? styles.bubbleGroupRight : ''}`}>
                    <p className={styles.bubbleAuthor}>{isMine ? 'Tú' : (m.authorName || 'BI')}</p>
                    <div className={`${styles.bubble} ${isMine ? styles.bubbleMine : styles.bubbleTheirs}`}>{m.text}</div>
                    <p className={styles.bubbleMeta}>
                      {new Date(m.createdAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}

            {ticket.biRejectedAt && (
              <div className={styles.resolutionBox}>
                <p className={styles.resolutionLabel}>❌ Solicitud rechazada — {ticket.biRejectedByName || 'BI'}</p>
                <p className={styles.resolutionText}>{ticket.biRejectionReason || 'Sin motivo especificado.'}</p>
              </div>
            )}

            {ticket.resolvedAt && !ticket.biRejectedAt && (
              <div className={styles.resolutionBox}>
                <p className={styles.resolutionLabel}>✅ Resolución — {ticket.resolvedByName || 'BI'}</p>
                <p className={styles.resolutionText}>{ticket.resolution}</p>
              </div>
            )}

            {isClosed ? (
              <p className={styles.waiting} style={{ marginTop: '0.6rem' }}>Este ticket ya está cerrado.</p>
            ) : (
              <form onSubmit={handleSend} className={styles.composer}>
                {error && <p className={styles.composerError}>{error}</p>}
                <div className={styles.composerRow}>
                  <textarea
                    className={styles.composerInput}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        handleSend(e);
                      }
                    }}
                    placeholder="Escribe un mensaje..."
                    rows={2}
                  />
                  <button type="submit" className={styles.composerBtn} disabled={sending || !text.trim()}>
                    {sending ? 'Enviando...' : 'Enviar'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
