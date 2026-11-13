// Adjunta los invoices de Adobe descargados (carpeta Downloads/ADOVE, una
// subcarpeta por cuenta) a los cargos a tarjeta de Pagos Recurrentes
// (2026-11-13, pedido explícito del usuario: "adjunta las facturas que ya
// estén... revísalas").
//
// Cada PDF se lee y se valida contra su propio contenido:
//   - número de cliente Adobe → cuenta (cada cuenta tiene un solo número,
//     el mismo en todas sus facturas);
//   - producto → plan (4,000 / 7,000 créditos, Firefly Pro, Creative Cloud Pro);
//   - duración del servicio ≥ 1 año ↔ plan anual (si no cuadra, no se sube);
//   - fecha de la factura → periodo (YYYY-MM) y fecha del cargo.
// Los periodos anteriores a noviembre no tenían ciclo: se crean ya
// 'pagado' (es historial); los que ya existen solo reciben el invoice.
// Mismo número de factura repetido (copias sueltas en la raíz) → una sola.
// Idempotente: si el número de factura ya está adjunto en ese servicio, se salta.
//
// Uso:  node scripts/attach-adobe-invoices.js <carpeta>           → solo plan
//       node scripts/attach-adobe-invoices.js <carpeta> --apply   → escribe
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const PaymentService = require('../src/models/PaymentService');
const PaymentCycle = require('../src/models/PaymentCycle');
const { uploadBuffer } = require('../src/utils/gridfs');
const { derivedFields } = require('../src/utils/paymentSchedule');
const { sha256 } = require('../src/utils/invoiceCheck');

const CLIENTES = {
  1215495182: 'coo.diseno@selectshop.com.mx',
  1217309840: 'coo.fyv@selectshop.com.mx',
  1294303583: 'disenador.3@selectshop.com.mx',
  1307255755: 'selectcontent11@gmail.com',
  1214016357: 'ss.coo.diseno@gmail.com',
  1258208250: 'ss.coo.fyv@gmail.com',
};
const MES = { ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, OCT: 10, NOV: 11, DIC: 12 };
const iso = (d) => { const [dd, mm, yy] = d.split('-'); return `${yy}-${String(MES[mm]).padStart(2, '0')}-${dd}`; };
const num = (s) => { const neg = /^\(.*\)$/.test(s) || s.startsWith('-'); const v = Number(s.replace(/[(),-]/g, '')); return neg ? -v : v; };

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : (/\.pdf$/i.test(e.name) ? [p] : []);
  });
}

async function readInvoice(file) {
  const buffer = fs.readFileSync(file);
  const t = (await pdfParse(buffer)).text.normalize('NFC');
  const g = (re) => (t.match(re) || [])[1];
  const numero = g(/(\d{9,})N.mero de factura/);
  const fecha = g(/(\d\d-[A-Z]{3}-\d{4})Fecha de la factura/);
  const cliente = g(/(\d{8,})Cliente/);
  const dur = t.match(/servicio: (\d\d-[A-Z]{3}-\d{4}) a (\d\d-[A-Z]{3}-\d{4})/);
  // pdf-parse junta las columnas: "30013633Adobe Firefly Pro1EA399.00…"
  const linea = t.match(/\n\d{8}\s*(.+?)\s*\d+\s*EA/);
  const total = g(/TOTAL \(MXN\)\s*(\S+)/);
  return {
    file, buffer, hash: sha256(buffer),
    nota: /Nota de cr.dito/.test(t),
    emisorOk: /Adobe Inc\./.test(t),
    numero, fecha: fecha && iso(fecha), cliente,
    desde: dur && iso(dur[1]), hasta: dur && iso(dur[2]),
    producto: linea && linea[1].replace(/\s+/g, ' ').trim(),
    total: total != null ? num(total) : null,
  };
}

function motivoDe(producto) {
  if (/^4,?000/.test(producto)) return '4,000 créditos Firefly';
  if (/^7,?000/.test(producto)) return '7,000 créditos Firefly';
  if (/Firefly Pro/.test(producto)) return 'Adobe Firefly Pro';
  if (/Creative Cloud Pro/.test(producto)) return 'Creative Cloud Pro';
  return null;
}

(async () => {
  const dir = process.argv[2];
  const apply = process.argv.includes('--apply');
  if (!dir || !fs.existsSync(dir)) throw new Error('Falta la carpeta de facturas');
  await mongoose.connect(process.env.MONGO_URI);

  const services = await PaymentService.find({ proveedor: 'Adobe Creative Cloud', metodo: 'tarjeta' }).lean();
  // Subcarpetas primero, para que la copia suelta de la raíz sea la que se salta.
  const files = walk(dir).sort((a, b) => path.dirname(b).length - path.dirname(a).length || a.localeCompare(b));
  const vistos = new Set();
  const plan = [];
  const saltados = [];
  for (const f of files) {
    const inv = await readInvoice(f);
    const rel = path.relative(dir, f);
    const skip = (why) => saltados.push(`${rel}: ${why}`);
    if (!inv.numero || !inv.fecha || !inv.cliente) { skip('no se pudo leer número/fecha/cliente'); continue; }
    if (vistos.has(inv.numero)) { skip(`copia de la factura ${inv.numero} (ya va desde otra carpeta)`); continue; }
    vistos.add(inv.numero);
    if (!inv.emisorOk) { skip('no es de Adobe Inc.'); continue; }
    const cuenta = CLIENTES[inv.cliente];
    if (!cuenta) { skip(`cliente Adobe ${inv.cliente} no reconocido`); continue; }
    const motivo = motivoDe(inv.producto || '');
    if (!motivo) { skip(`producto "${inv.producto}" no reconocido`); continue; }
    const anualFactura = inv.desde && inv.hasta && (new Date(inv.hasta) - new Date(inv.desde)) / 864e5 > 300;
    const svc = services.find((s) => s.cuenta === cuenta && s.motivo.startsWith(motivo));
    if (!svc) { skip(`no hay pago "${motivo}" de ${cuenta}`); continue; }
    if (inv.desde && anualFactura !== (svc.frecuencia === 'anual')) {
      skip(`la factura es ${anualFactura ? 'anual' : 'mensual'} y el pago "${svc.motivo}" es ${svc.frecuencia} (plan anterior)`);
      continue;
    }
    plan.push({ ...inv, rel, svc, periodo: inv.fecha.slice(0, 7) });
  }

  // Ya adjuntos (por número de factura o por archivo idéntico)
  const ya = await PaymentCycle.find({ service: { $in: services.map((s) => s._id) } }).lean();
  const adjNum = new Set(ya.flatMap((c) => c.facturas.map((x) => `${c.service}|${x.cfdi?.folio || ''}`)));
  const adjHash = new Set(ya.flatMap((c) => c.facturas.map((x) => x.hash)));
  const nuevos = plan.filter((p) => !adjNum.has(`${p.svc._id}|${p.numero}`) && !adjHash.has(p.hash));

  const porCiclo = new Map();
  for (const p of nuevos) {
    const k = `${p.svc._id}|${p.periodo}`;
    if (!porCiclo.has(k)) porCiclo.set(k, []);
    porCiclo.get(k).push(p);
  }
  console.log(`${files.length} PDFs · ${plan.length} válidos · ${plan.length - nuevos.length} ya adjuntos · ${nuevos.length} por adjuntar en ${porCiclo.size} pagos`);
  for (const items of porCiclo.values()) {
    const p0 = items[0];
    const existe = ya.find((c) => String(c.service) === String(p0.svc._id) && c.periodo === p0.periodo);
    const fechaCargo = items.find((i) => !i.nota)?.fecha || p0.fecha;
    console.log(`  ${existe ? '·' : '+'} ${p0.svc.cuenta} · ${p0.svc.motivo} · ${p0.periodo} (${fechaCargo})${existe ? ` [ciclo existente, ${existe.estado}]` : ' [ciclo nuevo, pagado]'} ← ${items.map((i) => `${i.numero}${i.nota ? ' nota de crédito' : ''} ${i.total}`).join(' + ')}`);
  }
  if (saltados.length) { console.log(`\nNo se suben (${saltados.length}):`); saltados.forEach((s) => console.log(`  - ${s}`)); }

  if (apply) {
    let ciclos = 0; let archivos = 0;
    for (const items of porCiclo.values()) {
      const { svc, periodo } = items[0];
      const fechaCargo = items.find((i) => !i.nota)?.fecha || items[0].fecha;
      let cycle = await PaymentCycle.findOne({ service: svc._id, periodo });
      if (!cycle) {
        cycle = new PaymentCycle({ service: svc._id, periodo, ...derivedFields(fechaCargo, 'tarjeta'), estado: 'pagado', notas: 'Historial: invoice de Adobe adjuntado por script.' });
        ciclos += 1;
      }
      for (const i of items) {
        const filename = `${i.fecha}_${svc.motivo.replace(/[^\wÀ-ÿ,.]+/g, '_')}_${i.numero}${i.nota ? '_nota-credito' : ''}.pdf`;
        const fileId = await uploadBuffer(i.buffer, filename, 'application/pdf', 'paymentInvoices');
        cycle.facturas.push({
          fileId, filename, contentType: 'application/pdf', kind: 'pdf', size: i.buffer.length,
          uploadedBy: 'attach-adobe-invoices', hash: i.hash,
          verificacion: {
            status: 'ok',
            checks: [
              { key: 'proveedor', ok: true, msg: 'Emisor Adobe Inc.' },
              { key: 'cuenta', ok: true, msg: `Cliente Adobe ${i.cliente} = ${svc.cuenta} (mismo número en todas sus facturas)` },
              { key: 'fecha', ok: true, msg: `Factura del ${i.fecha}${i.desde ? `, servicio ${i.desde} a ${i.hasta}` : ''}` },
            ],
          },
          cfdi: { folio: i.numero, fecha: i.fecha, total: i.total, moneda: 'MXN', tipo: i.nota ? 'E' : 'I', emisorNombre: 'Adobe Inc.' },
        });
        archivos += 1;
      }
      if (cycle.estado === 'pendiente') cycle.estado = 'pagado';
      const montos = cycle.facturas.filter((x) => typeof x.cfdi?.total === 'number').map((x) => x.cfdi.total);
      if (montos.length && (cycle.montoReal == null || cycle.montoRealAuto)) {
        cycle.montoReal = Math.round(montos.reduce((a, b) => a + b, 0) * 100) / 100;
        cycle.montoRealAuto = false; // fijo: el recálculo automático solo entiende XML
      }
      cycle.updatedByName = 'attach-adobe-invoices';
      await cycle.save();
    }
    console.log(`\nListo: ${archivos} invoices adjuntos, ${ciclos} pagos de historial creados.`);
  } else {
    console.log('\n(solo plan — agrega --apply para escribir)');
  }
  await mongoose.disconnect();
})().catch((err) => { console.error(err); process.exit(1); });
