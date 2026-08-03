import { useEffect, useState } from 'react';
import styles from './AccountRequestChatModal.module.css';

// Chat de una Solicitud de Cuenta (Gmail/Plataformas/ERP) en "esperando
// activación" — pedido explícito del usuario (2026-08-03): al aprobar, la
// cuenta ya se crea, pero a veces falta coordinar con el empleado (ej.
// pedirle su AnyDesk para terminar de configurar algo en su equipo). Se
// usa tanto en el panel admin (AccountRequests.jsx, con `api` + POST
// /:id/reply) como en el portal de empleado (MisSolicitudes.jsx, con
// `employeeApi` + POST /:id/messages) — `role` decide cuál.
export default function AccountRequestChatModal({ request, role, api, onClose, onUpdated }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState(request.messages || []);
  const [status, setStatus] = useState(request.status);

  const isAdmin = role === 'admin';
  const sendUrl = isAdmin
    ? `/account-requests/${request._id}/reply`
    : `/account-requests/${request._id}/messages`;
  const fetchUrl = isAdmin
    ? `/account-requests/${request._id}`
    : `/account-requests/${request._id}/mine`;

  // Auto-refresco cada 5s mientras el chat está abierto — pedido explícito
  // del usuario (2026-08-03): este chat se quedaba "muerto" sin refrescar
  // solo, a diferencia del chat de Tickets que ya hace lo mismo (ver
  // TicketDetailModal.jsx).
  useEffect(() => {
    const interval = setInterval(() => {
      api.get(fetchUrl)
        .then(({ data }) => {
          setMessages(data.messages || []);
          setStatus(data.status);
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchUrl]);

  const handleSend = async () => {
    if (!text.trim()) return;
    setSending(true);
    setError('');
    try {
      const { data } = await api.post(sendUrl, { text: text.trim() });
      setMessages(data.messages || []);
      setText('');
      onUpdated?.(data);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo enviar el mensaje');
    } finally {
      setSending(false);
    }
  };

  // Solo el admin puede cerrar el ciclo — pedido explícito del usuario
  // (2026-08-03): faltaba una forma de dar por terminada la coordinación
  // (ej. ya se instaló con el AnyDesk) y dejar la solicitud como aprobada.
  const handleFinish = async () => {
    setFinishing(true);
    setError('');
    try {
      const { data } = await api.put(`/account-requests/${request._id}/finish`);
      setStatus(data.status);
      onUpdated?.(data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo finalizar la solicitud');
    } finally {
      setFinishing(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <p className={styles.headerTitle}>{request.employeeName}</p>
            <p className={styles.headerSubtitle}>
              {request.fileName || 'Solicitud de cuenta'} · {status === 'esperando_activacion' ? 'Esperando activación' : 'Aprobada'}
            </p>
          </div>
          <div className={styles.headerActions}>
            {isAdmin && status === 'esperando_activacion' && (
              <button type="button" className={styles.finishBtn} onClick={handleFinish} disabled={finishing}>
                {finishing ? 'Finalizando...' : '✅ Finalizar'}
              </button>
            )}
            <button type="button" className={styles.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        <div className={styles.thread}>
          {messages.length === 0 ? (
            <p className={styles.empty}>Sin mensajes todavía — escribe el primero abajo.</p>
          ) : (
            messages.map((m, i) => {
              // "Mío" es relativo a quién está viendo el chat: para el admin,
              // sus propios mensajes ('admin') van a la derecha; para el
              // empleado, los suyos ('employee').
              const isMine = isAdmin ? m.from === 'admin' : m.from === 'employee';
              return (
                <div key={m._id || i} className={`${styles.bubbleRow} ${isMine ? styles.bubbleRowRight : ''}`}>
                  <p className={styles.bubbleAuthor}>{m.authorName}</p>
                  <div className={`${styles.bubble} ${isMine ? styles.bubbleMine : styles.bubbleTheirs}`}>{m.text}</div>
                  <p className={styles.bubbleMeta}>
                    {new Date(m.createdAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              );
            })
          )}
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.composer}>
          <textarea
            className={styles.input}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isAdmin ? 'Escribe un mensaje para quien solicitó...' : 'Ej. Mi AnyDesk es 123 456 789'}
          />
          <button type="button" className={styles.sendBtn} onClick={handleSend} disabled={sending || !text.trim()}>
            {sending ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
