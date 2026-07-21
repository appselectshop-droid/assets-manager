import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import MessageAttachmentImage from '../components/MessageAttachmentImage';
import { useTicketsContext } from './TicketsLayout';
import { TICKET_TYPE_CONFIG, timeAgo } from './ticketShared';
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

  const conversations = useMemo(() => {
    const withMessages = tickets.filter((t) => (t.messages || []).length > 0);
    const scoped = scope === 'mios' ? withMessages.filter((t) => t.assignedTo?._id === currentUser.id) : withMessages;
    return scoped
      .map((t) => {
        const lastMessage = t.messages[t.messages.length - 1];
        return { ticket: t, lastMessage, unread: lastMessage.from === 'employee' };
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

  const handleReplyFileChange = (e) => {
    const f = e.target.files[0];
    if (f && f.size > 15 * 1024 * 1024) {
      setError('La imagen no puede pesar más de 15MB.');
      e.target.value = '';
      return;
    }
    setReplyFile(f || null);
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

  const selectedTc = selectedTicket ? (TICKET_TYPE_CONFIG[selectedTicket.ticketType] || { label: selectedTicket.ticketType, icon: '❓' }) : null;

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

                <div className={styles.messengerMessages}>
                  {liveMessages.length === 0 ? (
                    <p className={styles.empty}>Sin mensajes todavía</p>
                  ) : (
                    liveMessages.map((m, i) => {
                      const fromAdmin = m.from === 'admin';
                      return (
                        <div key={m._id || i} className={`${styles.bubbleItem} ${fromAdmin ? styles.bubbleItemRight : ''}`}>
                          <p className={styles.bubbleAuthor}>{fromAdmin ? m.authorName : selectedTicket.employeeName}</p>
                          <div className={`${styles.bubbleText} ${fromAdmin ? styles.bubbleTheirs : styles.bubbleMine}`}>
                            {m.text}
                            {m.attachmentMimeType && (
                              <div className={styles.bubbleAttachment}>
                                <MessageAttachmentImage
                                  api={api}
                                  ticketId={selectedTicket._id}
                                  messageId={m._id}
                                  mimeType={m.attachmentMimeType}
                                  fileName={m.attachmentFileName}
                                />
                              </div>
                            )}
                          </div>
                          <p className={styles.bubbleMeta}>
                            {new Date(m.createdAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>

                {error && <p className={styles.formError}>{error}</p>}

                <div className={styles.messengerReplyBox}>
                  {replyFile && (
                    <div className={styles.replyFileChip}>
                      📎 {replyFile.name}
                      <button type="button" onClick={() => setReplyFile(null)} aria-label="Quitar imagen">✕</button>
                    </div>
                  )}
                  <div className={styles.messengerReplyRow}>
                    <textarea
                      className={styles.input}
                      rows={1}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Escribe un mensaje..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleReply();
                        }
                      }}
                    />
                    <label className={styles.btnLink} style={{ cursor: 'pointer' }}>
                      📷
                      <input type="file" accept="image/*" onChange={handleReplyFileChange} hidden />
                    </label>
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
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
