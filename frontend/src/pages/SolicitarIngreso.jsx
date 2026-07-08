import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
// Reutiliza los mismos estilos que Solicitud de Cuentas — misma página
// pública, mismo lenguaje visual, contenido distinto.
import styles from './SolicitarCuenta.module.css';

// Página pública (sin login, sin sidebar) exclusiva para RH — reemplaza el
// correo manual que se mandaba a Sistemas avisando de un ingreso nuevo
// (equipo, teléfono, correo, kit de bienvenida) y con qué datos darlo de
// alta. Nunca crea el empleado directo: alguien de Sistemas la revisa,
// confirma/corrige los datos (incluyendo el no. de empleado) y la aprueba
// desde "Solicitudes de Ingreso".

const BUSINESS_NAMES = [
  'ALEAGARAT', 'BH SOLAR', 'BH. BE HEALTHY COMERCIALIZADORA', 'BLOOM AND BLUSH',
  'COMERCIALIZADORA ONLINE NH', 'COMERCIALIZADORA DE MARCAS JSB', 'ENFERMERAS UNIDAS PLUS',
  'DONKERTECH', 'ZONA ZELU', 'SELECT SHOP MB',
];

const OFFICES = [
  'SUC.1 Corporativo Torre Polanco', 'SUC.3 Tienda Cuernavaca', 'SUC.4 Tienda Aragón',
  'SUC.5 CEDI Iztapalapa', 'SUC.6 CEDI Naucalpan', 'SUC.7 CEDI TEPOTZ JSB',
  'SUC.8 CEDI TEPOTZ B&B', 'SUC.10 Fontastic', 'SUC.11 Tienda Portal Centro',
  'SUC.12 Tienda Perinorte', 'GOLDEN',
];

const EMPTY = {
  employeeName: '', position: '', department: '', area: '', businessName: '', office: '',
  directManager: '', startDate: '',
  desiredCorporateEmail: '',
  needsEmail: false,
  needsComputer: false, computerNotes: '',
  needsPhone: false, phoneNotes: '',
  needsAccessories: false, accessoriesNotes: '',
  needsWelcomeKit: false,
  notes: '',
  requestedByName: '', requestedByEmail: '',
  website: '', // honeypot
};

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div className={styles.field}>
      <label>{label}</label>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export default function SolicitarIngreso() {
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // Quien solicita (RH) ya está registrado en Empleados — se busca por
  // nombre y se autorellena su correo, en vez de tenerlo que capturar a mano.
  const [requesterQuery, setRequesterQuery] = useState('');
  const [requesterMatches, setRequesterMatches] = useState([]);
  const [matchedRequester, setMatchedRequester] = useState(null);
  const [showRequesterDropdown, setShowRequesterDropdown] = useState(false);
  const requesterDebounceRef = useRef(null);

  useEffect(() => {
    if (requesterDebounceRef.current) clearTimeout(requesterDebounceRef.current);
    if (requesterQuery.trim().length < 3) { setRequesterMatches([]); return; }
    requesterDebounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/employees/public-lookup', { params: { q: requesterQuery } });
        setRequesterMatches(data);
      } catch (_) { setRequesterMatches([]); }
    }, 350);
    return () => clearTimeout(requesterDebounceRef.current);
  }, [requesterQuery]);

  const handleRequesterNameChange = (val) => {
    setRequesterQuery(val);
    setForm((f) => ({ ...f, requestedByName: val, requestedByEmail: '' }));
    setMatchedRequester(null);
    setShowRequesterDropdown(true);
  };

  const pickRequester = (emp) => {
    setForm((f) => ({ ...f, requestedByName: emp.name, requestedByEmail: emp.corporateEmails?.[0] || '' }));
    setMatchedRequester(emp);
    setRequesterQuery(emp.name);
    setShowRequesterDropdown(false);
  };

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.employeeName.trim()) {
      setError('Falta el nombre del nuevo ingreso.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/onboarding-requests/public', form);
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo enviar la solicitud. Intenta de nuevo.');
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
            <h1 className={styles.successTitle}>Solicitud de ingreso enviada</h1>
            <p className={styles.successText}>Sistemas la revisará y preparará lo necesario para el ingreso.</p>
            <button className={styles.submitBtn} onClick={() => { setForm(EMPTY); setDone(false); }}>
              Enviar otra solicitud
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
          <span className={styles.icon}>🧑‍💼</span>
          <h1 className={styles.title}>Solicitud de Ingreso de Personal</h1>
          <p className={styles.subtitle}>Recursos Humanos — Select Shop MB</p>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className={styles.section}>
            <p className={styles.sectionTitle}>1. Datos del nuevo ingreso</p>
            <div className={styles.row}>
              <Field label="Nombre completo *" value={form.employeeName} onChange={set('employeeName')} />
              <Field label="Puesto" value={form.position} onChange={set('position')} />
            </div>
            <div className={styles.row}>
              <Field label="Área" value={form.area} onChange={set('area')} />
              <Field label="Departamento" value={form.department} onChange={set('department')} />
            </div>
            <div className={styles.row}>
              <div className={styles.field}>
                <label>Empresa / Razón social</label>
                <select value={form.businessName} onChange={(e) => set('businessName')(e.target.value)}>
                  <option value="">— Selecciona —</option>
                  {BUSINESS_NAMES.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>Oficina / Sucursal</label>
                <select value={form.office} onChange={(e) => set('office')(e.target.value)}>
                  <option value="">— Selecciona —</option>
                  {OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div className={styles.row}>
              <Field label="Jefe directo" value={form.directManager} onChange={set('directManager')} />
              <Field label="Fecha de ingreso" value={form.startDate} onChange={set('startDate')} type="date" />
            </div>
          </div>

          <div className={styles.section}>
            <p className={styles.sectionTitle}>2. Correo corporativo</p>
            <label className={`${styles.checkOption} ${form.needsEmail ? styles.checkOptionActive : ''}`}>
              <input type="checkbox" checked={form.needsEmail} onChange={(e) => set('needsEmail')(e.target.checked)} />
              📧 Necesita correo corporativo
            </label>
            {form.needsEmail && (
              <div className={styles.field} style={{ marginTop: '0.75rem' }}>
                <label>¿Cómo quieres que quede el correo?</label>
                <input value={form.desiredCorporateEmail} placeholder="metodosyprocedimientos@selectshop.com.mx"
                  onChange={(e) => set('desiredCorporateEmail')(e.target.value)} />
                <p className={styles.hint}>Es una sugerencia — Sistemas confirma el nombre final antes de crearlo.</p>
              </div>
            )}
          </div>

          <div className={styles.section}>
            <p className={styles.sectionTitle}>3. Equipo necesario</p>
            <div className={styles.checkGrid}>
              <div className={styles.platformBlock}>
                <label className={styles.platformHeader}>
                  <input type="checkbox" checked={form.needsComputer} onChange={(e) => set('needsComputer')(e.target.checked)} />
                  💻 Computadora
                </label>
                {form.needsComputer && (
                  <Field label="Tipo de equipo / especificaciones" value={form.computerNotes} onChange={set('computerNotes')} placeholder="Laptop, escritorio, requerimientos especiales..." />
                )}
              </div>
              <div className={styles.platformBlock}>
                <label className={styles.platformHeader}>
                  <input type="checkbox" checked={form.needsPhone} onChange={(e) => set('needsPhone')(e.target.checked)} />
                  📱 Teléfono
                </label>
                {form.needsPhone && (
                  <Field label="Tipo de equipo" value={form.phoneNotes} onChange={set('phoneNotes')} placeholder="Gama, plan, requerimientos..." />
                )}
              </div>
              <div className={styles.platformBlock}>
                <label className={styles.platformHeader}>
                  <input type="checkbox" checked={form.needsAccessories} onChange={(e) => set('needsAccessories')(e.target.checked)} />
                  🖱️ Accesorios
                </label>
                {form.needsAccessories && (
                  <Field label="¿Cuáles?" value={form.accessoriesNotes} onChange={set('accessoriesNotes')} placeholder="Mouse, teclado, monitor, audífonos..." />
                )}
              </div>
              <label className={`${styles.checkOption} ${form.needsWelcomeKit ? styles.checkOptionActive : ''}`}>
                <input type="checkbox" checked={form.needsWelcomeKit} onChange={(e) => set('needsWelcomeKit')(e.target.checked)} />
                🎁 Kit de bienvenida
              </label>
            </div>
          </div>

          <div className={styles.section}>
            <p className={styles.sectionTitle}>4. Datos de quién solicita</p>
            <div className={styles.field} style={{ position: 'relative' }}>
              <label>Tu nombre</label>
              <input
                value={form.requestedByName}
                onChange={(e) => handleRequesterNameChange(e.target.value)}
                onFocus={() => setShowRequesterDropdown(true)}
                onBlur={() => setTimeout(() => setShowRequesterDropdown(false), 150)}
                placeholder="Escribe tu nombre..."
                autoComplete="off"
              />
              {showRequesterDropdown && requesterMatches.length > 0 && (
                <div className={styles.nameDropdown}>
                  {requesterMatches.map((emp) => (
                    <button type="button" key={emp._id} className={styles.nameOption} onClick={() => pickRequester(emp)}>
                      {emp.name}
                    </button>
                  ))}
                </div>
              )}
              {matchedRequester && <p className={styles.hint}>✓ Te encontramos — tu correo se agregó solo.</p>}
            </div>
            <div className={styles.field}>
              <label>Notas adicionales (opcional)</label>
              <textarea value={form.notes} onChange={(e) => set('notes')(e.target.value)} />
            </div>
          </div>

          {/* Honeypot — invisible para personas */}
          <div className={styles.honeypot} aria-hidden="true">
            <label>No llenar este campo</label>
            <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set('website')(e.target.value)} />
          </div>

          <button type="submit" className={styles.submitBtn} disabled={submitting}>
            {submitting ? 'Enviando...' : 'Enviar solicitud'}
          </button>
        </form>
      </div>
    </div>
  );
}
