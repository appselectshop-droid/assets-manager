import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
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

const EMPTY = {
  employeeName: '', employeeRef: '',
  assetRef: '', assetLabel: '',
  ticketType: '', subject: '', description: '', blocksWork: false,
  website: '', // honeypot
};

// Página pública (sin login, sin sidebar) — cualquier empleado reporta un
// problema de soporte sin necesitar cuenta en el sistema. A diferencia de
// otras solicitudes, si el nombre no coincide con nadie en Empleados se
// acepta tal cual (no se bloquea el reporte) — pero si sí coincide, el
// ticket queda ligado al ACTIVO específico que tiene asignado hoy (no a la
// persona), para que el historial de problemas se quede con la máquina
// aunque después se reasigne a alguien más.
export default function ReportarTicket() {
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null); // folio al terminar
  const [file, setFile] = useState(null);

  const [nameQuery, setNameQuery] = useState('');
  const [nameMatches, setNameMatches] = useState([]);
  const [matchedEmployee, setMatchedEmployee] = useState(null);
  const [showNameDropdown, setShowNameDropdown] = useState(false);
  const debounceRef = useRef(null);

  const [myAssets, setMyAssets] = useState([]);
  const [noSpecificAsset, setNoSpecificAsset] = useState(false);

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
    setForm((f) => ({ ...f, employeeName: val, employeeRef: '', assetRef: '', assetLabel: '' }));
    setMatchedEmployee(null);
    setMyAssets([]);
    setNoSpecificAsset(false);
    setShowNameDropdown(true);
  };

  const pickEmployee = async (emp) => {
    setForm((f) => ({ ...f, employeeName: emp.name, employeeRef: emp._id, assetRef: '', assetLabel: '' }));
    setMatchedEmployee(emp);
    setNameQuery(emp.name);
    setShowNameDropdown(false);
    setNoSpecificAsset(false);
    try {
      const { data } = await api.get('/tickets/public/my-assets', { params: { employeeId: emp._id } });
      setMyAssets(data);
      // Si solo tiene un activo asignado, no hace falta que elija — se
      // selecciona solo.
      if (data.length === 1) {
        const a = data[0];
        setForm((f) => ({ ...f, assetRef: a._id, assetLabel: assetLabelOf(a) }));
      }
    } catch (_) { setMyAssets([]); }
  };

  const assetLabelOf = (a) => `${a.brand || ''} ${a.model || ''}`.trim() + (a.serialNumber ? ` (${a.serialNumber})` : '') || 'Equipo sin marca/modelo';

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
    if (!form.employeeName.trim()) { setError('Falta tu nombre completo.'); return; }
    if (!form.ticketType) { setError('Selecciona el tipo de soporte.'); return; }
    if (!form.subject.trim()) { setError('Falta el asunto del ticket.'); return; }
    if (matchedEmployee && myAssets.length > 1 && !form.assetRef && !noSpecificAsset) {
      setError('Elige de qué equipo es el problema, o marca que no es sobre un equipo en particular.');
      return;
    }
    setSubmitting(true);
    try {
      const data = new FormData();
      data.append('employeeName', form.employeeName);
      if (form.employeeRef) data.append('employeeRef', form.employeeRef);
      if (form.assetRef) data.append('assetRef', form.assetRef);
      data.append('ticketType', form.ticketType);
      data.append('subject', form.subject);
      data.append('description', form.description);
      data.append('blocksWork', form.blocksWork);
      data.append('website', form.website);
      if (file) data.append('attachment', file);

      const { data: result } = await api.post('/tickets/public', data, {
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
            <button className={styles.submitBtn} onClick={() => {
              setForm(EMPTY); setNameQuery(''); setMatchedEmployee(null); setMyAssets([]);
              setNoSpecificAsset(false); setFile(null); setDone(null);
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
              {matchedEmployee && <p className={styles.hint}>✓ Te encontramos en el sistema.</p>}
            </div>
          </div>

          {matchedEmployee && myAssets.length > 0 && (
            <div className={styles.section}>
              <p className={styles.sectionTitle}>2. ¿De qué equipo es el problema?</p>
              <div className={styles.permGrid}>
                {myAssets.map((a) => (
                  <label key={a._id} className={styles.permOption}>
                    <input
                      type="radio"
                      name="asset"
                      checked={form.assetRef === a._id}
                      onChange={() => { setForm((f) => ({ ...f, assetRef: a._id, assetLabel: assetLabelOf(a) })); setNoSpecificAsset(false); }}
                    />
                    {assetLabelOf(a)}
                  </label>
                ))}
                <label className={styles.permOption}>
                  <input
                    type="radio"
                    name="asset"
                    checked={noSpecificAsset}
                    onChange={() => { setNoSpecificAsset(true); setForm((f) => ({ ...f, assetRef: '', assetLabel: '' })); }}
                  />
                  No es sobre un equipo en particular
                </label>
              </div>
            </div>
          )}

          <div className={styles.section}>
            <p className={styles.sectionTitle}>{matchedEmployee && myAssets.length > 0 ? '3' : '2'}. Qué está pasando</p>
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

          {/* Honeypot — invisible para personas */}
          <div className={styles.honeypot} aria-hidden="true">
            <label>No llenar este campo</label>
            <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set('website')(e.target.value)} />
          </div>

          <button type="submit" className={styles.submitBtn} disabled={submitting}>
            {submitting ? 'Enviando...' : 'Enviar ticket'}
          </button>
        </form>
      </div>
    </div>
  );
}
