// Motor de búsqueda del Centro de Ayuda — compartido por el buscador de
// Mesa de Ayuda (MesaDeAyuda.jsx) y el Robot de Ayuda (components/HelpBot.jsx).
// Antes este código vivía duplicado dentro de MesaDeAyuda.jsx; se movió aquí
// para que ambas superficies busquen con la MISMA lógica — mejorar una
// mejora la otra, no hay que sincronizar dos catálogos.
//
// Sigue siendo 100% basado en reglas (normalización + coincidencia de
// palabras clave), sin IA ni servicio externo de por medio — pedido
// explícito del usuario ("que sea gratis, no necesitemos pagar tokens").
// Lo "más completo" que se agregó sobre la versión original:
//   1. Sinónimos comunes (compu/pc/cel/wifi/pass/...) expandidos antes de
//      buscar, para que la jerga cotidiana encuentre lo mismo que el término
//      "formal" ya cubierto por los keywords curados.
//   2. Tolerancia a errores de dedo (distancia de edición 1) en palabras de
//      5+ letras, para que un typo no deje a alguien sin resultados.
//   3. Búsqueda también sobre las preguntas frecuentes de los manuales
//      (config/faqData.js), que antes solo se encontraban leyendo el manual
//      completo.
import { CATEGORIES, problemLabel, problemNote, problemTip, problemKeywords, findSpecialSubareas, categoryPath } from '../config/ticketCategories';
import { FAQ_ENTRIES } from '../config/faqData';

export function normalize(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// El Robot de Ayuda se llama "Click" — si alguien le habla por su nombre
// ("Click, ¿cómo reporto?", "Oye Click, no me llegan correos") se le quita
// el saludo antes de buscar, para que encuentre lo mismo que sin el nombre.
// Solo se quita cuando viene con una coma/puntuación justo después de
// "click" (un saludo real) — un "click" suelto sin coma se deja tal cual,
// porque puede ser parte de un problema real (ej. "click derecho no
// funciona").
const VOCATIVE_RE = /^(hola|oye|oiga)?[,\s]*click\s*[,:.!]+\s*/;
function stripVocative(q0) {
  return q0.replace(VOCATIVE_RE, '');
}

// Jerga/abreviaturas cotidianas -> el término "formal" que ya usan los
// keywords curados de CATEGORIES/SOLICITUD_TOPICS/FAQ_ENTRIES. Se agrega
// como palabra EXTRA a la búsqueda (no reemplaza lo que la persona escribió),
// así "no prende mi compu" encuentra lo mismo que "no prende mi computadora".
const SYNONYMS = {
  compu: 'computadora', pc: 'computadora', note: 'laptop', noteb: 'laptop',
  cel: 'celular', movil: 'celular', movi: 'celular', telefono: 'celular',
  pass: 'contraseña', password: 'contraseña', clave: 'contraseña', contra: 'contraseña',
  wifi: 'red', internet: 'red', señal: 'red',
  mail: 'correo', email: 'correo', gmail: 'correo', outlook: 'correo',
  impre: 'impresora', printer: 'impresora',
  soft: 'software', app: 'aplicacion', apps: 'aplicaciones',
  hard: 'hardware',
  user: 'usuario',
};

function expandWithSynonyms(q) {
  const tokens = q.split(/\s+/).filter(Boolean);
  const extra = [];
  for (const t of tokens) {
    const syn = SYNONYMS[t];
    if (syn && !q.includes(syn)) extra.push(syn);
  }
  return extra.length ? `${q} ${extra.join(' ')}` : q;
}

// Distancia de edición clásica, acotada a strings cortos (palabras sueltas,
// no frases) — suficiente para detectar un typo de una letra sin necesitar
// ninguna librería externa.
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], row[j - 1]);
    }
    prev = row;
  }
  return prev[b.length];
}

// Dos palabras "suenan a la misma" si difieren cuando mucho en 1 letra
// (typo, omisión o extra) y ambas tienen 5+ letras — con menos letras un
// typo de 1 distancia cambia demasiado el significado (ej. "red" -> "rey").
function isFuzzyMatch(a, b) {
  if (a.length < 5 || b.length < 5) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  return levenshtein(a, b) <= 1;
}

const SOLICITUD_TOPICS = [
  {
    icon: '🔐', label: 'Correo Gmail — solicitar cuenta nueva', to: '/mesa-de-ayuda/solicitar-cuenta?tipo=gmail',
    hint: 'Pedir una cuenta de Gmail nueva (no un problema con una que ya tienes).',
    keywords: ['nueva cuenta de correo', 'necesito gmail', 'alta de correo', 'correo nuevo', 'quiero un correo', 'dar de alta correo'],
  },
  {
    icon: '🌐', label: 'Plataforma de venta — solicitar cuenta nueva', to: '/mesa-de-ayuda/solicitar-cuenta?tipo=platforms',
    hint: 'Pedir acceso nuevo a Mercado Libre, Amazon, Walmart, etc.',
    keywords: ['mercado libre', 'amazon', 'walmart', 'plataforma de venta', 'nueva cuenta de plataforma'],
  },
  {
    icon: '🏭', label: 'Acceso al ERP — solicitar cuenta nueva', to: '/mesa-de-ayuda/solicitar-cuenta?tipo=erp',
    hint: 'Pedir que te den de alta como usuario nuevo del ERP.',
    keywords: ['necesito acceso al erp', 'nuevo usuario erp', 'alta usuario erp', 'quiero acceso al erp', 'dar de alta en el erp'],
  },
  {
    icon: '🖱️', label: 'Equipo o accesorio — solicitar recurso', to: '/mesa-de-ayuda/solicitar-recurso',
    hint: 'Pedir un equipo o accesorio nuevo (no reportar uno que ya tienes y falló).',
    keywords: ['necesito un mouse', 'necesito un teclado', 'monitor nuevo', 'necesito una laptop', 'accesorio nuevo', 'necesito equipo', 'necesito una diadema', 'audifonos nuevos'],
  },
  {
    icon: '📞', label: 'Línea telefónica — solicitar recurso', to: '/mesa-de-ayuda/solicitar-recurso?tipo=telefono',
    hint: 'Pedir una línea o plan telefónico de la empresa.',
    keywords: ['linea telefonica', 'numero de telefono', 'plan celular', 'chip nuevo'],
  },
  {
    icon: '💻', label: 'Software o licencia — solicitar recurso', to: '/mesa-de-ayuda/solicitar-recurso?tipo=software',
    hint: 'Pedir que te instalen un programa o una licencia nueva.',
    keywords: ['necesito instalar', 'licencia de', 'quiero un programa nuevo', 'necesito una licencia', 'instalar un programa'],
  },
  {
    icon: '🧑‍💼', label: 'Alta de nuevo ingreso', to: '/mesa-de-ayuda/solicitar-ingreso',
    hint: 'Alguien nuevo se integra al equipo (RH).',
    keywords: ['nuevo empleado', 'alta de personal', 'se integra alguien', 'ingreso nuevo', 'nuevo integrante', 'nuevo ingreso'],
    restricted: 'canManageOnboarding',
  },
  {
    icon: '📤', label: 'Baja de personal', to: '/mesa-de-ayuda/baja-personal',
    hint: 'Un jefe reporta que alguien de su equipo causa baja (jefes y RH).',
    keywords: ['baja de personal', 'dar de baja', 'causa baja', 'renuncia', 'despido', 'termino de contrato', 'devolucion de activos'],
    restricted: (u) => !!u?.canRequestOffboarding || !!u?.canManageOffboarding,
  },
];

function scoreKeywords(keywords, q, words, fullWeight, wordWeight) {
  let score = 0;
  const isSingleWordQuery = words.length === 1 && words[0] === q;
  for (const kw of keywords) {
    const nkw = normalize(kw);
    if (!nkw) continue;
    if (q.includes(nkw)) { score += fullWeight; continue; }
    if (nkw.includes(' ')) {
      // Frase de varias palabras que NO vino tal cual en la consulta — pasa
      // igual si TODAS sus palabras significativas (4+ letras) aparecen
      // sueltas, en cualquier orden. Cubre relleno natural ("no me llegan
      // LOS correos", "a mi correo no me llegan") que rompería una búsqueda
      // de substring exacto pero para una persona sigue siendo obviamente
      // la misma frase.
      const kwWords = nkw.split(' ').filter((w) => w.length >= 4);
      if (kwWords.length && kwWords.every((w2) => words.some((w) => w === w2 || w.includes(w2) || w2.includes(w) || isFuzzyMatch(w, w2)))) {
        score += wordWeight;
      }
    } else if (nkw.length >= 4 && words.some((w) => nkw.includes(w) || w.includes(nkw) || isFuzzyMatch(w, nkw))) {
      score += wordWeight;
    } else if (isSingleWordQuery) {
      const kwWords = nkw.split(' ').filter((w) => w.length >= 4);
      if (kwWords.some((w) => w.includes(q) || q.includes(w) || isFuzzyMatch(w, q))) score += wordWeight;
    }
  }
  return score;
}

function bestTicketMatch(cat, q, words, apps) {
  let best = null;
  const catScore = scoreKeywords(cat.keywords || [], q, words, 3, 1);
  if (catScore > 0) best = { score: catScore, kind: 'category' };

  if (Array.isArray(cat.problems)) {
    for (const p of cat.problems) {
      const pScore = scoreKeywords(problemKeywords(p), q, words, 5, 2);
      if (pScore > 0 && (!best || pScore > best.score)) best = { score: pScore, kind: 'problem', item: p };
    }
  } else if (cat.problems === 'apps') {
    for (const app of apps) {
      const subareas = findSpecialSubareas(app.name);
      if (subareas) {
        for (const sub of subareas) {
          for (const p of sub.problems) {
            const pScore = scoreKeywords(problemKeywords(p), q, words, 4, 1);
            if (pScore > 0 && (!best || pScore > best.score)) best = { score: pScore, kind: 'app-subarea-problem', app, subarea: sub, item: p };
          }
        }
      }
      const nname = normalize(app.name);
      if (nname.length >= 3 && q.includes(nname) && (!best || 5 > best.score)) best = { score: 5, kind: 'app', item: app };
    }
  }
  return best;
}

// Ruta de clics real, en el mismo lenguaje que usa la pantalla principal
// ("Tengo un problema o algo no funciona" → sección → tarjeta → ...) —
// pedido explícito del usuario: que el robot no solo mande al formulario,
// sino que también enseñe dónde se reporta, paso a paso, para la próxima vez.
function ruta(steps) {
  return `Ruta: ${['Tengo un problema', ...steps].join(' → ')}`;
}

function buildTicketResult(cat, best) {
  const path = categoryPath(cat);
  if (best.kind === 'category') {
    return { kind: 'nav', icon: cat.icon, label: `${cat.label} — reportar ticket`, hint: `${cat.desc} ${ruta(path)} y ahí eliges tu problema específico.`, to: `/mesa-de-ayuda/reportar-ticket?tipo=${cat.key}`, score: best.score };
  }
  if (best.kind === 'app') {
    return { kind: 'nav', icon: cat.icon, label: `${best.item.name} — reportar ticket`, hint: ruta([...path, best.item.name]), to: `/mesa-de-ayuda/reportar-ticket?tipo=aplicacion&app=${best.item._id}`, score: best.score };
  }
  if (best.kind === 'app-subarea-problem') {
    return {
      kind: 'nav',
      icon: best.subarea.icon,
      label: problemLabel(best.item),
      hint: ruta([...path, best.app.name, best.subarea.label, problemLabel(best.item)]),
      to: `/mesa-de-ayuda/reportar-ticket?tipo=aplicacion&app=${best.app._id}&subarea=${best.subarea.key}&problema=${encodeURIComponent(problemLabel(best.item))}`,
      score: best.score,
    };
  }
  const note = problemNote(best.item);
  return {
    kind: 'nav',
    icon: cat.icon,
    label: problemLabel(best.item),
    hint: note ? `${cat.label} — puede ser un tema de licencia, no una falla.` : ruta([...path, problemLabel(best.item)]),
    to: `/mesa-de-ayuda/reportar-ticket?tipo=${cat.key}&problema=${encodeURIComponent(problemLabel(best.item))}`,
    score: best.score,
    // Tip de troubleshooting (pedido explícito del usuario, 2026-07-27,
    // implementado en el Robot de Ayuda) — un consejo real antes de
    // reportar, distinto del `note` de arriba (que redirige a otro flujo).
    tip: problemTip(best.item),
  };
}

// Busca entre categorías/problemas de tickets + temas de solicitud
// (SOLICITUD_TOPICS) — resultados de tipo 'nav': llevan a un formulario.
export function searchTopics(rawQuery, apps, employeeUser) {
  const q0 = stripVocative(normalize(rawQuery));
  if (q0.length < 3) return [];
  const q = expandWithSynonyms(q0);
  const words = q.split(/\s+/).filter((w) => w.length >= 4);

  const ticketResults = CATEGORIES.map((cat) => {
    const best = bestTicketMatch(cat, q, words, apps);
    return best ? buildTicketResult(cat, best) : null;
  }).filter(Boolean);

  const solicitudResults = SOLICITUD_TOPICS
    .filter((topic) => {
      if (!topic.restricted) return true;
      return typeof topic.restricted === 'function' ? topic.restricted(employeeUser) : !!employeeUser?.[topic.restricted];
    })
    .map((topic) => ({ ...topic, kind: 'nav', score: scoreKeywords(topic.keywords, q, words, 3, 1) }))
    .filter((t) => t.score > 0);

  return [...ticketResults, ...solicitudResults].sort((a, b) => b.score - a.score).slice(0, 5);
}

// Busca entre las preguntas frecuentes de los 4 manuales — resultados de
// tipo 'faq': la respuesta se puede mostrar directo (ej. en el chat del
// Robot de Ayuda), sin tener que entrar al manual completo.
export function searchFaq(rawQuery) {
  const q0 = stripVocative(normalize(rawQuery));
  if (q0.length < 3) return [];
  const q = expandWithSynonyms(q0);
  const words = q.split(/\s+/).filter((w) => w.length >= 4);

  return FAQ_ENTRIES
    .map((entry) => {
      const keywordScore = scoreKeywords(entry.keywords || [], q, words, 5, 2);
      // Respaldo: también compara contra las propias palabras de la
      // pregunta (`entry.q`), con menos peso — cubre variantes que la lista
      // de `keywords` curada a mano no haya previsto.
      const qWords = normalize(entry.q).split(/\s+/).filter((w) => w.length >= 4);
      const textScore = words.filter((w) => qWords.some((qw) => qw === w || isFuzzyMatch(w, qw))).length;
      const score = keywordScore + textScore;
      return score > 0 ? { kind: 'faq', score, q: entry.q, a: entry.a, to: entry.to } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

// Frases que indican que la persona quiere saber CÓMO VA algo que ya
// reportó/solicitó, no encontrar a dónde reportar algo nuevo — dispara una
// consulta en vivo (GET /tickets/mine, /account-requests/mine, etc.) en vez
// de una búsqueda contra el catálogo estático.
const STATUS_PHRASES = [
  'como va mi', 'como van mis', 'en que va mi', 'en que van mis',
  'estatus de mi', 'estatus de mis', 'seguimiento de mi', 'seguimiento a mi',
  'mi ticket', 'mis tickets', 'mi solicitud', 'mis solicitudes',
  'ya reporte', 'ya solicite', 'que paso con mi', 'que paso con mis',
];

// Un simple "hola" — pedido explícito del usuario (2026-07-29): que Click
// conteste algo amigable ("¡Hola! ¿Qué necesitas?") en vez del fallback de
// "no encontré algo exacto para..." (ese fallback se queda tal cual para
// mensajes de verdad no reconocidos — groserías, texto sin sentido, etc.,
// donde sí es la respuesta correcta). Coincidencia EXACTA del mensaje
// completo (no solo `.includes()`) — así "hola, mi mouse no prende" sigue
// buscando el problema real en vez de quedarse solo en el saludo.
const GREETING_PHRASES = ['hola', 'hey', 'ola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'que tal', 'saludos', 'hi', 'holis'];
export function detectGreetingIntent(rawQuery) {
  const q = stripVocative(normalize(rawQuery))
    .replace(/[¡!¿?.,]/g, '')
    .replace(/^click\s+/, '')
    .replace(/\s+click$/, '')
    .trim();
  return GREETING_PHRASES.includes(q);
}

export function detectStatusIntent(rawQuery) {
  const q = stripVocative(normalize(rawQuery));
  return STATUS_PHRASES.some((p) => q.includes(p));
}

// Instalar la PWA — pedido explícito del usuario (2026-07-28): en vez de un
// solo video genérico, primero se pregunta dispositivo/navegador y luego se
// manda el video correcto (ver INSTALL_VIDEOS en components/HelpBot.jsx).
// Distinto de la FAQ existente "¿la app funciona sin instalar nada?" (esa
// habla de usarla desde el navegador sin instalar) — aquí es al revés,
// alguien SÍ quiere instalarla como app.
const INSTALL_PHRASES = [
  'como instalo la app', 'como instalo la aplicacion', 'como instalo la pwa',
  'instalar la app', 'instalar la aplicacion', 'instalar la pwa',
  'como se instala la app', 'como se instala la aplicacion',
  'agregar a la pantalla de inicio', 'agregar a pantalla de inicio',
  'poner la app en mi celular', 'poner la aplicacion en mi celular',
  'descargar la app', 'descargar la aplicacion',
  'instalar en mi celular', 'instalar en mi telefono', 'instalar en mi compu', 'instalar en mi computadora',
];
export function detectInstallIntent(rawQuery) {
  const q = stripVocative(normalize(rawQuery));
  return INSTALL_PHRASES.some((p) => q.includes(p));
}

// Solo se llama mientras Click está esperando la respuesta de dispositivo/
// navegador (ver `pendingInstall` en HelpBot.jsx) — no en cualquier mensaje,
// para que mencionar "chrome" o "android" en otro contexto no dispare esto
// por accidente.
export function detectInstallDeviceAnswer(rawQuery) {
  const q = stripVocative(normalize(rawQuery));
  if (/safari|firefox|opera|otro navegador|otro browser/.test(q)) return 'other';
  if (q.includes('android')) return 'chrome_android'; // en Android solo se ofrece con Chrome
  if (q.includes('edge')) return 'edge_pc';
  if (q.includes('chrome')) return 'chrome_pc';
  return null;
}

// "¿Qué novedad hay?" — pedido explícito del usuario (2026-07-29): cuando
// alguien ve el aviso de "Actualiza la página" y le pregunta a Click qué
// cambió, ver config/whatsNew.js para la respuesta (lista curada en
// lenguaje de usuario, no el CHANGELOG.md técnico).
const WHATS_NEW_PHRASES = [
  'que novedad hay', 'que novedades hay', 'que hay de nuevo', 'que hay nuevo',
  'que cambios hubo', 'que cambio hubo', 'que se actualizo', 'que se actualizaron',
  'que mejora se hizo', 'que mejoras hicieron', 'que se agrego', 'que se implemento',
  'novedades',
];
export function detectWhatsNewIntent(rawQuery) {
  const q = stripVocative(normalize(rawQuery));
  return WHATS_NEW_PHRASES.some((p) => q.includes(p));
}

// Combina resultados de navegación + FAQ en una sola lista ordenada — usado
// por el Robot de Ayuda para decidir qué mostrar en el chat.
export function searchHelp(rawQuery, { apps = [], employeeUser = null } = {}) {
  const navResults = searchTopics(rawQuery, apps, employeeUser);
  const faqResults = searchFaq(rawQuery);
  return [...navResults, ...faqResults].sort((a, b) => b.score - a.score).slice(0, 6);
}
