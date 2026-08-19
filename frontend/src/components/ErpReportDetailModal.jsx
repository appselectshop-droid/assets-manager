import { useState } from 'react';
import api from '../services/api';
import MessageAttachmentImage from './MessageAttachmentImage';
import { canDeleteTicketClient } from '../pages/ticketShared';
import styles from '../pages/Tickets.module.css';

const ERP_STAGE_CONFIG = {
  recibido:      { label: 'Recibido',      color: '#6b7280', bg: '#f5f5f5' },
  en_definicion: { label: 'En definición',  color: '#d97706', bg: '#fffbeb' },
  en_desarrollo: { label: 'En desarrollo',  color: '#2563eb', bg: '#eff6ff' },
  en_revision:   { label: 'En revisión',    color: '#7c3aed', bg: '#f5f3ff' },
  entregado:     { label: 'Entregado',      color: '#16a34a', bg: '#f0fdf4' },
};
const ERP_STAGE_ORDER = ['recibido', 'en_definicion', 'en_desarrollo', 'en_revision', 'entregado'];

const REPORT_FIELDS = [
  { key: 'reportName', label: 'Nombre del reporte' },
  { key: 'module', label: 'Módulo del ERP' },
  { key: 'dataNeeded', label: 'Qué debe incluir' },
  { key: 'purpose', label: 'Para qué se usará' },
  { key: 'deadline', label: 'Fecha límite' },
];

// Detalle de una Solicitud de Reporte ERP — mismo trato que
// BiRequestDetailModal.jsx para "Proyecto" de BI (pedido explícito de
// ERP), pero sin el gate de aprobación (solo Bases de Datos de BI lo
// tiene) ni el sistema de etiquetas/comentarios estilo Trello (no se pidió
// aquí). La conversación con quien reportó sigue viviendo en Tickets, como
// en BI.
export default function ErpReportDetailModal({ ticket, currentUser, onClose, onUpdated, onDelete }) {
  const [stageSaving, setStageSaving] = useState(false);
  const [deliverFile, setDeliverFile] = useState(null);
  const [delivering, setDelivering] = useState(false);
  const [error, setError] = useState('');

  // Eliminar (2026-08-19, pedido explícito del usuario): "quiero que ERP
  // y BI (los líderes) puedan borrar tickets" — antes exclusivo de
  // Administrador, ahora también lider.erp sobre sus propios reportes.
  const canDelete = canDeleteTicketClient(currentUser, ticket);

  const isDone = ['resuelto', 'cerrado'].includes(ticket.status);
  const currentStage = ERP_STAGE_CONFIG[ticket.erpStage] || ERP_STAGE_CONFIG.recibido;
  const data = ticket.erpReportData || {};

  const handleStageChange = async (e) => {
    const erpStage = e.target.value;
    setStageSaving(true);
    setError('');
    try {
      const { data } = await api.put(`/tickets/${ticket._id}/erp-stage`, { erpStage });
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
      const { data } = await api.post(`/tickets/${ticket._id}/erp-deliver`, form, {
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

          <div className={styles.field}>
            <label>Etapa</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span className={styles.statusBadge} style={{ color: currentStage.color, background: currentStage.bg }}>{currentStage.label}</span>
              {!isDone && (
                <select className={styles.input} value={ticket.erpStage || 'recibido'} onChange={handleStageChange} disabled={stageSaving} style={{ maxWidth: '220px' }}>
                  {ERP_STAGE_ORDER.map((s) => <option key={s} value={s}>{ERP_STAGE_CONFIG[s].label}</option>)}
                </select>
              )}
            </div>
            {isDone && <p className={styles.modalHint}>Este ticket ya está {ticket.status} — la etapa ya no se puede cambiar.</p>}
          </div>

          <div className={styles.panel}>
            <p className={styles.panelTitle}>Detalle de la solicitud</p>
            {REPORT_FIELDS.map((f) => (
              <div key={f.key} className={styles.reportStat}>
                <span className={styles.reportLabel}>{f.label}</span>
                <span className={styles.reportValue}>{data[f.key] || '—'}</span>
              </div>
            ))}
          </div>

          <div className={styles.field}>
            <label>Reporte entregado</label>
            {ticket.erpDeliverableFileName ? (
              <MessageAttachmentImage api={api} url={`/tickets/${ticket._id}/erp-deliverable`} mimeType={ticket.erpDeliverableMimeType} fileName={ticket.erpDeliverableFileName} />
            ) : (
              <p className={styles.modalHint}>Todavía no se ha entregado ningún archivo.</p>
            )}
            {!isDone && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="file" accept=".xlsx,.xls,.csv,.pdf" onChange={(e) => setDeliverFile(e.target.files[0] || null)} />
                <button type="button" className={styles.btnCancel} onClick={handleDeliver} disabled={delivering || !deliverFile}>
                  {delivering ? 'Subiendo...' : ticket.erpDeliverableFileName ? 'Reemplazar y entregar' : 'Entregar reporte'}
                </button>
              </div>
            )}
          </div>

          <p className={styles.modalHint}>
            💬 La conversación con {ticket.employeeName} (
            {(ticket.messages || []).length} mensaje{(ticket.messages || []).length !== 1 ? 's' : ''}) se ve y se
            responde desde <strong>Tickets</strong>, no aquí — busca el folio {ticket.folio}.
          </p>

          {canDelete && onDelete && (
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnDanger} onClick={onDelete}>Eliminar</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
