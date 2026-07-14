import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import employeeApi from '../services/employeeApi';
// Reutiliza los mismos estilos que las demás páginas públicas (Solicitar
// Cuenta/Ingreso/Recurso) — mismo lenguaje visual, contenido distinto.
import styles from './SolicitarCuenta.module.css';

const TICKET_TYPES = [
  ['hardware', '🖥️ Hardware (no enciende, pantalla, batería, teclado...)'],
  ['software', '💾 Software (sistema operativo, un programa, lentitud...)'],
  ['red', '📶 Red / Conectividad (WiFi, impresora, VPN...)'],
  ['cuenta_acceso', '🔐 Cuenta / Acceso (contraseña, permisos...)'],
  ['otro', '❓ Otro'],
];

const OTHER_TYPE = 'otro';

const EMPTY = {
  ticketType: '', otherTypeDetail: '', subject: '', description: '', blocksWork: false,
  appRef: '',
};

// Requiere sesión de empleado (ver EmployeeLogin.jsx / App.jsx —
// EmployeeRoute) desde que se agregó el historial de "Mis Tickets": la
// identidad ya no se busca por nombre escrito a mano, viene de la sesión
// (localStorage.employeeUser), y el ticket se manda a POST /tickets/mine.
export default function ReportarTicket() {
  const [searchParams] = useSearchParams();
  const employeeUser = JSON.parse(localStorage.getItem('employeeUser') || '{}');

  const [form, setForm] = useState(() => {
    const tipo = searchParams.get('tipo');
    const isValid = TICKET_TYPES.some(([key]) => key === tipo);
    return { ...EMPTY, ticketType: isValid ? tipo : '' };
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null); // folio al terminar
  const [file, setFile] = useState(null);

  // Catálogo de aplicaciones internas (ver InternalApps) — para que un
  // ticket de tipo Software se pueda ligar a la app específica y Sistemas
  // sepa a dónde enrutarlo (ej. "Cuentas por Pagar" es de Héctor, no de
  // Sistemas). Solo nombre/descripción — el resto (responsable, documento)
  // no le sirve a quien reporta.
  const [apps, setApps] = useState([]);
  useEffect(() => {
    employeeApi.get('/internal-apps/public').then(({ data }) => setApps(data)).catch(() => setApps([]));
  }, []);

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f && f.size > 15 * 1024 * 1024) {
      setError('La evidencia no puede pesar más de 15MB.');
      e.target.value = '';
      return;
    }
    setFile(f || null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.ticketType) { setError('Selecciona el tipo de soporte.'); return; }
    if (form.ticketType === OTHER_TYPE && !form.otherTypeDetail.trim()) { setError('Especifica de qué se trata.'); return; }
    if (!form.subject.trim()) { setError('Falta el asunto del ticket.'); return; }
    setSubmitting(true);
    try {
      const data = new FormData();
      data.append('ticketType', form.ticketType);
      data.append('otherTypeDetail', form.otherTypeDetail);
      data.append('subject', form.subject);
      data.append('description', form.description);
      data.append('blocksWork', form.blocksWork);
      if (form.appRef) data.append('appRef', form.appRef);
      if (file) data.append('attachment', file);

      const { data: result } = await employeeApi.post('/tickets/mine', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setDone(result.folio);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo enviar el ticket. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.successBox}>
            <span className={styles.successIcon}>✅</span>
            <h1 className={styles.successTitle}>Ticket enviado</h1>
            <p className={styles.successText}>Folio {done} — Sistemas lo va a revisar.</p>
            <Link to="/mis-tickets" className={styles.submitBtn} style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              Ver mis tickets
            </Link>
            <button className={styles.nameOption} style={{ marginTop: '0.6rem' }} onClick={() => {
              setForm(EMPTY); setFile(null); setDone(null);
            }}>
              Reportar otro ticket
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.icon}>🎫</span>
          <h1 className={styles.title}>Reportar un problema</h1>
          <p className={styles.subtitle}>Ticket de soporte — Sistemas IT & BI</p>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className={styles.section}>
            <p className={styles.sectionTitle}>1. Tus datos</p>
            <p className={styles.hint}>Reportando como <strong>{employeeUser.name}</strong>.</p>
          </div>

          <div className={styles.section}>
            <p className={styles.sectionTitle}>2. Qué está pasando</p>
            <div className={styles.field}>
              <label>Tipo de soporte *</label>
              <div className={styles.radioRow} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.4rem' }}>
                {TICKET_TYPES.map(([key, label]) => (
                  <label key={key} className={styles.radioOption}>
                    <input type="radio" name="ticketType" checked={form.ticketType === key} onChange={() => set('ticketType')(key)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            {form.ticketType === OTHER_TYPE && (
              <div className={styles.field}>
                <label>¿De qué se trata? *</label>
                <input value={form.otherTypeDetail} onChange={(e) => set('otherTypeDetail')(e.target.value)} placeholder="Especifica el motivo del ticket" />
              </div>
            )}
            {form.ticketType === 'software' && apps.length > 0 && (
              <div className={styles.field}>
                <label>¿Es sobre alguna aplicación en particular? (opcional)</label>
                <select value={form.appRef} onChange={(e) => set('appRef')(e.target.value)}>
                  <option value="">No estoy seguro / no aplica</option>
                  {apps.map((a) => (
                    <option key={a._id} value={a._id}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className={styles.field}>
              <label>Asunto *</label>
              <input value={form.subject} onChange={(e) => set('subject')(e.target.value)} placeholder="Ej. La laptop no enciende" />
            </div>
            <div className={styles.field}>
              <label>Descripción</label>
              <textarea value={form.description} onChange={(e) => set('description')(e.target.value)} placeholder="Cuéntanos con más detalle qué pasa..." />
            </div>
            <label className={styles.checkOption}>
              <input type="checkbox" checked={form.blocksWork} onChange={(e) => set('blocksWork')(e.target.checked)} />
              ⚠️ Esto me impide trabajar
            </label>
            <div className={styles.field} style={{ marginTop: '0.75rem' }}>
              <label>Adjuntar evidencia (foto/captura, opcional)</label>
              <input type="file" accept="image/*,.pdf" onChange={handleFileChange} />
            </div>
          </div>

          <button type="submit" className={styles.submitBtn} disabled={submitting}>
            {submitting ? 'Enviando...' : 'Enviar ticket'}
          </button>
        </form>
      </div>
    </div>
  );
}
