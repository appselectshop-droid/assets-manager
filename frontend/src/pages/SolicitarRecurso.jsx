import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { ACCESSORY_TYPE_LABELS } from '../config/assetFields';
// Reutiliza los mismos estilos que Solicitud de Cuentas/Ingreso — misma
// página pública, mismo lenguaje visual, contenido distinto.
import styles from './SolicitarCuenta.module.css';

// Lo que Sistemas realmente puede entregar de su stock — mismo catálogo que
// ya usa el resto de la app (ver Activos/Accesorios), no las categorías del
// Excel original (esto siempre es asignación, nunca compra ni instalación,
// eso lo maneja otra área). "Tablet" se excluye por el mismo motivo que en
// Solicitud de Ingreso (ya vive conceptualmente en Teléfono). "Línea
// Telefónica" y "Software o Licencia" van aparte porque son servicios, no
// accesorios físicos de stock — al elegir esta última se pide especificar cuál.
// "Otro (especifica)" es el escape para lo que todavía no está en el
// catálogo — si Sistemas lo aprueba, queda como casilla fija para la
// próxima vez (ver /resource-requests/custom-options/public).
const LICENSE_OPTION = 'Software o Licencia';
const OTHER_OPTION = 'Otro (especifica)';
const BASE_RESOURCE_OPTIONS = [
  ...Object.entries(ACCESSORY_TYPE_LABELS).filter(([key]) => key !== 'tablet').map(([, label]) => label),
  'Línea Telefónica',
  LICENSE_OPTION,
];

// ?tipo=telefono|software llega del wizard de Mesa de Ayuda — mapea a la
// opción estática correspondiente (las dos únicas que no dependen de
// customOptions, que carga async, así se pueden preseleccionar de inmediato).
const TIPO_TO_RESOURCE = { telefono: 'Línea Telefónica', software: LICENSE_OPTION };

const EMPTY = {
  employeeName: '', position: '', department: '', employeeId: '',
  resourceItems: [],
  licenseDetail: '',
  otherDetail: '',
  justification: '',
  requestedByEmail: '',
  website: '', // honeypot
};

// Página pública (sin login, sin sidebar) — reemplaza el Excel "FORMATO DE
// SOLICITUD DE RECURSOS Y SERVICIOS" que se llenaba e imprimía a mano. Solo
// queda "pendiente" para que Sistemas la revise y apruebe o rechace desde
// "Solicitudes de Recursos".
export default function SolicitarRecurso() {
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState(() => {
    const preset = TIPO_TO_RESOURCE[searchParams.get('tipo')];
    return { ...EMPTY, resourceItems: preset ? [preset] : [] };
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // Quien solicita ya está registrado en Empleados — se busca por nombre y
  // se autorellena puesto/departamento por dentro, sin volver a pedirlos.
  const [nameQuery, setNameQuery] = useState('');
  const [nameMatches, setNameMatches] = useState([]);
  const [matchedEmployee, setMatchedEmployee] = useState(null);
  const [showNameDropdown, setShowNameDropdown] = useState(false);
  const debounceRef = useRef(null);

  // Opciones que se han ido aprobando de solicitudes anteriores con "Otro
  // (especifica)" — se muestran como casilla normal, junto a las de siempre.
  const [customOptions, setCustomOptions] = useState([]);
  useEffect(() => {
    api.get('/resource-requests/custom-options/public')
      .then(({ data }) => setCustomOptions(data))
      .catch(() => setCustomOptions([]));
  }, []);
  const RESOURCE_OPTIONS = [...BASE_RESOURCE_OPTIONS, ...customOptions, OTHER_OPTION];

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
    setForm((f) => ({ ...f, employeeName: val, position: '', department: '', employeeId: '' }));
    setMatchedEmployee(null);
    setShowNameDropdown(true);
  };

  const pickEmployee = (emp) => {
    setForm((f) => ({
      ...f,
      employeeName: emp.name,
      position: emp.position || '',
      department: emp.department || emp.area || '',
      employeeId: emp._id,
      requestedByEmail: emp.corporateEmails?.[0] || f.requestedByEmail,
    }));
    setMatchedEmployee(emp);
    setNameQuery(emp.name);
    setShowNameDropdown(false);
  };

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  const toggleItem = (item) => {
    setForm((f) => ({
      ...f,
      resourceItems: f.resourceItems.includes(item)
        ? f.resourceItems.filter((v) => v !== item)
        : [...f.resourceItems, item],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.employeeName.trim()) { setError('Falta tu nombre completo.'); return; }
    if (!form.resourceItems.length) { setError('Selecciona al menos un recurso.'); return; }
    if (form.resourceItems.includes(LICENSE_OPTION) && !form.licenseDetail.trim()) {
      setError('Especifica qué software o licencia necesitas.');
      return;
    }
    if (form.resourceItems.includes(OTHER_OPTION) && !form.otherDetail.trim()) {
      setError('Especifica qué otro recurso necesitas.');
      return;
    }
    if (!form.justification.trim()) { setError('Falta la justificación de la solicitud.'); return; }
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
          <h1 className={styles.title}>Solicitud de Recursos</h1>
          <p className={styles.subtitle}>Accesorios, línea telefónica y licencias — Select Shop MB</p>
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
              {matchedEmployee && (
                <p className={styles.hint}>✓ Te encontramos — {matchedEmployee.position || 'sin puesto'} · {matchedEmployee.department || matchedEmployee.area || 'sin departamento'}</p>
              )}
            </div>
          </div>

          <div className={styles.section}>
            <p className={styles.sectionTitle}>2. Qué necesitas</p>
            <div className={styles.permGrid}>
              {RESOURCE_OPTIONS.map((opt) => (
                <label key={opt} className={styles.permOption}>
                  <input type="checkbox" checked={form.resourceItems.includes(opt)} onChange={() => toggleItem(opt)} />
                  {opt}
                </label>
              ))}
            </div>
            {form.resourceItems.includes(LICENSE_OPTION) && (
              <div className={styles.field} style={{ marginTop: '0.75rem' }}>
                <label>¿Cuál software o licencia? *</label>
                <input value={form.licenseDetail} onChange={(e) => set('licenseDetail')(e.target.value)} placeholder="Ej. Adobe Acrobat Pro, Office 365, AutoCAD..." />
              </div>
            )}
            {form.resourceItems.includes(OTHER_OPTION) && (
              <div className={styles.field} style={{ marginTop: '0.75rem' }}>
                <label>¿Qué otro recurso necesitas? *</label>
                <input value={form.otherDetail} onChange={(e) => set('otherDetail')(e.target.value)} placeholder="Ej. Base para laptop, silla ergonómica..." />
              </div>
            )}
            <div className={styles.field} style={{ marginTop: '0.75rem' }}>
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
