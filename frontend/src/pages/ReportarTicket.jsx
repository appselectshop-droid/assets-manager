import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import employeeApi from '../services/employeeApi';
import PortalLayout from '../components/PortalLayout';
// `shared`: mismos estilos de campo/sección que las demás páginas públicas
// (Solicitar Cuenta/Ingreso/Recurso). `rt`: cascarón propio (encabezado +
// panel) para que se vea como el resto del portal (Solicitudes/Mis Tickets),
// no como una tarjeta flotante aparte.
import shared from './SolicitarCuenta.module.css';
import rt from './ReportarTicket.module.css';

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
      <PortalLayout activeNav="tickets">
        <div className={rt.mainHead}>
          <h1>Reportar un problema</h1>
          <p>Ticket de soporte — Sistemas IT & BI</p>
        </div>
        <div className={rt.panel}>
          <div className={shared.successBox}>
            <span className={shared.successIcon}>✅</span>
            <h2 className={shared.successTitle}>Ticket enviado</h2>
            <p className={shared.successText}>Folio {done} — Sistemas lo va a revisar.</p>
            <Link to="/mis-tickets" className={shared.submitBtn} style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              Ver mis tickets
            </Link>
            <button className={shared.nameOption} style={{ marginTop: '0.6rem' }} onClick={() => {
              setForm(EMPTY); setFile(null); setDone(null);
            }}>
              Reportar otro ticket
            </button>
          </div>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout activeNav="tickets">
      <div className={rt.mainHead}>
        <h1>Reportar un problema</h1>
        <p>Ticket de soporte — Sistemas IT & BI</p>
      </div>

      <div className={rt.panel}>
        {error && <p className={shared.error}>{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className={shared.section}>
            <p className={shared.sectionTitle}>1. Tus datos</p>
            <p className={shared.hint}>Reportando como <strong>{employeeUser.name}</strong>.</p>
          </div>

          <div className={shared.section}>
            <p className={shared.sectionTitle}>2. Qué está pasando</p>
            <div className={shared.field}>
              <label>Tipo de soporte *</label>
              <div className={shared.radioRow} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.4rem' }}>
                {TICKET_TYPES.map(([key, label]) => (
                  <label key={key} className={shared.radioOption}>
                    <input type="radio" name="ticketType" checked={form.ticketType === key} onChange={() => set('ticketType')(key)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            {form.ticketType === OTHER_TYPE && (
              <div className={shared.field}>
                <label>¿De qué se trata? *</label>
                <input value={form.otherTypeDetail} onChange={(e) => set('otherTypeDetail')(e.target.value)} placeholder="Especifica el motivo del ticket" />
              </div>
            )}
            {form.ticketType === 'software' && apps.length > 0 && (
              <div className={shared.field}>
                <label>¿Es sobre alguna aplicación en particular? (opcional)</label>
                <select value={form.appRef} onChange={(e) => set('appRef')(e.target.value)}>
                  <option value="">No estoy seguro / no aplica</option>
                  {apps.map((a) => (
                    <option key={a._id} value={a._id}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className={shared.field}>
              <label>Asunto *</label>
              <input value={form.subject} onChange={(e) => set('subject')(e.target.value)} placeholder="Ej. La laptop no enciende" />
            </div>
            <div className={shared.field}>
              <label>Descripción</label>
              <textarea value={form.description} onChange={(e) => set('description')(e.target.value)} placeholder="Cuéntanos con más detalle qué pasa..." />
            </div>
            <label className={shared.checkOption}>
              <input type="checkbox" checked={form.blocksWork} onChange={(e) => set('blocksWork')(e.target.checked)} />
              ⚠️ Esto me impide trabajar
            </label>
            <div className={shared.field} style={{ marginTop: '0.75rem' }}>
              <label>Adjuntar evidencia (foto/captura, opcional)</label>
              <input type="file" accept="image/*,.pdf" onChange={handleFileChange} />
            </div>
          </div>

          <button type="submit" className={shared.submitBtn} disabled={submitting}>
            {submitting ? 'Enviando...' : 'Enviar ticket'}
          </button>
        </form>
      </div>
    </PortalLayout>
  );
}
