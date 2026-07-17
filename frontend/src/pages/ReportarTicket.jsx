import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import employeeApi from '../services/employeeApi';
import PortalLayout from '../components/PortalLayout';
import { ASSET_TYPE_LABELS } from '../config/assetFields';
// `shared`: mismos estilos de campo/sección que las demás páginas públicas
// (Solicitar Cuenta/Ingreso/Recurso). `rt`: cascarón propio (encabezado +
// panel + tarjetas del wizard) para que se vea como el resto del portal.
import shared from './SolicitarCuenta.module.css';
import rt from './ReportarTicket.module.css';

// De lo general a lo particular, en 2 pasos reales (no uno que repite al
// otro): 1) categoría amplia, 2) problema específico DE esa categoría — cada
// una con su propio contenido curado, no la misma lista disfrazada. "Software"
// (sistema operativo/programas instalados en tu equipo) y "Aplicaciones"
// (páginas/sistemas internos de la empresa) son categorías separadas a
// propósito — no son lo mismo, y antes vivían mezcladas (el selector de
// aplicación aparecía escondido dentro de "Software").
// `problems: 'apps'` = la lista del paso 2 se arma con el catálogo de
// Aplicaciones Internas (ver más abajo). `problems: null` = sin paso 2,
// directo al formulario (ERP/Otro no lo necesitan: ERP ya es específico por
// sí solo, "Otro" pide su propio detalle libre).
const CATEGORIES = [
  {
    key: 'hardware', icon: '🖥️', label: 'Hardware',
    desc: 'Un equipo físico que ya tienes: laptop, celular, monitor, mouse...',
    problems: [
      'No enciende o no prende',
      'La pantalla no da imagen o se ve mal',
      'La batería no carga o se descarga muy rápido',
      'El teclado o el mouse no funciona',
      'Otro problema de hardware',
    ],
  },
  {
    key: 'software', icon: '💾', label: 'Software',
    desc: 'El sistema operativo o un programa instalado en tu equipo.',
    problems: [
      'Windows lento o con errores',
      'Microsoft 365 / Office (Word, Excel, Outlook...)',
      'Un programa no abre o se cierra solo',
      'Macros o plantillas de Excel',
      'Otro problema de software',
    ],
  },
  {
    key: 'aplicacion', icon: '🗂️', label: 'Aplicaciones',
    desc: 'Una página o sistema interno de la empresa (no un programa de tu equipo).',
    problems: 'apps',
  },
  {
    key: 'red', icon: '📶', label: 'Red / Conectividad',
    desc: 'WiFi, impresora o VPN.',
    problems: [
      'No tengo WiFi o internet',
      'La impresora no imprime',
      'La VPN no conecta',
      'Otro problema de red',
    ],
  },
  {
    key: 'cuenta_acceso', icon: '🔐', label: 'Cuenta / Acceso',
    desc: 'Ya tienes la cuenta pero no puedes entrar.',
    problems: [
      'Olvidé mi contraseña',
      'Mi cuenta está bloqueada',
      'No tengo permisos para algo',
      'Otro problema de cuenta',
    ],
  },
  {
    key: 'erp', icon: '🏭', label: 'ERP',
    desc: 'El sistema ERP interno — módulos, reportes, accesos.',
    problems: [
      'No puedo entrar al ERP',
      'Un módulo no funciona',
      'Necesito un reporte y no sale',
      'Otro problema del ERP',
    ],
  },
  {
    key: 'otro', icon: '❓', label: 'Otro',
    desc: 'No encaja en las anteriores.',
    problems: null,
  },
];

const OTHER_CATEGORY = 'otro';

const EMPTY = {
  otherTypeDetail: '', subject: '', description: '', blocksWork: false,
  appRef: '', assetId: '',
};

// Etiqueta legible para el selector "¿sobre cuál equipo es esto?" — reutiliza
// el mismo catálogo de nombres de tipo que ya usa el resto de la app.
function assetLabel(a) {
  const type = ASSET_TYPE_LABELS[a.type] || a.type;
  const parts = [a.brand, a.model].filter(Boolean).join(' ');
  return `${type}${parts ? ` — ${parts}` : ''}${a.serialNumber ? ` (${a.serialNumber})` : ''}`;
}

const NO_SPECIFIC_ASSET = 'ninguno';

// Requiere sesión de empleado (ver EmployeeLogin.jsx / App.jsx —
// EmployeeRoute) desde que se agregó el historial de "Mis Tickets": la
// identidad ya no se busca por nombre escrito a mano, viene de la sesión
// (localStorage.employeeUser), y el ticket se manda a POST /tickets/mine.
export default function ReportarTicket() {
  const [searchParams] = useSearchParams();
  const employeeUser = JSON.parse(localStorage.getItem('employeeUser') || '{}');

  // ?tipo=software (ej. desde el buscador de Mesa de Ayuda) ya adelanta la
  // categoría y salta directo al paso 2 (o al formulario, si esa categoría no
  // tiene paso 2) — sin volver a preguntar la categoría que el buscador ya
  // resolvió.
  const presetCategory = CATEGORIES.find((c) => c.key === searchParams.get('tipo')) || null;

  const [step, setStep] = useState(presetCategory ? (presetCategory.problems === null ? 'form' : 'problem') : 'category');
  const [category, setCategory] = useState(presetCategory ? presetCategory.key : '');
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null); // folio al terminar
  const [file, setFile] = useState(null);

  // Catálogo de aplicaciones internas (ver InternalApps) — alimenta el paso 2
  // de la categoría "Aplicaciones", para que el ticket quede ligado a la app
  // específica y Sistemas sepa a dónde enrutarlo (ej. "Cuentas por Pagar" es
  // de Héctor, no de Sistemas).
  const [apps, setApps] = useState([]);
  useEffect(() => {
    employeeApi.get('/internal-apps/public').then(({ data }) => setApps(data)).catch(() => setApps([]));
  }, []);

  // Si la persona tiene más de un equipo asignado (ej. celular Y laptop), se
  // le pregunta sobre cuál es el problema — así el log del ticket ya no
  // arrastra ambos equipos cuando en realidad solo uno tiene la falla. Con 0
  // o 1 equipo asignado no hace falta preguntar nada.
  const [myAssets, setMyAssets] = useState([]);
  useEffect(() => {
    employeeApi.get('/tickets/mine/assets').then(({ data }) => setMyAssets(data)).catch(() => setMyAssets([]));
  }, []);

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));
  const selectedCategory = CATEGORIES.find((c) => c.key === category) || null;

  const handlePickCategory = (cat) => {
    setCategory(cat.key);
    setStep(cat.problems === null ? 'form' : 'problem');
  };

  // `appId`: solo aplica a la categoría "Aplicaciones" (liga la app elegida).
  // `label`: texto del problema elegido — se usa para adelantar el Asunto
  // (editable después), excepto en la opción de escape ("No sé cuál
  // aplicación..."), donde se deja en blanco para no dejar un asunto vacío
  // de sentido.
  const handlePickProblem = (label, appId = '') => {
    if (appId) set('appRef')(appId);
    if (label) set('subject')(label);
    setStep('form');
  };

  const handleBackToCategory = () => {
    setStep('category');
    setCategory('');
    setForm(EMPTY);
  };

  const handleBackFromForm = () => {
    setStep(selectedCategory?.problems === null ? 'category' : 'problem');
  };

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
    if (!category) { setError('Selecciona el tipo de soporte.'); return; }
    if (category === OTHER_CATEGORY && !form.otherTypeDetail.trim()) { setError('Especifica de qué se trata.'); return; }
    if (!form.subject.trim()) { setError('Falta el asunto del ticket.'); return; }
    if (myAssets.length > 1 && !form.assetId) { setError('Selecciona sobre cuál de tus equipos es esto.'); return; }
    setSubmitting(true);
    try {
      const data = new FormData();
      data.append('ticketType', category);
      data.append('otherTypeDetail', form.otherTypeDetail);
      data.append('subject', form.subject);
      data.append('description', form.description);
      data.append('blocksWork', form.blocksWork);
      if (form.appRef) data.append('appRef', form.appRef);
      if (form.assetId && form.assetId !== NO_SPECIFIC_ASSET) data.append('assetId', form.assetId);
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
              setForm(EMPTY); setFile(null); setDone(null); setCategory(''); setStep('category');
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

        {step === 'category' && (
          <>
            <p className={shared.sectionTitle}>¿De qué tipo es el problema?</p>
            <div className={rt.catGrid}>
              {CATEGORIES.map((cat) => (
                <button key={cat.key} type="button" className={rt.catCard} onClick={() => handlePickCategory(cat)}>
                  <span className={rt.catIcon}>{cat.icon}</span>
                  <h3>{cat.label}</h3>
                  <p>{cat.desc}</p>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'problem' && selectedCategory && (
          <>
            <button type="button" className={rt.backLink} onClick={handleBackToCategory}>← Cambiar categoría</button>
            <p className={shared.sectionTitle}>{selectedCategory.icon} {selectedCategory.label} — ¿cuál es el problema?</p>
            <div className={rt.problemList}>
              {selectedCategory.problems === 'apps' ? (
                apps.length > 0 ? (
                  <>
                    {apps.map((a) => (
                      <button key={a._id} type="button" className={rt.problemItem} onClick={() => handlePickProblem(a.name, a._id)}>{a.name}</button>
                    ))}
                    <button type="button" className={rt.problemItem} onClick={() => handlePickProblem('')}>No sé cuál aplicación / no está en la lista</button>
                  </>
                ) : (
                  <>
                    <p className={shared.hint}>Todavía no hay aplicaciones registradas en el catálogo.</p>
                    <button type="button" className={rt.problemItem} onClick={() => handlePickProblem('')}>Continuar de todos modos →</button>
                  </>
                )
              ) : (
                selectedCategory.problems.map((p) => (
                  <button key={p} type="button" className={rt.problemItem} onClick={() => handlePickProblem(p)}>{p}</button>
                ))
              )}
            </div>
          </>
        )}

        {step === 'form' && selectedCategory && (
          <form onSubmit={handleSubmit}>
            <div className={rt.breadcrumb}>
              <span>{selectedCategory.icon} {selectedCategory.label}</span>
              <button type="button" className={rt.backLink} onClick={handleBackFromForm}>Cambiar</button>
            </div>

            <div className={shared.section}>
              <p className={shared.sectionTitle}>Tus datos</p>
              <p className={shared.hint}>Reportando como <strong>{employeeUser.name}</strong>.</p>
            </div>

            <div className={shared.section}>
              {category === OTHER_CATEGORY && (
                <div className={shared.field}>
                  <label>¿De qué se trata? *</label>
                  <input value={form.otherTypeDetail} onChange={(e) => set('otherTypeDetail')(e.target.value)} placeholder="Especifica el motivo del ticket" />
                </div>
              )}
              {myAssets.length > 1 && (
                <div className={shared.field}>
                  <label>¿Sobre cuál de tus equipos es esto? *</label>
                  <select value={form.assetId} onChange={(e) => set('assetId')(e.target.value)}>
                    <option value="">Selecciona...</option>
                    {myAssets.map((a) => (
                      <option key={a._id} value={a._id}>{assetLabel(a)}</option>
                    ))}
                    <option value={NO_SPECIFIC_ASSET}>No es sobre un equipo en particular</option>
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
        )}
      </div>
    </PortalLayout>
  );
}
