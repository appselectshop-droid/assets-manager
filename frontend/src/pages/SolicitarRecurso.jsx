import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
// Reutiliza los mismos estilos que Solicitud de Cuentas/Ingreso — misma
// página pública, mismo lenguaje visual, contenido distinto.
import styles from './SolicitarCuenta.module.css';

// Mismas opciones ya validadas en el Excel original (data validation de las
// celdas D12/D13 de "FORMATO DE SOLICITUD DE RECURSOS Y SERVICIOS", SS-STD-DA-F01).
const REQUEST_TYPE_OPTIONS = ['ASIGNACIÓN', 'COMPRA', 'INSTALACIÓN'];
const RESOURCE_SERVICE_OPTIONS = [
  'LÍNEA TELEFÓNICA', 'EQUIPO FOTOGRÁFICO', 'EQUIPO DE CÓMPUTO', 'EQUIPO TELEFÓNICO',
  'SOFTWARE O LICENCIA', 'APP', 'SERVICIO EXTERNO', 'EQUIPO DE CÓMPUTO Y TELEFONÍA', 'OTRO',
];

const EMPTY = {
  employeeName: '', position: '', department: '', directManager: '',
  requestType: '', resourceService: '',
  detail: '', justification: '',
  requestedByEmail: '',
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

// Página pública (sin login, sin sidebar) — reemplaza el Excel "FORMATO DE
// SOLICITUD DE RECURSOS Y SERVICIOS" que se llenaba e imprimía a mano para
// pedir equipo, software, líneas o servicios externos. Solo queda
// "pendiente" para que Sistemas/Dirección la revise y apruebe o rechace
// desde "Solicitudes de Recursos".
export default function SolicitarRecurso() {
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // Quien solicita ya está registrado en Empleados — se busca por nombre y
  // se autorellena puesto/departamento, en vez de tenerlo que capturar a mano.
  const [nameQuery, setNameQuery] = useState('');
  const [nameMatches, setNameMatches] = useState([]);
  const [matchedEmployee, setMatchedEmployee] = useState(null);
  const [showNameDropdown, setShowNameDropdown] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (nameQuery.trim().length < 3) { setNameMatches([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/employees/public-lookup', { params: { q: nameQuery } });
        setNameMatches(data);
      } catch (_) { setNameMatches([]); }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [nameQuery]);

  const handleNameChange = (val) => {
    setNameQuery(val);
    setForm((f) => ({ ...f, employeeName: val }));
    setMatchedEmployee(null);
    setShowNameDropdown(true);
  };

  const pickEmployee = (emp) => {
    setForm((f) => ({
      ...f,
      employeeName: emp.name,
      position: emp.position || f.position,
      department: emp.department || emp.area || f.department,
      requestedByEmail: emp.corporateEmails?.[0] || f.requestedByEmail,
    }));
    setMatchedEmployee(emp);
    setNameQuery(emp.name);
    setShowNameDropdown(false);
  };

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.employeeName.trim()) { setError('Falta tu nombre completo.'); return; }
    if (!form.requestType) { setError('Selecciona el tipo de solicitud.'); return; }
    if (!form.resourceService) { setError('Selecciona el recurso o servicio.'); return; }
    if (!form.detail.trim()) { setError('Falta el detalle de la solicitud.'); return; }
    setSubmitting(true);
    try {
      await api.post('/resource-requests/public', form);
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
            <h1 className={styles.successTitle}>Solicitud enviada</h1>
            <p className={styles.successText}>Sistemas la revisará y te avisará el resultado.</p>
            <button className={styles.submitBtn} onClick={() => { setForm(EMPTY); setNameQuery(''); setMatchedEmployee(null); setDone(false); }}>
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
          <span className={styles.icon}>📦</span>
          <h1 className={styles.title}>Solicitud de Recursos y Servicios</h1>
          <p className={styles.subtitle}>Equipo, software, líneas o servicios externos — Select Shop MB</p>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className={styles.section}>
            <p className={styles.sectionTitle}>1. Tus datos</p>
            <div className={styles.field} style={{ position: 'relative' }}>
              <label>Nombre completo *</label>
              <input
                value={form.employeeName}
                onChange={(e) => handleNameChange(e.target.value)}
                onFocus={() => setShowNameDropdown(true)}
                onBlur={() => setTimeout(() => setShowNameDropdown(false), 150)}
                placeholder="Escribe tu nombre..."
                autoComplete="off"
              />
              {showNameDropdown && nameMatches.length > 0 && (
                <div className={styles.nameDropdown}>
                  {nameMatches.map((emp) => (
                    <button type="button" key={emp._id} className={styles.nameOption} onClick={() => pickEmployee(emp)}>
                      {emp.name}
                    </button>
                  ))}
                </div>
              )}
              {matchedEmployee && <p className={styles.hint}>✓ Te encontramos — puesto y departamento se agregaron solos.</p>}
            </div>
            <div className={styles.row}>
              <Field label="Puesto" value={form.position} onChange={set('position')} />
              <Field label="Departamento / Área" value={form.department} onChange={set('department')} />
            </div>
            <div className={styles.row}>
              <Field label="Jefe directo" value={form.directManager} onChange={set('directManager')} />
              <Field label="Correo de contacto (opcional)" value={form.requestedByEmail} onChange={set('requestedByEmail')} placeholder="para avisarte el resultado" />
            </div>
          </div>

          <div className={styles.section}>
            <p className={styles.sectionTitle}>2. Qué necesitas</p>
            <div className={styles.row}>
              <div className={styles.field}>
                <label>Tipo de solicitud *</label>
                <select value={form.requestType} onChange={(e) => set('requestType')(e.target.value)}>
                  <option value="">— Selecciona —</option>
                  {REQUEST_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>Recurso / Servicio *</label>
                <select value={form.resourceService} onChange={(e) => set('resourceService')(e.target.value)}>
                  <option value="">— Selecciona —</option>
                  {RESOURCE_SERVICE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div className={styles.field}>
              <label>Detalle de la solicitud *</label>
              <textarea value={form.detail} onChange={(e) => set('detail')(e.target.value)} placeholder="Ej. Se solicita reemplazar 1 celular Motorola..." />
            </div>
            <div className={styles.field}>
              <label>Justificación de la solicitud *</label>
              <textarea value={form.justification} onChange={(e) => set('justification')(e.target.value)} placeholder="¿Por qué se necesita?" />
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
