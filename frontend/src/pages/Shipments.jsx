import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import api from '../services/api';
import CreateShipmentModal from '../components/CreateShipmentModal';
// Mismos estilos que Solicitudes de Cuentas — misma tabla/modal, contenido distinto.
import styles from './AccountRequests.module.css';

const STATUS_CONFIG = {
  enviado:     { label: 'Enviado',     color: '#d97706', bg: '#fffbeb', icon: '📦' },
  en_transito: { label: 'En tránsito', color: '#2563eb', bg: '#eff6ff', icon: '🚚' },
  recibido:    { label: 'Recibido',    color: '#16a34a', bg: '#f0fdf4', icon: '✅' },
};

function DetailModal({ shipment, onClose }) {
  const sc = STATUS_CONFIG[shipment.status];
  const link = `${window.location.origin}/confirmar-envio/${shipment.confirmToken}`;
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>{sc.icon}</span>
          <h2 className={styles.modalTitle}>{shipment.folio}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          <span className={styles.statusBadge} style={{ color: sc.color, background: sc.bg }}>{sc.label}</span>
          <p className={styles.modalHint} style={{ marginTop: '0.5rem' }}>
            {shipment.originOffice} → {shipment.destinationOffice} — Para: {shipment.recipientName}
          </p>
          <p className={styles.modalHint}>Solicitó: {shipment.requesterName}{shipment.requesterDepartment && ` · ${shipment.requesterDepartment}`}</p>
          <div className={styles.field}>
            <label>Motivo</label>
            <p>{shipment.reason}{shipment.reasonOther ? `: ${shipment.reasonOther}` : ''}</p>
          </div>
          <div className={styles.field}>
            <label>Equipos ({shipment.items.length})</label>
            {shipment.items.map((it, i) => (
              <p key={i} style={{ fontSize: '0.85rem', margin: '0.2rem 0' }}>
                {it.type} — {it.description} {it.serialOrImei && `(${it.serialOrImei})`} {it.condition && `· ${it.condition}`} {it.itemStatus && `· ${it.itemStatus}`}
              </p>
            ))}
          </div>
          {shipment.notes && (
            <div className={styles.field}>
              <label>Observaciones</label>
              <p>{shipment.notes}</p>
            </div>
          )}
          {shipment.returnDate && (
            <div className={styles.field}>
              <label>Fecha de retorno esperada</label>
              <p>{new Date(shipment.returnDate).toLocaleDateString('es-MX')}</p>
            </div>
          )}
          {shipment.transitByName && (
            <div className={styles.field}>
              <label>Marcado en tránsito por</label>
              <p>{shipment.transitByName}{shipment.transitAt && ` — ${new Date(shipment.transitAt).toLocaleString('es-MX')}`}</p>
            </div>
          )}
          {shipment.status === 'recibido' && (
            <div className={styles.field}>
              <label>Confirmado por</label>
              <p>{shipment.receivedByName} — {new Date(shipment.receivedAt).toLocaleString('es-MX')}</p>
              {shipment.receivedNotes && <p style={{ fontSize: '0.82rem', color: '#666' }}>{shipment.receivedNotes}</p>}
            </div>
          )}
          {shipment.status !== 'recibido' && (
            <div className={styles.field}>
              <label>Link de seguimiento (mensajero y destinatario)</label>
              <p className={styles.modalHint} style={{ marginBottom: '0.3rem' }}>
                {shipment.status === 'enviado'
                  ? 'El mensajero lo abre para marcar "en tránsito"; después de eso, el mismo link le sirve al destinatario para confirmar la recepción.'
                  : 'El destinatario lo abre para confirmar la recepción.'}
              </p>
              <div className={styles.passwordBox} style={{ wordBreak: 'break-all', fontSize: '0.8rem' }}>{link}</div>
              <button type="button" className={styles.btnCancel} style={{ marginTop: '0.4rem' }} onClick={() => navigator.clipboard.writeText(link)}>Copiar link</button>

              {/* Para cuando no hay a dónde mandar el link (sin número a la mano):
                  se escanea directo desde la pantalla, sin escribir ni compartir nada. */}
              <p className={styles.modalHint} style={{ marginTop: '0.75rem', marginBottom: '0.3rem' }}>
                O que lo escaneen directo desde tu pantalla:
              </p>
              <div style={{ background: '#fff', padding: '0.75rem', display: 'inline-block', borderRadius: '8px', border: '1px solid #eee' }}>
                <QRCodeSVG value={link} size={160} />
              </div>
            </div>
          )}
          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Shipments() {
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [detailTarget, setDetailTarget] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const load = async () => {
    setLoading(true);
    const params = filterStatus ? { status: filterStatus } : {};
    const { data } = await api.get('/shipments', { params });
    setShipments(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const markTransit = async (s) => {
    setBusyId(s._id);
    try {
      await api.put(`/shipments/${s._id}/transit`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'No se pudo actualizar el estatus');
    } finally {
      setBusyId(null);
    }
  };

  // "salida" la firma el mensajero (se lleva el equipo bajo su resguardo
  // para transportarlo) — "recepcion" la firma quien recibe en destino. Son
  // dos documentos separados a propósito, para que cada quien firme el que
  // le corresponde y no haya confusión sobre quién firma cuál.
  const downloadPdf = async (s, kind = 'salida') => {
    const endpoint = kind === 'recepcion' ? 'reception-pdf' : 'pdf';
    const prefix = kind === 'recepcion' ? 'Recepcion' : 'Salida';
    setDownloadingId(`${s._id}-${kind}`);
    try {
      const resp = await api.get(`/shipments/${s._id}/${endpoint}`, { responseType: 'blob' });
      const blob = new Blob([resp.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${prefix}_${s.folio}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.message || 'No se pudo descargar el PDF');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (s) => {
    if (!confirm(`¿Eliminar el envío ${s.folio}? Esta acción no se puede deshacer.`)) return;
    await api.delete(`/shipments/${s._id}`);
    load();
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Envíos entre Sucursales</h1>
          <p className={styles.subtitle}>Salidas de equipo — rastreo tipo paquetería: enviado, en tránsito y recibido (confirmado por el destinatario).</p>
        </div>
        <button className={styles.btnPrimary} onClick={() => setShowCreate(true)}>+ Nueva salida</button>
      </div>

      <div className={styles.tabs}>
        {['', 'enviado', 'en_transito', 'recibido'].map((st) => (
          <button
            key={st || 'todos'}
            className={`${styles.tab} ${filterStatus === st ? styles.tabActive : ''}`}
            onClick={() => setFilterStatus(st)}
          >
            {st ? STATUS_CONFIG[st].label : 'Todos'}
          </button>
        ))}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Folio</th>
              <th>Ruta</th>
              <th>Destinatario</th>
              <th>Equipos</th>
              <th>Motivo</th>
              <th>Fecha</th>
              <th>Estatus</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className={styles.empty}>Cargando...</td></tr>}
            {!loading && shipments.length === 0 && (
              <tr><td colSpan={8} className={styles.empty}>Sin envíos registrados</td></tr>
            )}
            {shipments.map((s) => {
              const sc = STATUS_CONFIG[s.status];
              return (
                <tr key={s._id}>
                  <td className={styles.nameCell}>{s.folio}</td>
                  <td>{s.originOffice} → {s.destinationOffice}</td>
                  <td>{s.recipientName}</td>
                  <td>{s.items.length} equipo{s.items.length !== 1 ? 's' : ''}</td>
                  <td className={styles.reasonCell}>{s.reason}</td>
                  <td className={styles.date}>{new Date(s.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td><span className={styles.statusBadge} style={{ color: sc.color, background: sc.bg }}>{sc.icon} {sc.label}</span></td>
                  <td>
                    <div className={styles.actions}>
                      <button className={styles.btnView} onClick={() => setDetailTarget(s)}>Ver</button>
                      {s.status === 'enviado' && (
                        <button className={styles.btnApprove} onClick={() => markTransit(s)} disabled={busyId === s._id}>
                          {busyId === s._id ? '...' : 'Marcar en tránsito'}
                        </button>
                      )}
                      <button className={styles.btnView} title="Firma el mensajero al llevárselo" onClick={() => downloadPdf(s, 'salida')} disabled={downloadingId === `${s._id}-salida`}>
                        {downloadingId === `${s._id}-salida` ? '...' : '⬇ Salida'}
                      </button>
                      <button className={styles.btnView} title="Firma quien recibe en destino" onClick={() => downloadPdf(s, 'recepcion')} disabled={downloadingId === `${s._id}-recepcion`}>
                        {downloadingId === `${s._id}-recepcion` ? '...' : '⬇ Recepción'}
                      </button>
                      {currentUser.role === 'admin' && (
                        <button className={styles.btnReject} onClick={() => handleDelete(s)}>Eliminar</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateShipmentModal onClose={() => setShowCreate(false)} onDone={() => { setShowCreate(false); load(); }} />
      )}
      {detailTarget && (
        <DetailModal shipment={detailTarget} onClose={() => setDetailTarget(null)} />
      )}
    </div>
  );
}
