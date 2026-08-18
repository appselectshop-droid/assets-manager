import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import EmojiPicker from './EmojiPicker';
import MessageAttachmentImage from './MessageAttachmentImage';
import { imageFileFromClipboard } from '../utils/clipboardImage';
import styles from '../pages/Tickets.module.css';

// Conversación de ida y vuelta con quien reportó (POST /:id/reply, DELETE
// /:id/messages/:messageId) — extraído de TicketDetailModal.jsx (2026-08-18,
// pedido de BI: "el chat con el usuario estilo ticket se deje en las
// tarjetas del kanban") para reutilizarlo en BiRequestDetailModal.jsx SIN
// duplicar ~150 líneas de estado/efectos de scroll/adjuntos, mismo criterio
// que ya se usó con InternalNotesPanel.jsx el 2026-07-24.
//
// A propósito NO se tocó TicketDetailModal.jsx para usar este mismo
// componente — ese modal ya tiene mucho estado entrelazado (SLA,
// escalamiento, prioridad) alrededor de su chat, y el pedido de hoy es
// solo para BI, no para arriesgar una regresión en el módulo general de
// Tickets que todo el equipo de Sistemas usa a diario.
export default function TicketChatPanel({ ticket, canManage, disabled, disabledMessage, onUpdated }) {
  const [liveMessages, setLiveMessages] = useState(ticket.messages || []);
  const [replyText, setReplyText] = useState('');
  const [replyFile, setReplyFile] = useState(null);
  const [replyFilePreview, setReplyFilePreview] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState(null);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  // El ticket que llega por props puede refrescarse desde el padre (ej. tras
  // cambiar de etapa) — se resincroniza el hilo si trae mensajes que este
  // componente no tenía (evita que el hilo se quede congelado en lo viejo).
  useEffect(() => {
    setLiveMessages(ticket.messages || []);
  }, [ticket._id, ticket.messages?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!replyFile) { setReplyFilePreview(''); return; }
    const url = URL.createObjectURL(replyFile);
    setReplyFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [replyFile]);

  // Estilo WhatsApp — mismo criterio que TicketDetailModal.jsx/TicketsChats.jsx.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [liveMessages.length]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
      if (nearBottom) messagesEndRef.current?.scrollIntoView({ block: 'end' });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const applyReplyFile = (f) => {
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { setError('La imagen no puede pesar más de 15MB.'); return; }
    setReplyFile(f);
  };
  const handleReplyFileChange = (e) => {
    const f = e.target.files[0];
    if (f && f.size > 15 * 1024 * 1024) {
      setError('La imagen no puede pesar más de 15MB.');
      e.target.value = '';
      return;
    }
    setReplyFile(f || null);
  };
  const handleReplyPaste = (e) => {
    const f = imageFileFromClipboard(e);
    if (f) applyReplyFile(f);
  };

  const handleReply = async () => {
    if (!replyText.trim() && !replyFile) return;
    setSendingReply(true);
    setError('');
    try {
      let data;
      if (replyFile) {
        const form = new FormData();
        form.append('text', replyText.trim());
        form.append('attachment', replyFile);
        ({ data } = await api.post(`/tickets/${ticket._id}/reply`, form));
      } else {
        ({ data } = await api.post(`/tickets/${ticket._id}/reply`, { text: replyText.trim() }));
      }
      setLiveMessages(data.messages || []);
      setReplyText('');
      setReplyFile(null);
      onUpdated?.(data);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo enviar la respuesta');
    } finally {
      setSendingReply(false);
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (!window.confirm('¿Eliminar este mensaje? No se puede deshacer.')) return;
    setDeletingMessageId(messageId);
    setError('');
    try {
      const { data } = await api.delete(`/tickets/${ticket._id}/messages/${messageId}`);
      setLiveMessages(data.messages || []);
      onUpdated?.(data);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo eliminar el mensaje');
    } finally {
      setDeletingMessageId(null);
    }
  };

  return (
    <div className={styles.field}>
      {error && <p className={styles.formError}>{error}</p>}

      {liveMessages.length > 0 && (
        <div className={`${styles.convThread} ${styles.convThreadTall}`} ref={messagesContainerRef}>
          {liveMessages.map((m, i) => {
            const fromAdmin = m.from === 'admin';
            const canDeleteMessage = fromAdmin && !m.deleted && canManage;
            return (
              <div key={m._id || i} className={`${styles.bubbleItem} ${fromAdmin ? styles.bubbleItemRight : ''}`}>
                <p className={styles.bubbleAuthor}>{fromAdmin ? m.authorName : ticket.employeeName}</p>
                <div className={`${styles.bubbleText} ${fromAdmin ? styles.bubbleTheirs : styles.bubbleMine}`}>
                  {m.deleted ? <em>🗑️ Mensaje eliminado</em> : (
                    <>
                      {m.text}
                      {m.attachmentMimeType && (
                        <div className={styles.bubbleAttachment}>
                          <MessageAttachmentImage
                            api={api}
                            url={`/tickets/${ticket._id}/messages/${m._id}/attachment`}
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
          })}
          <div ref={messagesEndRef} />
        </div>
      )}

      {disabled ? (
        <p className={styles.modalHint} style={{ marginTop: liveMessages.length > 0 ? '0.5rem' : 0 }}>{disabledMessage}</p>
      ) : (
        <div style={{ marginTop: liveMessages.length > 0 ? '0.75rem' : 0 }}>
          <textarea
            className={styles.input}
            rows={4}
            style={{ resize: 'vertical' }}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onPaste={handleReplyPaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleReply();
              }
            }}
            placeholder="Escribe un mensaje para quien reportó... (Ctrl+V pega una imagen)"
            disabled={!canManage}
          />
          {replyFile && (
            <div className={styles.replyFileChip}>
              {replyFilePreview && <img src={replyFilePreview} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, marginRight: '0.4rem' }} />}
              {replyFile.name}
              <button type="button" onClick={() => setReplyFile(null)} aria-label="Quitar imagen">✕</button>
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center' }}>
            <button
              type="button"
              className={styles.btnCancel}
              onClick={handleReply}
              disabled={sendingReply || !canManage || (!replyText.trim() && !replyFile)}
            >
              {sendingReply ? 'Enviando...' : 'Enviar respuesta'}
            </button>
            <label className={styles.btnLink} style={{ cursor: canManage ? 'pointer' : 'not-allowed' }}>
              📷 Adjuntar imagen
              <input type="file" accept="image/*" onChange={handleReplyFileChange} hidden disabled={!canManage} />
            </label>
            {canManage && <EmojiPicker onSelect={(e) => setReplyText((t) => t + e)} />}
          </div>
        </div>
      )}
    </div>
  );
}
