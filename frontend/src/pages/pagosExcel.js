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

export async function readPagosExcel(file) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
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
  if (!rows.length) throw new Error('No encontré las hojas "Mensual" ni "Anual" con datos en ese archivo.');
  return rows;
}
