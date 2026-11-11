// Verificación de facturas al subirlas a un pago (2026-11-11, pedido
// explícito del usuario: "que con los datos que se importen exista una
// verificación de que sí corresponda a la cuenta del pago").
//
// Cada archivo recibe un resultado:
//   ok              ✅ proveedor y cuenta confirmados
//   revisar         ⚠️ algo no se pudo confirmar (se sube igual, con el motivo)
//   no_corresponde  ⛔ evidencia clara de que es de otro pago — no se sube
//                     salvo que el usuario elija "subir de todos modos"
//
// Qué se revisa (verificado contra las facturas reales de RECIBOS PAGOS):
//   proveedor  RFC emisor contra los RFC ya aprendidos del servicio o, la
//              primera vez, nombre del emisor contra el proveedor (Total Play
//              factura con dos RFC: Total Play y Total Box).
//   compañía   receptor del CFDI contra la compañía del pago. "Público en
//              general" (XAXX010101000) no se puede verificar — Telmex, IZZI
//              y Total Play de JSB facturan así.
//   cuenta     el número del pago (teléfono/cuenta/contrato) dentro del XML
//              o del texto del PDF. Si en su lugar aparece el número de OTRO
//              pago del mismo proveedor → no corresponde. Telmex no trae el
//              teléfono ni en XML ni en PDF (el PDF es imagen): ahí la
//              evidencia es que el monto coincida con lo pagado antes en esa
//              línea.
//   duplicado  mismo UUID o mismo archivo (hash) ya subido en algún pago.
//   fecha      la fecha del CFDI cerca del periodo del pago.
const crypto = require('crypto');
const { accountNumbers, provider, companyMatches } = require('./cxpImport');

const GENERIC_RFC = new Set(['XAXX010101000', 'XEXX010101000']);

let pdfParse = null;
async function pdfText(buffer) {
  try {
    pdfParse = pdfParse || require('pdf-parse/lib/pdf-parse.js');
    const { text } = await pdfParse(buffer);
    return text || '';
  } catch {
    return '';
  }
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function mentions(text, n) {
  const core = n.replace(/^0+/, '') || n;
  const re = new RegExp(`(^|\\D)0*${core}(\\D|$)`);
  // Total Play imprime la cuenta en el PDF con espacios: "01 05 75 17 51".
  return re.test(text) || (n.length >= 8 && re.test(text.replace(/(\d) (?=\d)/g, '$1')));
}

// Cablevisión es la razón social de izzi.
const EMISOR_ALIASES = { CABLE: 'IZZI' };
const emisorKey = (name) => { const k = provider(name); return EMISOR_ALIASES[k] || k; };

function daysBetween(a, b) {
  return Math.round((new Date(a) - new Date(b)) / 864e5);
}

// file: { kind, filename, buffer, cfdi }
// ctx:  { service, cycle, siblings (otros servicios del mismo proveedor),
//         lastAmounts (Map serviceId → montos pagados antes), findUuid, findHash }
async function verifyInvoice(file, ctx) {
  const { service, cycle } = ctx;
  const checks = [];
  const add = (key, ok, msg) => checks.push({ key, ok, msg });
  const hash = sha256(file.buffer);

  // ── Duplicados ───────────────────────────────────────────────────────
  const dupHash = await ctx.findHash(hash);
  if (dupHash) add('duplicado', false, `Este mismo archivo ya está subido en ${dupHash}`);
  else if (file.cfdi?.uuid) {
    const dupUuid = await ctx.findUuid(file.cfdi.uuid);
    if (dupUuid) add('duplicado', false, `Esta factura (UUID ${file.cfdi.uuid.slice(0, 8)}…) ya está subida en ${dupUuid}`);
  }

  const text = file.kind === 'xml' ? file.buffer.toString('utf8') : await pdfText(file.buffer);

  // ── Proveedor ────────────────────────────────────────────────────────
  if (file.cfdi?.emisorRfc) {
    const known = service.rfcsEmisor || [];
    const key = emisorKey(file.cfdi.emisorNombre);
    const nameOk = key === provider(service.proveedor);
    // ¿El emisor es OTRO proveedor que sí está en el catálogo?
    const otherProvider = !nameOk && (ctx.allProviderKeys || new Set()).has(key);
    if (known.includes(file.cfdi.emisorRfc)) add('proveedor', true, `Emisor ${file.cfdi.emisorNombre} (${file.cfdi.emisorRfc})`);
    else if (nameOk) add('proveedor', true, `Emisor ${file.cfdi.emisorNombre} coincide con ${service.proveedor}`);
    else if (known.length || otherProvider) add('proveedor', false, `El emisor es ${file.cfdi.emisorNombre} (${file.cfdi.emisorRfc}); este pago se le paga a ${service.proveedor}`);
    else add('proveedor', null, `Emisor ${file.cfdi.emisorNombre} — no se pudo confirmar que sea ${service.proveedor} (primera factura de este pago)`);
  }

  // ── Compañía ─────────────────────────────────────────────────────────
  if (file.cfdi?.receptorRfc) {
    if (GENERIC_RFC.has(file.cfdi.receptorRfc)) {
      // Nota informativa, no baja la calificación: Telmex, IZZI y Total Play
      // de JSB siempre facturan así.
      add('compania', 'info', 'Facturada a "Público en general" (no trae la compañía)');
    } else if (service.rfcReceptor && service.rfcReceptor === file.cfdi.receptorRfc) {
      add('compania', true, `Receptor ${file.cfdi.receptorNombre} (${file.cfdi.receptorRfc})`);
    } else if (companyMatches(service.compania, file.cfdi.receptorNombre)) {
      add('compania', true, `Receptor ${file.cfdi.receptorNombre} coincide con ${service.compania}`);
    } else {
      add('compania', false, `Facturada a ${file.cfdi.receptorNombre} (${file.cfdi.receptorRfc}); este pago es de ${service.compania}`);
    }
  }

  // ── Cargos a tarjeta (invoice extranjero, solo PDF) ─────────────────
  // No hay CFDI: se busca en el texto el emisor (Anthropic, OpenAI,
  // Adobe…) y, si la cuenta es un correo, que el invoice lo mencione.
  if (service.metodo === 'tarjeta' && !file.cfdi) {
    const low = (text || '').toLowerCase();
    const names = [service.emisorFactura, service.proveedor.split(/[\s.]/)[0]]
      .filter((n) => n && n.length >= 3).map((n) => n.toLowerCase());
    if (!low) add('proveedor', null, 'No se pudo leer el texto del archivo');
    else if (names.some((n) => low.includes(n))) add('proveedor', true, `Menciona ${names.find((n) => low.includes(n))}`);
    else add('proveedor', null, `No encontré "${names.join('" ni "')}" en el archivo`);
    const email = (service.cuenta.match(/[\w.+-]+@[\w.-]+/) || [])[0];
    if (email && low) {
      add('cuenta', low.includes(email.toLowerCase()) ? true : null,
        low.includes(email.toLowerCase()) ? `Menciona ${email}` : `No encontré ${email} en el archivo`);
    }
  }

  // ── Cuenta / teléfono / contrato ────────────────────────────────────
  const mine = service.metodo === 'tarjeta' ? [] : accountNumbers(service.cuenta);
  if (mine.length) {
    if (text && mine.some((n) => mentions(text, n))) {
      add('cuenta', true, `Menciona ${service.cuenta.trim()}`);
    } else {
      const other = text ? ctx.siblings.find((s) => accountNumbers(s.cuenta).some((n) => n.length >= 5 && mentions(text, n))) : null;
      if (other) {
        add('cuenta', false, `Menciona ${other.cuenta.trim()} (${other.compania} · ${other.sucursal}), que es otro pago`);
      } else if (file.kind === 'xml' && file.cfdi?.total != null && ctx.lastAmounts.length) {
        const near = ctx.lastAmounts.some((m) => Math.abs(m - file.cfdi.total) <= Math.max(5, m * 0.05));
        add('cuenta', near ? true : null, near
          ? `No trae el número, pero el total ${file.cfdi.total} coincide con lo pagado antes en ${service.cuenta.trim()}`
          : `No trae el número de ${service.cuenta.trim()} y el total no se parece a lo pagado antes (${ctx.lastAmounts.slice(0, 3).join(', ')})`);
      } else if (!text) {
        add('cuenta', null, 'No se pudo leer el texto del archivo para buscar la cuenta');
      } else {
        add('cuenta', null, `No encontré ${service.cuenta.trim()} en el archivo`);
      }
    }
  }

  // ── Fecha ────────────────────────────────────────────────────────────
  if (file.cfdi?.fecha) {
    const d = daysBetween(cycle.fechaLimite, file.cfdi.fecha.slice(0, 10));
    if (d < -20 || d > 90) add('fecha', null, `Fecha de la factura ${file.cfdi.fecha.slice(0, 10)}, lejos del vencimiento ${cycle.fechaLimite}`);
  }

  const status = checks.some((c) => c.ok === false) ? 'no_corresponde'
    : checks.some((c) => c.ok === null) || !checks.some((c) => c.ok === true) ? 'revisar' : 'ok';
  // 'info' (ℹ️) no cuenta ni a favor ni en contra.
  return { status, checks, hash };
}

module.exports = { verifyInvoice, sha256, GENERIC_RFC };
