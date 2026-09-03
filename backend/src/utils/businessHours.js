// Cálculo de tiempos SLA respetando el horario laboral de Sistemas —
// BUG-10 de la matriz de pruebas de Felipe (2026-08-20), implementado
// 2026-09-01 tras confirmar las reglas reales con el usuario (no eran las
// del caso de prueba de Felipe, que solo era ilustrativo): horario
// 8:00–19:00, lunes a viernes (sábado/domingo no cuentan), sin excluir
// días festivos por ahora, y aplica por igual a `responseDueAt`,
// `resolutionDueAt` y `providerSlaDueAt` — no solo a un tipo de ticket.
//
// Mismo truco de zona horaria ya usado en calendarActivities.js (BUG-01/02
// de la misma matriz): México es UTC-6 fijo, sin horario de verano desde
// 2022 — se resta/suma 6h para trabajar con los métodos UTC de `Date`
// (getUTCHours, getUTCDay, etc.) como si fueran hora de México, sin
// depender del huso horario del proceso que corre esto (el EC2 corre en
// UTC).
const MX_OFFSET_MS = 6 * 60 * 60 * 1000;
const WORK_START_MIN = 8 * 60;   // 8:00
const WORK_END_MIN = 19 * 60;    // 19:00 (11 horas hábiles por día)

function toMxShifted(date) {
  return new Date(date.getTime() - MX_OFFSET_MS);
}

function fromMxShifted(shifted) {
  return new Date(shifted.getTime() + MX_OFFSET_MS);
}

// getUTCDay() sobre la representación "shifted" da el día de la semana
// real en México (0=domingo..6=sábado), sin que importe el huso del
// proceso — es la misma razón por la que se usan getUTC*/setUTC* en todo
// este archivo, nunca los métodos locales.
function isBusinessDay(shifted) {
  const day = shifted.getUTCDay();
  return day >= 1 && day <= 5;
}

function atMinuteOfDay(shifted, minuteOfDay) {
  const d = new Date(shifted);
  d.setUTCHours(Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0);
  return d;
}

function nextDayAt(shifted, minuteOfDay) {
  const d = new Date(shifted);
  d.setUTCDate(d.getUTCDate() + 1);
  return atMinuteOfDay(d, minuteOfDay);
}

// Si `shifted` cae fuera de horario laboral (fin de semana, antes de las
// 8:00, o a partir de las 19:00), lo adelanta al siguiente inicio de
// jornada hábil. Si ya está dentro de horario laboral, lo deja igual — el
// reloj del SLA sigue arrancando desde `createdAt` tal cual, como ya
// estaba documentado antes de este fix, solo que ahora "arrancar" respeta
// la jornada.
function snapToBusinessStart(shifted) {
  let d = new Date(shifted);
  while (!isBusinessDay(d)) d = nextDayAt(d, WORK_START_MIN);
  const minuteOfDay = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (minuteOfDay < WORK_START_MIN) return atMinuteOfDay(d, WORK_START_MIN);
  if (minuteOfDay >= WORK_END_MIN) return nextBusinessDayStart(d);
  return d;
}

function nextBusinessDayStart(shifted) {
  let d = nextDayAt(shifted, WORK_START_MIN);
  while (!isBusinessDay(d)) d = nextDayAt(d, WORK_START_MIN);
  return d;
}

// Suma `minutes` de tiempo HÁBIL (horario laboral MX) a partir de
// `startDate` (instante real, UTC) — pausa/difiere el conteo fuera de
// jornada y traslada el remanente al siguiente día hábil, como pide el
// caso de prueba de Felipe. Regresa un instante real (UTC).
function addBusinessMinutes(startDate, minutes) {
  let cursor = snapToBusinessStart(toMxShifted(startDate));
  let remaining = minutes;
  while (remaining > 0) {
    const minuteOfDay = cursor.getUTCHours() * 60 + cursor.getUTCMinutes();
    const minutesLeftToday = WORK_END_MIN - minuteOfDay;
    if (remaining <= minutesLeftToday) {
      cursor = new Date(cursor.getTime() + remaining * 60000);
      remaining = 0;
    } else {
      remaining -= minutesLeftToday;
      cursor = nextBusinessDayStart(cursor);
    }
  }
  return fromMxShifted(cursor);
}

module.exports = { addBusinessMinutes };
