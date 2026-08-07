import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import MessageAttachmentImage from '../components/MessageAttachmentImage';
import InternalNotesPanel from '../components/InternalNotesPanel';
import { imageFileFromClipboard } from '../utils/clipboardImage';
import {
  GERENTE_SISTEMAS_EMAIL, TICKET_TYPE_CONFIG, STATUS_CONFIG,
  PRIORITY_ORDER, PRIORITY_CONFIG, SLA_CATALOG, SLA_LEVEL_CONFIG,
  assetsLabel, daysOpen, isOverdue,
} from './ticketShared';
import { isErpOnlyUser, isBiOnlyUser } from '../components/Layout';
import styles from './Tickets.module.css';

// Extraído tal cual de la vieja Tickets.jsx monolítica — se abre desde
// cualquier sub-página del módulo (Tablero, Mis Tickets, Chats, Notas
// internas, Buscador), todas comparten este mismo modal en vez de tener
// cada una su propia copia.
export default function TicketDetailModal({ ticket, currentUser, users, resolutionOptions, onResolutionOptionsChange, canDelete, onDelete, onClose, onDone, onSilentUpdate }) {
  const [assignedTo, setAssignedTo] = useState(ticket.assignedTo?._id || '');
  const [assigning, setAssigning] = useState(false);
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [resolution, setResolution] = useState('');
  const [otherResolution, setOtherResolution] = useState('');
  const [addToCatalog, setAddToCatalog] = useState(false);
  // Pedido explícito del usuario (2026-07-28): el catálogo de "¿Cómo se
  // resolvió?" solo crecía, sin forma de quitar entradas de prueba/basura
  // (ej. "brrrr") — panel chiquito para borrarlas, no una página aparte.
  const [showManageCatalog, setShowManageCatalog] = useState(false);
  const [deletingOption, setDeletingOption] = useState('');
  const handleDeleteResolutionOption = async (label) => {
    if (!confirm(`¿Eliminar "${label}" del catálogo de resoluciones?`)) return;
    setDeletingOption(label);
    try {
      await api.delete(`/tickets/resolution-options/${encodeURIComponent(label)}`);
      onResolutionOptionsChange?.();
    } catch (err) {
      alert(err.response?.data?.message || 'No se pudo eliminar.');
    } finally {
      setDeletingOption('');
    }
  };
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [openingAttachment, setOpeningAttachment] = useState(false);
  const [openingBankProof, setOpeningBankProof] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyFile, setReplyFile] = useState(null);
  const [sendingReply, setSendingReply] = useState(false);
  // Quién quedó asignado — pedido explícito del usuario (2026-08-07): al
  // contestar (ver POST /:id/reply, que auto-asigna si no tenía dueño), el
  // modal no reflejaba el cambio sin cerrarlo y volver a abrirlo. El modal
  // no vuelve a pedir el ticket tras responder (solo `onSilentUpdate` en
  // segundo plano, que refresca la lista de fondo pero no este prop ya
  // montado), así que se guarda en vivo aquí y se usa en vez de
  // `ticket.assignedTo` en toda la UI de este modal.
  const [liveAssignedTo, setLiveAssignedTo] = useState(ticket.assignedTo || null);
  // Estado propio para el hilo — así el mensaje nuevo aparece de inmediato
  // sin tener que cerrar el modal (onDone cierra y recarga la lista, lo cual
  // cortaría la conversación a media respuesta).
  const [liveMessages, setLiveMessages] = useState(ticket.messages || []);
  // Estilo WhatsApp — pedido explícito del usuario (2026-08-04): al abrir el
  // ticket (o al llegar un mensaje nuevo) debe verse lo último enviado, no
  // quedarse arriba en los mensajes más viejos.
  //
  // Depende de `.length`, NO del array completo (2026-08-05) — el polling
  // de abajo llama `setLiveMessages(data.messages || [])` cada 5s, creando
  // un array nuevo aunque el contenido sea idéntico; con el array completo
  // como dependencia, este efecto disparaba cada 5s SIN que llegara nada
  // nuevo, forzando el scroll al fondo y peleándose con quien intentaba
  // hacer scroll hacia arriba para leer mensajes viejos — bug real
  // reportado por el usuario.
  const messagesEndRef = useRef(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [liveMessages.length]);
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
  // Escalamiento — pedido explícito y urgente del usuario (2026-08-03):
  // cadena fija por rol (ver getEscalationTargets en
  // backend/src/routes/tickets.js) — ya no un simple "sí/no", ahora hay
  // que elegir A QUIÉN O A QUÉ ÁREA se escala, de una lista de destinos
  // válidos que trae el propio backend (para no duplicar la regla aquí).
  const [liveEscalated, setLiveEscalated] = useState(ticket.escalated || false);
  const [escalationReason, setEscalationReason] = useState('');
  const [savingEscalation, setSavingEscalation] = useState(false);
  const [escalationTargets, setEscalationTargets] = useState([]);
  const [escalationTargetIdx, setEscalationTargetIdx] = useState('');
  // Escalamiento detrás de un botón (2026-08-05) — pedido explícito del
  // usuario: el formulario de escalar (select + textarea + botón Escalar)
  // se mostraba siempre expandido, arriba de la conversación — se
  // confundía con el chat real con quien reportó. Ahora empieza colapsado;
  // "🚀 Escalar" lo despliega.
  const [showEscalateForm, setShowEscalateForm] = useState(false);
  // Último recurso (2026-08-06): si ni la cadena interna (persona/área)
  // resuelve el caso, quien tenga el ticket asignado en este momento puede
  // dar UN salto más a Proveedor externo — pedido explícito del usuario,
  // a raíz de un caso real donde ERP escaló mal y, al ya no poder
  // desescalar, no tenía ninguna salida. Se sigue pidiendo el destino al
  // backend (getEscalationTargets) — solo aparece para quien de verdad
  // tenga "proveedor" disponible en su cadena (el tope, ej. Gerente de
  // Sistemas), igual que antes.
  const [showProviderEscalate, setShowProviderEscalate] = useState(false);

  useEffect(() => {
    // Se sigue pidiendo aunque ya esté escalado — se necesita para saber si
    // el último recurso (escalar a Proveedor) está disponible para quien
    // tiene el ticket asignado ahora.
    api.get(`/tickets/${ticket._id}/escalation-targets`)
      .then(({ data }) => setEscalationTargets(data))
      .catch(() => setEscalationTargets([]));
  }, [ticket._id]);

  const providerTarget = escalationTargets.find((t) => t.kind === 'proveedor');

  const handleEscalate = async () => {
    const target = escalationTargets[escalationTargetIdx];
    if (!target) { setError('Elige a quién o a qué área escalar'); return; }
    // Pedido explícito del usuario (2026-08-06): mínimo una confirmación
    // antes de escalar — ya no se puede desescalar/deshacer, así que un
    // clic accidental (como el caso real de ERP) quedaba sin salida.
    if (!confirm(`¿Seguro que quieres escalar este ticket a "${target.label}"? Ya no se podrá deshacer.`)) return;
    setSavingEscalation(true);
    setError('');
    try {
      await api.put(`/tickets/${ticket._id}/escalate`, {
        kind: target.kind,
        targetEmail: target.email,
        targetArea: target.area,
        reason: escalationReason,
      });
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo escalar el ticket');
    } finally {
      setSavingEscalation(false);
    }
  };

  const handleEscalateToProvider = async () => {
    if (!confirm('¿Seguro que quieres escalar este ticket a Proveedor externo? Es el último recurso — ya no se podrá modificar después.')) return;
    setSavingEscalation(true);
    setError('');
    try {
      await api.put(`/tickets/${ticket._id}/escalate`, {
        kind: 'proveedor',
        reason: escalationReason,
      });
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo escalar el ticket a Proveedor externo');
    } finally {
      setSavingEscalation(false);
    }
  };

  // Reasignar categoría — pedido explícito y urgente del usuario
  // (2026-07-27): un ticket mal clasificado se podía reasignar de persona,
  // prioridad o categoría SLA, pero no de TIPO. Se guarda aparte (como
  // livePriority) para reflejarse al toque sin cerrar el modal, y deja
  // rastro visible (originalTicketType/reassignedByName) para que el
  // empleado vea en Mis Tickets que se reclasificó — "quiero que el
  // usuario aprenda a reportar".
  const [liveTicketType, setLiveTicketType] = useState(ticket.ticketType);
  const [liveOtherTypeDetail, setLiveOtherTypeDetail] = useState(ticket.otherTypeDetail || '');
  const [liveOriginalTicketType, setLiveOriginalTicketType] = useState(ticket.originalTicketType || '');
  const [liveReassignedByName, setLiveReassignedByName] = useState(ticket.reassignedByName || '');
  const [showReassignForm, setShowReassignForm] = useState(false);
  const [reassignType, setReassignType] = useState('');
  const [reassignOtherDetail, setReassignOtherDetail] = useState('');
  const [reassigning, setReassigning] = useState(false);

  const REASSIGN_OPTIONS = Object.keys(TICKET_TYPE_CONFIG)
    .filter((k) => !['hardware', 'software', 'red'].includes(k) && k !== liveTicketType);

  const handleReassign = async () => {
    if (!reassignType) { setError('Elige la nueva categoría'); return; }
    if (reassignType === 'otro' && !reassignOtherDetail.trim()) { setError('Especifica de qué se trata'); return; }
    setReassigning(true);
    setError('');
    try {
      const { data } = await api.put(`/tickets/${ticket._id}/reassign-type`, {
        ticketType: reassignType,
        otherTypeDetail: reassignOtherDetail,
      });
      setLiveTicketType(data.ticketType);
      setLiveOtherTypeDetail(data.otherTypeDetail || '');
      setLiveOriginalTicketType(data.originalTicketType || '');
      setLiveReassignedByName(data.reassignedByName || '');
      setShowReassignForm(false);
      setReassignType('');
      setReassignOtherDetail('');
      onSilentUpdate?.();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo reasignar el ticket');
    } finally {
      setReassigning(false);
    }
  };

  const tc = TICKET_TYPE_CONFIG[liveTicketType] || { label: liveTicketType, icon: '❓' };
  const sc = STATUS_CONFIG[ticket.status];
  const asset = assetsLabel(ticket.assetRefs);
  const overdue = isOverdue(ticket);
  // Un ticket ya asignado sigue siendo "de quien lo atiende" — pedido
  // explícito: sin asignar, cualquiera con acceso a este ticket puede
  // tomarlo; ya asignado, solo esa persona (o un Administrador) puede
  // modificarlo.
  //
  // `role === 'admin'` se agregó tras un ticket real que quedó asignado a
  // un usuario ERP-only y atorado 13 días — GERENTE_SISTEMAS_EMAIL por sí
  // solo no rescata nada si esa cuenta nunca se dio de alta.
  //
  // Corrección explícita del usuario (2026-08-03): "sistemas no debería
  // estar en ERP y viceversa, el único que debe andar en todo es
  // gerente.sistemas" — un ticket ERP asignado a un analista no lo podía
  // tocar el otro analista/líder de ERP (sin el mismo privilegio de
  // "equipo" que ya tenía Sistemas vía role==='admin'), mientras que
  // cualquier admin de Sistemas SÍ podía entrar a un ticket ERP. Mismo
  // criterio exacto que canManageTicket() en backend/src/routes/tickets.js
  // — ver ahí para el detalle completo.
  const erpTicket = (ticket.escalatedToArea || ticket.ticketType) === 'erp';
  // Mismo hueco que erpTicket arriba — bug real reportado por el usuario
  // (2026-08-05): un ticket de Soporte BI nunca tenía este mismo trato
  // exclusivo, así que cualquier admin de Sistemas podía gestionarlo
  // (responder/asignar/escalar/editar), no solo BI. Mismo criterio exacto
  // que canManageTicket() en backend/src/routes/tickets.js.
  const biTicket = (ticket.escalatedToArea || ticket.ticketType) === 'soporte_bi';
  // canManageTickets (2026-08-04): mismo hueco que canManageTicket() en
  // backend/src/routes/tickets.js — becario.sistemas (role: 'viewer' +
  // canManageTickets, no 'admin') se quedaba con el modal entero
  // deshabilitado en cualquier ticket que no fuera suyo. Ver ahí para el
  // detalle completo.
  const canManage = currentUser.email === GERENTE_SISTEMAS_EMAIL
    || currentUser.canViewManagerDashboard
    || (erpTicket
      ? isErpOnlyUser(currentUser)
      : biTicket
        ? isBiOnlyUser(currentUser)
        : currentUser.role === 'admin' || currentUser.canManageTickets || !ticket.assignedTo || ticket.assignedTo._id === currentUser.id);
  const ticketResolved = ['resuelto', 'cerrado'].includes(ticket.status);
  // Escalado (2026-08-05, pedido explícito del usuario) — al escalar (a
  // una persona, otra área o proveedor) el chat directo con quien reportó
  // se congela; el seguimiento vive en Notas Internas/Públicas de aquí en
  // adelante. Mismo criterio que ya tiene el backend (POST /:id/reply).
  const chatBlocked = ticketResolved || liveEscalated;

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

  // Segundo adjunto de "Alta de Proveedores" — comprobante de datos
  // bancarios, aparte de la CSF (ver openAttachment de arriba).
  const openBankProof = async () => {
    setOpeningBankProof(true);
    try {
      const resp = await api.get(`/tickets/${ticket._id}/bank-proof-attachment`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([resp.data], { type: resp.headers['content-type'] }));
      window.open(url, '_blank');
    } catch (err) {
      setError('No se pudo abrir el comprobante');
    } finally {
      setOpeningBankProof(false);
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

  // Responder no marca el ticket como resuelto — es la conversación libre de
  // ida y vuelta mientras se trabaja (ver backend/src/routes/tickets.js,
  // POST /:id/reply). "Marcar como resuelto" sigue siendo un paso aparte, con
  // su catálogo de resoluciones — pero desde 2026-08-03 ya NO cierra el
  // ticket de una vez: el cierre real solo lo dispara el empleado al
  // calificar la atención (ver handleResolve más abajo y
  // POST /:id/satisfaction en el backend).
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
      if (data.assignedTo) {
        setLiveAssignedTo(data.assignedTo);
        setAssignedTo(data.assignedTo._id);
      }
      setReplyText('');
      setReplyFile(null);
      onSilentUpdate?.(); // refresca el tablero de fondo (ej. abierto → en proceso), sin cerrar este modal
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo enviar la respuesta');
    } finally {
      setSendingReply(false);
    }
  };

  // Pedido explícito del usuario (2026-08-03): un ticket ya NO se cierra por
  // completo hasta que el propio empleado califica la atención — si nunca
  // califica, no se cierra (salvo el respaldo de 5 días sin actividad, ver
  // autoCloseStaleResolved() en el backend). Por eso esto ya solo marca
  // "resuelto", no "cerrado" — el cierre real lo dispara
  // POST /:id/satisfaction cuando el empleado responde la encuesta.
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
          {!canManage && liveAssignedTo && (
            <p className={styles.modalHint}>🔒 Asignado a {liveAssignedTo.name} — solo esa persona (o el Gerente de Sistemas) puede modificarlo.</p>
          )}
          {canManage && liveAssignedTo && !ticket.assignedTo && (
            <p className={styles.modalHint}>🔒 Este ticket quedó asignado a {liveAssignedTo.name} al contestarlo.</p>
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
                !showEscalateForm ? (
                  <button type="button" className={styles.btnCancel} onClick={() => setShowEscalateForm(true)}>
                    🚀 Escalar
                  </button>
                ) : escalationTargets.length === 0 ? (
                  <p className={styles.modalHint}>No tienes ningún destino de escalamiento disponible.</p>
                ) : (
                  <>
                    <select
                      className={styles.input}
                      value={escalationTargetIdx}
                      onChange={(e) => setEscalationTargetIdx(e.target.value)}
                    >
                      <option value="">Elige a quién o a qué área escalar...</option>
                      {escalationTargets.map((t, i) => (
                        <option key={i} value={i}>{t.label}</option>
                      ))}
                    </select>
                    <textarea
                      className={styles.input}
                      rows={2}
                      value={escalationReason}
                      onChange={(e) => setEscalationReason(e.target.value)}
                      placeholder="Ej. Requiere garantía con el fabricante, soporte de un proveedor externo... (opcional)"
                      style={{ marginTop: '0.5rem' }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <button
                        type="button"
                        className={styles.btnDanger}
                        onClick={handleEscalate}
                        disabled={savingEscalation || escalationTargetIdx === ''}
                      >
                        {savingEscalation ? 'Guardando...' : 'Escalar'}
                      </button>
                      <button type="button" className={styles.btnCancel} onClick={() => setShowEscalateForm(false)} disabled={savingEscalation}>
                        Cancelar
                      </button>
                    </div>
                  </>
                )
              )
            ) : (
              <>
                <p style={{ margin: 0 }}>
                  {ticket.escalationType === 'area'
                    ? `Escalado a la cola de ${ticket.escalatedToArea === 'erp' ? 'ERP' : ticket.escalatedToArea === 'bi' ? 'BI' : 'Sistemas'} (sin asignar)`
                    : ticket.escalationType === 'proveedor'
                      ? 'Escalado a Proveedores (garantía / soporte externo)'
                      : `Escalado a ${ticket.assignedTo?.name || 'la persona elegida'}`}
                </p>
                {ticket.escalationReason && <p style={{ margin: '0.3rem 0 0' }}>{ticket.escalationReason}</p>}
                <p className={styles.modalHint}>Escalado por {ticket.escalatedByName || '—'}{ticket.escalatedAt ? ` — ${new Date(ticket.escalatedAt).toLocaleString('es-MX')}` : ''}</p>
                {ticket.escalationType === 'proveedor' && (
                  ticket.providerSlaLabel ? (
                    <p className={styles.modalHint} style={{ marginTop: '0.3rem' }}>
                      📐 SLA con Proveedor: <strong>{ticket.providerSlaLabel}</strong>
                      {ticket.providerSlaDueAt && ` — límite ${new Date(ticket.providerSlaDueAt).toLocaleString('es-MX')}`}
                    </p>
                  ) : (
                    <p className={styles.modalHint} style={{ marginTop: '0.3rem', color: '#d97706' }}>
                      ⚠️ Sin SLA de Proveedor — clasifica la Categoría de Falla para calcularlo.
                    </p>
                  )
                )}
                {canManage && ticket.escalationType !== 'proveedor' && providerTarget && (
                  !showProviderEscalate ? (
                    <button type="button" className={styles.btnCancel} style={{ marginTop: '0.5rem' }} onClick={() => setShowProviderEscalate(true)}>
                      🚚 Ni así se resolvió — escalar a Proveedor externo
                    </button>
                  ) : (
                    <div style={{ marginTop: '0.5rem' }}>
                      <textarea
                        className={styles.input}
                        rows={2}
                        value={escalationReason}
                        onChange={(e) => setEscalationReason(e.target.value)}
                        placeholder="Motivo (opcional)"
                      />
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button type="button" className={styles.btnDanger} onClick={handleEscalateToProvider} disabled={savingEscalation}>
                          {savingEscalation ? 'Guardando...' : 'Escalar a Proveedor externo'}
                        </button>
                        <button type="button" className={styles.btnCancel} onClick={() => setShowProviderEscalate(false)} disabled={savingEscalation}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )
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
            Reportado por <strong>{ticket.employeeName}</strong>
            {/* Cuenta de uso múltiple (ej. tablet compartida) — sin esto,
                todos los tickets de la tablet se ven idénticos aunque los
                haya reportado gente distinta. */}
            {ticket.sharedAccountReporterName && <> (<strong>{ticket.sharedAccountReporterName}</strong>)</>}
            {' '}· {tc.label}{liveOtherTypeDetail && `: ${liveOtherTypeDetail}`}
          </p>
          {liveReassignedByName && (
            <p className={styles.modalHint}>
              🔁 <strong>{liveReassignedByName}</strong> lo reclasificó de "{TICKET_TYPE_CONFIG[liveOriginalTicketType]?.label || liveOriginalTicketType}" a "{tc.label}".
            </p>
          )}
          {canManage && !showReassignForm && (
            <button type="button" className={styles.btnLink} onClick={() => setShowReassignForm(true)}>🔁 Reasignar categoría</button>
          )}
          {canManage && showReassignForm && (
            <div className={styles.field}>
              <label>Categoría correcta</label>
              <select className={styles.input} value={reassignType} onChange={(e) => setReassignType(e.target.value)}>
                <option value="">Selecciona...</option>
                {REASSIGN_OPTIONS.map((k) => (
                  <option key={k} value={k}>{TICKET_TYPE_CONFIG[k].label}</option>
                ))}
              </select>
              {reassignType === 'otro' && (
                <input className={styles.input} style={{ marginTop: '0.4rem' }} value={reassignOtherDetail}
                  onChange={(e) => setReassignOtherDetail(e.target.value)} placeholder="Especifica de qué se trata" />
              )}
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnCancel} onClick={() => { setShowReassignForm(false); setReassignType(''); setReassignOtherDetail(''); }}>Cancelar</button>
                <button type="button" className={styles.btnPrimary} onClick={handleReassign} disabled={reassigning}>
                  {reassigning ? 'Guardando...' : 'Confirmar reasignación'}
                </button>
              </div>
            </div>
          )}
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
          {ticket.providerName && (
            <div className={styles.field}>
              <label>Datos del proveedor</label>
              <p>
                <strong>{ticket.providerName}</strong><br />
                {ticket.providerEmail} · {ticket.providerPhone}<br />
                <span style={{ whiteSpace: 'pre-wrap' }}>{ticket.providerBankDetails}</span>
              </p>
            </div>
          )}
          {ticket.attachmentMimeType && (
            <div className={styles.field}>
              <label>{ticket.providerName ? 'Constancia de Situación Fiscal (CSF)' : 'Evidencia'}</label>
              <button type="button" className={styles.btnLink} onClick={openAttachment} disabled={openingAttachment}>
                {openingAttachment ? 'Abriendo...' : 'Ver adjunto ↗'}
              </button>
            </div>
          )}
          {ticket.bankProofMimeType && (
            <div className={styles.field}>
              <label>Comprobante de datos bancarios</label>
              <button type="button" className={styles.btnLink} onClick={openBankProof} disabled={openingBankProof}>
                {openingBankProof ? 'Abriendo...' : 'Ver adjunto ↗'}
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
                              url={`/tickets/${ticket._id}/messages/${m._id}/attachment`}
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
                <div ref={messagesEndRef} />
              </div>
            </div>
          )}

          <div className={styles.field}>
            <label>Responder</label>
            {!liveAssignedTo && (
              <p className={styles.modalHint}>Este ticket no está asignado — al enviar tu respuesta quedará asignado a ti.</p>
            )}
            {/* Bug real reportado por el usuario (2026-08-05): se podía
                seguir escribiendo/mandando mensajes en un ticket ya
                resuelto — el backend (POST /:id/reply) ya lo rechaza, esto
                solo evita que se intente escribir para nada. */}
            {ticketResolved && (
              <p className={styles.modalHint}>Este ticket ya está resuelto — no se pueden mandar más mensajes.</p>
            )}
            {liveEscalated && !ticketResolved && (
              <p className={styles.modalHint}>Este ticket está escalado — da seguimiento desde 📢 Notas Públicas o 🔒 Notas Internas, más abajo.</p>
            )}
            <textarea
              className={styles.input}
              rows={2}
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
              disabled={!canManage || chatBlocked}
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
                disabled={sendingReply || !canManage || chatBlocked || (!replyText.trim() && !replyFile)}
              >
                {sendingReply ? 'Enviando...' : 'Enviar respuesta'}
              </button>
              <label className={styles.btnLink} style={{ cursor: canManage && !chatBlocked ? 'pointer' : 'not-allowed' }}>
                📷 Adjuntar imagen
                <input type="file" accept="image/*" onChange={handleReplyFileChange} hidden disabled={!canManage || chatBlocked} />
              </label>
            </div>
          </div>

          <div className={styles.field}>
            <label>📢 Notas públicas <span className={styles.modalHint}>(quien reportó SÍ ve esto — ej. avisos de seguimiento con un proveedor externo)</span></label>
            <InternalNotesPanel ticket={ticket} currentUser={currentUser} kind="public" />
          </div>

          <div className={`${styles.field} ${styles.internalNotesBox}`}>
            <label>🔒 Notas internas <span className={styles.modalHint}>(solo equipo de Sistemas — quien reportó nunca ve esto)</span></label>
            <InternalNotesPanel ticket={ticket} currentUser={currentUser} />
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
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => {
                      // Escalado a Proveedor — pedido explícito del usuario
                      // (2026-08-03): este mismo botón (relabeled) es lo
                      // que reabre la calificación normal del empleado
                      // cuando el proveedor ya terminó el servicio.
                      if (ticket.escalationType === 'proveedor') {
                        setResolution('Otro (especifica)');
                        setOtherResolution('Resuelto por el proveedor');
                      }
                      setShowResolveForm(true);
                    }}
                    disabled={!canManage}
                  >
                    {ticket.escalationType === 'proveedor' ? '✅ Servicio con el proveedor terminado' : 'Marcar como resuelto'}
                  </button>
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
                    <button type="button" className={styles.btnLink} onClick={() => setShowManageCatalog((v) => !v)}>
                      {showManageCatalog ? 'Ocultar catálogo' : '🗑️ Administrar catálogo'}
                    </button>
                    {showManageCatalog && (
                      <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        {resolutionOptions.length === 0 && <p className={styles.muted}>El catálogo está vacío.</p>}
                        {resolutionOptions.map((opt) => (
                          <div key={opt} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ flex: 1, fontSize: '0.85rem' }}>{opt}</span>
                            <button
                              type="button"
                              className={styles.btnDanger}
                              disabled={deletingOption === opt}
                              onClick={() => handleDeleteResolutionOption(opt)}
                            >
                              {deletingOption === opt ? 'Eliminando...' : 'Eliminar'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
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
            <div className={styles.field}>
              <label>Resolución</label>
              <p>{ticket.resolution}</p>
              {ticket.resolutionNotes && <p className={styles.resolutionNote}>{ticket.resolutionNotes}</p>}
              <p className={styles.muted}>{ticket.resolvedByName} — {new Date(ticket.resolvedAt).toLocaleString('es-MX')}</p>
              {/* Pedido explícito del usuario (2026-08-03): el cierre real ya
                  no lo decide Sistemas — solo lo dispara el empleado al
                  calificar la atención (o el respaldo automático de 5 días
                  sin actividad). Por eso ya no hay un botón de "Cerrar
                  ticket" aquí; un ticket "resuelto" ya no se puede reabrir
                  (el backend lo rechaza aunque alguien llame la ruta
                  directo), solo esperar a que se cierre solo. */}
              {ticket.status === 'resuelto' && (
                <p className={styles.muted}>🔒 Este ticket se cierra solo cuando el empleado califica la atención (o automático a los 5 días sin actividad).</p>
              )}
            </div>
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
