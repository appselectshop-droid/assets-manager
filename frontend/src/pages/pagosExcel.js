import * as XLSX from 'xlsx';

// Lectura del Excel del usuario (PagosIT_2_corregido_recibos_pagos_v2.xlsx)
// para la importación inicial del catálogo de Pagos Recurrentes. Solo se
// leen las hojas "Mensual" y "Anual" (las "_antes", "Abril", "ENLACES" son
// copias/vistas viejas de lo mismo). Columnas por posición — el encabezado
// tiene dos "comentarios" y una columna sin nombre:
//   0 PROVEEDOR · 1 CENTRO DE COSTO · 2 Cuenta · 3 MOTIVO · 4 MONTO
//   5 COMPAÑÍA · 6 SUCURSAL · 7 (siempre "GASTO") · 8 DIRECCIÓN
//   9 vencimiento ("02 de cada mes", "03 de marzo (anual)") · 10 notas
const SHEETS = ['Mensual', 'Anual'];
const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const str = (v) => (v === null || v === undefined ? '' : String(v).trim());

function parseMonto(v) {
  if (typeof v === 'number') return v;
  const s = str(v).replace(/\$/g, '').replace(/\s/g, '');
  if (!s || !/\d/.test(s)) return null;
  // "236,00" (coma decimal) vs "1,234.50" (coma de miles)
  const normalized = /,\d{1,2}$/.test(s) && !s.includes('.') ? s.replace(',', '.') : s.replace(/,/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function parseVencimiento(text) {
  const t = str(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const day = Number((t.match(/^(\d{1,2})/) || [])[1]);
  if (!day || day > 31) return { error: `No entiendo el vencimiento "${str(text)}"` };
  if (/de\s+ca\w*\s+mes/.test(t)) return { frecuencia: 'mensual', diaVencimiento: day };
  const mes = Object.entries(MESES).find(([name]) => new RegExp(`de\\s+${name}\\b`).test(t));
  if (mes) return { frecuencia: 'anual', diaVencimiento: day, mesVencimiento: mes[1] };
  if (/cada\s+a/.test(t)) return { frecuencia: 'anual', diaVencimiento: day, error: `Falta el mes en "${str(text)}"` };
  return { error: `No entiendo el vencimiento "${str(text)}"` };
}

// ── Plantilla para dar de alta pagos nuevos (2026-11-11) ─────────────────
// Pedido explícito del usuario: "que me dé el layout que llenaré al subir un
// nuevo proveedor a importarlos". Hoja "Pagos" con una columna por campo
// (se lee por NOMBRE de encabezado, no por posición — aguanta columnas
// movidas), más "Instrucciones" y "Catálogos" con los valores que ya
// existen en el catálogo, para escribirlos igual.
const TEMPLATE_SHEET = 'Pagos';
const TEMPLATE_COLUMNS = [
  { key: 'proveedor',      header: 'PROVEEDOR *',                  width: 34, help: 'Razón social o nombre del proveedor, como aparece en Cuentas por Pagar. Ej. TOTAL PLAY TELECOMUNICACIONES' },
  { key: 'cuenta',         header: 'CUENTA / TELÉFONO / CONTRATO', width: 30, help: 'El número que identifica el servicio: "TEL 5556871130", "CUENTA 0200704359", "CONTRATO 5778", o el dominio. Es lo que se busca dentro de la factura para verificarla: mientras más exacto, mejor.' },
  { key: 'motivo',         header: 'MOTIVO DE PAGO',               width: 24, help: 'Igual que en Cuentas por Pagar: INTERNET, TELEFONO LOCAL, RENTA DE IMPRESORAS, LICENCIAS PARA SOFTWARE…' },
  { key: 'centroCostos',   header: 'CENTRO DE COSTOS',             width: 26, help: 'Igual que en Cuentas por Pagar.' },
  { key: 'compania',       header: 'COMPAÑÍA *',                   width: 30, help: 'Empresa que paga. Usa un valor de la hoja Catálogos.' },
  { key: 'sucursal',       header: 'SUCURSAL',                     width: 22, help: 'Usa un valor de la hoja Catálogos.' },
  { key: 'direccion',      header: 'DIRECCIÓN',                    width: 18, help: 'Dirección o área: FINANZAS, LOGISTICA, SISTEMAS…' },
  { key: 'montoEstimado',  header: 'MONTO ESTIMADO',               width: 15, help: 'Número, sin signo de pesos. Ej. 1650.00' },
  { key: 'moneda',         header: 'MONEDA',                       width: 9,  help: 'MXN (si lo dejas vacío), USD o EUR.' },
  { key: 'frecuencia',     header: 'FRECUENCIA *',                 width: 13, help: 'Mensual, Bimestral, Trimestral, Semestral o Anual.' },
  { key: 'diaVencimiento', header: 'DÍA DE VENCIMIENTO *',         width: 12, help: 'Día del mes de la fecha límite de pago (1 a 31). Si el mes no tiene ese día, se usa el último.' },
  { key: 'mesVencimiento', header: 'MES DE VENCIMIENTO',           width: 14, help: 'Obligatorio si NO es mensual: el mes en que vence (enero…diciembre o 1…12). Ej. anualidad que vence el 3 de marzo: día 3, mes marzo.' },
  { key: 'notas',          header: 'NOTAS',                        width: 40, help: 'Libre. Si escribes "cancelado", entra inactivo.' },
];
const FREQ_LABELS = { mensual: 'Mensual', bimestral: 'Bimestral', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual' };
const MESES_ORDEN = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const headerKey = (h) => str(h).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();

export function buildPagosTemplate(services = []) {
  const uniq = (k) => [...new Set(services.map((s) => str(s[k])).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const wb = XLSX.utils.book_new();

  const pagos = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS.map((c) => c.header)]);
  pagos['!cols'] = TEMPLATE_COLUMNS.map((c) => ({ wch: c.width }));
  pagos['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(TEMPLATE_COLUMNS.length - 1)}1` };
  XLSX.utils.book_append_sheet(wb, pagos, TEMPLATE_SHEET);

  const instr = [
    ['PLANTILLA DE PAGOS RECURRENTES — Assets Manager'],
    [''],
    ['1. Llena un renglón por cada pago recurrente en la hoja "Pagos" (una línea de teléfono, una cuenta de internet, un contrato, un dominio…).'],
    ['2. Las columnas con * son obligatorias. No cambies los encabezados.'],
    ['3. Para COMPAÑÍA y SUCURSAL usa los valores de la hoja "Catálogos" (cópialos tal cual).'],
    ['4. En Pagos → Catálogo → "Importar Excel", sube este archivo. Verás una vista previa antes de guardar; lo que ya exista no se duplica.'],
    ['5. Los recordatorios empiezan con lo que vence a partir del próximo corte.'],
    [''],
    ['COLUMNA', 'QUÉ LLEVA'],
    ...TEMPLATE_COLUMNS.map((c) => [c.header, c.help]),
    [''],
    ['EJEMPLOS (solo de referencia, no los copies a la hoja Pagos)'],
    TEMPLATE_COLUMNS.map((c) => c.header),
    ['OPEN PAY', 'MODULO API TIMBRADO NOMINA', 'CUOTAS Y SUSCRIPCIONES', 'NOMINA', 'COMERCIALIZADORA ONLINE NH', 'POLANCO PISO 13', 'JURIDICO RH', 1650, 'MXN', 'Anual', 5, 'noviembre', 'Vigencia 12 meses'],
    ['CELCOM H', 'MANTENIMIENTO INFRAESTRUCTURA', 'MANTENIMIENTO DE INFRAESTRUCTURA', 'ADMINISTRACION', '01. SELECT SHOP MB', 'POLANCO PISO 13', 'SISTEMAS', 1798, 'MXN', 'Mensual', 10, '', ''],
  ];
  const wsI = XLSX.utils.aoa_to_sheet(instr);
  wsI['!cols'] = [{ wch: 34 }, { wch: 110 }, ...TEMPLATE_COLUMNS.slice(2).map((c) => ({ wch: c.width }))];
  XLSX.utils.book_append_sheet(wb, wsI, 'Instrucciones');

  const lists = [uniq('compania'), uniq('sucursal'), uniq('centroCostos'), uniq('motivo'), uniq('direccion'), Object.values(FREQ_LABELS), ['MXN', 'USD', 'EUR'], MESES_ORDEN];
  const heads = ['COMPAÑÍA', 'SUCURSAL', 'CENTRO DE COSTOS', 'MOTIVO DE PAGO', 'DIRECCIÓN', 'FRECUENCIA', 'MONEDA', 'MES'];
  const max = Math.max(...lists.map((l) => l.length));
  const wsC = XLSX.utils.aoa_to_sheet([heads, ...Array.from({ length: max }, (_, i) => lists.map((l) => l[i] ?? ''))]);
  wsC['!cols'] = heads.map(() => ({ wch: 32 }));
  XLSX.utils.book_append_sheet(wb, wsC, 'Catálogos');

  XLSX.writeFile(wb, 'Plantilla_Pagos_Recurrentes.xlsx');
}

function readTemplate(ws) {
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  const header = (aoa[0] || []).map(headerKey);
  const idx = {};
  for (const c of TEMPLATE_COLUMNS) idx[c.key] = header.indexOf(headerKey(c.header));
  if (idx.proveedor < 0) throw new Error('La hoja "Pagos" no tiene la columna PROVEEDOR — descarga la plantilla otra vez.');
  const get = (r, k) => (idx[k] >= 0 ? r[idx[k]] : null);
  const rows = [];
  aoa.slice(1).forEach((r, i) => {
    const proveedor = str(get(r, 'proveedor'));
    if (!proveedor) return;
    const errors = [];
    const freqText = headerKey(get(r, 'frecuencia')).toLowerCase();
    const frecuencia = freqText ? Object.keys(FREQ_LABELS).find((k) => k === freqText) : 'mensual';
    if (!frecuencia) errors.push(`Frecuencia "${str(get(r, 'frecuencia'))}" no válida`);
    const dia = Number(get(r, 'diaVencimiento'));
    if (!(dia >= 1 && dia <= 31)) errors.push('Falta el día de vencimiento (1 a 31)');
    const mesRaw = headerKey(get(r, 'mesVencimiento')).toLowerCase().replace('setiembre', 'septiembre');
    let mes = Number(mesRaw) || (MESES_ORDEN.indexOf(mesRaw) + 1) || null;
    if (frecuencia && frecuencia !== 'mensual' && !(mes >= 1 && mes <= 12)) errors.push('Falta el mes de vencimiento (no es mensual)');
    if (frecuencia === 'mensual') mes = null;
    if (!str(get(r, 'compania'))) errors.push('Falta la compañía');
    const moneda = str(get(r, 'moneda')).toUpperCase() || 'MXN';
    if (!['MXN', 'USD', 'EUR'].includes(moneda)) errors.push(`Moneda "${moneda}" no válida`);
    const notas = str(get(r, 'notas'));
    rows.push({
      proveedor,
      cuenta: str(get(r, 'cuenta')),
      motivo: str(get(r, 'motivo')),
      centroCostos: str(get(r, 'centroCostos')),
      compania: str(get(r, 'compania')),
      sucursal: str(get(r, 'sucursal')),
      direccion: str(get(r, 'direccion')),
      montoEstimado: parseMonto(get(r, 'montoEstimado')),
      moneda,
      frecuencia: frecuencia || 'mensual',
      diaVencimiento: dia || null,
      mesVencimiento: mes,
      notas,
      activo: !/cancelad/i.test(notas),
      origen: `Plantilla fila ${i + 2}`,
      _error: errors.join(' · '),
    });
  });
  if (!rows.length) throw new Error('La hoja "Pagos" de la plantilla está vacía.');
  return rows;
}

export async function readPagosExcel(file) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  if (wb.Sheets[TEMPLATE_SHEET]) return readTemplate(wb.Sheets[TEMPLATE_SHEET]);
  return readLegacy(wb);
}

function readLegacy(wb) {
  const rows = [];
  for (const name of SHEETS) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
    aoa.slice(1).forEach((r, i) => {
      const proveedor = str(r[0]);
      if (!proveedor) return;
      const venc = parseVencimiento(r[9]);
      const notas = str(r[10]);
      const direccion = str(r[8]) || (str(r[7]).toUpperCase() !== 'GASTO' ? str(r[7]) : '');
      rows.push({
        proveedor,
        centroCostos: str(r[1]),
        cuenta: str(r[2]),
        motivo: str(r[3]),
        montoEstimado: parseMonto(r[4]),
        moneda: 'MXN',
        compania: str(r[5]),
        sucursal: str(r[6]),
        direccion,
        frecuencia: venc.frecuencia || (name === 'Anual' ? 'anual' : 'mensual'),
        diaVencimiento: venc.diaVencimiento || null,
        mesVencimiento: venc.mesVencimiento || null,
        notas: [str(r[9]), notas].filter(Boolean).join(' · '),
        activo: !/cancelad/i.test(notas),
        origen: `Excel: ${name} fila ${i + 2}`,
        _error: venc.error || '',
      });
    });
  }
  if (!rows.length) throw new Error('No encontré la hoja "Pagos" de la plantilla ni las hojas "Mensual"/"Anual" con datos en ese archivo.');
  return rows;
}
