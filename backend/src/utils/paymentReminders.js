// Recordatorio por correo de Pagos Recurrentes (2026-11-11, pedido
// explícito del usuario: "que me recuerde desde el lunes por correo").
//
// Lunes, martes y miércoles a partir de las 8:00 (hora de México) manda UN
// correo por día a cada usuario con `canManagePayments`, con lo que hay que
// meter a Cuentas por Pagar en el corte de ese miércoles + lo atrasado. Si
// no hay nada pendiente, no manda nada. Deja de insistir solo: en cuanto un
// pago se marca "Metido en CxP" ya no aparece.
//
// Este proyecto no tenía ningún cron (ver comentario en CalendarActivity.js)
// — es un chequeo en el mismo proceso del backend, cada 10 minutos. Solo hay
// UNA instancia de backend (docker-compose en el EC2), y aun así el índice
// único de PaymentReminderLog.fecha garantiza un solo envío por día.
//
// Apagado por default: solo corre si PAYMENT_REMINDERS_ENABLED=true (así el
// Docker local de pruebas no manda correos reales por accidente).
const User = require('../models/User');
const PaymentReminderLog = require('../models/PaymentReminderLog');
const { buildSummary } = require('./paymentCycles');
const { nowMxParts } = require('./paymentSchedule');
const { notifyEmail } = require('./graphMail');

const BRAND = '#E8431A';
const FONT = 'Arial, Helvetica, sans-serif';
const SEND_DAYS = [1, 2, 3]; // lunes, martes, miércoles
const SEND_HOUR = Number(process.env.PAYMENT_REMINDERS_HOUR || 8);
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fechaCorta(s) {
  const [y, m, d] = s.split('-').map(Number);
  const dia = DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dia} ${d} ${MESES[m - 1]}`;
}
function money(n, moneda) {
  if (n === null || n === undefined) return '—';
  return `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda || 'MXN'}`;
}

function table(rows, accent) {
  const th = (t) => `<td style="padding:6px 8px; font-family:${FONT}; font-size:11px; text-transform:uppercase; color:#888; border-bottom:2px solid ${accent};">${t}</td>`;
  const td = (t, extra = '') => `<td style="padding:7px 8px; font-family:${FONT}; font-size:13px; color:#222; border-bottom:1px solid #eee; ${extra}">${t}</td>`;
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>${th('Proveedor')}${th('Cuenta')}${th('Compañía')}${th('Vence')}${th('Monto est.')}${th('Estado')}</tr>
      ${rows.map((c) => `<tr>
        ${td(`<strong>${esc(c.service.proveedor)}</strong>`)}
        ${td(esc(c.service.cuenta))}
        ${td(esc(c.service.compania))}
        ${td(esc(fechaCorta(c.fechaLimite)), 'white-space:nowrap;')}
        ${td(esc(money(c.service.montoEstimado, c.service.moneda)), 'white-space:nowrap;')}
        ${td(c.estado === 'factura_recibida' ? '<span style="color:#16a34a;">Factura recibida</span>' : '<span style="color:#d97706;">Falta factura</span>')}
      </tr>`).join('')}
    </table>`;
}

function buildReminderEmail(summary) {
  const link = `${(process.env.FRONTEND_URL || '').replace(/\/$/, '')}/pagos`;
  const total = summary.estaSemana.length + summary.atrasados.length;
  const subject = summary.atrasados.length
    ? `Pagos: ${summary.estaSemana.length} por meter el ${fechaCorta(summary.corte)} + ${summary.atrasados.length} atrasado(s) — Semana ${summary.semana}`
    : `Pagos: ${summary.estaSemana.length} por meter el ${fechaCorta(summary.corte)} — Semana ${summary.semana}`;

  const html = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5; padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="680" cellpadding="0" cellspacing="0" style="background:#fff; border-radius:8px;">
        <tr><td style="background:#1a1a1a; padding:18px 24px; font-family:${FONT}; color:#fff; font-size:16px; font-weight:bold;">
          <span style="color:${BRAND};">●</span> Recordatorio de pagos — Semana ${summary.semana}
        </td></tr>
        <tr><td style="padding:22px 24px; font-family:${FONT}; font-size:14px; color:#333;">
          <p style="margin:0 0 6px;">Tienes <strong>${total}</strong> solicitud(es) por meter en Cuentas por Pagar.</p>
          <p style="margin:0 0 18px; color:#666;">Corte: <strong>${esc(fechaCorta(summary.corte))}</strong> · se pagan el ${esc(fechaCorta(summary.fechaPagoCorte))} · carpeta <strong>Semana ${summary.semana}</strong></p>
          ${summary.atrasados.length ? `
            <div style="font-family:${FONT}; font-size:13px; font-weight:bold; color:#dc2626; margin:0 0 6px;">Atrasados (ya pasó su corte)</div>
            ${table(summary.atrasados, '#dc2626')}
            <div style="height:18px;"></div>` : ''}
          ${summary.estaSemana.length ? `
            <div style="font-family:${FONT}; font-size:13px; font-weight:bold; color:${BRAND}; margin:0 0 6px;">Meter el ${esc(fechaCorta(summary.corte))}</div>
            ${table(summary.estaSemana, BRAND)}` : ''}
          <p style="margin:22px 0 0;"><a href="${esc(link)}" style="background:${BRAND}; color:#fff; text-decoration:none; padding:10px 18px; border-radius:6px; font-family:${FONT}; font-size:13px; font-weight:bold;">Abrir Pagos Recurrentes</a></p>
          <p style="margin:18px 0 0; font-size:12px; color:#999;">Marca cada pago como "Metido en CxP" en el módulo y deja de aparecer aquí. Este correo llega lunes, martes y miércoles mientras haya pendientes.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>`;
  return { subject, html, total };
}

async function recipients() {
  const users = await User.find({ canManagePayments: true }).select('email').lean();
  return users.map((u) => u.email).filter(Boolean);
}

async function checkAndSend(now = new Date()) {
  const { date, dow, hour } = nowMxParts(now);
  if (!SEND_DAYS.includes(dow) || hour < SEND_HOUR) return;
  if (await PaymentReminderLog.exists({ fecha: date })) return;

  const summary = await buildSummary();
  const email = buildReminderEmail(summary);
  // Sin pendientes o sin destinatarios no se registra nada: el chequeo se
  // repite cada 10 min y, si más tarde ese día aparece algo (ej. se da de
  // alta un pago que vence pronto), el correo sale entonces.
  if (email.total === 0) return;
  const to = await recipients();
  if (!to.length) return;

  // Se registra ANTES de mandar: si dos chequeos coinciden, el segundo
  // choca con el índice único y no manda nada.
  try {
    await PaymentReminderLog.create({ fecha: date, corte: summary.corte, pendientes: email.total, destinatarios: to, enviado: true });
  } catch (err) {
    if (err.code === 11000) return;
    throw err;
  }
  await notifyEmail({ to, subject: email.subject, html: email.html });
  console.log(`Recordatorio de pagos enviado a ${to.join(', ')} (${email.total} pendientes)`);
}

function startPaymentReminderScheduler() {
  if (process.env.PAYMENT_REMINDERS_ENABLED !== 'true') {
    console.log('Recordatorios de pagos: desactivados (PAYMENT_REMINDERS_ENABLED != true)');
    return;
  }
  const run = () => checkAndSend().catch((err) => console.error('Recordatorio de pagos falló:', err.message));
  setTimeout(run, 30 * 1000);
  setInterval(run, 10 * 60 * 1000);
  console.log(`Recordatorios de pagos: activos (lun–mié desde las ${SEND_HOUR}:00 hora de México)`);
}

module.exports = { startPaymentReminderScheduler, buildReminderEmail, checkAndSend, recipients };
