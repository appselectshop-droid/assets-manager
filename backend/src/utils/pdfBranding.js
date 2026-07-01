const path = require('path');

// ── EMPRESA CONFIG ──────────────────────────────────────────────────────────
// color: brand accent extracted from each company logo
// logo:  filename in backend/src/assets/logos/ (named by company)
// Keys cover both short DB values and full legal names (including known DB typos)
const EMPRESA_CONFIG = {
  // SELECT SHOP MB
  'SELECT SHOP MB':                             { color: '#E8431A', logo: 'SELECT SHOP MB.png' },
  'SELEC SHOP MB':                              { color: '#E8431A', logo: 'SELECT SHOP MB.png' },
  'SELECT SHOP MB, S.A DE C.V.':               { color: '#E8431A', logo: 'SELECT SHOP MB.png' },
  // ALEGARAT
  'ALEGARAT':                                   { color: '#7A7A7A', logo: 'ALEGARAT.png' },
  'ALEAGARAT':                                  { color: '#7A7A7A', logo: 'ALEGARAT.png' },
  'ALEGARAT, S.A DE C.V.':                      { color: '#7A7A7A', logo: 'ALEGARAT.png' },
  // BLOOM & BLUSH
  'BLOOM AND BLUSH':                            { color: '#7B6BAE', logo: 'BLOOM & BLUSH.png' },
  'BLOOM & BLUSH':                              { color: '#7B6BAE', logo: 'BLOOM & BLUSH.png' },
  'BLOOM & BLUSH, S.A DE C.V.':                { color: '#7B6BAE', logo: 'BLOOM & BLUSH.png' },
  // COMERCIALIZADORA DE MARCAS JSB
  'COMERCIALIZADORA DE MARCAS JSB':             { color: '#1E3A5F', logo: 'COMERCIALIZADORA DE MARCAS JSB.png' },
  'COMERCIALIZADORA DE MARCAS JSB, S.A DE C.V.': { color: '#1E3A5F', logo: 'COMERCIALIZADORA DE MARCAS JSB.png' },
  // BH BE HEALTHY
  'BH BE HEALTHY COMERCIALIZADORA':             { color: '#00AADE', logo: 'BH BE HEALTHY.png' },
  'BH. BE HEALTHY COMERCIALIZADORA':            { color: '#00AADE', logo: 'BH BE HEALTHY.png' },
  'BH BE HEALTHY COMERCIALIZADORA, S.A DE C.V.': { color: '#00AADE', logo: 'BH BE HEALTHY.png' },
  // BH SOLAR
  'BH SOLAR':                                   { color: '#2B7878', logo: 'BH SOLAR.png' },
  'BH SOLAR, S.A DE C.V.':                      { color: '#2B7878', logo: 'BH SOLAR.png' },
  // ENFERMERAS UNIDAS PLUS
  'ENFERMERAS UNIDAS PLUS':                     { color: '#1E3A8A', logo: 'ENFERMERAS UNIDAS PLUS.png' },
  'EFERMERAS UNIDAS PLUS':                      { color: '#1E3A8A', logo: 'ENFERMERAS UNIDAS PLUS.png' },
  'ENFERMERAS UNIDAS PLUS, S.A DE C.V.':        { color: '#1E3A8A', logo: 'ENFERMERAS UNIDAS PLUS.png' },
  // COMERCIALIZADORA ON LINE NH
  'COMERCIALIZADORA ONLINE NH':                 { color: '#D63050', logo: 'COMERCIALIZADORA ONLINE NH.png' },
  'COMERCIALIZADORA ON LINE NH':                { color: '#D63050', logo: 'COMERCIALIZADORA ONLINE NH.png' },
  'COMERCIALIZADORA ON LINE NH, S.A DE C.V.':   { color: '#D63050', logo: 'COMERCIALIZADORA ONLINE NH.png' },
  // DONKERTECH
  'DONKERTECH':                                 { color: '#3A5282', logo: 'DONKERTECH.png' },
  'DONKERTECH, S.A DE C.V.':                    { color: '#3A5282', logo: 'DONKERTECH.png' },
  // ZONA ZELU
  'ZONA ZELU':                                  { color: '#0066CC', logo: 'ZONA ZELU.png' },
  'ZONA ZELU, S.A. DE C.V.':                    { color: '#0066CC', logo: 'ZONA ZELU.png' },
  // GOLDEN YEARS MANAGEMENT
  'GOLDEN YEARS MANAGEMENT':                    { color: '#B08A30', logo: 'GOLDEN.png' },
  'GOLDEN YEARS MANAGEMENT, S.A DE C.V.':       { color: '#B08A30', logo: 'GOLDEN.png' },
};

const DEFAULT_CONFIG = { color: '#E8431A', logo: 'SELECT SHOP MB.png' };
const LOGOS_DIR = path.join(__dirname, '../assets/logos');

function getEmpresaConfig(businessName) {
  if (!businessName) return DEFAULT_CONFIG;
  const upper = businessName.toUpperCase().trim();
  const key = Object.keys(EMPRESA_CONFIG).find((k) => k.toUpperCase() === upper);
  return key ? EMPRESA_CONFIG[key] : DEFAULT_CONFIG;
}

// ── LAYOUT CONSTANTS ────────────────────────────────────────────────────────
const MARGIN = 36;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const CW = PAGE_W - MARGIN * 2;
const DARK = '#111111';
const GRAY = '#555555';
const GRAY_LT = '#999999';
const BORDER = '#e0e0e0';
const BG_STRIPE = '#fafafa';

// ── PDF HELPERS ─────────────────────────────────────────────────────────────
function guard(doc, y, need) {
  if (y + (need || 60) > PAGE_H - MARGIN) { doc.addPage(); return MARGIN; }
  return y;
}

function hline(doc, y, color, w) {
  doc.save().strokeColor(color || BORDER).lineWidth(w || 0.5)
     .moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).stroke().restore();
}

function sectionBand(doc, y, label, accent) {
  y = guard(doc, y, 30);
  const bg = blendWithWhite(accent, 0.1);
  doc.save().rect(MARGIN, y, CW, 16).fill(bg).restore();
  doc.fillColor(accent).font('Helvetica-Bold').fontSize(7.5)
     .text(label, MARGIN + 6, y + 4, { width: CW - 12, lineBreak: false });
  return y + 18;
}

// blend hex color toward white by factor (0=color, 1=white)
function blendWithWhite(hex, factor) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const br = Math.round(r + (255 - r) * (1 - factor));
  const bg = Math.round(g + (255 - g) * (1 - factor));
  const bb = Math.round(b + (255 - b) * (1 - factor));
  return `#${br.toString(16).padStart(2, '0')}${bg.toString(16).padStart(2, '0')}${bb.toString(16).padStart(2, '0')}`;
}

function kvPair(doc, x, y, colW, label, value) {
  doc.fillColor(GRAY_LT).font('Helvetica-Bold').fontSize(5.8)
     .text(label.toUpperCase(), x + 3, y + 3, { width: 72, lineBreak: false });
  const val = (value != null && value !== '' && value !== false) ? String(value) : '—';
  doc.fillColor(DARK).font('Helvetica').fontSize(7.5)
     .text(val, x + 78, y + 2, { width: colW - 82, lineBreak: false });
}

function kvRow(doc, y, left, right) {
  const h = 15;
  const half = CW / 2;
  kvPair(doc, MARGIN, y, half, left.label, left.value);
  if (right) kvPair(doc, MARGIN + half, y, half, right.label, right.value);
  hline(doc, y + h, '#f0f0f0', 0.3);
  return y + h;
}

function clauseBlock(doc, y, i, text) {
  const w = CW - 10;
  const h = doc.heightOfString(text, { width: w, fontSize: 6.5 }) + 7;
  y = guard(doc, y, h);
  if (i % 2 === 0) doc.save().rect(MARGIN, y, CW, h).fill(BG_STRIPE).restore();
  doc.fillColor(GRAY).font('Helvetica').fontSize(6.5)
     .text(text, MARGIN + 5, y + 3, { width: w });
  return y + h + 1;
}

module.exports = {
  EMPRESA_CONFIG, DEFAULT_CONFIG, LOGOS_DIR, getEmpresaConfig,
  MARGIN, PAGE_W, PAGE_H, CW, DARK, GRAY, GRAY_LT, BORDER, BG_STRIPE,
  guard, hline, sectionBand, blendWithWhite, kvPair, kvRow, clauseBlock,
};
