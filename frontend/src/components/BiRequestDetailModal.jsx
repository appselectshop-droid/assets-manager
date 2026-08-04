import { useState } from 'react';
import api from '../services/api';
import { BI_PROJECT_SECTIONS } from './BiProjectForm';
import { BI_DATABASE_TYPES, BI_PLATFORM_CATALOG, BI_STORE_CATALOG } from './BiDatabaseForm';
import MessageAttachmentImage from './MessageAttachmentImage';
// Reutiliza Tickets.module.css (no BiPreview.module.css) a propósito: ese
// otro usa las variables de tema oscuro del portal de empleado
// (var(--p-*), definidas solo bajo .portalDark en styles/portal-theme.css)
// — se verían rotas dentro del panel admin, que es tema claro/oscuro por
// separado. Aquí se re-arma la misma lógica de secciones/filas que ya
// usa BiPreview.jsx, con las clases del panel admin.
import styles from '../pages/Tickets.module.css';
import pjStyles from './BiProjectFields.module.css';

const BI_STAGE_CONFIG = {
  recibido:      { label: 'Recibido',      color: '#6b7280', bg: '#f5f5f5' },
  en_definicion: { label: 'En definición',  color: '#d97706', bg: '#fffbeb' },
  en_desarrollo: { label: 'En desarrollo',  color: '#2563eb', bg: '#eff6ff' },
  en_revision:   { label: 'En revisión',    color: '#7c3aed', bg: '#f5f3ff' },
  entregado:     { label: 'Entregado',      color: '#16a34a', bg: '#f0fdf4' },
};
const BI_STAGE_ORDER = ['recibido', 'en_definicion', 'en_desarrollo', 'en_revision', 'entregado'];

// Misma paleta que backend/src/models/ProjectLabel.js (PROJECT_LABEL_COLORS)
// — se repite aquí porque el frontend no importa código del backend.
const PROJECT_LABEL_COLORS = ['#E8651A', '#dc2626', '#16a34a', '#2563eb', '#7c3aed', '#d97706', '#0d9488', '#6b7280'];

function labelFor(options, value) {
  return options.find((o) => o.value === value)?.label || value;
}

// Etiquetas + comentarios estilo Trello — pedido explícito del usuario
// (2026-08-04): "las anotaciones las necesito como en Trello, tarjetas,
// etiquetas, y dentro de esas tarjetas comentarios" — separado por
// completo del chat con quien reportó (ese sigue viviendo en Tickets).
// Solo aplica a biRequestKind 'proyecto'.
function ProjectLabelsAndComments({ ticket, onUpdated }) {
  const [catalog, setCatalog] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState(PROJECT_LABEL_COLORS[0]);
  const [savingLabel, setSavingLabel] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [savingComment, setSavingComment] = useState(false);
  const [error, setError] = useState('');

  const assignedIds = (ticket.projectLabelIds || []).map((l) => (typeof l === 'string' ? l : l._id));

  const loadCatalog = () => {
    api.get('/tickets/project-labels').then(({ data }) => setCatalog(data)).catch(() => setCatalog([]));
  };
  const openPicker = () => {
    if (!catalog) loadCatalog();
    setPickerOpen((v) => !v);
  };

  const toggleLabel = async (labelId) => {
    const next = assignedIds.includes(labelId) ? assignedIds.filter((id) => id !== labelId) : [...assignedIds, labelId];
    setError('');
    try {
      const { data } = await api.put(`/tickets/${ticket._id}/project-labels`, { labelIds: next });
      onUpdated(data);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo actualizar la etiqueta');
    }
  };

  const handleCreateLabel = async () => {
    if (!newLabelName.trim()) return;
    setSavingLabel(true);
    setError('');
    try {
      const { data } = await api.post('/tickets/project-labels', { name: newLabelName.trim(), color: newLabelColor });
      setCatalog((prev) => [...(prev || []), data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewLabelName('');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo crear la etiqueta');
    } finally {
      setSavingLabel(false);
    }
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    setSavingComment(true);
    setError('');
    try {
      const { data } = await api.post(`/tickets/${ticket._id}/project-comments`, { text: commentText.trim() });
      onUpdated(data);
      setCommentText('');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo agregar el comentario');
    } finally {
      setSavingComment(false);
    }
  };

  const assignedLabels = (ticket.projectLabelIds || []).filter((l) => typeof l === 'object');
  const comments = [...(ticket.projectComments || [])].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  return (
    <div className={styles.field}>
      {error && <p className={styles.formError}>{error}</p>}

      <label>🏷️ Etiquetas</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center', position: 'relative' }}>
        {assignedLabels.map((l) => (
          <span key={l._id} style={{ background: l.color, color: '#fff', padding: '0.15rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700 }}>{l.name}</span>
        ))}
        <button type="button" className={styles.btnLink} onClick={openPicker}>+ Etiqueta</button>

        {pickerOpen && (
          <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '0.3rem', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.6rem', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 10, width: '260px' }}>
            {catalog === null ? (
              <p className={styles.modalHint}>Cargando...</p>
            ) : (
              <>
                {catalog.length === 0 && <p className={styles.modalHint}>Todavía no hay etiquetas.</p>}
                {catalog.map((l) => (
                  <label key={l._id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0', cursor: 'pointer' }}>
                    <input type="checkbox" checked={assignedIds.includes(l._id)} onChange={() => toggleLabel(l._id)} />
                    <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: l.color, display: 'inline-block' }} />
                    <span style={{ fontSize: '0.82rem' }}>{l.name}</span>
                  </label>
                ))}
                <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '0.5rem', paddingTop: '0.5rem' }}>
                  <input
                    className={styles.input}
                    placeholder="Nueva etiqueta..."
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    style={{ marginBottom: '0.4rem' }}
                  />
                  <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                    {PROJECT_LABEL_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewLabelColor(c)}
                        style={{
                          width: '20px', height: '20px', borderRadius: '4px', background: c, cursor: 'pointer',
                          border: newLabelColor === c ? '2px solid #111' : '2px solid transparent',
                        }}
                      />
                    ))}
                  </div>
                  <button type="button" className={styles.btnCancel} onClick={handleCreateLabel} disabled={savingLabel || !newLabelName.trim()}>
                    {savingLabel ? 'Creando...' : 'Crear etiqueta'}
                  </button>
                </div>
                <button type="button" className={styles.btnLink} style={{ marginTop: '0.4rem' }} onClick={() => setPickerOpen(false)}>Cerrar</button>
              </>
            )}
          </div>
        )}
      </div>

      <label style={{ marginTop: '0.85rem', display: 'block' }}>💬 Comentarios <span className={styles.modalHint}>(seguimiento interno del proyecto, no es el chat con quien reportó)</span></label>
      <div className={styles.convThread}>
        {comments.length === 0 && <p className={styles.modalHint}>Sin comentarios todavía.</p>}
        {comments.map((c, i) => (
          <div key={c._id || i} className={styles.bubbleItem}>
            <p className={styles.bubbleAuthor}>{c.authorName}</p>
            <div className={styles.bubbleText}>{c.text}</div>
            <p className={styles.bubbleMeta}>
              {new Date(c.createdAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <textarea
          className={styles.input}
          rows={2}
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="Ej. Ya se validó la fuente de datos con el área de Compras..."
        />
        <button type="button" className={styles.btnCancel} onClick={handleAddComment} disabled={savingComment || !commentText.trim()}>
          {savingComment ? 'Guardando...' : 'Comentar'}
        </button>
      </div>
    </div>
  );
}

// Estilo visual replicado del Word "Solicitud de Nuevo Reporte" (ver
// backend/src/utils/biProjectDocx.js) — pedido explícito del usuario
// (2026-08-04): "no el tipo de documento, el diseño, la estructura y la
// forma". Banda naranja de título por sección + tabla de 2 columnas
// etiqueta/valor, en vez del panel genérico plano que tenía antes.
function ProjectFields({ data }) {
  return (
    <div className={pjStyles.wordDoc}>
      {BI_PROJECT_SECTIONS.map((section) => {
        const rows = section.fields
          .map((field) => {
            const value = data?.[field.key];
            let display;
            if (field.type === 'checkbox') display = (value || []).map((v) => labelFor(field.options, v)).join(', ');
            else if (field.type === 'radio') display = value ? labelFor(field.options, value) : '';
            else display = value;
            return { label: field.label, display };
          })
          .filter((r) => r.display);
        if (!rows.length) return null;
        return (
          <div key={section.title} className={pjStyles.section}>
            <div className={pjStyles.sectionBanner}>{section.title}</div>
            <div className={pjStyles.sectionTable}>
              {rows.map((r) => (
                <div key={r.label} className={pjStyles.tableRow}>
                  <div className={pjStyles.tableLabel}>{r.label}</div>
                  <div className={pjStyles.tableValue}>{r.display}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DatabaseFields({ data }) {
  if (!data) return null;
  const tipo = BI_DATABASE_TYPES[data.tipo];
  const platformLabel = data.plataforma === 'otra'
    ? data.plataformaOtra
    : BI_PLATFORM_CATALOG[data.tipo]?.find((p) => p.value === data.plataforma)?.label || data.plataforma;
  const storeLabel = BI_STORE_CATALOG.find((t) => t.value === data.tienda)?.label || data.tienda;
  return (
    <div className={styles.panel}>
      <p className={styles.panelTitle}>Detalle de la solicitud</p>
      <div className={styles.reportStat}><span className={styles.reportLabel}>Base de datos</span><span className={styles.reportValue}>{tipo?.icon} {tipo?.label}</span></div>
      <div className={styles.reportStat}><span className={styles.reportLabel}>Plataforma</span><span className={styles.reportValue}>{platformLabel}</span></div>
      <div className={styles.reportStat}><span className={styles.reportLabel}>Tienda</span><span className={styles.reportValue}>{storeLabel}</span></div>
      <div className={styles.reportStat}><span className={styles.reportLabel}>Periodo</span><span className={styles.reportValue}>{data.startDate} — {data.endDate}</span></div>
    </div>
  );
}

// Detalle de una solicitud de Soporte BI — compartido por "Bases de
// Datos"/"Proyectos" (ver BiLayout.jsx). Muestra los datos estructurados
// del wizard (biProjectData/biDatabaseRequest) y el selector de etapa
// (PUT /:id/bi-stage) — es el historial/área de trabajo de BI (aprobar/
// rechazar, avanzar etapas, entregar el archivo). Pedido explícito del
// usuario (2026-08-03): ya NO muestra la conversación — antes la
// duplicaba con `POST /:id/reply`, ahora esa conversación vive únicamente
// en el Tablero de Tickets (mismo camino que ya seguía "Soporte" desde el
// 2026-07-30) para no tener el chat repartido en dos lugares distintos.
export default function BiRequestDetailModal({ ticket, onClose, onUpdated }) {
  const [stageSaving, setStageSaving] = useState(false);
  const [deliverFile, setDeliverFile] = useState(null);
  const [delivering, setDelivering] = useState(false);
  const [error, setError] = useState('');
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const isDone = ['resuelto', 'cerrado'].includes(ticket.status);
  const isDatabase = ticket.biRequestKind === 'bases_datos';
  const currentStage = BI_STAGE_CONFIG[ticket.biStage] || BI_STAGE_CONFIG.recibido;
  // Pedido explícito del usuario (2026-07-31): una solicitud de Bases de
  // Datos se aprueba/rechaza antes de trabajarla — mientras no pase por
  // ahí, no tiene sentido mostrarle a BI el selector de etapa de siempre.
  const needsApproval = isDatabase && !ticket.biApprovedAt && !ticket.biRejectedAt;

  const handleApprove = async () => {
    setApproving(true);
    setError('');
    try {
      const { data } = await api.put(`/tickets/${ticket._id}/bi-approve`);
      onUpdated(data);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo aprobar la solicitud');
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    setRejecting(true);
    setError('');
    try {
      const { data } = await api.put(`/tickets/${ticket._id}/bi-reject`, { reason: rejectReason.trim() });
      setShowRejectForm(false);
      setRejectReason('');
      onUpdated(data);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo rechazar la solicitud');
    } finally {
      setRejecting(false);
    }
  };
  // Una base de datos solo llega a "Entregado" vía el archivo real (ver
  // "Entregar base de datos" abajo) — se quita del selector genérico para
  // que no parezca una opción más.
  const stageOptions = isDatabase ? BI_STAGE_ORDER.filter((s) => s !== 'entregado') : BI_STAGE_ORDER;

  const handleStageChange = async (e) => {
    const biStage = e.target.value;
    setStageSaving(true);
    setError('');
    try {
      const { data } = await api.put(`/tickets/${ticket._id}/bi-stage`, { biStage });
      onUpdated(data);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo cambiar la etapa');
    } finally {
      setStageSaving(false);
    }
  };

  const handleDeliver = async () => {
    if (!deliverFile) return;
    setDelivering(true);
    setError('');
    try {
      const form = new FormData();
      form.append('deliverable', deliverFile);
      const { data } = await api.post(`/tickets/${ticket._id}/bi-deliver`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setDeliverFile(null);
      onUpdated(data);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo entregar el archivo');
    } finally {
      setDelivering(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '720px' }}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{ticket.folio}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          {error && <p className={styles.formError}>{error}</p>}

          <p className={styles.modalHint}>{ticket.employeeName} · {new Date(ticket.createdAt).toLocaleString('es-MX')}</p>

          {ticket.biRejectedAt && (
            <div className={styles.field}>
              <label>Solicitud rechazada</label>
              <p className={styles.modalHint}>
                {ticket.biRejectedByName} rechazó esta solicitud el {new Date(ticket.biRejectedAt).toLocaleString('es-MX')}.
                {ticket.biRejectionReason && <><br />Motivo: {ticket.biRejectionReason}</>}
              </p>
            </div>
          )}

          {needsApproval ? (
            <div className={styles.field}>
              <label>Aprobar solicitud</label>
              {!showRejectForm ? (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button type="button" className={styles.btnPrimary} onClick={handleApprove} disabled={approving}>
                    {approving ? 'Aprobando...' : '✅ Aprobar'}
                  </button>
                  <button type="button" className={styles.btnDanger} onClick={() => setShowRejectForm(true)} disabled={rejecting}>
                    Rechazar
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <textarea
                    className={styles.input}
                    rows={2}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Motivo del rechazo (opcional)"
                  />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" className={styles.btnDanger} onClick={handleReject} disabled={rejecting}>
                      {rejecting ? 'Rechazando...' : 'Confirmar rechazo'}
                    </button>
                    <button type="button" className={styles.btnCancel} onClick={() => setShowRejectForm(false)} disabled={rejecting}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.field}>
              <label>Etapa</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span className={styles.statusBadge} style={{ color: currentStage.color, background: currentStage.bg }}>{currentStage.label}</span>
                {!isDone && (
                  <select className={styles.input} value={ticket.biStage || 'recibido'} onChange={handleStageChange} disabled={stageSaving} style={{ maxWidth: '220px' }}>
                    {stageOptions.map((s) => <option key={s} value={s}>{BI_STAGE_CONFIG[s].label}</option>)}
                  </select>
                )}
              </div>
              {isDone && <p className={styles.modalHint}>Este ticket ya está {ticket.status} — la etapa ya no se puede cambiar.</p>}
            </div>
          )}

          {ticket.biRequestKind === 'proyecto' && <ProjectFields data={ticket.biProjectData} />}
          {ticket.biRequestKind === 'proyecto' && <ProjectLabelsAndComments ticket={ticket} onUpdated={onUpdated} />}
          {isDatabase && <DatabaseFields data={ticket.biDatabaseRequest} />}

          {isDatabase && (
            <div className={styles.field}>
              <label>Base de datos entregada</label>
              {ticket.biDeliverableFileName ? (
                <MessageAttachmentImage api={api} url={`/tickets/${ticket._id}/bi-deliverable`} mimeType={ticket.biDeliverableMimeType} fileName={ticket.biDeliverableFileName} />
              ) : (
                <p className={styles.modalHint}>Todavía no se ha entregado ningún archivo.</p>
              )}
              {!isDone && !needsApproval && (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input type="file" accept=".xlsx,.xls,.csv,.pdf" onChange={(e) => setDeliverFile(e.target.files[0] || null)} />
                  <button type="button" className={styles.btnCancel} onClick={handleDeliver} disabled={delivering || !deliverFile}>
                    {delivering ? 'Subiendo...' : ticket.biDeliverableFileName ? 'Reemplazar y entregar' : 'Entregar base de datos'}
                  </button>
                </div>
              )}
            </div>
          )}

          <p className={styles.modalHint}>
            💬 La conversación con {ticket.employeeName} (
            {(ticket.messages || []).length} mensaje{(ticket.messages || []).length !== 1 ? 's' : ''}) se ve y se
            responde desde <strong>Tickets</strong>, no aquí — busca el folio {ticket.folio}.
          </p>
        </div>
      </div>
    </div>
  );
}
