import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import employeeApi from '../services/employeeApi';
import PortalLayout from '../components/PortalLayout';
import MessageAttachmentImage from '../components/MessageAttachmentImage';
import styles from './MisTickets.module.css';

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

const TICKET_TYPE_LABELS = {
  // Genéricos — heredados, solo para tickets viejos.
  hardware: '🖥️ Hardware', software: '💾 Software', red: '📶 Red / Conectividad',
  // Separados por Computadoras/Celulares.
  hardware_pc: '🖥️ Hardware Computadoras', hardware_celular: '📱 Hardware Celulares', accesorio: '🖱️ Accesorios',
  software_pc: '💾 Software Computadoras', software_celular: '📲 Software Celulares',
  red_pc: '📶 Red Computadoras', red_celular: '📡 Red Celulares',
  aplicacion: '🗂️ Aplicaciones', impresora: '🖨️ Impresoras',
  cuenta_acceso: '🔐 Cuenta / Acceso', seguridad: '🛡️ Seguridad', erp: '🏭 ERP', otro: '❓ Otro',
  // Soporte BI (proyecto y bases de datos) ya NO llega aquí — se excluye de
  // /tickets/mine del lado del backend (ver GET /mine en routes/tickets.js)
  // y se muestra en Mis Solicitudes en su lugar.
};
const STATUS_CONFIG = {
  abierto: { label: 'Abierto', color: 'var(--p-amber)', bg: 'var(--p-amber-soft)', pillClass: 'pillAmber' },
  en_proceso: { label: 'En proceso', color: 'var(--p-orange)', bg: 'var(--p-orange-soft)', pillClass: 'pillOrange' },
  resuelto: { label: 'Resuelto', color: 'var(--p-green)', bg: 'var(--p-green-soft)', pillClass: 'pillGreen' },
  cerrado: { label: 'Cerrado', color: 'var(--p-gray)', bg: 'var(--p-gray-soft)', pillClass: 'pillGray' },
};
// Nivel de Servicio (SLA) — lo fija Sistemas al clasificar la Categoría de
// Falla (ver PUT /tickets/:id/sla-category); de solo lectura para el
// empleado. null hasta que Sistemas lo clasifique.
const SLA_LEVEL_CONFIG = {
  1: { label: 'Nivel 1', color: 'var(--p-green)', bg: 'var(--p-green-soft)' },
  2: { label: 'Nivel 2', color: 'var(--p-amber)', bg: 'var(--p-amber-soft)' },
  3: { label: 'Nivel 3', color: '#ff8080', bg: 'rgba(220, 38, 38, 0.14)' },
};
const CSAT_OPTIONS = [
  { value: 'Extremadamente satisfecho', emoji: '🟢' },
  { value: 'Mayormente satisfecho', emoji: '🟢' },
  { value: 'Ni satisfecho ni insatisfecho', emoji: '🟡' },
  { value: 'Mayormente insatisfecho', emoji: '🟠' },
  { value: 'Extremadamente insatisfecho', emoji: '🔴' },
];

function formatDate(d) {
  return new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Cada ticket como una conversación real: el reporte inicial, cualquier
// mensaje de ida y vuelta (ticket.messages — el empleado puede seguir
// escribiendo, Sistemas puede responder sin marcarlo resuelto todavía) y,
// al final, la resolución formal si ya la hay. Un ticket "resuelto" solo lo
// cierra Sistemas (ver backend/src/routes/tickets.js) — el empleado ya no
// puede cerrarlo ni reabrirlo por su cuenta.
function TicketThread({ ticket, onUpdate, onClose }) {
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const sc = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.abierto;
  const sla = SLA_LEVEL_CONFIG[ticket.slaLevel];

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f && f.size > MAX_ATTACHMENT_BYTES) {
      setError('La imagen no puede pesar más de 15MB.');
      e.target.value = '';
      return;
    }
    setFile(f || null);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim() && !file) return;
    setError('');
    setSending(true);
    try {
      let data;
      if (file) {
        const form = new FormData();
        form.append('text', text.trim());
        form.append('attachment', file);
        ({ data } = await employeeApi.post(`/tickets/${ticket._id}/messages`, form));
      } else {
        ({ data } = await employeeApi.post(`/tickets/${ticket._id}/messages`, { text: text.trim() }));
      }
      onUpdate({ ...data, appRef: ticket.appRef }); // el POST no puebla appRef, se conserva el que ya se tenía
      setText('');
      setFile(null);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo enviar tu mensaje.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={styles.ticketCard}>
      <div className={styles.ticketHead}>
        <div>
          <p className={styles.folio}>{ticket.folio}</p>
          <p className={styles.subject}>
            {TICKET_TYPE_LABELS[ticket.ticketType] || ticket.ticketType} · {ticket.subject}
          </p>
        </div>
        <div className={styles.badges}>
          <span className={styles.statusBadge} style={{ color: sc.color, background: sc.bg }}>{sc.label}</span>
          {ticket.appRef && <span className={styles.appBadge}>🗂️ {ticket.appRef.name}</span>}
        </div>
      </div>

      <div className={styles.detailsPanel}>
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>Responsable de Soporte</span>
          <span className={styles.detailValue}>{ticket.assignedByName || 'Sin asignar'}</span>
        </div>
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>Nivel de Servicio</span>
          {sla ? (
            <span className={styles.statusBadge} style={{ color: sla.color, background: sla.bg }}>{sla.label}</span>
          ) : (
            <span className={styles.detailValue}>Sin clasificar</span>
          )}
        </div>
      </div>

      {/* Pedido explícito y urgente del usuario (2026-07-27): "quiero que el
          usuario aprenda a reportar" — si Sistemas reclasificó la categoría
          (ver PUT /tickets/:id/reassign-type), se le avisa aquí con qué
          categoría se reportó originalmente vs. la correcta. */}
      {ticket.reassignedByName && (
        <p className={styles.waiting} style={{ color: 'var(--p-amber)' }}>
          🔁 Sistemas reclasificó este ticket — se reportó como{' '}
          <strong>{(TICKET_TYPE_LABELS[ticket.originalTicketType] || ticket.originalTicketType || '').replace(/^[^\s]+\s/, '')}</strong>.
        </p>
      )}

      <div className={`${styles.bubbleRow} ${styles.bubbleRowRight}`}>
        <div className={`${styles.bubbleGroup} ${styles.bubbleGroupRight}`}>
          <p className={styles.bubbleAuthor}>Tú</p>
          <div className={`${styles.bubble} ${styles.bubbleMine}`}>
            {ticket.description || ticket.subject}
          </div>
          <p className={styles.bubbleMeta}>{formatDate(ticket.createdAt)}</p>
        </div>
      </div>

      {(ticket.messages || []).map((m) => {
        const isMine = m.from === 'employee';
        return (
          <div key={m._id} className={`${styles.bubbleRow} ${isMine ? styles.bubbleRowRight : ''}`}>
            <div className={`${styles.bubbleGroup} ${isMine ? styles.bubbleGroupRight : ''}`}>
              <p className={styles.bubbleAuthor}>{isMine ? 'Tú' : (m.authorName || 'Sistemas')}</p>
              <div className={`${styles.bubble} ${isMine ? styles.bubbleMine : styles.bubbleTheirs}`}>
                {m.text}
                {m.attachmentMimeType && (
                  <div className={styles.bubbleAttachment}>
                    <MessageAttachmentImage
                      api={employeeApi}
                      ticketId={ticket._id}
                      messageId={m._id}
                      mimeType={m.attachmentMimeType}
                      fileName={m.attachmentFileName}
                    />
                  </div>
                )}
              </div>
              <p className={styles.bubbleMeta}>{formatDate(m.createdAt)}</p>
            </div>
          </div>
        );
      })}

      {ticket.resolvedAt ? (
        // Pedido explícito del usuario (2026-07-28): antes esto se veía
        // IGUAL que un mensaje normal del chat — se perdía entre la
        // conversación casual y parecía "un mensaje más", no la resolución
        // oficial. Estilo propio (verde, con encabezado aparte) para que
        // se note la diferencia.
        <div className={styles.resolutionBox}>
          <p className={styles.resolutionLabel}>✅ Resolución — {ticket.resolvedByName || 'Sistemas'}</p>
          <p className={styles.resolutionText}>
            {ticket.resolution}{ticket.resolutionNotes ? ` — ${ticket.resolutionNotes}` : ''}
          </p>
          <p className={styles.bubbleMeta}>{formatDate(ticket.resolvedAt)}</p>
        </div>
      ) : (
        <p className={styles.waiting}>
          {ticket.status === 'en_proceso' ? 'Sistemas ya lo está atendiendo...' : 'Todavía sin respuesta de Sistemas...'}
        </p>
      )}

      {ticket.status === 'resuelto' && (
        <p className={styles.waiting} style={{ marginTop: '0.6rem' }}>
          Sistemas cerrará este ticket una vez que confirme que quedó resuelto.
        </p>
      )}

      {ticket.status === 'cerrado' ? (
        <p className={styles.waiting} style={{ marginTop: '0.6rem' }}>
          Este ticket ya está cerrado — reporta uno nuevo si el problema sigue.
        </p>
      ) : (
        <form onSubmit={handleSend} className={styles.composer}>
          {error && <p className={styles.composerError}>{error}</p>}
          {file && (
            <div className={styles.composerFileChip}>
              📎 {file.name}
              <button type="button" onClick={() => setFile(null)} aria-label="Quitar imagen">✕</button>
            </div>
          )}
          <div className={styles.composerRow}>
            <textarea
              className={styles.composerInput}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={ticket.status === 'resuelto' ? '¿Sigue el problema? Cuéntanos qué pasa...' : 'Escribe un mensaje de seguimiento...'}
              rows={2}
            />
            <label className={styles.composerAttachBtn} title="Adjuntar imagen">
              📷
              <input type="file" accept="image/*" onChange={handleFileChange} hidden />
            </label>
            <button type="submit" className={styles.composerBtn} disabled={sending || (!text.trim() && !file)}>
              {sending ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
        </form>
      )}

      {ticket.status === 'cerrado' && (
        <CsatSurvey ticket={ticket} onUpdate={onUpdate} onClose={onClose} />
      )}
    </div>
  );
}

// Encuesta de satisfacción — solo aparece cuando Sistemas ya cerró el
// ticket (ver POST /tickets/:id/satisfaction). Una vez calificado ya no se
// puede cambiar — solo se muestra la respuesta elegida.
function CsatSurvey({ ticket, onUpdate, onClose }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Al calificar, se cierra la ventana sola — un pequeño respiro para que se
  // alcance a ver la opción marcada antes de que desaparezca.
  const rate = async (value) => {
    setError('');
    setSubmitting(true);
    try {
      const { data } = await employeeApi.post(`/tickets/${ticket._id}/satisfaction`, { rating: value });
      onUpdate({ ...data, appRef: ticket.appRef });
      setTimeout(() => onClose?.(), 500);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar tu respuesta.');
      setSubmitting(false);
    }
  };

  if (ticket.satisfactionRating) {
    const chosen = CSAT_OPTIONS.find((o) => o.value === ticket.satisfactionRating);
    return (
      <div className={styles.csatBox}>
        <p className={styles.csatTitle}>¿Qué tan satisfecho estás con la atención recibida?</p>
        <div className={styles.csatChosen}>
          <span className={styles.csatEmoji}>{chosen?.emoji}</span>
          {ticket.satisfactionRating}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.csatBox}>
      <p className={styles.csatTitle}>¿Qué tan satisfecho estás con la atención recibida?</p>
      {error && <p className={styles.composerError}>{error}</p>}
      <div className={styles.csatOptions}>
        {CSAT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={styles.csatOption}
            onClick={() => rate(opt.value)}
            disabled={submitting}
          >
            <span className={styles.csatEmoji}>{opt.emoji}</span>
            {opt.value}
          </button>
        ))}
      </div>
    </div>
  );
}

// Portal del empleado (requiere sesión — ver EmployeeLogin.jsx): su propio
// historial de tickets, ligado a su identidad real (Ticket.employeeRef), no a
// un nombre escrito a mano como en la versión anterior sin login. Se ve como
// lista/tabla (folio, asunto, estatus, fecha) — la conversación completa
// (TicketThread) se abre en una ventana flotante al hacer clic en un renglón.
export default function MisTickets() {
  const [searchParams] = useSearchParams();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  // ?ticket=<id> (ver notificación push en usePushSubscription.js/tickets.js
  // POST /:id/reply) — que el clic en el aviso de verdad abra la
  // conversación, no solo la lista.
  useEffect(() => {
    employeeApi.get('/tickets/mine')
      .then(({ data }) => {
        setTickets(data);
        const fromUrl = searchParams.get('ticket');
        if (fromUrl && data.some((t) => t._id === fromUrl)) setSelectedId(fromUrl);
      })
      .finally(() => setLoading(false));
  }, [searchParams]);

  // Mientras hay una conversación abierta, refresca cada 5s — así un
  // mensaje nuevo de Sistemas se ve "en vivo" sin cerrar la ventana.
  useEffect(() => {
    if (!selectedId) return;
    const interval = setInterval(() => {
      employeeApi.get('/tickets/mine').then(({ data }) => setTickets(data)).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedId]);

  const handleUpdate = (updated) => {
    setTickets((prev) => prev.map((t) => (t._id === updated._id ? updated : t)));
  };

  const selectedTicket = tickets.find((t) => t._id === selectedId) || null;

  return (
    <PortalLayout activeNav="tickets">
      <Link to="/mesa-de-ayuda" className={styles.backLink}>← Volver a Solicitudes</Link>
      <div className={styles.mainHead}>
        <h1>Mis tickets</h1>
        <p>Tu historial de reportes y su seguimiento.</p>
      </div>

      {loading && <p className={styles.tableEmpty}>Cargando tu historial...</p>}
      {!loading && tickets.length === 0 && (
        <div className={styles.tableEmpty}>Todavía no has reportado ningún ticket.</div>
      )}

      {!loading && tickets.length > 0 && (
        <div className={styles.tablePanel}>
          <table>
            <thead>
              <tr><th>Folio</th><th>Ticket</th><th>Estatus</th><th>Fecha</th></tr>
            </thead>
            <tbody>
              {tickets.map((t) => {
                const sc = STATUS_CONFIG[t.status] || STATUS_CONFIG.abierto;
                const sla = SLA_LEVEL_CONFIG[t.slaLevel];
                return (
                  <tr key={t._id} onClick={() => setSelectedId(t._id)}>
                    <td><span className={styles.folioLink}>{t.folio}</span></td>
                    <td>
                      {TICKET_TYPE_LABELS[t.ticketType] || t.ticketType} · {t.subject}
                      {/* Pedido explícito del usuario (2026-07-28): que la
                          resolución se note desde la lista, sin tener que
                          entrar al ticket a buscarla entre los mensajes. */}
                      {t.resolvedAt && (
                        <div className={styles.resolutionPreview}>
                          ✅ {t.resolution}{t.resolutionNotes ? ` — ${t.resolutionNotes}` : ''}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`${styles.pill} ${styles[sc.pillClass]}`}><span className={styles.dot} />{sc.label.toLowerCase()}</span>
                      {sla && (
                        <span className={styles.pill} style={{ color: sla.color, background: sla.bg, marginLeft: '0.4rem' }} title="Nivel de Servicio">
                          <span className={styles.dot} />{sla.label.toLowerCase()}
                        </span>
                      )}
                    </td>
                    <td className={styles.date}>{formatDate(t.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedTicket && (
        <div className={styles.overlay} onClick={() => setSelectedId(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button type="button" className={styles.modalClose} onClick={() => setSelectedId(null)} aria-label="Cerrar">✕</button>
            <div className={styles.modalScroll}>
              <TicketThread ticket={selectedTicket} onUpdate={handleUpdate} onClose={() => setSelectedId(null)} />
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
