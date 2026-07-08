import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import styles from './SolicitarCuenta.module.css';

// Página pública (sin login, sin sidebar) — el link se comparte directo con
// quien necesite pedir una cuenta o acceso. Guarda la solicitud en el mismo
// sistema que usan las Responsivas, pero nunca crea la cuenta real: alguien
// del área de Sistemas la revisa y aprueba a mano desde "Solicitudes de
// Cuentas" (solo ve los tipos que administra — Gmail/Plataformas por un
// lado, ERP por otro, nunca mezclados).

const MARKETPLACE_OPTIONS = ['Mercado Libre', 'Amazon', 'Walmart', 'TikTok Shop', 'Coppel', 'Liverpool'];

const PERMISSION_FIELDS = [
  ['ventas', 'Ventas al detalle'], ['publicaciones', 'Publicaciones'], ['inventarios', 'Inventarios'],
  ['envio', 'Gestión de envío (Full)'], ['pagos', 'Pagos'], ['facturas', 'Facturas'], ['admin', 'Admin (total)'],
];

const ERP_MODULE_OPTIONS = [
  'Ventas', 'Compras', 'Inventarios / Almacén', 'Facturación', 'CxC', 'CxP',
  'Finanzas / Contabilidad', 'Bancos / Tesorería', 'Nómina / RH', 'Reportes / BI',
];
const ERP_ACCESS_LEVELS = ['Consulta (solo lectura)', 'Captura / Operación', 'Autorización / Supervisión', 'Administrador'];

const EMPTY = {
  employeeName: '', employeeIdNum: '', position: '', department: '', directManager: '',
  phone: '', businessName: '',
  wantsGmail: false, wantsPlatforms: false, wantsErp: false,
  gmail: { username: '', gmailTouched: false, displayName: '', accountKind: 'Individual', mainUse: 'Correo operativo', recoveryPhone: '', sharedResponsible: '' },
  platformsSelected: {}, // { 'Mercado Libre': { store, permissions } }
  otherPlatformName: '',
  erp: { system: '', groupCompanies: '', modules: [], moduleOther: '', accessLevel: '' },
  reason: '', validity: 'Indefinida', validityDate: '', accessPurpose: '',
  acceptedTerms: false,
  website: '', // honeypot — un humano nunca llena esto
};

function Field({ label, value, onChange, placeholder, type = 'text', required }) {
  return (
    <div className={styles.field}>
      <label>{label}{required && ' *'}</label>
      <input type={type} value={value} placeholder={placeholder} required={required}
        onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

// Solo una sugerencia de referencia — nunca se garantiza que esté libre en
// Google, ni se checa contra nada real; Sistemas confirma el correo final.
function suggestGmail(fullName) {
  const clean = (fullName || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita acentos
    .toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (clean.length === 0) return '';
  const first = clean[0];
  const last = clean.length > 1 ? clean[clean.length - 1] : '';
  return `${[first, last].filter(Boolean).join('.')}@gmail.com`;
}

export default function SolicitarCuenta() {
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  // Autocompletar por nombre contra Empleados (búsqueda pública, sin JWT) —
  // rellena puesto/área/teléfono/empresa/no. de empleado en automático sin
  // mostrárselos a quien llena el formulario.
  const [nameQuery, setNameQuery] = useState('');
  const [nameMatches, setNameMatches] = useState([]);
  const [matchedEmployee, setMatchedEmployee] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchStatus, setSearchStatus] = useState('idle'); // idle | searching | done
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (nameQuery.trim().length < 3) { setNameMatches([]); setSearchStatus('idle'); return; }
    setSearchStatus('searching');
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/employees/public-lookup', { params: { q: nameQuery } });
        setNameMatches(data);
      } catch (_) { setNameMatches([]); }
      setSearchStatus('done');
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [nameQuery]);

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));
  const setGmail = (key) => (val) => setForm((f) => ({ ...f, gmail: { ...f.gmail, [key]: val, gmailTouched: key === 'username' ? true : f.gmail.gmailTouched } }));
  const setErp = (key) => (val) => setForm((f) => ({ ...f, erp: { ...f.erp, [key]: val } }));

  const handleNameChange = (val) => {
    setNameQuery(val);
    setForm((f) => ({ ...f, employeeName: val }));
    setMatchedEmployee(null);
    setShowDropdown(true);
  };

  const pickEmployee = (emp) => {
    setForm((f) => ({
      ...f,
      employeeName: emp.name,
      employeeIdNum: emp.employeeId || '',
      position: emp.position || '',
      department: [emp.area, emp.department].filter(Boolean).join(' / '),
      phone: emp.phone || '',
      businessName: emp.businessName || '',
    }));
    setMatchedEmployee(emp);
    setNameQuery(emp.name);
    setShowDropdown(false);
  };

  // Sugerir correo Gmail en automático la primera vez que se abre esa
  // sección, mientras la persona no lo haya editado a mano.
  useEffect(() => {
    if (form.wantsGmail && !form.gmail.gmailTouched && !form.gmail.username && form.employeeName) {
      setForm((f) => ({ ...f, gmail: { ...f.gmail, username: suggestGmail(f.employeeName) } }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.wantsGmail, form.employeeName]);

  const togglePlatform = (name) => {
    setForm((f) => {
      const next = { ...f.platformsSelected };
      if (next[name]) delete next[name];
      else next[name] = { store: '', permissions: {} };
      return { ...f, platformsSelected: next };
    });
  };
  const setPlatformStore = (name, store) => {
    setForm((f) => ({ ...f, platformsSelected: { ...f.platformsSelected, [name]: { ...f.platformsSelected[name], store } } }));
  };
  const togglePlatformPerm = (name, permKey) => {
    setForm((f) => {
      const current = f.platformsSelected[name] || { store: '', permissions: {} };
      return {
        ...f,
        platformsSelected: {
          ...f.platformsSelected,
          [name]: { ...current, permissions: { ...current.permissions, [permKey]: !current.permissions[permKey] } },
        },
      };
    });
  };
  const toggleErpModule = (mod) => {
    setForm((f) => ({
      ...f,
      erp: { ...f.erp, modules: f.erp.modules.includes(mod) ? f.erp.modules.filter((m) => m !== mod) : [...f.erp.modules, mod] },
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!matchedEmployee) {
      setError('No encontramos ese nombre en la base de empleados. Escríbelo tal como aparece registrado y selecciónalo de la lista.');
      return;
    }
    if (!form.wantsGmail && !form.wantsPlatforms && !form.wantsErp) {
      setError('Selecciona al menos un tipo de cuenta que necesitas (Gmail, Plataformas o ERP).');
      return;
    }
    if (!form.acceptedTerms) {
      setError('Debes leer y aceptar las condiciones de uso para enviar la solicitud.');
      return;
    }

    const platforms = Object.entries(form.platformsSelected).map(([name, data]) => ({
      platform: name === 'Otra' ? (form.otherPlatformName || 'Otra') : name,
      store: data.store,
      permissions: data.permissions,
    }));

    setSubmitting(true);
    try {
      const { data } = await api.post('/account-requests/public', {
        employeeName: form.employeeName,
        employeeIdNum: form.employeeIdNum,
        position: form.position,
        department: form.department,
        directManager: form.directManager,
        phone: form.phone,
        businessName: form.businessName,
        actionType: 'alta',
        reason: form.reason,
        validity: form.validity === 'Fecha límite' && form.validityDate ? `Hasta ${form.validityDate}` : form.validity,
        referenceProfile: form.accessPurpose,
        acceptedTerms: form.acceptedTerms,
        website: form.website,
        wantsGmail: form.wantsGmail,
        gmail: form.gmail,
        wantsPlatforms: form.wantsPlatforms,
        platforms,
        wantsErp: form.wantsErp,
        erp: form.erp,
      });
      setResult(data.folios || []);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo enviar la solicitud. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.successBox}>
            <span className={styles.successIcon}>✅</span>
            <h1 className={styles.successTitle}>Solicitud enviada</h1>
            <p className={styles.successText}>
              El área de Sistemas la revisará y te contactará cuando la cuenta esté lista.
            </p>
            {result.length > 0 && (
              <div className={styles.folioList}>
                {result.map((r) => (
                  <div key={r.id} className={styles.folioItem}>{r.folio}</div>
                ))}
              </div>
            )}
            <button className={styles.submitBtn} onClick={() => { setForm(EMPTY); setNameQuery(''); setMatchedEmployee(null); setResult(null); }}>
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
          <span className={styles.icon}>🔑</span>
          <h1 className={styles.title}>Solicitud de Cuentas y Accesos</h1>
          <p className={styles.subtitle}>Correo · Plataformas de venta · ERP — Select Shop MB</p>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className={styles.section}>
            <p className={styles.sectionTitle}>1. Datos del solicitante</p>
            <div className={styles.row}>
              <div className={styles.field} style={{ position: 'relative' }}>
                <label>Nombre completo *</label>
                <input
                  value={form.employeeName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  placeholder="Escribe tu nombre..."
                  required
                  autoComplete="off"
                />
                {showDropdown && nameMatches.length > 0 && (
                  <div className={styles.nameDropdown}>
                    {nameMatches.map((emp) => (
                      <button type="button" key={emp._id} className={styles.nameOption} onClick={() => pickEmployee(emp)}>
                        {emp.name}
                      </button>
                    ))}
                  </div>
                )}
                {matchedEmployee && <p className={styles.hint}>✓ Te encontramos en el sistema.</p>}
                {!matchedEmployee && searchStatus === 'done' && nameMatches.length === 0 && nameQuery.trim().length >= 3 && (
                  <p className={styles.hintWarn}>No encontramos a nadie con ese nombre — escríbelo tal como aparece registrado, o contacta a Sistemas si eres de alta muy reciente.</p>
                )}
              </div>
              <Field label="Jefe directo" value={form.directManager} onChange={set('directManager')} />
            </div>
          </div>

          <div className={styles.section}>
            <p className={styles.sectionTitle}>2. ¿Qué necesitas?</p>
            <div className={styles.checkGrid}>
              <label className={`${styles.checkOption} ${form.wantsGmail ? styles.checkOptionActive : ''}`}>
                <input type="checkbox" checked={form.wantsGmail} onChange={(e) => set('wantsGmail')(e.target.checked)} />
                🔐 Correo Gmail
              </label>
              <label className={`${styles.checkOption} ${form.wantsPlatforms ? styles.checkOptionActive : ''}`}>
                <input type="checkbox" checked={form.wantsPlatforms} onChange={(e) => set('wantsPlatforms')(e.target.checked)} />
                🌐 Acceso a plataformas de venta
              </label>
              <label className={`${styles.checkOption} ${form.wantsErp ? styles.checkOptionActive : ''}`}>
                <input type="checkbox" checked={form.wantsErp} onChange={(e) => set('wantsErp')(e.target.checked)} />
                🏭 Acceso al ERP
              </label>
            </div>
          </div>

          {form.wantsGmail && (
            <div className={styles.section}>
              <p className={styles.sectionTitle}>Cuenta de correo (Gmail)</p>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>Correo solicitado</label>
                  <input value={form.gmail.username} placeholder="nombre.apellido@gmail.com"
                    onChange={(e) => setGmail('username')(e.target.value)} />
                  <p className={styles.hint}>Es solo una referencia — puede quedar así o puede que Google ya lo tenga ocupado; Sistemas confirma el correo final.</p>
                </div>
                <Field label="Nombre para mostrar" value={form.gmail.displayName} onChange={setGmail('displayName')} />
              </div>
              <div className={styles.field}>
                <label>Tipo de cuenta</label>
                <div className={styles.radioRow}>
                  {['Individual', 'Compartida'].map((k) => (
                    <label key={k} className={styles.radioOption}>
                      <input type="radio" name="gmailKind" checked={form.gmail.accountKind === k} onChange={() => setGmail('accountKind')(k)} />
                      {k}
                    </label>
                  ))}
                </div>
              </div>
              <div className={styles.field}>
                <label>Uso principal</label>
                <div className={styles.radioRow}>
                  {['Correo operativo', 'Acceso a plataformas de venta', 'Acceso a sistemas / ERP', 'Otro'].map((k) => (
                    <label key={k} className={styles.radioOption}>
                      <input type="radio" name="gmailUse" checked={form.gmail.mainUse === k} onChange={() => setGmail('mainUse')(k)} />
                      {k}
                    </label>
                  ))}
                </div>
              </div>
              <div className={styles.row}>
                <Field label="Teléfono de recuperación" value={form.gmail.recoveryPhone} onChange={setGmail('recoveryPhone')} />
                {form.gmail.accountKind === 'Compartida' && (
                  <Field label="Responsable de la cuenta" value={form.gmail.sharedResponsible} onChange={setGmail('sharedResponsible')} />
                )}
              </div>
            </div>
          )}

          {form.wantsPlatforms && (
            <div className={styles.section}>
              <p className={styles.sectionTitle}>Accesos a plataformas de venta</p>
              <div className={styles.checkGrid}>
                {[...MARKETPLACE_OPTIONS, 'Otra'].map((name) => {
                  const selected = !!form.platformsSelected[name];
                  return (
                    <div key={name} className={styles.platformBlock}>
                      <label className={styles.platformHeader}>
                        <input type="checkbox" checked={selected} onChange={() => togglePlatform(name)} />
                        {name}
                      </label>
                      {selected && (
                        <>
                          {name === 'Otra' && (
                            <Field label="Nombre de la plataforma" value={form.otherPlatformName} onChange={set('otherPlatformName')} />
                          )}
                          <Field label="Tienda / Cuenta / Seller" value={form.platformsSelected[name].store}
                            onChange={(v) => setPlatformStore(name, v)} />
                          <div className={styles.permGrid}>
                            {PERMISSION_FIELDS.map(([key, label]) => (
                              <label key={key} className={styles.permOption}>
                                <input type="checkbox" checked={!!form.platformsSelected[name].permissions[key]}
                                  onChange={() => togglePlatformPerm(name, key)} />
                                {label}
                              </label>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {form.wantsErp && (
            <div className={styles.section}>
              <p className={styles.sectionTitle}>Acceso al ERP</p>
              <div className={styles.row}>
                <Field label="Sistema / ERP" value={form.erp.system} onChange={setErp('system')} placeholder="SAP, Odoo, Aspel..." />
                <Field label="Empresa(s) del grupo con acceso" value={form.erp.groupCompanies} onChange={setErp('groupCompanies')} />
              </div>
              <div className={styles.field}>
                <label>Módulos</label>
                <div className={styles.permGrid}>
                  {ERP_MODULE_OPTIONS.map((mod) => (
                    <label key={mod} className={styles.permOption}>
                      <input type="checkbox" checked={form.erp.modules.includes(mod)} onChange={() => toggleErpModule(mod)} />
                      {mod}
                    </label>
                  ))}
                </div>
                <Field label="Otro módulo" value={form.erp.moduleOther} onChange={setErp('moduleOther')} />
              </div>
              <div className={styles.field}>
                <label>Nivel de acceso</label>
                <div className={styles.radioRow}>
                  {ERP_ACCESS_LEVELS.map((lvl) => (
                    <label key={lvl} className={styles.radioOption}>
                      <input type="radio" name="erpLevel" checked={form.erp.accessLevel === lvl} onChange={() => setErp('accessLevel')(lvl)} />
                      {lvl}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className={styles.section}>
            <p className={styles.sectionTitle}>3. Justificación y vigencia</p>
            <div className={styles.field}>
              <label>Justificación / funciones que desempeñará con estas cuentas</label>
              <textarea value={form.reason} onChange={(e) => set('reason')(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>Vigencia</label>
              <div className={styles.radioRow}>
                <label className={styles.radioOption}>
                  <input type="radio" name="validity" checked={form.validity === 'Indefinida'} onChange={() => set('validity')('Indefinida')} />
                  Indefinida
                </label>
                <label className={styles.radioOption}>
                  <input type="radio" name="validity" checked={form.validity === 'Fecha límite'} onChange={() => set('validity')('Fecha límite')} />
                  Fecha límite
                </label>
                {form.validity === 'Fecha límite' && (
                  <input type="date" value={form.validityDate} onChange={(e) => set('validityDate')(e.target.value)} />
                )}
              </div>
            </div>
            <div className={styles.field}>
              <label>Accesos — ¿para qué vas a utilizar estas cuentas en las plataformas? (opcional)</label>
              <textarea value={form.accessPurpose} onChange={(e) => set('accessPurpose')(e.target.value)} />
            </div>
          </div>

          <div className={styles.section}>
            <p className={styles.sectionTitle}>4. Obligaciones y responsabilidades</p>
            <div className={styles.legalBox}>
              <p>Al enviar esta solicitud, declaras haber leído y aceptado que: las cuentas, correos y accesos otorgados son propiedad de la empresa y se conceden únicamente para el desempeño de tus funciones laborales; tus credenciales son personales e intransferibles y no debes compartirlas ni divulgarlas sin autorización expresa del área de Sistemas; debes limitarte a las plataformas, módulos y permisos autorizados aquí; eres responsable de todas las acciones realizadas con tus cuentas y accesos; la información a la que tengas acceso (datos de clientes, ventas, costos, información financiera y contable) es estrictamente confidencial; queda prohibido alterar o eliminar registros para ocultar información o eludir controles internos; y en caso de baja o cambio de puesto, tus accesos serán revocados por el área de Sistemas.</p>
              <p>El incumplimiento de estas obligaciones podrá derivar en la revocación inmediata de tus accesos y en las medidas disciplinarias, administrativas o legales que correspondan conforme al Reglamento Interior de Trabajo, la Ley Federal del Trabajo (Arts. 134 Fracc. I/IV/XIII, 135 Fracc. IX y 47 Fracc. II/IX), la Ley Federal de Protección de Datos Personales en Posesión de los Particulares, y el Código Penal Federal (Art. 211 Bis 1, acceso ilícito a sistemas informáticos).</p>
              <p>De conformidad con los Arts. 89 y 97 del Código de Comercio, al marcar la casilla de aceptación este formulario constituye un mensaje de datos con la misma validez que una firma autógrafa.</p>
            </div>
            <label className={styles.acceptRow}>
              <input type="checkbox" checked={form.acceptedTerms} onChange={(e) => set('acceptedTerms')(e.target.checked)} required />
              He leído y acepto las condiciones de uso de las cuentas y accesos que solicito.
            </label>
          </div>

          {/* Honeypot — invisible para personas, los bots suelen llenarlo */}
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
