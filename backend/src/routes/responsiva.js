const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const Employee = require('../models/Employee');
const Assignment = require('../models/Assignment');

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
  // tinted background (accent at 12% opacity via white blend)
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

function assetSection(doc, y, title, rows, accRow, accent) {
  const estH = 20 + rows.length * 15 + (accRow ? 15 : 0);
  y = guard(doc, y, estH);
  y = sectionBand(doc, y, title, accent);
  rows.forEach(([l1, v1, l2, v2]) => {
    y = kvRow(doc, y, { label: l1, value: v1 }, l2 != null ? { label: l2, value: v2 } : null);
  });
  if (accRow) {
    y = kvRow(doc, y, { label: accRow.label, value: accRow.value });
  }
  return y + 4;
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

// ── ROUTE ────────────────────────────────────────────────────────────────────
router.get('/:employeeId', auth, async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.employeeId);
    if (!employee) return res.status(404).json({ message: 'Empleado no encontrado' });

    const assignments = await Assignment.find({ employee: employee._id, active: true })
      .populate('asset').sort({ 'asset.type': 1 });

    let assets = assignments.map((a) => a.asset).filter(Boolean);

    // Optional: single-asset responsiva
    const { assetId } = req.query;
    if (assetId) {
      assets = assets.filter((a) => a._id.toString() === assetId);
      if (!assets.length) return res.status(404).json({ message: 'Activo no encontrado' });
    }

    // ── CATEGORIZE ASSETS ───────────────────────────────────────────────────
    const laptops   = assets.filter((a) => a.type === 'laptop');
    const desktops  = assets.filter((a) => ['escritorio', 'all_in_one'].includes(a.type));
    const phones    = assets.filter((a) => ['celular', 'tablet'].includes(a.type));
    const monitors  = assets.filter((a) => a.type === 'monitor');
    const mouses    = assets.filter((a) => a.type === 'mouse');
    const keyboards = assets.filter((a) => a.type === 'teclado');
    const chargers  = assets.filter((a) => ['cargador_laptop', 'cargador_celular'].includes(a.type));
    const others    = assets.filter((a) => ['accesorio', 'otro'].includes(a.type));
    const periph    = [...monitors, ...mouses, ...keyboards, ...chargers, ...others];

    const hasLap  = laptops.length > 0;
    const hasDesk = desktops.length > 0;
    const hasTel  = phones.length > 0;
    const hasAcc  = periph.length > 0;

    // ── DELIVERY TYPE STRING (matches _TIPOS logic) ─────────────────────────
    const parts = [];
    if (hasLap)  parts.push('Computadora Laptop');
    if (hasDesk) parts.push('Computadora de Escritorio');
    if (hasTel)  parts.push('Teléfono Celular');
    if (hasAcc)  parts.push('Accesorios');
    const deliveryType = parts.join(' + ') || 'Activos de TI';

    // ── EMPRESA CONFIG ──────────────────────────────────────────────────────
    const company = employee.businessName || 'SELECT SHOP MB, S.A DE C.V.';
    const { color: ACCENT, logo: logoFile } = getEmpresaConfig(company);
    const ACCENT_BG = blendWithWhite(ACCENT, 0.1);

    const logoPath = path.join(LOGOS_DIR, logoFile);
    const hasLogo  = fs.existsSync(logoPath);

    const dateStr  = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
    const safeName = (employee.name || 'empleado').replace(/[^a-zA-Z0-9\- ]/g, '_').replace(/\s+/g, '_');

    // ── BUILD PDF ───────────────────────────────────────────────────────────
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      autoFirstPage: true,
      bufferPages: true,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename="Responsiva_${employee.employeeId}_${safeName}.pdf"`);
    doc.pipe(res);

    let y = MARGIN;

    // ── HEADER ──────────────────────────────────────────────────────────────
    if (hasLogo) {
      try { doc.image(logoPath, MARGIN, y, { fit: [100, 40] }); } catch (_) {}
    }

    doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(12)
       .text(
         deliveryType ? `RESPONSIVA DE ${deliveryType.toUpperCase()}` : 'RESPONSIVA',
         MARGIN + (hasLogo ? 110 : 0), y + 7,
         { width: CW - (hasLogo ? 230 : 130), align: 'center', lineBreak: false }
       );

    doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6.5)
       .text('CLAVE: IT-27/05/26-F01', PAGE_W - MARGIN - 130, y,
             { width: 130, align: 'right', lineBreak: false });
    doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6.5)
       .text(`Ciudad de México a ${dateStr}`, PAGE_W - MARGIN - 130, y + 10,
             { width: 130, align: 'right', lineBreak: false });

    y += 46;
    doc.fillColor(DARK).font('Helvetica').fontSize(8.5)
       .text(company, MARGIN, y, { width: CW, align: 'center', lineBreak: false });

    y += 13;
    doc.save().rect(MARGIN, y, CW, 2.5).fill(ACCENT).restore();
    y += 6;

    // ── TIPO + EMPRESA ROW ───────────────────────────────────────────────────
    doc.save().rect(MARGIN, y, CW, 18).fill(BG_STRIPE).restore();
    kvPair(doc, MARGIN, y, CW / 2, 'Tipo de entrega', deliveryType);
    kvPair(doc, MARGIN + CW / 2, y, CW / 2, 'Empresa', company);
    y += 20;

    // ── FUNDAMENTO LEGAL ─────────────────────────────────────────────────────
    const legalText = 'La asignación de estas herramientas se sustenta en la Ley Federal del Trabajo: Art. 110, Fracc. I (límites para descuentos salariales; ningún descuento mayor al importe de un mes de salario ni más del 30% del excedente del salario mínimo). Art. 132, Fracc. III (Proporcionar oportunamente a los trabajadores los útiles, instrumentos y materiales necesarios para la ejecución del trabajo, debiendo darlos de buena calidad, en buen estado y reponerlos tan luego como dejen de ser eficientes, siempre que aquéllos no se hayan comprometido a usar herramienta propia. El patrón no podrá exigir indemnización alguna por el desgaste natural que sufran los útiles, instrumentos y materiales de trabajo). Art. 134, Fracc. IV (Ejecutar el trabajo con la intensidad, cuidado y esmero apropiados y en la forma, tiempo y lugar convenidos) y Fracc. VI (Restituir al patrón los materiales no usados y conservar en buen estado los instrumentos y útiles que les haya dado para el trabajo, no siendo responsables por el deterioro que origine el uso de estos objetos, ni del ocasionado por caso fortuito, fuerza mayor, o por mala calidad o defectuosa construcción). Art. 135, Fracc. III (Sustraer de la empresa o establecimiento útiles de trabajo o materia prima o elaborada) y Fracc. IX (Usar los útiles y herramientas suministrados por el patrón, para objeto distinto de aquél a que están destinados).';
    const legalH = doc.heightOfString(legalText, { width: CW - 10, fontSize: 6.5 }) + 8;
    doc.save().rect(MARGIN, y, CW, legalH).fill('#fffbf5').restore();
    doc.fillColor('#7a5230').font('Helvetica').fontSize(6.5)
       .text(legalText, MARGIN + 5, y + 4, { width: CW - 10 });
    y += legalH + 5;

    // ── COLABORADOR ───────────────────────────────────────────────────────────
    y = sectionBand(doc, y, '  DATOS DEL COLABORADOR', ACCENT);
    y = kvRow(doc, y,
      { label: 'No. Empleado', value: employee.employeeId },
      { label: 'Nombre', value: employee.name });
    y = kvRow(doc, y,
      { label: 'Ubicación / Sucursal', value: employee.office },
      { label: 'Departamento', value: employee.department });
    y = kvRow(doc, y,
      { label: 'Puesto', value: employee.position },
      { label: 'Área', value: employee.area });
    if (employee.corporateEmails?.length > 0) {
      y = kvRow(doc, y,
        { label: 'Correo Corporativo', value: employee.corporateEmails.join(', ') });
    }
    y += 5;

    // ── LAPTOPS ───────────────────────────────────────────────────────────────
    if (hasLap) {
      laptops.forEach((lp, i) => {
        const accs = [];
        if (lp.specs?.hasMonitor)  accs.push('Monitor');
        if (lp.specs?.hasMouse)    accs.push('Mouse');
        if (lp.specs?.hasKeyboard) accs.push('Teclado');
        y = assetSection(doc, y,
          `  EQUIPO DE CÓMPUTO — LAPTOP${laptops.length > 1 ? ` (${i + 1})` : ''}`,
          [
            ['Tipo', 'Laptop',                 'Marca',         lp.brand],
            ['Modelo', lp.model,               'No. de Serie',  lp.serialNumber],
            ['Procesador', lp.specs?.processor, 'RAM / Alm.',   `${lp.specs?.ram || '—'} / ${lp.specs?.storage || '—'}`],
            ['Sistema Operativo', lp.specs?.os, 'Propiedad',    lp.specs?.ownership],
            ['Cargador (CT)',
              lp.specs?.hasCharger
                ? `Incluye${lp.specs?.chargerSerial ? ' — S/N: ' + lp.specs.chargerSerial : ''}`
                : 'No incluye',
              'Contrato', lp.specs?.contractNumber],
            ['Etiqueta Inventario', lp.inventoryTag, 'AnyDesk ID', lp.specs?.anydesk],
          ],
          accs.length ? { label: 'Accesorios incluidos', value: accs.join(' · ') } : null,
          ACCENT
        );
      });
    }

    // ── ESCRITORIOS / ALL-IN-ONE ───────────────────────────────────────────────
    if (hasDesk) {
      desktops.forEach((ds, i) => {
        const isAIO = ds.type === 'all_in_one';
        const accs = [];
        if (ds.specs?.hasMonitor)  accs.push('Monitor');
        if (ds.specs?.hasMouse)    accs.push('Mouse');
        if (ds.specs?.hasKeyboard) accs.push('Teclado');
        y = assetSection(doc, y,
          `  EQUIPO DE CÓMPUTO — ${isAIO ? 'ALL-IN-ONE' : 'ESCRITORIO'}${desktops.length > 1 ? ` (${i + 1})` : ''}`,
          [
            ['Tipo', isAIO ? 'All-in-One' : 'Escritorio', 'Marca',        ds.brand],
            ['Modelo', ds.model,                           'No. de Serie', ds.serialNumber],
            ['Procesador', ds.specs?.processor,            'RAM / Alm.',   `${ds.specs?.ram || '—'} / ${ds.specs?.storage || '—'}`],
            ['Sistema Operativo', ds.specs?.os,            'Propiedad',    ds.specs?.ownership],
            ['Fuente de Poder', ds.specs?.psuSerial || '—', 'Contrato',   ds.specs?.contractNumber],
            ['Etiqueta Inventario', ds.inventoryTag,       'AnyDesk ID',  ds.specs?.anydesk],
          ],
          accs.length ? { label: 'Accesorios incluidos', value: accs.join(' · ') } : null,
          ACCENT
        );
      });
    }

    // ── CELULARES / TABLETS ───────────────────────────────────────────────────
    if (hasTel) {
      phones.forEach((ph, i) => {
        const isTablet = ph.type === 'tablet';
        y = assetSection(doc, y,
          `  EQUIPO DE TELEFONÍA — ${isTablet ? 'TABLET' : 'CELULAR'}${phones.length > 1 ? ` (${i + 1})` : ''}`,
          [
            ['Marca', ph.brand,                    'Modelo',         ph.model],
            ['IMEI 1', ph.specs?.imei,             'IMEI 2',         ph.specs?.imei2],
            ['Núm. Marcación', ph.specs?.lineNumber, 'Operadora',    ph.specs?.carrier],
            ['Correo Gmail', ph.specs?.gmailAccount, 'Almacenamiento', ph.specs?.storage],
            ['Cargador', ph.specs?.hasCharger ? 'Incluye' : 'No incluye', 'Costo del Equipo', ph.specs?.planCost],
            ['No. de Serie', ph.serialNumber,      'Contrato',       ph.specs?.contractNumber],
          ],
          null,
          ACCENT
        );
      });
    }

    // ── ACCESORIOS PERIFÉRICOS ────────────────────────────────────────────────
    if (hasAcc) {
      y = guard(doc, y, 20 + periph.length * 16);
      y = sectionBand(doc, y, '  ACCESORIOS ENTREGADOS', ACCENT);

      const TYPE_LABEL = {
        monitor: 'Monitor', mouse: 'Mouse', teclado: 'Teclado',
        cargador_laptop: 'Cargador Laptop', cargador_celular: 'Cargador Celular',
        accesorio: 'Accesorio', otro: 'Otro',
      };
      const half = CW / 2;

      periph.forEach((acc, i) => {
        const col = i % 2;
        if (col === 0) {
          if (i > 0) y += 16;
          if (Math.floor(i / 2) % 2 === 0) {
            doc.save().rect(MARGIN, y, CW, 16).fill(BG_STRIPE).restore();
          }
        }
        const x = MARGIN + col * half;
        const label = `${TYPE_LABEL[acc.type] || acc.type}: ${acc.brand} ${acc.model}`.trim();
        const sub   = acc.serialNumber ? `Serie: ${acc.serialNumber}` : (acc.inventoryTag ? `Inv: ${acc.inventoryTag}` : '');

        doc.save().rect(x + 4, y + 4, 7, 7).stroke(ACCENT).restore();
        doc.save().fillColor(ACCENT).rect(x + 5.5, y + 5.5, 4, 4).fill().restore();
        doc.fillColor(DARK).font('Helvetica').fontSize(7)
           .text(label, x + 16, y + 3, { width: half - 20, lineBreak: false });
        if (sub) {
          doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6)
             .text(sub, x + 16, y + 10, { width: half - 20, lineBreak: false });
        }
      });
      if (periph.length % 2 === 1) y += 16;
      y += 6;
    }

    // ── CLÁUSULAS (filtradas por tipo, igual que VBA) ─────────────────────────
    y = guard(doc, y, 30);
    y = sectionBand(doc, y, '  TÉRMINOS Y CONDICIONES', ACCENT);

    // Cláusulas generales (siempre)
    const generalClauses = [
      'RESPONSABILIDAD GENERAL: A partir de la fecha de entrega, el colaborador reconoce haber recibido en correcto funcionamiento el equipo, dispositivo o accesorio asignado, comprometiéndose a: utilizarlo únicamente para actividades laborales autorizadas; conservarlo en condiciones normales de uso, protegiendo la confidencialidad e integridad de la información; no alterar configuraciones de seguridad ni desactivar herramientas de protección (antivirus, MDM, etc.); no instalar software no autorizado; y permitir revisiones técnicas, inventarios, auditorías de seguridad y accesos remotos cuando la empresa lo requiera.',
      'DEVOLUCIÓN: El colaborador deberá entregar el equipo asignado en caso de cambio de puesto, término de la relación laboral, renovación tecnológica o requerimiento del área. La devolución deberá realizarse SIN bloqueos, sin formateos no autorizados, sin eliminación de información corporativa, con accesorios completos y en condiciones normales de uso. El incumplimiento podrá derivar en medidas administrativas conforme al Reglamento Interior de Trabajo.',
      'USO INDEBIDO Y SANCIONES: El uso indebido, negligencia o incumplimiento de políticas internas podrá derivar en levantamiento de actas administrativas y responsabilidades conforme al Reglamento Interior de Trabajo. Cualquier recuperación económica por daños o pérdidas se sujetará al Art. 110 Fracc. I LFT, mediante convenios voluntarios de pago personal documentados, sin descuentos automáticos vía nómina.',
    ];

    // Cláusulas de laptop (si aplica)
    const lapClauses = hasLap ? [
      'LAPTOP — Acceso Remoto y Responsabilidad: La computadora portátil es un activo de Riesgo Operativo Alto/Medio. El área de Sistemas/TI tiene la facultad de ingresar remotamente al equipo mediante herramientas seguras y VPN para: soporte técnico, diagnóstico, instalación de software autorizado, auditorías de seguridad, mantenimiento preventivo y recuperación de información corporativa. El colaborador será responsable de daños por: derrames de líquidos, caídas por descuido, manipulación incorrecta de hardware o instalación de software malicioso.',
      'LAPTOP — Traslado y Robo: Cuando las funciones del puesto requieran trabajo remoto, el colaborador podrá trasladar la computadora portátil bajo su absoluta responsabilidad. Si el puesto NO requiere movilidad, requerirá autorización previa de su jefe directo. En caso de robo, deberá: reportar inmediatamente a su jefe directo y al área de Sistemas/TI; levantar denuncia ante el Ministerio Público; y entregar copia del acuse a la empresa. Tratándose de robo comprobado, no procederán cobros automáticos (Art. 110 Fracc. I LFT).',
    ] : [];

    // Cláusulas de escritorio (si aplica)
    const deskClauses = hasDesk ? [
      'ESCRITORIO — Acceso Remoto y Restricciones: La computadora de escritorio deberá permanecer en el área de trabajo asignada y no podrá removerse sin autorización previa. El área de Sistemas/TI tiene la facultad de ingresar remotamente mediante VPN para soporte, auditorías y mantenimiento. Queda estrictamente prohibido: modificar configuraciones de red; conectar dispositivos externos no autorizados; compartir credenciales institucionales; o manipular componentes internos del equipo.',
    ] : [];

    // Cláusulas de teléfono (si aplica)
    const telClauses = hasTel ? [
      'TELÉFONO — Uso Exclusivo y Políticas: El teléfono móvil empresarial está destinado exclusivamente a actividades operativas y de comunicación institucional. El colaborador se compromete a: mantener activa la cuenta institucional; no vincular cuentas personales; mantener comunicación estrictamente profesional. Queda prohibido compartir información confidencial o alterar configuraciones de seguridad.',
      'TELÉFONO — Robo, Extravío y Daños: En caso de robo o extravío, el colaborador deberá notificar inmediatamente a su jefe directo y al área de Sistemas/TI para ejecutar protocolos de bloqueo y borrado remoto, y levantar denuncia ante el Ministerio Público. No proceden cobros automáticos por robo comprobado (Art. 110 Fracc. I LFT). Los daños por caídas, golpes o mal uso comprobado podrán derivar en responsabilidades administrativas.',
    ] : [];

    // Cláusulas de accesorios (si aplica)
    const accClauses = hasAcc ? [
      'ACCESORIOS — Inventario y Responsabilidad: Los accesorios asignados (monitores, teclados, ratones, adaptadores, cargadores, etc.) forman parte integral del inventario del colaborador. Deberán devolverse en conjunto con el equipo principal al término de la relación laboral, en cambio de puesto o renovación tecnológica, en condiciones normales de uso y con todos los componentes completos. El colaborador es responsable por pérdidas o daños derivados de negligencia o uso inadecuado.',
    ] : [];

    const allClauses = [...generalClauses, ...lapClauses, ...deskClauses, ...telClauses, ...accClauses];
    allClauses.forEach((text, i) => { y = clauseBlock(doc, y, i, text); });

    y += 8;

    // ── FIRMAS DE CONFORMIDAD ─────────────────────────────────────────────────
    y = guard(doc, y, 100);

    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8)
       .text('FIRMAS DE CONFORMIDAD', MARGIN, y, { width: CW, align: 'center', lineBreak: false });
    y += 14;

    const sigW = (CW - 20) / 3;
    const sigH = 72;
    const sigLabels = ['ENTREGA', 'RECIBE', 'AUTORIZA'];
    const sigRoles  = ['IT / SISTEMAS', 'EMPLEADO', 'JEFE INMEDIATO'];

    sigLabels.forEach((lbl, i) => {
      const x = MARGIN + i * (sigW + 10);
      doc.save().rect(x, y, sigW, sigH).stroke(BORDER).restore();
      doc.save().rect(x, y, sigW, 14).fill(blendWithWhite(ACCENT, 0.1)).restore();
      doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(7)
         .text(lbl, x, y + 4, { width: sigW, align: 'center', lineBreak: false });
      // Pre-fill employee name in RECIBE box
      if (i === 1) {
        doc.fillColor(DARK).font('Helvetica').fontSize(7)
           .text(employee.name, x, y + sigH - 36, { width: sigW, align: 'center', lineBreak: false });
      }
      doc.save().strokeColor(BORDER).lineWidth(0.7)
         .moveTo(x + 8, y + sigH - 22).lineTo(x + sigW - 8, y + sigH - 22).stroke().restore();
      doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6.5)
         .text('Nombre, fecha y firma', x, y + sigH - 18, { width: sigW, align: 'center', lineBreak: false });
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(7)
         .text(sigRoles[i], x, y + sigH - 8, { width: sigW, align: 'center', lineBreak: false });
    });

    y += sigH + 8;
    doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6)
       .text('c.c.p. Departamento de Legal  ·  c.c.p. Departamento de Recursos Humanos',
             MARGIN, y, { width: CW, lineBreak: false });

    doc.end();

  } catch (err) {
    console.error('Error generando responsiva:', err);
    if (!res.headersSent) res.status(500).json({ message: 'Error al generar la responsiva' });
  }
});

module.exports = router;
