import { useEffect, useRef, useState } from 'react';
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

// Mismo correo que el backend (backend/src/utils/pdfBranding.js) — todos son
// admin, pero aquí solo se usa para decidir qué botones mostrar; el backend
// es quien realmente hace valer el permiso.
const GERENTE_SISTEMAS_EMAIL = 'gerente.sistemas@selectshop.com.mx';

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
  // Todos son admin, pero un envío sigue siendo "de quien lo creó" — pedido
  // explícito: cualquiera puede VER la lista completa (para coordinarse),
  // pero solo quien lo creó (o el Gerente de Sistemas) puede modificarlo.
  const canManage = (s) => currentUser.email === GERENTE_SISTEMAS_EMAIL || s.sentBy === currentUser.id;
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [detailTarget, setDetailTarget] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [signatureTargetId, setSignatureTargetId] = useState(null);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const signatureInputRef = useRef(null);

  const load = async () => {
    setLoading(true);
    const params = filterStatus ? { status: filterStatus } : {};
    const { data } = await api.get('/shipments', { params });
    setShipments(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterStatus]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Solo Felipe (Luis Felipe Gomez Gonzalez) tiene firma reutilizable —
  // pedido explicito: "no ningun otro Felipe". Un solo nombre de pila no
  // basta (puede haber mas de un Felipe en la empresa), por eso se exige que
  // aparezcan al menos 2 de sus nombres/apellidos reales — "felipe" solo no
  // enciende el boton, pero "felipe gomez", "luis felipe gomez" o su nombre
  // completo si.
  const isFelipeShipment = (s) => {
    const norm = (v) => (v || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const matches = (v) => {
      const n = norm(v);
      return n.includes('felipe gomez') || n.includes('gomez felipe') || n.includes('luis felipe gomez gonzalez');
    };
    return matches(s.receivedByName) || matches(s.recipientName);
  };

  const openSignaturePicker = (s) => {
    setSignatureTargetId(s._id);
    signatureInputRef.current?.click();
  };

  // Sube la hoja escaneada UNA vez, desde cualquiera de sus envíos ya
  // registrados — no hace falta esperar al link público. Se guarda en la
  // ficha de Felipe y de ahí en adelante todos sus PDF de recepción futuros
  // ya salen firmados solos.
  const handleSignatureFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !signatureTargetId) return;
    setUploadingSignature(true);
    try {
      const formData = new FormData();
      formData.append('signatureImage', file);
      const { data } = await api.post(`/shipments/${signatureTargetId}/signature`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      alert(data.message || 'Firma guardada');
    } catch (err) {
      alert(err.response?.data?.message || 'No se pudo subir la firma');
    } finally {
      setUploadingSignature(false);
      setSignatureTargetId(null);
    }
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
                      <button className={styles.btnView} title="Firma el mensajero al llevárselo" onClick={() => downloadPdf(s, 'salida')} disabled={downloadingId === `${s._id}-salida`}>
                        {downloadingId === `${s._id}-salida` ? '...' : '⬇ Salida'}
                      </button>
                      <button
                        className={styles.btnView}
                        title={s.status === 'recibido' ? 'Firma quien recibe en destino' : 'Se habilita cuando el destinatario confirme la recepción'}
                        onClick={() => downloadPdf(s, 'recepcion')}
                        disabled={downloadingId === `${s._id}-recepcion` || s.status !== 'recibido'}
                      >
                        {downloadingId === `${s._id}-recepcion` ? '...' : '⬇ Recepción'}
                      </button>
                      {isFelipeShipment(s) && (
                        <button
                          className={styles.btnView}
                          title="Sube su hoja firmada una sola vez — de ahí en adelante sus PDF de recepción ya salen firmados solos"
                          onClick={() => openSignaturePicker(s)}
                          disabled={uploadingSignature && signatureTargetId === s._id}
                        >
                          {uploadingSignature && signatureTargetId === s._id ? '...' : '🖊 Firma'}
                        </button>
                      )}
                      {currentUser.role === 'admin' && canManage(s) && (
                        <button className={styles.btnReject} onClick={() => handleDelete(s)}>Eliminar</button>
                      )}
                      {!canManage(s) && (
                        <span className={styles.muted} title="Solo quien lo creó (o el Gerente de Sistemas) puede modificar este envío">🔒 De {s.sentByName}</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <input
        type="file"
        accept="image/jpeg,image/png"
        ref={signatureInputRef}
        style={{ display: 'none' }}
        onChange={handleSignatureFileChange}
      />

      {showCreate && (
        <CreateShipmentModal onClose={() => setShowCreate(false)} onDone={() => { setShowCreate(false); load(); }} />
      )}
      {detailTarget && (
        <DetailModal shipment={detailTarget} onClose={() => setDetailTarget(null)} />
      )}
    </div>
  );
}
