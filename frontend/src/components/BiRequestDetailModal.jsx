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

const BI_STAGE_CONFIG = {
  recibido:      { label: 'Recibido',      color: '#6b7280', bg: '#f5f5f5' },
  en_definicion: { label: 'En definición',  color: '#d97706', bg: '#fffbeb' },
  en_desarrollo: { label: 'En desarrollo',  color: '#2563eb', bg: '#eff6ff' },
  en_revision:   { label: 'En revisión',    color: '#7c3aed', bg: '#f5f3ff' },
  entregado:     { label: 'Entregado',      color: '#16a34a', bg: '#f0fdf4' },
};
const BI_STAGE_ORDER = ['recibido', 'en_definicion', 'en_desarrollo', 'en_revision', 'entregado'];

const SIMPLE_STATUS_CONFIG = {
  abierto:    { label: 'Abierto',    color: '#d97706', bg: '#fffbeb' },
  en_proceso: { label: 'En proceso', color: '#2563eb', bg: '#eff6ff' },
  resuelto:   { label: 'Resuelto',   color: '#16a34a', bg: '#f0fdf4' },
  cerrado:    { label: 'Cerrado',    color: '#6b7280', bg: '#f5f5f5' },
};

function labelFor(options, value) {
  return options.find((o) => o.value === value)?.label || value;
}

function ProjectFields({ data }) {
  return (
    <>
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
          <div key={section.title} className={styles.panel} style={{ marginBottom: '0.75rem' }}>
            <p className={styles.panelTitle}>{section.title}</p>
            {rows.map((r) => (
              <div key={r.label} className={styles.reportStat}>
                <span className={styles.reportLabel}>{r.label}</span>
                <span className={styles.reportValue} style={{ fontSize: '0.85rem', fontWeight: 500, textAlign: 'right', whiteSpace: 'pre-wrap' }}>{r.display}</span>
              </div>
            ))}
          </div>
        );
      })}
    </>
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
// Datos"/"Proyectos"/"Soporte" (ver BiLayout.jsx). Para proyecto/bases_datos
// muestra los datos estructurados del wizard + el selector de etapa
// (PUT /:id/bi-stage); para 'soporte' (2026-07-30, sin formulario) muestra
// el asunto/descripción + un estatus genérico (PUT /:id/status), como
// cualquier ticket normal. La conversación (POST /:id/reply) es igual para
// los 3.
export default function BiRequestDetailModal({ ticket, onClose, onUpdated }) {
  const [stageSaving, setStageSaving] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [deliverFile, setDeliverFile] = useState(null);
  const [delivering, setDelivering] = useState(false);
  const [resolutionText, setResolutionText] = useState('');
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState('');

  const isDone = ['resuelto', 'cerrado'].includes(ticket.status);
  const isSupport = ticket.biRequestKind === 'soporte';
  const isDatabase = ticket.biRequestKind === 'bases_datos';
  const currentStage = BI_STAGE_CONFIG[ticket.biStage] || BI_STAGE_CONFIG.recibido;
  const currentSimpleStatus = SIMPLE_STATUS_CONFIG[ticket.status] || SIMPLE_STATUS_CONFIG.abierto;
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

  const handleSimpleStatusChange = async (e) => {
    const status = e.target.value;
    setStageSaving(true);
    setError('');
    try {
      const { data } = await api.put(`/tickets/${ticket._id}/status`, { status });
      onUpdated(data);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo cambiar el estatus');
    } finally {
      setStageSaving(false);
    }
  };

  const handleResolve = async () => {
    if (!resolutionText.trim()) return;
    setResolving(true);
    setError('');
    try {
      const { data } = await api.put(`/tickets/${ticket._id}/status`, { status: 'resuelto', resolution: resolutionText.trim() });
      onUpdated(data);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo resolver');
    } finally {
      setResolving(false);
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

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setSendingReply(true);
    setError('');
    try {
      const { data } = await api.post(`/tickets/${ticket._id}/reply`, { text: replyText.trim() });
      setReplyText('');
      onUpdated(data);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo enviar la respuesta');
    } finally {
      setSendingReply(false);
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

          {isSupport ? (
            <div className={styles.field}>
              <label>Estatus</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span className={styles.statusBadge} style={{ color: currentSimpleStatus.color, background: currentSimpleStatus.bg }}>{currentSimpleStatus.label}</span>
                {!isDone && (
                  <select className={styles.input} value={ticket.status} onChange={handleSimpleStatusChange} disabled={stageSaving} style={{ maxWidth: '180px' }}>
                    <option value="abierto">Abierto</option>
                    <option value="en_proceso">En proceso</option>
                  </select>
                )}
              </div>
              {isDone && <p className={styles.modalHint}>Este ticket ya está {ticket.status}.</p>}
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

          {isSupport && (
            <div className={styles.panel}>
              <p className={styles.panelTitle}>Descripción</p>
              <p style={{ fontSize: '0.85rem', color: '#333', whiteSpace: 'pre-wrap' }}>{ticket.description || ticket.subject}</p>
            </div>
          )}
          {ticket.biRequestKind === 'proyecto' && <ProjectFields data={ticket.biProjectData} />}
          {isDatabase && <DatabaseFields data={ticket.biDatabaseRequest} />}

          {isDatabase && (
            <div className={styles.field}>
              <label>Base de datos entregada</label>
              {ticket.biDeliverableFileName ? (
                <MessageAttachmentImage api={api} url={`/tickets/${ticket._id}/bi-deliverable`} mimeType={ticket.biDeliverableMimeType} fileName={ticket.biDeliverableFileName} />
              ) : (
                <p className={styles.modalHint}>Todavía no se ha entregado ningún archivo.</p>
              )}
              {!isDone && (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input type="file" accept=".xlsx,.xls,.csv,.pdf" onChange={(e) => setDeliverFile(e.target.files[0] || null)} />
                  <button type="button" className={styles.btnCancel} onClick={handleDeliver} disabled={delivering || !deliverFile}>
                    {delivering ? 'Subiendo...' : ticket.biDeliverableFileName ? 'Reemplazar y entregar' : 'Entregar base de datos'}
                  </button>
                </div>
              )}
            </div>
          )}

          {(ticket.messages || []).length > 0 && (
            <div className={styles.field}>
              <label>Conversación</label>
              <div className={styles.convThread}>
                {ticket.messages.map((m, i) => {
                  const fromAdmin = m.from === 'admin';
                  return (
                    <div key={m._id || i} className={`${styles.bubbleItem} ${fromAdmin ? styles.bubbleItemRight : ''}`}>
                      <p className={styles.bubbleAuthor}>{fromAdmin ? m.authorName : ticket.employeeName}</p>
                      <div className={`${styles.bubbleText} ${fromAdmin ? styles.bubbleTheirs : styles.bubbleMine}`}>{m.text}</div>
                      <p className={styles.bubbleMeta}>
                        {new Date(m.createdAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!isDone && (
            <div className={styles.field}>
              <label>Responder</label>
              <textarea
                className={styles.input}
                rows={2}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Escribe un mensaje para quien reportó..."
              />
              <div style={{ marginTop: '0.5rem' }}>
                <button type="button" className={styles.btnCancel} onClick={handleReply} disabled={sendingReply || !replyText.trim()}>
                  {sendingReply ? 'Enviando...' : 'Enviar respuesta'}
                </button>
              </div>
            </div>
          )}

          {isSupport && !isDone && (
            <div className={styles.field}>
              <label>Resolver</label>
              <textarea
                className={styles.input}
                rows={2}
                value={resolutionText}
                onChange={(e) => setResolutionText(e.target.value)}
                placeholder="¿Cómo se resolvió?"
              />
              <div style={{ marginTop: '0.5rem' }}>
                <button type="button" className={styles.btnPrimary} onClick={handleResolve} disabled={resolving || !resolutionText.trim()}>
                  {resolving ? 'Resolviendo...' : 'Marcar como resuelto'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
