// Calendario de Pagos Recurrentes (2026-11-11, pedido explícito del usuario).
//
// Regla del proceso interno de pagos (Cuentas por Pagar de SelectShop):
// los pagos se programan SIEMPRE en miércoles, y la solicitud tiene que
// estar metida el miércoles de la semana ANTERIOR. Ejemplo del usuario:
// si la fecha límite cae entre el miércoles 18 y el martes 24 de noviembre,
// la solicitud se mete a más tardar el miércoles 11 de noviembre.
//
// Verificado contra el historial real de cuentasporpagar.selectshop.com.mx
// (221 solicitudes, ago–nov 2026): 187/199 fechas de programación caen en
// miércoles y el desfase solicitud→programación es de 7–9 días.
//
// Formalmente: fecha límite D → miércoles en o antes de D (inicio de su
// "semana de pago" miércoles–martes) → menos 7 días = día para meterla.
// "Semana N" = semana ISO de ese día — coincide con las carpetas
// "RECIBOS PAGOS/Semana N" de OneDrive del usuario (Semana 45 = lo que se
// metió el miércoles 4-nov-2026 y se pagó el 11).
//
// Todo trabaja con strings "YYYY-MM-DD" (fechas de calendario, sin hora)
// y aritmética en UTC — así el resultado no depende de la zona horaria del
// proceso (el EC2 corre en UTC). "Hoy" se calcula en hora de México (UTC-6
// fijo, mismo criterio que utils/dateFormat.js).

const FREQUENCIES = {
  mensual: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

function parse(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function fmt(d) { return d.toISOString().slice(0, 10); }
function addDays(s, n) {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}
// 0 = domingo … 3 = miércoles … 6 = sábado
function dow(s) { return parse(s).getUTCDay(); }

function todayMx(now = new Date()) {
  return new Date(now.getTime() - 6 * 3600 * 1000).toISOString().slice(0, 10);
}
function nowMxParts(now = new Date()) {
  const d = new Date(now.getTime() - 6 * 3600 * 1000);
  return { date: d.toISOString().slice(0, 10), dow: d.getUTCDay(), hour: d.getUTCHours() };
}

function wednesdayOnOrBefore(s) {
  return addDays(s, -((dow(s) - 3 + 7) % 7));
}

// Día en que la solicitud tiene que quedar metida en Cuentas por Pagar.
function submitDateFor(dueDate) {
  return addDays(wednesdayOnOrBefore(dueDate), -7);
}

// Miércoles de pago en el que efectivamente se pagaría.
function paymentDateFor(dueDate) {
  return wednesdayOnOrBefore(dueDate);
}

// El "corte" vigente: de lunes a miércoles es el miércoles de esta misma
// semana; de jueves a domingo ya es el miércoles siguiente.
function currentCutoff(today) {
  return addDays(today, (3 - dow(today) + 7) % 7);
}

function isoWeek(s) {
  const d = parse(s);
  const day = (d.getUTCDay() + 6) % 7; // lunes = 0
  d.setUTCDate(d.getUTCDate() - day + 3); // jueves de esa semana
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  jan4.setUTCDate(jan4.getUTCDate() - jan4Day + 3);
  return { week: 1 + Math.round((d - jan4) / (7 * 864e5)), year };
}

function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

// Si el mes no tiene ese día (ej. "30 de cada mes" en febrero), se usa el
// último día del mes.
function dueDateIn(y, m, day) {
  return fmt(new Date(Date.UTC(y, m - 1, Math.min(day, daysInMonth(y, m)))));
}

// Todas las fechas límite de un servicio entre `from` y `to` (inclusive).
// Devuelve [{ periodo: 'YYYY-MM', fechaLimite: 'YYYY-MM-DD' }].
function dueDatesBetween(service, from, to) {
  const step = FREQUENCIES[service.frecuencia] || 1;
  const anchor = step === 1 ? 1 : (service.mesVencimiento || 1);
  const out = [];
  const start = parse(from);
  const end = parse(to);
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth() + 1;
  // Un mes antes del rango por si el día se recorta al fin de mes.
  m -= 1; if (m < 1) { m = 12; y -= 1; }
  while (y < end.getUTCFullYear() || (y === end.getUTCFullYear() && m <= end.getUTCMonth() + 2)) {
    if ((((m - anchor) % step) + step) % step === 0) {
      const due = dueDateIn(y, m, service.diaVencimiento);
      if (due >= from && due <= to) {
        out.push({ periodo: `${y}-${String(m).padStart(2, '0')}`, fechaLimite: due });
      }
    }
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

// Campos derivados de una fecha límite — se guardan en el ciclo para poder
// filtrar/ordenar en Mongo sin recalcular.
function derivedFields(fechaLimite) {
  const fechaMeter = submitDateFor(fechaLimite);
  const { week, year } = isoWeek(fechaMeter);
  return { fechaLimite, fechaMeter, fechaPago: paymentDateFor(fechaLimite), semana: week, anioSemana: year };
}

module.exports = {
  FREQUENCIES,
  addDays, dow, todayMx, nowMxParts,
  wednesdayOnOrBefore, submitDateFor, paymentDateFor, currentCutoff,
  isoWeek, dueDateIn, dueDatesBetween, derivedFields,
};
