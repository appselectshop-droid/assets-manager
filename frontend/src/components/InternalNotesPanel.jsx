import { useState } from 'react';
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
export default function InternalNotesPanel({ ticket, currentUser }) {
  const [liveInternalNotes, setLiveInternalNotes] = useState(ticket.internalNotes || []);
  const [internalNoteText, setInternalNoteText] = useState('');
  const [noteFile, setNoteFile] = useState(null);
  const [savingInternalNote, setSavingInternalNote] = useState(false);
  const [error, setError] = useState('');

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
        ({ data } = await api.post(`/tickets/${ticket._id}/internal-notes`, form, { timeout: 600000 }));
      } else {
        ({ data } = await api.post(`/tickets/${ticket._id}/internal-notes`, { text: internalNoteText.trim() }));
      }
      setLiveInternalNotes(data.internalNotes || []);
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
                      url={`/tickets/${ticket._id}/internal-notes/${n._id}/attachment`}
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
        </div>
      )}
      {notesLocked ? (
        <p className={styles.modalHint} style={{ marginTop: liveInternalNotes.length > 0 ? '0.6rem' : 0 }}>
          🔒 Ticket cerrado — las notas internas quedan como solo lectura.
        </p>
      ) : (
        <>
          <textarea
            className={styles.input}
            rows={2}
            value={internalNoteText}
            onChange={(e) => setInternalNoteText(e.target.value)}
            onPaste={handleNotePaste}
            placeholder="Ej. Se reinstaló el driver de la impresora, se probó imprimiendo desde Word... (Ctrl+V pega una imagen)"
            disabled={!canManage}
            style={{ marginTop: liveInternalNotes.length > 0 ? '0.6rem' : 0 }}
          />
          {noteFile && (
            <div className={styles.replyFileChip}>
              📎 {noteFile.name}
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
              {savingInternalNote ? (noteFile ? 'Subiendo...' : 'Guardando...') : 'Agregar nota interna'}
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
