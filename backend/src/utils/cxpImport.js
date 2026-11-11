// Importación del histórico de Cuentas por Pagar (cuentasporpagar.
// selectshop.com.mx, endpoint /api/historial-general) a Pagos Recurrentes —
// pedido explícito del usuario (2026-11-11): "aún no metiste el histórico
// que viste en la plataforma de cuentas por pagar".
//
// Cada solicitud de CxP se cruza con un servicio del catálogo:
//   1. Proveedor (primera palabra significativa: TELEFONOS, TOTAL, DIGITAL…)
//   2. Compañía (todas las palabras del catálogo deben estar en la de CxP:
//      "11. BLOOM BLUSH" ↔ "BLOOM & BLUSH", "GOLDEN" ↔ "GOLDEN YEARS…").
//   3. Cuenta: el número de teléfono/cuenta/contrato del catálogo aparece en
//      las observaciones de CxP ("TEL 5556854768", "CTA 0200704359",
//      "CONTRATO 5331"). Si ninguno trae número, desempata la sucursal; si
//      aun así queda más de un candidato, NO se adivina (queda "ambigua").
// Y luego con un periodo: el vencimiento del servicio cuyo corte (día para
// meterla) queda más cerca de la fecha en que se metió la solicitud.
//
// Es re-ejecutable (sirve de "sincronización"): si el ciclo ya tiene ese
// folio solo actualiza el estado (metido → pagado); nunca pisa un ciclo que
// ya tiene OTRO folio.
const { addDays, dueDatesBetween, submitDateFor, derivedFields } = require('./paymentSchedule');

const STOP = new Set(['SA', 'DE', 'CV', 'SAB', 'SAPI', 'S', 'A', 'C', 'V', 'Y', 'LA', 'EL', 'EN']);
const norm = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/^\s*\d+\s*\.\s*/, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s) => norm(s).split(' ').filter((t) => t && !STOP.has(t));

function providerKey(name) {
  const t = norm(name).split(' ');
  // "DE LAGE LANDEN" → "DELAG"; el resto, primeras 5 letras de la 1a palabra
  const word = t[0] === 'DE' && t[1] ? t[0] + t[1] : t[0];
  return (word || '').slice(0, 5);
}
// DLL Leasing y De Lage Landen son la misma arrendadora (el usuario las
// junta en "DLL Y DE LAGE"), pero cada contrato tiene su número — la cuenta
// es la que decide, así que basta con tratarlas como un solo proveedor.
const PROVIDER_ALIASES = { DELAG: 'DLL' };
const provider = (name) => { const k = providerKey(name); return PROVIDER_ALIASES[k] || k; };

function companyMatches(catalogCompany, cxpCompany) {
  const cat = tokens(catalogCompany);
  if (!cat.length || norm(catalogCompany) === 'POR CONFIRMAR') return true;
  const cx = new Set(tokens(cxpCompany));
  return cat.every((t) => cx.has(t));
}

// Números de cuenta/teléfono/contrato del catálogo ("TEL 5556871130",
// "CONTRATO 009-0036157-000" → 0036157, "Cto. 104"). Se ignoran años (2026
// en "PAGO CTA MAESTRA ... DE ABRIL 2026") y los ceros de relleno ("000").
// Si hay un número largo, los cortos sobran: el "023" de "023-0230311-000"
// o el "500" de "PLAN INTERNET PLUS SIMETRICO 500" coincidirían con
// cualquier otra solicitud.
function accountNumbers(cuenta) {
  const nums = (String(cuenta || '').match(/\d{3,}/g) || [])
    .filter((n) => !/^20\d\d$/.test(n) && !/^0+$/.test(n));
  const longest = Math.max(0, ...nums.map((n) => n.length));
  return nums.filter((n) => n.length >= Math.min(longest, 4));
}
function mentions(text, n) {
  const core = n.replace(/^0+/, '') || n;
  return new RegExp(`(^|\\D)0*${core}(\\D|$)`).test(text)
    // Total Play pone la cuenta dentro de la referencia "0800000" + cuenta.
    || (n.length >= 8 && text.includes(n));
}

// Zona IT factura por separado la renta de impresoras (por contrato) y el
// suministro de etiquetas, misma compañía y sucursal — el "motivo" de CxP
// es lo único que los distingue cuando la observación no trae el contrato.
function kind(str) {
  const t = norm(str);
  // Ojo: "RENTA"/"CONTRATO" a secas NO cuentan — DLL/De Lage Landen
  // también son "renta de equipo de cómputo" con contrato, y ahí solo el
  // número de contrato puede decidir.
  if (/IMPRESORA|\bCTO\b/.test(t)) return 'impresoras';
  if (/ETIQUETA/.test(t)) return 'etiquetas';
  return null;
}
const serviceKind = (s) => kind(`${s.cuenta} ${s.motivo}`);

function matchRecord(services, rec) {
  const text = `${rec.obs || ''} ${rec.folioCfdi || ''} ${(rec.facturas || []).join(' ')}`;
  const prov = provider(rec.proveedor);
  let cands = services.filter((s) => provider(s.proveedor) === prov && companyMatches(s.compania, rec.empresa));
  if (!cands.length) return { reason: 'sin_servicio' };

  const byAccount = cands.filter((s) => accountNumbers(s.cuenta).some((n) => mentions(text, n)));
  if (byAccount.length === 1) return { service: byAccount[0], how: 'cuenta' };
  if (byAccount.length > 1) {
    cands = byAccount;
  } else {
    // Ningún número coincidió: un servicio que SÍ tiene número propio no
    // puede ser (ej. un contrato nuevo de De Lage Landen que no está en el
    // catálogo no se le "pega" al único contrato que sí está).
    const recKind = kind(rec.motivo);
    const sameKind = (s) => !recKind || !serviceKind(s) || serviceKind(s) === recKind;
    const withoutNumber = cands.filter((s) => !accountNumbers(s.cuenta).length && sameKind(s));
    // Si no queda ninguno sin número, se aceptan los que sí tienen número
    // pero solo cuando el tipo (renta/etiquetas) coincide explícitamente —
    // ej. la renta de Zona IT cuya observación no menciona el contrato.
    cands = withoutNumber.length
      ? withoutNumber
      : cands.filter((s) => recKind && serviceKind(s) === recKind);
    if (!cands.length) return { reason: 'sin_servicio' };
  }

  const bySucursal = cands.filter((s) => norm(s.sucursal) && norm(s.sucursal) === norm(rec.sucursal));
  if (bySucursal.length === 1) return { service: bySucursal[0], how: byAccount.length ? 'cuenta+sucursal' : 'sucursal' };
  if (cands.length === 1) return { service: cands[0], how: byAccount.length ? 'cuenta' : 'proveedor+compañía' };
  return { reason: 'ambigua', candidatos: cands.length };
}

// Periodos posibles del servicio, del corte más cercano a la fecha de
// solicitud al más lejano (máx. 35 días de diferencia). Si el más cercano
// ya lo ocupó otra solicitud del mismo servicio (se metió tarde un mes y a
// tiempo el siguiente), se usa el siguiente libre.
function periodOptions(service, fechaSolicitud) {
  return dueDatesBetween(service, addDays(fechaSolicitud, -60), addDays(fechaSolicitud, 95))
    .map((o) => ({ ...o, diff: Math.abs((new Date(submitDateFor(o.fechaLimite)) - new Date(fechaSolicitud)) / 864e5) }))
    .filter((o) => o.diff <= 35)
    // Una solicitud no puede cubrir un corte de más de una semana después de
    // cuando se metió — Zona IT factura con retraso (lo de septiembre se
    // metió el 28-oct): sin este tope, "el siguiente libre" caía en el corte
    // del 18-nov y lo marcaba metido, cuando ese corte es justo el que
    // todavía hay que meter.
    .filter((o) => submitDateFor(o.fechaLimite) <= addDays(fechaSolicitud, 7))
    .sort((a, b) => a.diff - b.diff);
}

const STATE_MAP = { pagada: 'pagado', por_pagar: 'metido', aprobada: 'metido', pendiente: 'metido' };

// Devuelve un plan (no escribe nada): qué ciclo crear/actualizar por cada
// solicitud, y qué quedó sin cruzar.
function planImport(services, records) {
  const plan = [];
  const skipped = [];
  for (const rec of records) {
    if (rec.tipo && rec.tipo !== 'pago') { skipped.push({ rec, reason: `tipo ${rec.tipo}` }); continue; }
    const estado = STATE_MAP[rec.estado];
    if (!estado) { skipped.push({ rec, reason: `estado ${rec.estado}` }); continue; }
    const m = matchRecord(services, rec);
    if (!m.service) { skipped.push({ rec, reason: m.reason, candidatos: m.candidatos }); continue; }
    plan.push({ rec, service: m.service, how: m.how, estado });
  }
  // Periodo: en orden de fecha de solicitud, cada una toma el periodo libre
  // más cercano de su servicio.
  plan.sort((a, b) => String(a.rec.fechaSolicitud).localeCompare(String(b.rec.fechaSolicitud)));
  const taken = new Map();
  const final = [];
  for (const item of plan) {
    const free = periodOptions(item.service, item.rec.fechaSolicitud)
      .find((o) => !taken.has(`${item.service._id}|${o.periodo}`));
    if (!free) { skipped.push({ rec: item.rec, reason: 'sin_periodo_libre', service: item.service }); continue; }
    taken.set(`${item.service._id}|${free.periodo}`, item.rec.folio);
    final.push({ ...item, periodo: free.periodo, fechaLimite: free.fechaLimite });
  }
  return { plan: final, skipped };
}

async function applyImport(PaymentCycle, plan, userName) {
  let created = 0; let updated = 0; let conflicts = 0;
  for (const it of plan) {
    const existing = await PaymentCycle.findOne({ service: it.service._id, periodo: it.periodo });
    const folio = String(it.rec.folio || '').toUpperCase();
    const montoReal = it.rec.moneda === (it.service.moneda || 'MXN') ? it.rec.monto : null;
    if (!existing) {
      await PaymentCycle.create({
        service: it.service._id, periodo: it.periodo, ...derivedFields(it.fechaLimite, it.service.metodo),
        estado: it.estado, folioCxp: folio, montoReal, notas: 'Importado de Cuentas por Pagar', updatedByName: userName,
      });
      created += 1;
      continue;
    }
    if (existing.folioCxp && existing.folioCxp !== folio) { conflicts += 1; continue; }
    const rank = { pendiente: 0, factura_recibida: 1, metido: 2, pagado: 3, omitido: 3 };
    if (existing.folioCxp === folio && rank[existing.estado] >= rank[it.estado]) continue;
    existing.estado = it.estado;
    existing.folioCxp = folio;
    if (existing.montoReal === null || existing.montoReal === undefined) existing.montoReal = montoReal;
    existing.updatedByName = userName;
    await existing.save();
    updated += 1;
  }
  return { created, updated, conflicts };
}

module.exports = { planImport, applyImport, matchRecord, periodOptions, provider, companyMatches, accountNumbers };
