import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import MessageAttachmentImage from '../components/MessageAttachmentImage';
import EmojiPicker from '../components/EmojiPicker';
import { imageFileFromClipboard } from '../utils/clipboardImage';
import { useTicketsContext } from './TicketsLayout';
import { GERENTE_SISTEMAS_EMAIL, TICKET_TYPE_CONFIG, timeAgo } from './ticketShared';
import styles from './Tickets.module.css';

// "Chats" — pedido explícito del usuario: que se sienta como Messenger, no
// como una bandeja que abre un modal. Panel doble: lista de conversaciones
// a la izquierda, conversación abierta a la derecha con burbujas y su
// propia caja para responder — sin cerrar/abrir nada. Para asignar, cambiar
// prioridad, marcar resuelto o ver notas internas, se sigue abriendo el
// modal completo del ticket con un botón aparte ("Ver ticket completo").
// El toggle "Todos / Mis Chats" NO vive aquí — pedido explícito del
// usuario: se despliega en la MISMA barra lateral al presionar "Chats"
// (ver TicketsLayout.jsx), así que aquí solo se LEE el scope desde el
// query string.
export default function TicketsChats() {
  const { tickets, loading, currentUser, setDetailTarget, load } = useTicketsContext();
  const [searchParams] = useSearchParams();
  const scope = searchParams.get('scope') === 'mios' ? 'mios' : 'todos';
  const [selectedId, setSelectedId] = useState(null);
  const [liveMessages, setLiveMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [replyFile, setReplyFile] = useState(null);
  const [sendingReply, setSendingReply] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  // Miniatura de la imagen antes de enviarla (2026-08-07, pedido explícito
  // del usuario) — antes solo se veía el nombre del archivo, sin poder
  // confirmar visualmente que sí era la imagen correcta antes de mandarla.
  const [replyFilePreview, setReplyFilePreview] = useState('');
  useEffect(() => {
    if (!replyFile) { setReplyFilePreview(''); return; }
    const url = URL.createObjectURL(replyFile);
    setReplyFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [replyFile]);

  const conversations = useMemo(() => {
    const withMessages = tickets.filter((t) => (t.messages || []).length > 0);
    const scoped = scope === 'mios' ? withMessages.filter((t) => t.assignedTo?._id === currentUser.id) : withMessages;
    return scoped
      .map((t) => {
        const lastMessage = t.messages[t.messages.length - 1];
        // Bug real reportado por el usuario (2026-08-07): "tengo chats con
        // ese circulito verde como si nunca lo hubiera visto" — un ticket
        // ya resuelto/cerrado, donde el empleado mandó un último "gracias"
        // después de cerrado el caso, se quedaba marcado como "esperando
        // respuesta" para siempre. Ya resuelto/cerrado no hay nada que
        // responder, sin importar quién mandó el último mensaje.
        const unread = lastMessage.from === 'employee' && !['resuelto', 'cerrado'].includes(t.status);
        return { ticket: t, lastMessage, unread };
      })
      .sort((a, b) => new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt));
  }, [tickets, scope, currentUser.id]);

  const unreadCount = conversations.filter((c) => c.unread).length;

  // Si el ticket seleccionado deja de estar en la lista (ej. cambia el
  // scope a "mios" y ese chat no es mío), se limpia la selección.
  const selectedTicket = conversations.find((c) => c.ticket._id === selectedId)?.ticket || null;

  useEffect(() => {
    if (!selectedTicket && conversations.length > 0) setSelectedId(conversations[0].ticket._id);
    else if (conversations.length === 0) setSelectedId(null);
  }, [conversations, selectedTicket]);

  useEffect(() => {
    setLiveMessages(selectedTicket?.messages || []);
    setReplyText('');
    setReplyFile(null);
    setError('');
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mientras hay una conversación abierta, se refresca cada 5s — mismo
  // patrón que el modal de detalle, para ver mensajes nuevos "en vivo".
  useEffect(() => {
    if (!selectedId) return;
    const interval = setInterval(() => {
      api.get(`/tickets/${selectedId}`)
        .then(({ data }) => setLiveMessages(data.messages || []))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedId]);

  // Estilo WhatsApp — pedido explícito del usuario (2026-08-04): al abrir
  // una conversación (o al llegar un mensaje nuevo) debe verse lo último
  // enviado, no quedarse arriba mostrando los mensajes más viejos.
  //
  // Depende de `.length`, NO del array completo (2026-08-05) — el polling
  // de arriba llama `setLiveMessages(data.messages || [])` cada 5s, con un
  // array nuevo aunque el contenido sea idéntico; con el array completo
  // como dependencia, esto forzaba el scroll al fondo cada 5s sin que
  // llegara nada nuevo, peleándose con quien intentaba hacer scroll hacia
  // arriba para leer mensajes viejos — bug real reportado por el usuario.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [selectedId, liveMessages.length]);

  // Bug real reportado por el usuario (2026-08-07): "sigue desplazándose
  // hacia arriba y no deja ver los últimos mensajes" — el scroll de arriba
  // se movía al fondo ANTES de que las imágenes adjuntas terminaran de
  // descargarse (ver MessageAttachmentImage.jsx, pide el blob aparte); al
  // terminar de cargar la imagen, la burbuja crece y empuja el fondo
  // real más abajo, dejando la vista mostrando algo por encima de los
  // últimos mensajes. Un ResizeObserver en el contenedor vuelve a bajar el
  // scroll cada vez que el contenido crece — pero SOLO si ya estábamos
  // cerca del fondo, para no pelearse con quien hizo scroll manual hacia
  // arriba a propósito para leer mensajes viejos.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
      if (nearBottom) messagesEndRef.current?.scrollIntoView({ block: 'end' });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [selectedId]);

  const applyReplyFile = (f) => {
    if (f && f.size > 15 * 1024 * 1024) {
      setError('La imagen no puede pesar más de 15MB.');
      return;
    }
    setReplyFile(f || null);
  };

  const handleReplyFileChange = (e) => {
    const f = e.target.files[0];
    if (f && f.size > 15 * 1024 * 1024) e.target.value = '';
    applyReplyFile(f);
  };

  // Ctrl+V/Cmd+V de una captura de pantalla — pedido explícito del usuario
  // (2026-08-07): "no deja copiar y pegar la imagen" — mismo criterio ya
  // usado en TicketDetailModal.jsx/InternalNotesPanel.jsx.
  const handleReplyPaste = (e) => {
    const f = imageFileFromClipboard(e);
    if (f) applyReplyFile(f);
  };

  const handleReply = async () => {
    if (!selectedId || (!replyText.trim() && !replyFile)) return;
    setSendingReply(true);
    setError('');
    try {
      let data;
      if (replyFile) {
        const form = new FormData();
        form.append('text', replyText.trim());
        form.append('attachment', replyFile);
        ({ data } = await api.post(`/tickets/${selectedId}/reply`, form));
      } else {
        ({ data } = await api.post(`/tickets/${selectedId}/reply`, { text: replyText.trim() }));
      }
      setLiveMessages(data.messages || []);
      setReplyText('');
      setReplyFile(null);
      load(); // refresca la lista de fondo (orden por más reciente, snippet, abierto → en proceso)
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo enviar la respuesta');
    } finally {
      setSendingReply(false);
    }
  };

  // Borrar mensaje (2026-08-13, pedido explícito del usuario: "déjame
  // eliminar mensajes, luego nos equivocamos") — mismo criterio que
  // TicketDetailModal.jsx (única fuente de verdad es el backend, ver
  // DELETE /:id/messages/:messageId).
  const [deletingMessageId, setDeletingMessageId] = useState(null);
  const handleDeleteMessage = async (messageId) => {
    if (!window.confirm('¿Eliminar este mensaje? No se puede deshacer.')) return;
    setDeletingMessageId(messageId);
    setError('');
    try {
      const { data } = await api.delete(`/tickets/${selectedId}/messages/${messageId}`);
      setLiveMessages(data.messages || []);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo eliminar el mensaje');
    } finally {
      setDeletingMessageId(null);
    }
  };

  const selectedTc = selectedTicket ? (TICKET_TYPE_CONFIG[selectedTicket.ticketType] || { label: selectedTicket.ticketType, icon: '❓' }) : null;
  // Pedido explícito del usuario: un chat que no es mío (ya asignado a otra
  // persona) es de solo lectura aquí — mismo criterio que ya usa el modal
  // de detalle (canManage), el backend también lo hace valer en POST
  // /:id/reply, esto solo evita que se intente escribir para nada.
  //
  // role === 'admin' / canManageTickets (2026-08-04): faltaban los dos —
  // esto se quedaba en modo lectura para CUALQUIER admin (no solo
  // becario.sistemas) en un chat ya asignado a un compañero, aunque el
  // backend sí lo aceptara — mismo bug reportado por el usuario para
  // becario.sistemas, encontrado aquí también al revisar canManageTicket().
  const canManageSelected = !!selectedTicket && (
    currentUser.email === GERENTE_SISTEMAS_EMAIL
    || currentUser.role === 'admin'
    || currentUser.canManageTickets
    || !selectedTicket.assignedTo
    || selectedTicket.assignedTo._id === currentUser.id
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>💬</div>
          <div>
            <h1 className={styles.title}>Chats</h1>
            <p className={styles.subtitle}>Bandeja de conversaciones activas{unreadCount > 0 ? ` — ${unreadCount} sin responder` : ''}.</p>
          </div>
        </div>
      </div>

      {loading ? (
        <p className={styles.empty}>Cargando...</p>
      ) : conversations.length === 0 ? (
        <p className={styles.empty}>Todavía no hay conversaciones{scope === 'mios' ? ' asignadas a ti' : ' en ningún ticket'}</p>
      ) : (
        <div className={styles.messengerWrap}>
          <div className={styles.messengerList}>
            {conversations.map(({ ticket, lastMessage, unread }) => {
              const tc = TICKET_TYPE_CONFIG[ticket.ticketType] || { label: ticket.ticketType, icon: '❓' };
              return (
                <div
                  key={ticket._id}
                  className={`${styles.messengerListItem} ${unread ? styles.chatItemUnread : ''} ${ticket._id === selectedId ? styles.messengerListItemActive : ''}`}
                  onClick={() => setSelectedId(ticket._id)}
                >
                  <div className={styles.chatAvatar}>{tc.icon}</div>
                  <div className={styles.chatBody}>
                    <div className={styles.chatTop}>
                      <span className={styles.chatName}>{ticket.employeeName}</span>
                      <span className={styles.chatTime}>{timeAgo(lastMessage.createdAt)}</span>
                    </div>
                    <p className={styles.chatSubject}>{ticket.folio} · {ticket.subject}</p>
                    <p className={styles.chatSnippet}>
                      {lastMessage.from === 'admin' ? `${lastMessage.authorName}: ` : ''}{lastMessage.text || '📎 Imagen adjunta'}
                    </p>
                  </div>
                  {unread && <span className={styles.chatUnreadDot} title="Esperando respuesta de Sistemas" />}
                </div>
              );
            })}
          </div>

          <div className={styles.messengerThread}>
            {!selectedTicket ? (
              <p className={styles.empty}>Selecciona una conversación</p>
            ) : (
              <>
                <div className={styles.messengerThreadHeader}>
                  <div>
                    <p className={styles.messengerThreadTitle}>{selectedTc.icon} {selectedTicket.subject}</p>
                    <p className={styles.muted}>{selectedTicket.folio} · {selectedTicket.employeeName}</p>
                  </div>
                  <button type="button" className={styles.btnLink} onClick={() => setDetailTarget(selectedTicket)}>
                    Ver ticket completo →
                  </button>
                </div>

                <div className={styles.messengerMessages} ref={messagesContainerRef}>
                  {liveMessages.length === 0 ? (
                    <p className={styles.empty}>Sin mensajes todavía</p>
                  ) : (
                    liveMessages.map((m, i) => {
                      const fromAdmin = m.from === 'admin';
                      const canDeleteMessage = fromAdmin && !m.deleted
                        && (m.authorName === currentUser.name || currentUser.email === GERENTE_SISTEMAS_EMAIL || currentUser.canViewManagerDashboard);
                      return (
                        <div key={m._id || i} className={`${styles.bubbleItem} ${fromAdmin ? styles.bubbleItemRight : ''}`}>
                          <p className={styles.bubbleAuthor}>{fromAdmin ? m.authorName : selectedTicket.employeeName}</p>
                          <div className={`${styles.bubbleText} ${fromAdmin ? styles.bubbleTheirs : styles.bubbleMine}`}>
                            {m.deleted ? <em>🗑️ Mensaje eliminado</em> : (
                              <>
                                {m.text}
                                {m.attachmentMimeType && (
                                  <div className={styles.bubbleAttachment}>
                                    <MessageAttachmentImage
                                      api={api}
                                      url={`/tickets/${selectedTicket._id}/messages/${m._id}/attachment`}
                                      mimeType={m.attachmentMimeType}
                                      fileName={m.attachmentFileName}
                                    />
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                          <p className={styles.bubbleMeta}>
                            {new Date(m.createdAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            {canDeleteMessage && (
                              <button
                                type="button"
                                className={styles.btnLink}
                                style={{ marginLeft: '0.5rem' }}
                                onClick={() => handleDeleteMessage(m._id)}
                                disabled={deletingMessageId === m._id}
                              >
                                🗑️ Eliminar
                              </button>
                            )}
                          </p>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {error && <p className={styles.formError}>{error}</p>}

                {/* 'resuelto' agregado (2026-08-05, bug real reportado por
                    el usuario) — antes solo bloqueaba 'cerrado', dejando
                    seguir mandando mensajes en un ticket ya resuelto. */}
                {['resuelto', 'cerrado'].includes(selectedTicket.status) ? (
                  <div className={styles.messengerReplyBox}>
                    <p className={styles.modalHint}>
                      🔒 Este ticket ya está resuelto — no se pueden mandar más mensajes.
                    </p>
                  </div>
                ) : selectedTicket.escalated ? (
                  <div className={styles.messengerReplyBox}>
                    <p className={styles.modalHint}>
                      🔒 Este ticket está escalado — da seguimiento desde Notas Públicas/Internas en "Ver ticket completo", no desde aquí.
                    </p>
                  </div>
                ) : !canManageSelected ? (
                  <div className={styles.messengerReplyBox}>
                    <p className={styles.modalHint}>
                      🔒 Asignado a {selectedTicket.assignedTo.name} — solo esa persona (o el Gerente de Sistemas) puede responder. Aquí solo puedes leer.
                    </p>
                  </div>
                ) : (
                  <div className={styles.messengerReplyBox}>
                    {replyFile && (
                      <div className={styles.replyFileChip}>
                        {replyFilePreview && <img src={replyFilePreview} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, marginRight: '0.4rem' }} />}
                        {replyFile.name}
                        <button type="button" onClick={() => setReplyFile(null)} aria-label="Quitar imagen">✕</button>
                      </div>
                    )}
                    <div className={styles.messengerReplyRow}>
                      <textarea
                        className={styles.input}
                        rows={1}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Escribe un mensaje... (Ctrl+V pega una imagen)"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleReply();
                          }
                        }}
                        onPaste={handleReplyPaste}
                      />
                      <label className={styles.btnLink} style={{ cursor: 'pointer' }}>
                        📷
                        <input type="file" accept="image/*" onChange={handleReplyFileChange} hidden />
                      </label>
                      <EmojiPicker onSelect={(e) => setReplyText((t) => t + e)} />
                      <button
                        type="button"
                        className={styles.btnPrimary}
                        onClick={handleReply}
                        disabled={sendingReply || (!replyText.trim() && !replyFile)}
                      >
                        {sendingReply ? '...' : 'Enviar'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
