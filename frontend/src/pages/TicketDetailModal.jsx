import { useEffect, useState } from 'react';
import api from '../services/api';
import MessageAttachmentImage from '../components/MessageAttachmentImage';
import {
  GERENTE_SISTEMAS_EMAIL, TICKET_TYPE_CONFIG, STATUS_CONFIG,
  PRIORITY_ORDER, PRIORITY_CONFIG, SLA_CATALOG, SLA_LEVEL_CONFIG,
  assetsLabel, daysOpen, isOverdue,
} from './ticketShared';
import styles from './Tickets.module.css';

// Extraído tal cual de la vieja Tickets.jsx monolítica — se abre desde
// cualquier sub-página del módulo (Tablero, Mis Tickets, Chats, Notas
// internas, Buscador), todas comparten este mismo modal en vez de tener
// cada una su propia copia.
export default function TicketDetailModal({ ticket, currentUser, users, resolutionOptions, canDelete, onDelete, onClose, onDone, onSilentUpdate }) {
  const [assignedTo, setAssignedTo] = useState(ticket.assignedTo?._id || '');
  const [assigning, setAssigning] = useState(false);
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [resolution, setResolution] = useState('');
  const [otherResolution, setOtherResolution] = useState('');
  const [addToCatalog, setAddToCatalog] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [openingAttachment, setOpeningAttachment] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyFile, setReplyFile] = useState(null);
  const [sendingReply, setSendingReply] = useState(false);
  // Estado propio para el hilo — así el mensaje nuevo aparece de inmediato
  // sin tener que cerrar el modal (onDone cierra y recarga la lista, lo cual
  // cortaría la conversación a media respuesta).
  const [liveMessages, setLiveMessages] = useState(ticket.messages || []);
  // Notas internas (bitácora técnica) — solo las ve el equipo de Sistemas,
  // nunca quien reportó. Separado de liveMessages a propósito.
  const [liveInternalNotes, setLiveInternalNotes] = useState(ticket.internalNotes || []);
  const [internalNoteText, setInternalNoteText] = useState('');
  const [savingInternalNote, setSavingInternalNote] = useState(false);
  // Igual que liveMessages: la prioridad se puede cambiar en cualquier
  // estatus (no solo abierto/en_proceso), así que se guarda aparte para
  // reflejarse al toque sin cerrar el modal.
  const [livePriority, setLivePriority] = useState(ticket.priority || 'media');
  const [savingPriority, setSavingPriority] = useState(false);
  // Categoría de Falla (SLA) — igual que livePriority, se puede cambiar en
  // cualquier estatus. Al elegirla, el backend ya regresa priority/slaLevel
  // actualizados en la misma respuesta (ver PUT /:id/sla-category).
  const [liveSlaCategory, setLiveSlaCategory] = useState(ticket.slaCategory || '');
  const [liveSlaLevel, setLiveSlaLevel] = useState(ticket.slaLevel || null);
  const [liveResolutionDueAt, setLiveResolutionDueAt] = useState(ticket.resolutionDueAt || null);
  const [savingSla, setSavingSla] = useState(false);
  // Escalamiento — pedido explícito del usuario: marcar tickets que se
  // salen del alcance del área (garantía con fabricante, proveedor externo,
  // otra área) para que tengan su propia bandeja (ver TicketsEscalamiento).
  const [liveEscalated, setLiveEscalated] = useState(ticket.escalated || false);
  const [escalationReason, setEscalationReason] = useState(ticket.escalationReason || '');
  const [savingEscalation, setSavingEscalation] = useState(false);

  const tc = TICKET_TYPE_CONFIG[ticket.ticketType] || { label: ticket.ticketType, icon: '❓' };
  const sc = STATUS_CONFIG[ticket.status];
  const asset = assetsLabel(ticket.assetRefs);
  const overdue = isOverdue(ticket);
  // Todos son admin, pero un ticket ya asignado sigue siendo "de quien lo
  // atiende" — pedido explícito: sin asignar, cualquiera puede tomarlo; ya
  // asignado, solo esa persona (o el Gerente de Sistemas) puede modificarlo.
  const canManage = currentUser.email === GERENTE_SISTEMAS_EMAIL
    || !ticket.assignedTo
    || ticket.assignedTo._id === currentUser.id;
  // Notas internas: se pueden agregar mientras el ticket sigue abierto (en
  // cualquier estatus previo a "cerrado"); una vez cerrado quedan como
  // bitácora de solo lectura, igual que pidió el usuario.
  const notesLocked = ticket.status === 'cerrado';

  // Mientras el modal está abierto, refresca la conversación cada 5s — así
  // un mensaje nuevo del empleado se ve "en vivo" sin cerrar y reabrir el
  // ticket (ver POST /tickets/mine/:id/messages en employeeAuth, y el mismo
  // patrón del lado del empleado en MisTickets.jsx).
  useEffect(() => {
    const interval = setInterval(() => {
      api.get(`/tickets/${ticket._id}`)
        .then(({ data }) => setLiveMessages(data.messages || []))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [ticket._id]);

  // No es un <a href> directo porque la ruta pide sesión (Bearer token) —
  // hay que pedirla con axios (que sí manda el header) y abrir el blob.
  const openAttachment = async () => {
    setOpeningAttachment(true);
    try {
      const resp = await api.get(`/tickets/${ticket._id}/attachment`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([resp.data], { type: resp.headers['content-type'] }));
      window.open(url, '_blank');
    } catch (err) {
      setError('No se pudo abrir la evidencia');
    } finally {
      setOpeningAttachment(false);
    }
  };

  const handleAssign = async (userId) => {
    const user = users.find((u) => u._id === userId);
    setAssigning(true);
    try {
      await api.put(`/tickets/${ticket._id}/assign`, { userId: userId || null, userName: user?.name || '' });
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo asignar el ticket');
    } finally {
      setAssigning(false);
    }
  };

  const handleStatusChange = async (status, extra = {}) => {
    setSaving(true);
    setError('');
    try {
      await api.put(`/tickets/${ticket._id}/status`, { status, ...extra });
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo actualizar el ticket');
      setSaving(false);
    }
  };

  const handlePriorityChange = async (newPriority) => {
    setLivePriority(newPriority);
    setSavingPriority(true);
    setError('');
    try {
      await api.put(`/tickets/${ticket._id}/priority`, { priority: newPriority });
      onSilentUpdate?.();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo cambiar la prioridad');
      setLivePriority(ticket.priority || 'media');
    } finally {
      setSavingPriority(false);
    }
  };

  const handleSlaCategoryChange = async (newCategory) => {
    setLiveSlaCategory(newCategory);
    setSavingSla(true);
    setError('');
    try {
      const { data } = await api.put(`/tickets/${ticket._id}/sla-category`, { slaCategory: newCategory || null });
      setLiveSlaLevel(data.slaLevel);
      setLiveResolutionDueAt(data.resolutionDueAt);
      setLivePriority(data.priority); // la categoría también fija la prioridad sola
      onSilentUpdate?.();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo cambiar la categoría de falla');
      setLiveSlaCategory(ticket.slaCategory || '');
    } finally {
      setSavingSla(false);
    }
  };

  const handleEscalate = async () => {
    const nextEscalated = !liveEscalated;
    setSavingEscalation(true);
    setError('');
    try {
      const { data } = await api.put(`/tickets/${ticket._id}/escalate`, { escalated: nextEscalated, reason: escalationReason });
      setLiveEscalated(data.escalated);
      setEscalationReason(data.escalationReason || '');
      onSilentUpdate?.();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo actualizar el escalamiento');
    } finally {
      setSavingEscalation(false);
    }
  };

  // Responder no marca el ticket como resuelto — es la conversación libre de
  // ida y vuelta mientras se trabaja (ver backend/src/routes/tickets.js,
  // POST /:id/reply). "Marcar resuelto" sigue siendo un paso aparte, con su
  // catálogo de resoluciones.
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
      onSilentUpdate?.(); // refresca el tablero de fondo (ej. abierto → en proceso), sin cerrar este modal
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo enviar la respuesta');
    } finally {
      setSendingReply(false);
    }
  };

  const handleAddInternalNote = async () => {
    if (!internalNoteText.trim()) return;
    setSavingInternalNote(true);
    setError('');
    try {
      const { data } = await api.post(`/tickets/${ticket._id}/internal-notes`, { text: internalNoteText.trim() });
      setLiveInternalNotes(data.internalNotes || []);
      setInternalNoteText('');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo agregar la nota');
    } finally {
      setSavingInternalNote(false);
    }
  };

  const handleResolve = () => {
    const finalResolution = resolution === 'Otro (especifica)' ? otherResolution.trim() : resolution;
    if (!finalResolution) { setError('Selecciona o especifica cómo se resolvió.'); return; }
    handleStatusChange('resuelto', {
      resolution: finalResolution,
      resolutionNotes,
      addToCatalog: resolution === 'Otro (especifica)' && addToCatalog,
    });
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>{tc.icon}</span>
          <h2 className={styles.modalTitle}>{ticket.folio}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          {error && <p className={styles.formError}>{error}</p>}
          {!canManage && (
            <p className={styles.modalHint}>🔒 Asignado a {ticket.assignedTo.name} — solo esa persona (o el Gerente de Sistemas) puede modificarlo.</p>
          )}

          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span className={styles.statusBadge} style={{ color: sc.color, background: sc.bg }}>{sc.label}</span>
            {overdue && <span className={styles.statusBadge} style={{ color: '#dc2626', background: '#fef2f2' }}>⚠️ Vencido</span>}
            {ticket.blocksWork && <span className={styles.statusBadge} style={{ color: '#b91c1c', background: '#fef2f2' }}>Impide trabajar</span>}
          </div>

          <div className={styles.field}>
            <label>Prioridad</label>
            <select
              className={styles.input}
              value={livePriority}
              onChange={(e) => handlePriorityChange(e.target.value)}
              disabled={savingPriority || !canManage}
              style={{ color: PRIORITY_CONFIG[livePriority].color, fontWeight: 700 }}
            >
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>{PRIORITY_CONFIG[p].icon} {PRIORITY_CONFIG[p].label}</option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label>Categoría de Falla (SLA)</label>
            <select
              className={styles.input}
              value={liveSlaCategory}
              onChange={(e) => handleSlaCategoryChange(e.target.value)}
              disabled={savingSla || !canManage}
            >
              <option value="">Sin clasificar</option>
              {SLA_CATALOG.map((row) => (
                <option key={row.category} value={row.category}>{row.category}</option>
              ))}
            </select>
            {liveSlaLevel && (
              <span className={styles.statusBadge} style={{ marginTop: '0.4rem', color: SLA_LEVEL_CONFIG[liveSlaLevel].color, background: SLA_LEVEL_CONFIG[liveSlaLevel].bg }}>
                {SLA_LEVEL_CONFIG[liveSlaLevel].icon} {SLA_LEVEL_CONFIG[liveSlaLevel].label}
              </span>
            )}
            {liveResolutionDueAt && (
              <span className={styles.modalHint} style={{ display: 'block', marginTop: '0.3rem' }}>
                Resolución límite: {new Date(liveResolutionDueAt).toLocaleString('es-MX')}
              </span>
            )}
          </div>

          <div className={`${styles.field} ${liveEscalated ? styles.escalationBox : ''}`}>
            <label>🚀 Escalamiento <span className={styles.modalHint}>(se sale del alcance del área)</span></label>
            {!liveEscalated ? (
              canManage && (
                <>
                  <textarea
                    className={styles.input}
                    rows={2}
                    value={escalationReason}
                    onChange={(e) => setEscalationReason(e.target.value)}
                    placeholder="Ej. Requiere garantía con el fabricante, soporte de un proveedor externo..."
                  />
                  <button
                    type="button"
                    className={styles.btnDanger}
                    onClick={handleEscalate}
                    disabled={savingEscalation}
                    style={{ marginTop: '0.5rem' }}
                  >
                    {savingEscalation ? 'Guardando...' : 'Marcar como escalado'}
                  </button>
                </>
              )
            ) : (
              <>
                {escalationReason && <p style={{ margin: 0 }}>{escalationReason}</p>}
                <p className={styles.modalHint}>Escalado por {ticket.escalatedByName || '—'}{ticket.escalatedAt ? ` — ${new Date(ticket.escalatedAt).toLocaleString('es-MX')}` : ''}</p>
                {canManage && (
                  <button type="button" className={styles.btnCancel} onClick={handleEscalate} disabled={savingEscalation} style={{ marginTop: '0.4rem' }}>
                    {savingEscalation ? 'Guardando...' : 'Quitar escalamiento'}
                  </button>
                )}
              </>
            )}
          </div>

          {ticket.satisfactionRating && (
            <p className={styles.modalHint}>
              🙂 Satisfacción del usuario: <strong>{ticket.satisfactionRating}</strong>
            </p>
          )}

          <p className={styles.modalHint}>
            Reportado por <strong>{ticket.employeeName}</strong> · {tc.label}{ticket.otherTypeDetail && `: ${ticket.otherTypeDetail}`}
          </p>
          {asset && <p className={styles.modalHint}>Equipo{ticket.assetRefs.length > 1 ? 's' : ''}: <strong>{asset}</strong></p>}
          {ticket.appRef && (
            <p className={`${styles.modalHint} ${styles.appHint}`}>
              🗂️ Aplicación: <strong>{ticket.appRef.name}</strong>
              {(ticket.appRef.responsibleName || ticket.appRef.responsibleArea) && (
                <> — enrutar a {[ticket.appRef.responsibleName, ticket.appRef.responsibleArea].filter(Boolean).join(' / ')}</>
              )}
            </p>
          )}
          <p className={styles.modalHint}>{daysOpen(ticket)} día{daysOpen(ticket) !== 1 ? 's' : ''} {ticket.resolvedAt ? 'para resolverse' : 'abierto'}</p>

          <div className={styles.field}>
            <label>Asunto</label>
            <p>{ticket.subject}</p>
          </div>
          {ticket.description && (
            <div className={styles.field}>
              <label>Descripción</label>
              <p style={{ whiteSpace: 'pre-wrap' }}>{ticket.description}</p>
            </div>
          )}
          {ticket.attachmentMimeType && (
            <div className={styles.field}>
              <label>Evidencia</label>
              <button type="button" className={styles.btnLink} onClick={openAttachment} disabled={openingAttachment}>
                {openingAttachment ? 'Abriendo...' : 'Ver adjunto ↗'}
              </button>
            </div>
          )}

          {liveMessages.length > 0 && (
            <div className={styles.field}>
              <label>Conversación</label>
              <div className={styles.convThread}>
                {liveMessages.map((m, i) => {
                  const fromAdmin = m.from === 'admin';
                  return (
                    <div key={m._id || i} className={`${styles.bubbleItem} ${fromAdmin ? styles.bubbleItemRight : ''}`}>
                      <p className={styles.bubbleAuthor}>{fromAdmin ? m.authorName : ticket.employeeName}</p>
                      <div className={`${styles.bubbleText} ${fromAdmin ? styles.bubbleTheirs : styles.bubbleMine}`}>
                        {m.text}
                        {m.attachmentMimeType && (
                          <div className={styles.bubbleAttachment}>
                            <MessageAttachmentImage
                              api={api}
                              ticketId={ticket._id}
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
                })}
              </div>
            </div>
          )}

          <div className={styles.field}>
            <label>Responder</label>
            <textarea
              className={styles.input}
              rows={2}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Escribe un mensaje para quien reportó..."
              disabled={!canManage}
            />
            {replyFile && (
              <div className={styles.replyFileChip}>
                📎 {replyFile.name}
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
            </div>
          </div>

          <div className={`${styles.field} ${styles.internalNotesBox}`}>
            <label>🔒 Notas internas <span className={styles.modalHint}>(solo equipo de Sistemas — quien reportó nunca ve esto)</span></label>
            {liveInternalNotes.length > 0 && (
              <div className={styles.convThread}>
                {liveInternalNotes.map((n, i) => (
                  <div key={n._id || i} className={styles.bubbleItem}>
                    <p className={styles.bubbleAuthor}>{n.authorName}</p>
                    <div className={`${styles.bubbleText} ${styles.bubblePrivate}`}>{n.text}</div>
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
                  placeholder="Ej. Se reinstaló el driver de la impresora, se probó imprimiendo desde Word..."
                  disabled={!canManage}
                  style={{ marginTop: liveInternalNotes.length > 0 ? '0.6rem' : 0 }}
                />
                <button
                  type="button"
                  className={styles.btnCancel}
                  onClick={handleAddInternalNote}
                  disabled={savingInternalNote || !canManage || !internalNoteText.trim()}
                  style={{ marginTop: '0.5rem' }}
                >
                  {savingInternalNote ? 'Guardando...' : 'Agregar nota interna'}
                </button>
              </>
            )}
          </div>

          {['abierto', 'en_proceso'].includes(ticket.status) && (
            <>
              <div className={styles.field}>
                <label>Asignado a</label>
                <select className={styles.input} value={assignedTo} onChange={(e) => { setAssignedTo(e.target.value); handleAssign(e.target.value); }} disabled={assigning || !canManage}>
                  <option value="">Sin asignar</option>
                  {users.map((u) => (
                    <option key={u._id} value={u._id}>{u.name}{u._id === currentUser.id ? ' (yo)' : ''}</option>
                  ))}
                </select>
                <button type="button" className={styles.btnLink} onClick={() => { setAssignedTo(currentUser.id); handleAssign(currentUser.id); }} disabled={assigning || !canManage}>
                  Asignarme
                </button>
              </div>

              {!showResolveForm ? (
                <div className={styles.modalActions} style={{ justifyContent: 'flex-start' }}>
                  <button type="button" className={styles.btnPrimary} onClick={() => setShowResolveForm(true)} disabled={!canManage}>Marcar resuelto</button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className={styles.field}>
                    <label>¿Cómo se resolvió? *</label>
                    <select className={styles.input} value={resolution} onChange={(e) => setResolution(e.target.value)}>
                      <option value="">Selecciona una opción...</option>
                      {resolutionOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                      <option value="Otro (especifica)">Otro (especifica)</option>
                    </select>
                  </div>
                  {resolution === 'Otro (especifica)' && (
                    <div className={styles.field}>
                      <label>Especifica *</label>
                      <input className={styles.input} value={otherResolution} onChange={(e) => setOtherResolution(e.target.value)} />
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 400, fontSize: '0.78rem', marginTop: '0.3rem' }}>
                        <input type="checkbox" checked={addToCatalog} onChange={(e) => setAddToCatalog(e.target.checked)} />
                        Agregar al catálogo de resoluciones
                      </label>
                    </div>
                  )}
                  <div className={styles.field}>
                    <label>Notas (opcional)</label>
                    <input className={styles.input} value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} />
                  </div>
                  <div className={styles.modalActions}>
                    <button type="button" className={styles.btnCancel} onClick={() => setShowResolveForm(false)}>Cancelar</button>
                    <button type="button" className={styles.btnPrimary} onClick={handleResolve} disabled={saving}>
                      {saving ? 'Guardando...' : 'Confirmar resolución'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {['resuelto', 'cerrado'].includes(ticket.status) && (
            <>
              <div className={styles.field}>
                <label>Resolución</label>
                <p>{ticket.resolution}</p>
                {ticket.resolutionNotes && <p className={styles.resolutionNote}>{ticket.resolutionNotes}</p>}
                <p className={styles.muted}>{ticket.resolvedByName} — {new Date(ticket.resolvedAt).toLocaleString('es-MX')}</p>
              </div>
              <div className={styles.modalActions} style={{ justifyContent: 'flex-start' }}>
                {ticket.status === 'resuelto' && (
                  <button type="button" className={styles.btnPrimary} onClick={() => handleStatusChange('cerrado')} disabled={saving || !canManage}>
                    Cerrar ticket
                  </button>
                )}
                <button type="button" className={styles.btnDanger} onClick={() => handleStatusChange('abierto')} disabled={saving || !canManage}>
                  Reabrir
                </button>
              </div>
            </>
          )}

          <div className={styles.modalActions}>
            {canDelete && canManage && <button type="button" className={styles.btnDanger} onClick={onDelete}>Eliminar</button>}
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
