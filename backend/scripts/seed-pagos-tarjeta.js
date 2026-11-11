// Alta de los cargos a tarjeta en Pagos Recurrentes (2026-11-11, pedido
// explícito del usuario: Claude Team, Monday.com, Adobe Creative Cloud,
// ChatGPT y SaaS Megaupload — "siempre son variables sus totales... solo
// generan invoice").
//
// Fuente de cada fecha/monto (todo con fecha real de cobro):
//   - Downloads/licencias/Licencias.xlsx, hoja "Detalle gasto" (octubre 2026)
//   - Downloads/Reporte_Gasto_Mensual_Adobe.pdf (corte 14-oct-2026): fechas
//     de renovación de cada plan Adobe por cuenta, incluidas las anuales.
// montoEstimado = último cargo conocido (solo referencia; el real cambia).
//
// Uso:  node scripts/seed-pagos-tarjeta.js            → solo muestra el plan
//       node scripts/seed-pagos-tarjeta.js --apply    → escribe
// Idempotente: no duplica (proveedor + cuenta + motivo).
require('dotenv').config();
const mongoose = require('mongoose');
const PaymentService = require('../src/models/PaymentService');
const { ensureCycles } = require('../src/utils/paymentCycles');

const SSMB = '01. SELECT SHOP MB';
const CICLOS_DESDE = '2026-11-01'; // noviembre en adelante: los cargos del 4 y 8-nov ya salen como "cobrado, falta invoice"

const m = (proveedor, cuenta, motivo, dia, monto, moneda, extra = {}) => ({
  proveedor, cuenta, motivo, diaVencimiento: dia, montoEstimado: monto, moneda,
  frecuencia: 'mensual', compania: SSMB, metodo: 'tarjeta', ...extra,
});
const anual = (mes) => ({ frecuencia: 'anual', mesVencimiento: mes });

const SERVICES = [
  m('Claude Team', 'Plan Team (Premium + Standard)', 'Suscripción mensual', 8, 725, 'USD',
    { tarjeta: 'Amex', emisorFactura: 'Anthropic', notas: 'Cuando se agregan asientos llega un invoice extra de prorrateo: súbelo en el mismo mes.' }),
  m('Monday.com', 'Plan Pro', 'Suscripción mensual', 4, 7350, 'MXN', { emisorFactura: 'monday.com' }),
  m('ChatGPT', 's.estrategiac@selectshop.com.mx', 'ChatGPT Pro', 4, 1972, 'MXN', { tarjeta: 'Amex', emisorFactura: 'OpenAI' }),
  m('ChatGPT', 'copywriter@selectshop.com.mx', 'ChatGPT Plus', 4, 399, 'MXN', { tarjeta: 'Amex', emisorFactura: 'OpenAI' }),
  m('ChatGPT', 'yojanan.averbuy@selectshop.com.mx', 'ChatGPT Plus', 4, 399, 'MXN', { tarjeta: 'Amex', emisorFactura: 'OpenAI' }),
  m('SaaS Megaupload', 'coo.fyv@selectshop.com.mx', 'MEGA Business mensual', 27, 50, 'EUR',
    { emisorFactura: 'MEGA', notas: 'No emite factura: el comprobante es el historial de compras de MEGA.' }),
  // Adobe — una suscripción = un cargo = un invoice
  m('Adobe Creative Cloud', 'coo.diseno@selectshop.com.mx', 'Creative Cloud Pro mensual', 21, 1611.29, 'MXN'),
  m('Adobe Creative Cloud', 'coo.diseno@selectshop.com.mx', '4,000 créditos Firefly', 12, 443.69, 'MXN'),
  m('Adobe Creative Cloud', 'coo.fyv@selectshop.com.mx', 'Creative Cloud Pro anual', 23, 18001.06, 'MXN', anual(11)),
  m('Adobe Creative Cloud', 'coo.fyv@selectshop.com.mx', '7,000 créditos Firefly', 19, 649, 'MXN'),
  m('Adobe Creative Cloud', 'coo.fyv@selectshop.com.mx', 'Adobe Firefly Pro', 12, 443.69, 'MXN'),
  m('Adobe Creative Cloud', 'disenador.3@selectshop.com.mx', 'Creative Cloud Pro anual', 23, 11996.26, 'MXN', anual(5)),
  m('Adobe Creative Cloud', 'disenador.3@selectshop.com.mx', '4,000 créditos Firefly', 12, 443.69, 'MXN'),
  m('Adobe Creative Cloud', 'disenador.3@selectshop.com.mx', '7,000 créditos Firefly', 19, 649, 'MXN'),
  m('Adobe Creative Cloud', 'selectcontent11@gmail.com', 'Creative Cloud Pro anual', 3, 11996.26, 'MXN', anual(12)),
  m('Adobe Creative Cloud', 'selectcontent11@gmail.com', '4,000 créditos Firefly', 12, 443.69, 'MXN'),
  m('Adobe Creative Cloud', 'ss.coo.diseno@gmail.com', 'Creative Cloud Pro anual', 23, 18001.06, 'MXN', anual(9)),
  m('Adobe Creative Cloud', 'ss.coo.diseno@gmail.com', '7,000 créditos Firefly', 26, 649, 'MXN'),
  m('Adobe Creative Cloud', 'ss.coo.fyv@gmail.com', 'Creative Cloud Pro mensual', 25, 1611.29, 'MXN'),
  m('Adobe Creative Cloud', 'ss.coo.fyv@gmail.com', '7,000 créditos Firefly', 19, 649, 'MXN'),
].map((s) => ({ emisorFactura: s.proveedor.split(' ')[0], ...s }));

(async () => {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGO_URI);
  const key = (s) => [s.proveedor, s.cuenta, s.motivo].map((v) => String(v || '').trim().toUpperCase()).join('|');
  const existing = new Set((await PaymentService.find().lean()).map(key));
  const nuevos = SERVICES.filter((s) => !existing.has(key(s)));
  console.log(`${SERVICES.length} cargos a tarjeta · ${SERVICES.length - nuevos.length} ya existen · ${nuevos.length} por crear`);
  for (const s of nuevos) console.log(`  + ${s.proveedor} · ${s.cuenta} · ${s.motivo} · día ${s.diaVencimiento}${s.mesVencimiento ? `/${s.mesVencimiento}` : ''} · ${s.montoEstimado} ${s.moneda}`);
  if (apply && nuevos.length) {
    const docs = await PaymentService.insertMany(nuevos.map((s) => ({
      ...s, ciclosDesde: CICLOS_DESDE, origen: 'Licencias.xlsx / Reporte Adobe (cargo a tarjeta)', createdBy: 'seed-pagos-tarjeta',
    })));
    const n = await ensureCycles({ serviceIds: docs.map((d) => d._id) });
    console.log(`Creados ${docs.length} servicios y ${n} ciclos.`);
  } else if (!apply) {
    console.log('(solo plan — agrega --apply para escribir)');
  }
  await mongoose.disconnect();
})().catch((err) => { console.error(err); process.exit(1); });
