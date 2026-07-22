import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import employeeApi from '../services/employeeApi';
import PortalLayout from '../components/PortalLayout';
import { ASSET_TYPE_LABELS } from '../config/assetFields';
import {
  CATEGORIES, problemLabel, problemNote, problemSla,
  findSpecialSubareas,
  CATEGORY_ASSET_REQUIREMENT, PARENT_GROUPING_CATEGORY, CATEGORY_SECTIONS, SECTION_ACCENTS,
} from '../config/ticketCategories';
import { PRINTER_CATALOG, OTHER_PRINTER_OPTION, printerOptionLabel, printerOptionValue, findPrinterByValue } from '../config/printerCatalog';
// `shared`: mismos estilos de campo/sección que las demás páginas públicas
// (Solicitar Cuenta/Ingreso/Recurso). `rt`: cascarón propio (encabezado +
// panel + tarjetas del wizard) para que se vea como el resto del portal.
import shared from './SolicitarCuenta.module.css';
import rt from './ReportarTicket.module.css';

const OTHER_CATEGORY = 'otro';
const APP_CATEGORY = 'aplicacion';
// Las impresoras no son equipo personal (nunca están "asignadas" a alguien
// como una laptop o celular) — pedirle a quien reporta "¿sobre cuál de TUS
// equipos es esto?" no tiene sentido aquí, porque la impresora jamás va a
// aparecer en esa lista. En vez de eso, se reusa el mismo campo libre que ya
// existe para "Otro" (`otherTypeDetail` — ya se guarda y se muestra siempre,
// sin importar el tipo de ticket) para que digan cuál impresora es.
const PRINTER_CATEGORY = 'impresora';
// Mismo criterio para "Aplicaciones" — pedido explícito del usuario: un
// aplicativo interno tampoco es equipo personal, la pregunta nunca aplica.
// Hardware/Software/Red ya vienen separados por tipo de equipo desde el
// propio botón de categoría (Computadoras/Celulares) — la pregunta de
// "¿cuál de tus equipos?" quedaría redundante, y "Accesorios" tampoco es
// "tu equipo" en ese sentido.
const NO_ASSET_SELECTOR_CATEGORIES = [
  PRINTER_CATEGORY, APP_CATEGORY, 'accesorio',
  'hardware_pc', 'hardware_celular', 'software_pc', 'software_celular', 'red_pc', 'red_celular',
];

// `findSpecialSubareas` (Solicitud de Pagos, Ventas, Gestor de Constancias)
// ahora vive en config/ticketCategories.js — el buscador de Mesa de Ayuda
// también la necesita para poder llegar hasta un problema específico DENTRO
// de un apartado (ej. "alta de proveedores"), no solo hasta el nombre de la
// app.

const EMPTY = {
  otherTypeDetail: '', subject: '', description: '',
  appRef: '', assetId: '', slaHint: '',
};

// Etiqueta para el selector "¿sobre cuál equipo es esto?" — pedido explícito
// del usuario: no mostrarle a quien reporta marca/modelo/serie del equipo,
// solo el tipo genérico (Celular, Laptop, Escritorio...).
function assetLabel(a) {
  return ASSET_TYPE_LABELS[a.type] || a.type;
}

const NO_SPECIFIC_ASSET = 'ninguno';

// Busca, dentro de una categoría con lista estática, el problema cuyo label
// coincide exactamente con el texto — usado para resolver `?problema=...`
// (ver más abajo: el buscador de Mesa de Ayuda ya sabe el problema exacto,
// no solo la categoría, y llega hasta lo particular sin pasos de más).
function findPresetProblem(cat, label) {
  if (!cat || !label || !Array.isArray(cat.problems)) return null;
  return cat.problems.find((p) => problemLabel(p) === label) || null;
}

// Requiere sesión de empleado (ver EmployeeLogin.jsx / App.jsx —
// EmployeeRoute) desde que se agregó el historial de "Mis Tickets": la
// identidad ya no se busca por nombre escrito a mano, viene de la sesión
// (localStorage.employeeUser), y el ticket se manda a POST /tickets/mine.
export default function ReportarTicket() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const employeeUser = JSON.parse(localStorage.getItem('employeeUser') || '{}');

  // ?tipo=software (ej. desde el buscador de Mesa de Ayuda) ya adelanta la
  // categoría. Si además trae ?problema=<texto exacto> (el buscador resolvió
  // el problema específico, no solo la categoría), se salta TAMBIÉN el paso
  // 2 y llega directo al formulario ya precargado — de lo general a lo
  // particular sin pasos de más, sin importar si la persona navegó a mano o
  // llegó por una búsqueda. Para la categoría "Aplicaciones" el equivalente
  // es ?app=<id>, resuelto más abajo una vez que el catálogo de apps carga
  // (llega async, a diferencia de las listas estáticas de las demás).
  const presetCategory = CATEGORIES.find((c) => c.key === searchParams.get('tipo')) || null;
  const presetProblem = findPresetProblem(presetCategory, searchParams.get('problema'));
  const presetAppId = presetCategory?.problems === 'apps' ? searchParams.get('app') : null;

  const initialStep = (() => {
    if (!presetCategory) return 'category';
    if (presetProblem) return problemNote(presetProblem) ? 'problem' : 'form';
    if (presetCategory.problems === null) return 'form';
    if (presetCategory.problems === 'device-split') return 'device-split';
    return 'problem';
  })();

  const [step, setStep] = useState(initialStep);
  const [category, setCategory] = useState(presetCategory ? presetCategory.key : '');
  const [activeNote, setActiveNote] = useState(presetProblem && problemNote(presetProblem) ? presetProblem : null);
  const [autoAppDone, setAutoAppDone] = useState(false);
  // Solo para las apps "especiales" (ver SPECIAL_APPS arriba) — la lista de
  // apartados de la app elegida (`subareaOptions`, ej. los 3 de Solicitud de
  // Pagos) y cuál de ellos se eligió (`subarea`), antes de llegar a la lista
  // de problemas específicos DE ese apartado.
  const [subareaOptions, setSubareaOptions] = useState(null);
  const [subarea, setSubarea] = useState(null);
  // Solo para la categoría Impresoras — qué opción del catálogo real (ver
  // config/printerCatalog.js) se eligió en el select; `OTHER_PRINTER_OPTION`
  // revela el campo de texto libre de respaldo (impresora nueva o sucursal
  // que no esté en el catálogo).
  const [printerSelection, setPrinterSelection] = useState('');
  const [form, setForm] = useState(() => (
    presetProblem && !problemNote(presetProblem)
      ? { ...EMPTY, subject: problemLabel(presetProblem), slaHint: problemSla(presetProblem) || '' }
      : EMPTY
  ));
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
  const [myAssetsLoaded, setMyAssetsLoaded] = useState(false);
  useEffect(() => {
    employeeApi.get('/tickets/mine/assets')
      .then(({ data }) => setMyAssets(data))
      .catch(() => setMyAssets([]))
      .finally(() => setMyAssetsLoaded(true));
  }, []);

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));
  const selectedCategory = CATEGORIES.find((c) => c.key === category) || null;

  // Un solo botón "Hardware"/"Software"/"Red" en la pantalla principal
  // (pedido explícito: no quería 7 botones sueltos) — las categorías reales
  // por tipo de equipo (hardware_pc, red_celular, etc.) quedan marcadas
  // `hidden: true` y solo se llega a ellas a través del botón agrupador,
  // vía el paso "device-split" de abajo.
  const visibleCategories = CATEGORIES.filter((cat) => !cat.hidden);

  // Agrupadas por sección (ver CATEGORY_SECTIONS) — pedido explícito: "siento
  // que está todo revuelto" con las 10 categorías en una sola cuadrícula
  // plana. Cada grupo se pinta con su propio encabezado, en vez de un solo
  // montón de tarjetas sin dividir. Una sección sin categorías visibles
  // (poco probable, pero por si acaso) no se pinta.
  const categoriesBySection = CATEGORY_SECTIONS
    .map((section) => ({ section, items: visibleCategories.filter((cat) => cat.section === section) }))
    .filter((group) => group.items.length > 0);

  // Pedido explícito: "Celulares" ni debe aparecer como opción si la
  // persona no tiene celular asignado (y lo mismo para "Computadoras", por
  // simetría) — basado en sus activos reales, no en una lista fija.
  // Mientras el fetch no termine, se muestran todas para no hacer
  // parpadear la pantalla con una lista incompleta.
  const visibleDeviceOptions = (cat) => (cat.deviceOptions || []).filter((opt) => {
    const requiredTypes = CATEGORY_ASSET_REQUIREMENT[opt.key];
    if (!requiredTypes) return true;
    if (!myAssetsLoaded) return true;
    return myAssets.some((a) => requiredTypes.includes(a.type));
  });

  const handlePickCategory = (cat) => {
    setCategory(cat.key);
    setActiveNote(null);
    setSubareaOptions(null);
    setSubarea(null);
    setPrinterSelection('');
    if (cat.problems === 'device-split') { setStep('device-split'); return; }
    setStep(cat.problems === null ? 'form' : 'problem');
  };

  // Elegir del catálogo real de impresoras (ver config/printerCatalog.js)
  // rellena `otherTypeDetail` con sucursal + modelo + serie de un jalón —
  // "Otra / no está en la lista" lo deja en blanco para que se escriba a
  // mano, como funcionaba antes de tener este catálogo.
  const handlePrinterSelect = (value) => {
    setPrinterSelection(value);
    if (value === OTHER_PRINTER_OPTION || !value) {
      set('otherTypeDetail')('');
      return;
    }
    const found = findPrinterByValue(value);
    if (found) set('otherTypeDetail')(`${found.branch} — ${printerOptionLabel(found.printer)}`);
  };

  // Computadoras/Celulares — elegir uno "activa" la categoría real de ese
  // tipo de equipo (hardware_pc, red_celular, etc.), que ya trae su propio
  // catálogo de problemas de siempre.
  const handlePickDevice = (opt) => {
    setCategory(opt.key);
    setStep('problem');
  };

  // `appId`: solo aplica a la categoría "Aplicaciones" (liga la app elegida).
  // `label`: texto del problema elegido — se usa para adelantar el Asunto
  // (editable después), excepto en la opción de escape ("No sé cuál
  // aplicación..."), donde se deja en blanco para no dejar un asunto vacío
  // de sentido. `sla`: Categoría de Falla ya resuelta para este problema
  // específico (ver problemSla en config/ticketCategories.js) — clasifica el
  // ticket desde que nace en vez de depender de que un admin lo haga después.
  const handlePickProblem = (label, appId = '', sla = '') => {
    if (appId) set('appRef')(appId);
    if (label) set('subject')(label);
    if (sla) set('slaHint')(sla);
    setStep('form');
  };

  // La mayoría de los problemas del paso 2 avanzan directo al formulario. El
  // que trae una nota (licencia de Office) primero explica por qué eso no es
  // una falla, y deja elegir: ir a Solicitudes, o reportarlo de todos modos
  // como ticket (por si de verdad es un problema distinto, ej. antes sí
  // tenía Word instalado y ya no).
  const handleProblemClick = (item) => {
    const note = problemNote(item);
    if (note) { setActiveNote(item); return; }
    handlePickProblem(problemLabel(item), '', problemSla(item) || '');
  };

  // Elegir una app del catálogo — algunas (ver SPECIAL_APPS) son especiales:
  // en vez de ir directo al formulario, primero preguntan de qué apartado
  // es, porque cada apartado lo atiende un equipo distinto (ver
  // getTicketEmailRecipients en el backend). Cualquier otra app sigue igual
  // que siempre.
  const handlePickApp = (app) => {
    const subareas = findSpecialSubareas(app.name);
    if (subareas) {
      set('appRef')(app._id);
      setSubareaOptions(subareas);
      setStep('app-subarea');
      return;
    }
    handlePickProblem(app.name, app._id);
  };

  const handlePickSubarea = (s) => {
    setSubarea(s);
    setStep('app-subarea-problem');
  };

  // El apartado (`otherTypeDetail`) es lo que el backend usa para decidir a
  // quién le llega el correo — no es texto libre aquí, viene fijo del
  // apartado ya elegido.
  const handlePickSubareaProblem = (item) => {
    set('otherTypeDetail')(subarea.label);
    set('subject')(problemLabel(item));
    if (problemSla(item)) set('slaHint')(problemSla(item));
    setStep('form');
  };

  // ?app=<id> (categoría "Aplicaciones" desde el buscador) solo se puede
  // resolver hasta que el catálogo de apps termine de cargar — a diferencia
  // de ?problema=, que se resuelve sincrónico arriba porque las demás
  // listas ya están en el bundle. `autoAppDone` evita repetirlo si la
  // persona ya cambió de categoría a mano mientras tanto.
  //
  // Si además trae `?subarea=<key>&problema=<texto exacto>` (el buscador ya
  // encontró el problema específico DENTRO de un apartado, ej. "alta de
  // proveedores" en Solicitud de Pagos), se salta también los pasos de
  // elegir apartado y problema, directo al formulario — mismo criterio de
  // "de lo general a lo particular sin pasos de más" que ya aplica al resto
  // del buscador.
  useEffect(() => {
    if (autoAppDone || !presetAppId || apps.length === 0) return;
    const match = apps.find((a) => a._id === presetAppId);
    if (match) {
      const subareas = findSpecialSubareas(match.name);
      if (subareas) {
        set('appRef')(match._id);
        setSubareaOptions(subareas);
        const subareaMatch = subareas.find((s) => s.key === searchParams.get('subarea'));
        if (subareaMatch) {
          setSubarea(subareaMatch);
          const problemMatch = subareaMatch.problems.find((p) => problemLabel(p) === searchParams.get('problema'));
          if (problemMatch) {
            set('otherTypeDetail')(subareaMatch.label);
            set('subject')(problemLabel(problemMatch));
            if (problemSla(problemMatch)) set('slaHint')(problemSla(problemMatch));
            setStep('form');
          } else {
            setStep('app-subarea-problem');
          }
        } else {
          setStep('app-subarea');
        }
      } else {
        handlePickProblem(match.name, match._id);
      }
    }
    setAutoAppDone(true);
  }, [apps]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBackToCategory = () => {
    // Si el problema que se estaba viendo es de una categoría "oculta"
    // (hardware_pc, red_celular, etc.), "← Cambiar categoría" regresa
    // primero al paso de elegir Computadoras/Celulares de su categoría
    // agrupadora, no directo a la pantalla principal.
    const parentKey = PARENT_GROUPING_CATEGORY[category];
    setActiveNote(null);
    setForm(EMPTY);
    setPrinterSelection('');
    if (parentKey) {
      setCategory(parentKey);
      setStep('device-split');
      return;
    }
    setStep('category');
    setCategory('');
    setSubareaOptions(null);
    setSubarea(null);
  };

  const handleBackFromForm = () => {
    if (subarea) { setStep('app-subarea-problem'); return; }
    setStep(selectedCategory?.problems === null ? 'category' : 'problem');
  };

  const handleBackToSubareaPicker = () => {
    setSubarea(null);
    setStep('app-subarea');
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
    if (category === PRINTER_CATEGORY && !form.otherTypeDetail.trim()) { setError('Especifica cuál impresora es.'); return; }
    if (!form.subject.trim()) { setError('Falta el asunto del ticket.'); return; }
    if (myAssets.length > 1 && !NO_ASSET_SELECTOR_CATEGORIES.includes(category) && !form.assetId) { setError('Selecciona sobre cuál de tus equipos es esto.'); return; }
    setSubmitting(true);
    try {
      const data = new FormData();
      data.append('ticketType', category);
      data.append('otherTypeDetail', form.otherTypeDetail);
      data.append('subject', form.subject);
      data.append('description', form.description);
      if (form.appRef) data.append('appRef', form.appRef);
      if (form.assetId && form.assetId !== NO_SPECIFIC_ASSET) data.append('assetId', form.assetId);
      if (form.slaHint) data.append('slaHint', form.slaHint);
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
        <Link to="/mesa-de-ayuda" className={rt.backLink}>← Volver a Solicitudes</Link>
        <div className={rt.mainHead}>
          <h1>Reportar un problema</h1>
          <p>Ticket de soporte — Sistemas IT & BI</p>
        </div>
        <div className={rt.panel}>
          <div className={`${shared.successBox} ${rt.formWrap}`}>
            <span className={shared.successIcon}>✅</span>
            <h2 className={shared.successTitle}>Ticket enviado</h2>
            <p className={shared.successText}>Folio {done} — Sistemas lo va a revisar.</p>
            <Link to="/mis-tickets" className={shared.submitBtn} style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              Ver mis tickets
            </Link>
            <button className={shared.nameOption} style={{ marginTop: '0.6rem' }} onClick={() => {
              setForm(EMPTY); setFile(null); setDone(null); setCategory(''); setSubareaOptions(null); setSubarea(null); setPrinterSelection(''); setStep('category');
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
      <Link to="/mesa-de-ayuda" className={rt.backLink}>← Volver a Solicitudes</Link>
      <div className={rt.mainHead}>
        <h1>Reportar un problema</h1>
        <p>Ticket de soporte — Sistemas IT & BI</p>
      </div>

      <div className={rt.panel}>
        {error && <p className={shared.error}>{error}</p>}

        {step === 'category' && (
          <>
            <p className={shared.sectionTitle}>¿De qué tipo es el problema?</p>
            <div className={rt.catStepWrap}>
              {categoriesBySection.map((group, i) => (
                <div
                  key={group.section}
                  className={i > 0 ? rt.catSection : undefined}
                  style={{
                    '--accent': `var(--p-${SECTION_ACCENTS[group.section] || 'orange'})`,
                    '--accent-soft': `var(--p-${SECTION_ACCENTS[group.section] || 'orange'}-soft)`,
                  }}
                >
                  <p className={rt.catSectionTitle}><span className={rt.catSectionDot} />{group.section}</p>
                  <div className={rt.catGrid}>
                    {group.items.map((cat) => (
                      <button key={cat.key} type="button" className={rt.catCard} onClick={() => handlePickCategory(cat)}>
                        <span className={rt.catIcon}>{cat.icon}</span>
                        <h3>{cat.label}</h3>
                        <p>{cat.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {step === 'device-split' && selectedCategory && (
          <>
            <button type="button" className={rt.backLink} onClick={() => { setStep('category'); setCategory(''); }}>← Cambiar categoría</button>
            <p className={shared.sectionTitle}>{selectedCategory.icon} {selectedCategory.label} — ¿de tu computadora o de tu celular?</p>
            <div className={rt.catStepWrap}>
              <div className={rt.catGrid}>
                {visibleDeviceOptions(selectedCategory).map((opt) => (
                  <button key={opt.key} type="button" className={rt.catCard} onClick={() => handlePickDevice(opt)}>
                    <span className={rt.catIcon}>{opt.icon}</span>
                    <h3>{opt.label}</h3>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 'problem' && selectedCategory && (
          <>
            <button type="button" className={rt.backLink} onClick={handleBackToCategory}>← Cambiar categoría</button>
            <p className={shared.sectionTitle}>{selectedCategory.icon} {selectedCategory.label} — ¿cuál es el problema?</p>

            {activeNote ? (
              <div className={rt.noteBox}>
                <p>{problemNote(activeNote).text}</p>
                <div className={rt.noteActions}>
                  <button type="button" className={shared.submitBtn} style={{ width: 'auto', padding: '0.7rem 1.25rem' }} onClick={() => navigate(problemNote(activeNote).ctaTo)}>
                    {problemNote(activeNote).ctaLabel}
                  </button>
                  <button type="button" className={rt.backLink} onClick={() => { handlePickProblem(problemLabel(activeNote), '', problemSla(activeNote) || ''); setActiveNote(null); }}>
                    Aún así, reportarlo como ticket →
                  </button>
                </div>
                <button type="button" className={rt.backLink} style={{ marginTop: '0.75rem' }} onClick={() => setActiveNote(null)}>← Volver a la lista</button>
              </div>
            ) : (
              <div className={rt.problemList}>
                {selectedCategory.problems === 'apps' ? (
                  apps.length > 0 ? (
                    <>
                      {apps.map((a) => (
                        <button key={a._id} type="button" className={rt.problemItem} onClick={() => handlePickApp(a)}>{a.name}</button>
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
                    <button key={problemLabel(p)} type="button" className={rt.problemItem} onClick={() => handleProblemClick(p)}>{problemLabel(p)}</button>
                  ))
                )}
              </div>
            )}
          </>
        )}

        {step === 'app-subarea' && selectedCategory && subareaOptions && (
          <>
            <button type="button" className={rt.backLink} onClick={() => setStep('problem')}>← Cambiar aplicación</button>
            <p className={shared.sectionTitle}>{apps.find((a) => a._id === form.appRef)?.name || 'Aplicación'} — ¿de qué apartado es?</p>
            <div className={rt.catStepWrap}>
              <div className={rt.catGrid}>
                {subareaOptions.map((s) => (
                  <button key={s.key} type="button" className={rt.catCard} onClick={() => handlePickSubarea(s)}>
                    <span className={rt.catIcon}>{s.icon}</span>
                    <h3>{s.label}</h3>
                    <p>{s.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 'app-subarea-problem' && subarea && (
          <>
            <button type="button" className={rt.backLink} onClick={handleBackToSubareaPicker}>← Cambiar apartado</button>
            <p className={shared.sectionTitle}>{subarea.icon} {subarea.label} — ¿cuál es el problema?</p>
            <div className={rt.problemList}>
              {subarea.problems.map((p) => (
                <button key={problemLabel(p)} type="button" className={rt.problemItem} onClick={() => handlePickSubareaProblem(p)}>{problemLabel(p)}</button>
              ))}
            </div>
          </>
        )}

        {step === 'form' && selectedCategory && (
          <form onSubmit={handleSubmit} className={rt.formWrap}>
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
              {category === PRINTER_CATEGORY && (
                <div className={shared.field}>
                  <label>¿Cuál impresora es? *</label>
                  <select value={printerSelection} onChange={(e) => handlePrinterSelect(e.target.value)}>
                    <option value="">Selecciona...</option>
                    {PRINTER_CATALOG.map((group) => (
                      <optgroup key={group.branch} label={group.branch}>
                        {group.printers.map((p) => (
                          <option key={printerOptionValue(group.branch, p)} value={printerOptionValue(group.branch, p)}>
                            {printerOptionLabel(p)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    <option value={OTHER_PRINTER_OPTION}>Otra / no está en la lista</option>
                  </select>
                  {printerSelection === OTHER_PRINTER_OPTION && (
                    <input
                      style={{ marginTop: '0.5rem' }}
                      value={form.otherTypeDetail}
                      onChange={(e) => set('otherTypeDetail')(e.target.value)}
                      placeholder="Ej. HP de Recepción, planta baja"
                    />
                  )}
                </div>
              )}
              {category === APP_CATEGORY && subarea && (
                <p className={shared.hint}>Apartado: <strong>{subarea.label}</strong></p>
              )}
              {myAssets.length > 1 && !NO_ASSET_SELECTOR_CATEGORIES.includes(category) && (
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
