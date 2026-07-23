import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/employeeApi';
import useEmployeeLookup from '../hooks/useEmployeeLookup';
import useSlowRequestNotice from '../hooks/useSlowRequestNotice';
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

// Mercado Libre no se administra por permisos sueltos como las demás
// plataformas — tiene sus propios roles fijos de la definición oficial de
// Mercado Libre (KAM, Atención al Cliente, Operación/Almacén, etc.), así que
// para esta plataforma se elige de esta lista en vez de PERMISSION_FIELDS.
const ML_ROLE_FIELDS = [
  ['KAM', 'KAM / Comercial'],
  ['AC', 'Atención al Cliente'],
  ['ALM', 'Operación / Almacén'],
  ['BI', 'Business Intelligence'],
  ['CyC', 'Crédito y Cobranza / Finanzas'],
  ['MKT', 'Marketing / Contenido'],
  ['AUD', 'Auditoría'],
  ['BO', 'Back Office'],
];
const MERCADO_LIBRE = 'Mercado Libre';

// Simplificado a petición del líder de ERP (2026-07-22): el formulario ya no
// pregunta empresa(s) del grupo con acceso, checklist de módulos ni nivel de
// acceso — eso lo resuelven el usuario y su jefe directo fuera del sistema.
// Catálogo cerrado (2026-07-23, corrección explícita del usuario): cada
// tienda tiene su PROPIO ERP, así que cada opción ya incluye la tienda (antes
// era un catálogo de software genérico — SAP/Odoo/Aspel — que necesitaba un
// campo aparte de "¿a qué tienda?", ahora redundante y se quitó). Multi-select
// (checkboxes, no <select> de una sola opción) porque alguien puede necesitar
// acceso a más de un ERP a la vez. Mismo set en
// backend/src/routes/accountRequests.js (ERP_SYSTEM_CATALOG).
const ERP_SYSTEM_CATALOG = ['ERP SelectShop', 'ERP Nexustore', 'ERP Medicalstore', 'ERP Tlab'];

const EMPTY = {
  employeeName: '', employeeIdNum: '', position: '', department: '', directManager: '',
  phone: '', businessName: '', currentEmail: '',
  wantsGmail: false, wantsPlatforms: false, wantsErp: false,
  gmail: { username: '', displayName: '', accountKind: 'Individual', mainUse: 'Correo operativo', sharedResponsible: '' },
  platformsSelected: {}, // { 'Mercado Libre': { store, username, permissions } }
  otherPlatformName: '',
  erp: { systems: [], moduleOther: '' },
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

export default function SolicitarCuenta() {
  // ?tipo=gmail|platforms|erp llega del wizard de Mesa de Ayuda — solo
  // preselecciona el checkbox correspondiente al cargar, la persona puede
  // marcar/desmarcar libremente después.
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState(() => {
    const tipo = searchParams.get('tipo');
    return {
      ...EMPTY,
      wantsGmail: tipo === 'gmail',
      wantsPlatforms: tipo === 'platforms',
      wantsErp: tipo === 'erp',
    };
  });
  const [submitting, setSubmitting] = useState(false);
  const slowSubmit = useSlowRequestNotice(submitting);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  // Autocompletar por nombre contra Empleados (búsqueda pública, sin JWT) —
  // rellena puesto/área/teléfono/empresa/no. de empleado en automático sin
  // mostrárselos a quien llena el formulario. Ver hooks/useEmployeeLookup —
  // distingue 'error' (falló la búsqueda, ej. por wifi) de 'done' sin
  // resultados (de verdad no se encontró a nadie).
  const [nameQuery, setNameQuery] = useState('');
  const [matchedEmployee, setMatchedEmployee] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const { matches: nameMatches, status: searchStatus, retry: retryNameSearch } = useEmployeeLookup(api, nameQuery);

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));
  const setGmail = (key) => (val) => setForm((f) => ({ ...f, gmail: { ...f.gmail, [key]: val } }));
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
      currentEmail: (emp.corporateEmails || []).join(', '),
    }));
    setMatchedEmployee(emp);
    setNameQuery(emp.name);
    setShowDropdown(false);
  };

  const togglePlatform = (name) => {
    setForm((f) => {
      const next = { ...f.platformsSelected };
      if (next[name]) delete next[name];
      else next[name] = { store: '', username: '', permissions: {}, roles: [] };
      return { ...f, platformsSelected: next };
    });
  };
  const setPlatformStore = (name, store) => {
    setForm((f) => ({ ...f, platformsSelected: { ...f.platformsSelected, [name]: { ...f.platformsSelected[name], store } } }));
  };
  const setPlatformUsername = (name, username) => {
    setForm((f) => ({ ...f, platformsSelected: { ...f.platformsSelected, [name]: { ...f.platformsSelected[name], username } } }));
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
  const togglePlatformRole = (name, roleKey) => {
    setForm((f) => {
      const current = f.platformsSelected[name] || { store: '', roles: [] };
      const roles = current.roles || [];
      return {
        ...f,
        platformsSelected: {
          ...f.platformsSelected,
          [name]: { ...current, roles: roles.includes(roleKey) ? roles.filter((r) => r !== roleKey) : [...roles, roleKey] },
        },
      };
    });
  };
  const toggleErpSystem = (name) => {
    setForm((f) => {
      const current = f.erp.systems;
      const systems = current.includes(name) ? current.filter((s) => s !== name) : [...current, name];
      return { ...f, erp: { ...f.erp, systems } };
    });
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
    if (form.wantsErp && form.erp.systems.length === 0) {
      setError('Selecciona al menos un sistema ERP.');
      return;
    }
    if (!form.acceptedTerms) {
      setError('Debes leer y aceptar las condiciones de uso para enviar la solicitud.');
      return;
    }

    const platforms = Object.entries(form.platformsSelected).map(([name, data]) => ({
      platform: name === 'Otra' ? (form.otherPlatformName || 'Otra') : name,
      store: data.store,
      username: data.username,
      permissions: data.permissions,
      roles: data.roles || [],
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
        currentEmail: form.currentEmail,
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
      <div className={`portalDark ${styles.page}`}>
        <div className={styles.card}>
          <Link to="/mesa-de-ayuda" className={styles.backLink}>← Volver a Mesa de Ayuda</Link>
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
    <div className={`portalDark ${styles.page}`}>
      <div className={styles.card}>
        <Link to="/mesa-de-ayuda" className={styles.backLink}>← Volver a Mesa de Ayuda</Link>
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
                {!matchedEmployee && searchStatus === 'error' && (
                  <p className={styles.hintError}>
                    No pudimos buscar tu nombre — parece un problema de conexión, no que no existas.
                    {/* onMouseDown preventDefault: sin esto, el clic le quita el foco
                        al input ANTES de que retryNameSearch termine, y el dropdown
                        de resultados se cierra solo (por el onBlur de abajo) antes
                        de que el reintento traiga algo que mostrar. */}
                    <button
                      type="button"
                      className={styles.retryLink}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { retryNameSearch(); setShowDropdown(true); }}
                    >
                      Reintentar
                    </button>
                  </p>
                )}
              </div>
              <Field label="Jefe directo" value={form.directManager} onChange={set('directManager')} />
            </div>
          </div>

          <div className={styles.section}>
            <p className={styles.sectionTitle}>2. ¿Qué necesitas?</p>
            <div className={styles.checkGrid}>
              <label
                className={`${styles.checkOption} ${form.wantsGmail ? styles.checkOptionActive : ''}`}
                style={{ '--accent': 'var(--p-blue)', '--accent-soft': 'var(--p-blue-soft)' }}
              >
                <input type="checkbox" checked={form.wantsGmail} onChange={(e) => set('wantsGmail')(e.target.checked)} />
                <span className={styles.checkEmoji}>🔐</span>
                Correo Gmail
              </label>
              <label
                className={`${styles.checkOption} ${form.wantsPlatforms ? styles.checkOptionActive : ''}`}
                style={{ '--accent': 'var(--p-green)', '--accent-soft': 'var(--p-green-soft)' }}
              >
                <input type="checkbox" checked={form.wantsPlatforms} onChange={(e) => set('wantsPlatforms')(e.target.checked)} />
                <span className={styles.checkEmoji}>🌐</span>
                Acceso a plataformas de venta
              </label>
              <label
                className={`${styles.checkOption} ${form.wantsErp ? styles.checkOptionActive : ''}`}
                style={{ '--accent': 'var(--p-amber)', '--accent-soft': 'var(--p-amber-soft)' }}
              >
                <input type="checkbox" checked={form.wantsErp} onChange={(e) => set('wantsErp')(e.target.checked)} />
                <span className={styles.checkEmoji}>🏭</span>
                Acceso al ERP
              </label>
            </div>
          </div>

          {form.wantsGmail && (
            <div className={styles.section} style={{ '--accent': 'var(--p-blue)', '--accent-soft': 'var(--p-blue-soft)' }}>
              <p className={styles.sectionTitle}>Cuenta de correo (Gmail)</p>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>Correo solicitado</label>
                  <input
                    value={form.gmail.username}
                    placeholder="ventas@... / atencion@... / compras@..."
                    onChange={(e) => setGmail('username')(e.target.value)}
                  />
                  <p className={styles.hintWarn}>⚠️ No debe llevar nombres — usa el puesto o área (ej. ventas, atencion, compras).</p>
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
              {form.gmail.accountKind === 'Compartida' && (
                <Field label="Responsable de la cuenta" value={form.gmail.sharedResponsible} onChange={setGmail('sharedResponsible')} />
              )}
            </div>
          )}

          {form.wantsPlatforms && (
            <div className={styles.section} style={{ '--accent': 'var(--p-green)', '--accent-soft': 'var(--p-green-soft)' }}>
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
                          <div className={styles.field}>
                            <label>Usuario o correo con el que quieres que quede</label>
                            <input value={form.platformsSelected[name].username} placeholder="ventas@... / atencion@... / compras@..."
                              onChange={(e) => setPlatformUsername(name, e.target.value)} />
                            <p className={styles.hintWarn}>⚠️ No debe llevar nombres — usa el puesto o área.</p>
                          </div>
                          {name === MERCADO_LIBRE ? (
                            <div className={styles.field}>
                              <label>Rol(es) en Mercado Libre</label>
                              <div className={styles.permGrid}>
                                {ML_ROLE_FIELDS.map(([key, label]) => (
                                  <label key={key} className={styles.permOption}>
                                    <input type="checkbox" checked={(form.platformsSelected[name].roles || []).includes(key)}
                                      onChange={() => togglePlatformRole(name, key)} />
                                    {label}
                                  </label>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className={styles.permGrid}>
                              {PERMISSION_FIELDS.map(([key, label]) => (
                                <label key={key} className={styles.permOption}>
                                  <input type="checkbox" checked={!!form.platformsSelected[name].permissions[key]}
                                    onChange={() => togglePlatformPerm(name, key)} />
                                  {label}
                                </label>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {form.wantsErp && (
            <div className={styles.section} style={{ '--accent': 'var(--p-amber)', '--accent-soft': 'var(--p-amber-soft)' }}>
              <p className={styles.sectionTitle}>Acceso al ERP</p>
              <div className={styles.field}>
                <label>Sistema(s) / ERP *</label>
                <div className={styles.permGrid}>
                  {ERP_SYSTEM_CATALOG.map((s) => (
                    <label key={s} className={styles.permOption}>
                      <input type="checkbox" checked={form.erp.systems.includes(s)} onChange={() => toggleErpSystem(s)} />
                      {s}
                    </label>
                  ))}
                </div>
              </div>
              <Field label="¿Qué módulo(s) necesitas?" value={form.erp.moduleOther} onChange={setErp('moduleOther')} placeholder="Ej. Facturación y CxP" />
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
          {slowSubmit && (
            <p className={styles.hintWarn} style={{ textAlign: 'center', marginTop: '0.6rem' }}>
              La conexión está tardando más de lo normal — seguimos intentando, no cierres esta pantalla.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
