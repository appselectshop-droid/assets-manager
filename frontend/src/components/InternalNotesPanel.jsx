import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { GERENTE_SISTEMAS_EMAIL } from '../pages/ticketShared';
import { imageFileFromClipboard } from '../utils/clipboardImage';
import MessageAttachmentImage from './MessageAttachmentImage';
import styles from '../pages/Tickets.module.css';

// Notas internas (bitácora técnica de un ticket, solo la ve Sistemas) —
// extraído de TicketDetailModal.jsx (2026-07-24) para poder reutilizarlo
// también en un modal ligero "solo notas" (ver TicketNotesModal.jsx +
// TicketsNotasInternas.jsx): pedido explícito del usuario — al buscar el
// procedimiento seguido en un ticket pasado, lo que importa es leer/agregar
// notas, no administrar el ticket completo (estatus, asignación, SLA).
//
// `kind` (2026-08-03) — agregado para las notas PÚBLICAS de seguimiento con
// un proveedor externo (ej. escalamiento a Proveedor): mismo componente,
// mismo molde de datos (texto + adjunto), solo cambia el campo/endpoint y
// los textos — en vez de duplicar todo este componente para una segunda
// bitácora casi idéntica.
const KIND_CONFIG = {
  internal: {
    field: 'internalNotes', path: 'internal-notes',
    lockedMessage: '🔒 Ticket cerrado — las notas internas quedan como solo lectura.',
    placeholder: 'Ej. Se reinstaló el driver de la impresora, se probó imprimiendo desde Word... (Ctrl+V pega una imagen)',
    addLabel: 'Agregar nota interna',
  },
  public: {
    field: 'publicNotes', path: 'public-notes',
    lockedMessage: '🔒 Ticket cerrado — las notas públicas quedan como solo lectura.',
    placeholder: 'Ej. Seguimos en espera de que el proveedor consiga la refacción... (el empleado sí ve esto, Ctrl+V pega una imagen)',
    addLabel: 'Agregar nota pública',
  },
};

export default function InternalNotesPanel({ ticket, currentUser, kind = 'internal' }) {
  const cfg = KIND_CONFIG[kind];
  const [liveInternalNotes, setLiveInternalNotes] = useState(ticket[cfg.field] || []);
  const [internalNoteText, setInternalNoteText] = useState('');
  const [noteFile, setNoteFile] = useState(null);
  const [savingInternalNote, setSavingInternalNote] = useState(false);
  const [error, setError] = useState('');
  // Miniatura de la imagen antes de enviarla (2026-08-07, pedido explícito
  // del usuario) — antes solo se veía el nombre del archivo.
  const [noteFilePreview, setNoteFilePreview] = useState('');
  useEffect(() => {
    if (!noteFile) { setNoteFilePreview(''); return; }
    const url = URL.createObjectURL(noteFile);
    setNoteFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [noteFile]);
  // Estilo WhatsApp — pedido explícito del usuario (2026-08-04): al abrir
  // esta bitácora (o al llegar una nota nueva) debe verse la última, no
  // quedarse arriba en la más vieja.
  const messagesEndRef = useRef(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [liveInternalNotes]);

  const notesLocked = ticket.status === 'cerrado';
  // Mismo criterio que canManage en TicketDetailModal.jsx.
  const canManage = currentUser.role === 'admin'
    || currentUser.email === GERENTE_SISTEMAS_EMAIL
    || !ticket.assignedTo
    || ticket.assignedTo._id === currentUser.id;

  const applyNoteFile = (f) => {
    if (!f) return;
    if (f.size > 80 * 1024 * 1024) { setError('El archivo no puede pesar más de 80MB.'); return; }
    setNoteFile(f);
  };
  const handleNoteFileChange = (e) => {
    const f = e.target.files[0];
    if (f && f.size > 80 * 1024 * 1024) {
      setError('El archivo no puede pesar más de 80MB.');
      e.target.value = '';
      return;
    }
    setNoteFile(f || null);
  };
  const handleNotePaste = (e) => {
    const f = imageFileFromClipboard(e);
    if (f) applyNoteFile(f);
  };

  const handleAddInternalNote = async () => {
    if (!internalNoteText.trim() && !noteFile) return;
    setSavingInternalNote(true);
    setError('');
    try {
      let data;
      if (noteFile) {
        const form = new FormData();
        form.append('text', internalNoteText.trim());
        form.append('attachment', noteFile);
        // Timeout más largo que el default de la instancia (90s, ver
        // services/api.js) — un video de hasta 80MB en una conexión lenta
        // puede tardar varios minutos.
        ({ data } = await api.post(`/tickets/${ticket._id}/${cfg.path}`, form, { timeout: 600000 }));
      } else {
        ({ data } = await api.post(`/tickets/${ticket._id}/${cfg.path}`, { text: internalNoteText.trim() }));
      }
      setLiveInternalNotes(data[cfg.field] || []);
      setInternalNoteText('');
      setNoteFile(null);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo agregar la nota');
    } finally {
      setSavingInternalNote(false);
    }
  };

  return (
    <>
      {error && <p className={styles.formError}>{error}</p>}
      {liveInternalNotes.length > 0 && (
        <div className={styles.convThread}>
          {liveInternalNotes.map((n, i) => (
            <div key={n._id || i} className={styles.bubbleItem}>
              <p className={styles.bubbleAuthor}>{n.authorName}</p>
              <div className={`${styles.bubbleText} ${styles.bubblePrivate}`}>
                {n.text}
                {n.attachmentMimeType && (
                  <div className={styles.bubbleAttachment}>
                    <MessageAttachmentImage
                      api={api}
                      url={`/tickets/${ticket._id}/${cfg.path}/${n._id}/attachment`}
                      mimeType={n.attachmentMimeType}
                      fileName={n.attachmentFileName}
                    />
                  </div>
                )}
              </div>
              <p className={styles.bubbleMeta}>
                {new Date(n.createdAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}
      {notesLocked ? (
        <p className={styles.modalHint} style={{ marginTop: liveInternalNotes.length > 0 ? '0.6rem' : 0 }}>
          {cfg.lockedMessage}
        </p>
      ) : (
        <>
          <textarea
            className={styles.input}
            rows={2}
            value={internalNoteText}
            onChange={(e) => setInternalNoteText(e.target.value)}
            onPaste={handleNotePaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAddInternalNote();
              }
            }}
            placeholder={cfg.placeholder}
            disabled={!canManage}
            style={{ marginTop: liveInternalNotes.length > 0 ? '0.6rem' : 0 }}
          />
          {noteFile && (
            <div className={styles.replyFileChip}>
              {noteFile.type.startsWith('image/') && noteFilePreview
                ? <img src={noteFilePreview} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, marginRight: '0.4rem' }} />
                : '🎥 '}
              {noteFile.name}
              <button type="button" onClick={() => setNoteFile(null)} aria-label="Quitar archivo">✕</button>
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center' }}>
            <button
              type="button"
              className={styles.btnCancel}
              onClick={handleAddInternalNote}
              disabled={savingInternalNote || !canManage || (!internalNoteText.trim() && !noteFile)}
            >
              {savingInternalNote ? (noteFile ? 'Subiendo...' : 'Guardando...') : cfg.addLabel}
            </button>
            <label className={styles.btnLink} style={{ cursor: canManage ? 'pointer' : 'not-allowed' }}>
              📷🎥 Adjuntar imagen o video
              <input type="file" accept="image/*,video/*" onChange={handleNoteFileChange} hidden disabled={!canManage} />
            </label>
          </div>
        </>
      )}
    </>
  );
}
