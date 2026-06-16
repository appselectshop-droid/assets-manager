const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const Employee = require('../models/Employee');
const Assignment = require('../models/Assignment');

const ORANGE = '#E8431A';
const DARK = '#111111';
const GRAY = '#666666';
const GRAY_LT = '#999999';
const BORDER = '#e0e0e0';
const BG_STRIPE = '#fafafa';
const BG_ORANGE = '#fff5f3';

const MARGIN = 36;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const CW = PAGE_W - MARGIN * 2; // content width
const LOGO = path.join(__dirname, '../assets/logo.png');

function newPage(doc) {
  doc.addPage();
  return MARGIN;
}

function guard(doc, y, need = 60) {
  return y + need > PAGE_H - MARGIN ? newPage(doc) : y;
}

function hline(doc, y, color = BORDER, w = 0.5) {
  doc.save().strokeColor(color).lineWidth(w)
     .moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).stroke().restore();
}

function sectionBand(doc, y, label) {
  y = guard(doc, y, 30);
  doc.save().rect(MARGIN, y, CW, 16).fill(BG_ORANGE).restore();
  doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(7.5)
     .text(label, MARGIN + 6, y + 4, { width: CW - 12, lineBreak: false });
  return y + 18;
}

function kvPair(doc, x, y, colW, label, value) {
  doc.fillColor(GRAY_LT).font('Helvetica-Bold').fontSize(5.8)
     .text(label.toUpperCase(), x + 3, y + 3, { width: 70, lineBreak: false });
  const val = (value != null && value !== '' && value !== false) ? String(value) : '—';
  doc.fillColor(DARK).font('Helvetica').fontSize(7.5)
     .text(val, x + 76, y + 2, { width: colW - 80, lineBreak: false });
}

function kvRow(doc, y, left, right = null) {
  const h = 15;
  const half = CW / 2;
  kvPair(doc, MARGIN, y, half, left.label, left.value);
  if (right) kvPair(doc, MARGIN + half, y, half, right.label, right.value);
  hline(doc, y + h, '#f0f0f0', 0.3);
  return y + h;
}

function assetSection(doc, y, title, rows, accessories = []) {
  y = guard(doc, y, 20 + rows.length * 15 + (accessories.length ? 15 : 0));
  y = sectionBand(doc, y, title);
  rows.forEach(([l1, v1, l2, v2]) => {
    y = kvRow(doc, y, { label: l1, value: v1 }, l2 ? { label: l2, value: v2 } : null);
  });
  if (accessories.length > 0) {
    y = kvRow(doc, y, { label: 'Accesorios incluidos', value: accessories.join(' · ') });
  }
  return y + 4;
}

function clause(doc, y, i, text) {
  const w = CW - 10;
  const h = doc.heightOfString(text, { width: w, fontSize: 6.5 }) + 7;
  y = guard(doc, y, h);
  if (i % 2 === 0) {
    doc.save().rect(MARGIN, y, CW, h).fill(BG_STRIPE).restore();
  }
  doc.fillColor(GRAY).font('Helvetica').fontSize(6.5)
     .text(text, MARGIN + 5, y + 3, { width: w });
  return y + h + 1;
}

router.get('/:employeeId', auth, async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.employeeId);
    if (!employee) return res.status(404).json({ message: 'Empleado no encontrado' });

    const assignments = await Assignment.find({ employee: employee._id, active: true })
      .populate('asset').sort({ 'asset.type': 1 });

    const assets = assignments.map((a) => a.asset).filter(Boolean);

    const laptops    = assets.filter((a) => a.type === 'laptop');
    const desktops   = assets.filter((a) => ['escritorio', 'all_in_one'].includes(a.type));
    const phones     = assets.filter((a) => ['celular', 'tablet'].includes(a.type));
    const monitors   = assets.filter((a) => a.type === 'monitor');
    const mouses     = assets.filter((a) => a.type === 'mouse');
    const keyboards  = assets.filter((a) => a.type === 'teclado');
    const chargers   = assets.filter((a) => ['cargador_laptop', 'cargador_celular'].includes(a.type));
    const others     = assets.filter((a) => ['accesorio', 'otro'].includes(a.type));

    const deliveryParts = [];
    if (laptops.length) deliveryParts.push('Computadora Laptop');
    if (desktops.length) deliveryParts.push('Computadora Escritorio');
    if (phones.length) deliveryParts.push('Teléfono Celular');
    const periph = [...monitors, ...mouses, ...keyboards, ...chargers, ...others];
    if (periph.length) deliveryParts.push('Accesorios');
    const deliveryType = deliveryParts.join(' + ') || 'Activos de TI';

    const company = employee.businessName || 'SELECT SHOP MB, S.A DE C.V.';
    const dateStr = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
    const safeName = employee.name.replace(/[^a-zA-Z0-9_\- ]/g, '_').replace(/\s+/g, '_');

    const doc = new PDFDocument({ size: 'A4', margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN }, autoFirstPage: true, bufferPages: true });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Responsiva_${employee.employeeId}_${safeName}.pdf"`);
    doc.pipe(res);

    let y = MARGIN;

    // ── HEADER ──────────────────────────────────────────
    const hasLogo = fs.existsSync(LOGO);
    if (hasLogo) {
      doc.image(LOGO, MARGIN, y, { fit: [90, 38] });
    }

    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(13)
       .text(`RESPONSIVA${deliveryType ? ' DE ' + deliveryType.toUpperCase() : ''}`,
             MARGIN + (hasLogo ? 100 : 0), y + 6, {
               width: CW - (hasLogo ? 220 : 130),
               align: 'center',
               lineBreak: false,
             });

    doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6.5)
       .text('CLAVE: IT-27/05/26-F01', PAGE_W - MARGIN - 130, y, { width: 130, align: 'right', lineBreak: false });
    doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6.5)
       .text(`Ciudad de México a ${dateStr}`, PAGE_W - MARGIN - 130, y + 10, { width: 130, align: 'right', lineBreak: false });

    y += 44;
    doc.fillColor(DARK).font('Helvetica').fontSize(8.5)
       .text(company, MARGIN, y, { width: CW, align: 'center', lineBreak: false });

    y += 13;
    doc.save().rect(MARGIN, y, CW, 2.5).fill(ORANGE).restore();
    y += 6;

    // ── TIPO DE ENTREGA + EMPRESA ────────────────────────
    doc.save().rect(MARGIN, y, CW, 18).fill(BG_STRIPE).restore();
    kvPair(doc, MARGIN, y, CW / 2, 'Tipo de entrega', deliveryType);
    kvPair(doc, MARGIN + CW / 2, y, CW / 2, 'Empresa', company);
    y += 20;

    // ── FUNDAMENTO LEGAL (compact) ───────────────────────
    const legalShort = 'La asignación se sustenta en la Ley Federal del Trabajo: Art. 110 Fracc. I (límites para descuentos salariales). Art. 132 Fracc. III (proporcionar útiles, instrumentos y materiales necesarios; no exigir indemnización por desgaste natural). Art. 134 Fracc. IV y VI (ejecutar el trabajo con cuidado; restituir materiales no usados y conservar en buen estado los instrumentos). Art. 135 Fracc. III y IX (no sustraer útiles de trabajo ni usarlos para objeto distinto).';
    const legalH = doc.heightOfString(legalShort, { width: CW - 10, fontSize: 6.5 }) + 8;
    doc.save().rect(MARGIN, y, CW, legalH).fill('#fffbf5').restore();
    doc.fillColor('#7a5230').font('Helvetica').fontSize(6.5)
       .text(legalShort, MARGIN + 5, y + 4, { width: CW - 10 });
    y += legalH + 5;

    // ── COLABORADOR ──────────────────────────────────────
    y = sectionBand(doc, y, '  DATOS DEL COLABORADOR');
    y = kvRow(doc, y, { label: 'No. Empleado', value: employee.employeeId }, { label: 'Nombre', value: employee.name });
    y = kvRow(doc, y, { label: 'Ubicación / Sucursal', value: employee.office }, { label: 'Departamento', value: employee.department });
    y = kvRow(doc, y, { label: 'Puesto', value: employee.position }, { label: 'Área', value: employee.area });
    if (employee.corporateEmails?.length > 0) {
      y = kvRow(doc, y, { label: 'Correo Corporativo', value: employee.corporateEmails.join(', ') });
    }
    y += 5;

    // ── LAPTOPS ──────────────────────────────────────────
    laptops.forEach((lp, i) => {
      const accs = [];
      if (lp.specs?.hasMonitor) accs.push('Monitor');
      if (lp.specs?.hasMouse) accs.push('Mouse');
      if (lp.specs?.hasKeyboard) accs.push('Teclado');

      y = assetSection(doc, y, `  EQUIPO DE CÓMPUTO — LAPTOP${laptops.length > 1 ? ` (${i + 1})` : ''}`, [
        ['Tipo', 'Laptop', 'Marca', lp.brand],
        ['Modelo', lp.model, 'No. de Serie', lp.serialNumber],
        ['Procesador', lp.specs?.processor, 'RAM / Almacenamiento', `${lp.specs?.ram || '—'} / ${lp.specs?.storage || '—'}`],
        ['Sistema Operativo', lp.specs?.os, 'Propiedad', lp.specs?.ownership],
        ['Cargador (CT)', lp.specs?.hasCharger ? `Incluye${lp.specs?.chargerSerial ? ' — S/N: ' + lp.specs.chargerSerial : ''}` : 'No incluye', 'Contrato', lp.specs?.contractNumber],
        ['Etiqueta Inventario', lp.inventoryTag, 'AnyDesk ID', lp.specs?.anydesk],
      ], accs);
    });

    // ── DESKTOPS / ALL-IN-ONE ─────────────────────────────
    desktops.forEach((ds, i) => {
      const isAIO = ds.type === 'all_in_one';
      const accs = [];
      if (ds.specs?.hasMonitor) accs.push('Monitor');
      if (ds.specs?.hasMouse) accs.push('Mouse');
      if (ds.specs?.hasKeyboard) accs.push('Teclado');

      y = assetSection(doc, y, `  EQUIPO DE CÓMPUTO — ${isAIO ? 'ALL-IN-ONE' : 'ESCRITORIO'}${desktops.length > 1 ? ` (${i + 1})` : ''}`, [
        ['Tipo', isAIO ? 'All-in-One' : 'Escritorio', 'Marca', ds.brand],
        ['Modelo', ds.model, 'No. de Serie', ds.serialNumber],
        ['Procesador', ds.specs?.processor, 'RAM / Almacenamiento', `${ds.specs?.ram || '—'} / ${ds.specs?.storage || '—'}`],
        ['Sistema Operativo', ds.specs?.os, 'Propiedad', ds.specs?.ownership],
        ['Fuente de Poder', ds.specs?.psuSerial || '—', 'Contrato', ds.specs?.contractNumber],
        ['Etiqueta Inventario', ds.inventoryTag, 'AnyDesk ID', ds.specs?.anydesk],
      ], accs);
    });

    // ── CELULARES / TABLETS ───────────────────────────────
    phones.forEach((ph, i) => {
      const isTablet = ph.type === 'tablet';
      y = assetSection(doc, y, `  EQUIPO DE TELEFONÍA — ${isTablet ? 'TABLET' : 'CELULAR'}${phones.length > 1 ? ` (${i + 1})` : ''}`, [
        ['Marca', ph.brand, 'Modelo', ph.model],
        ['IMEI 1', ph.specs?.imei, 'IMEI 2', ph.specs?.imei2],
        ['Núm. Marcación', ph.specs?.lineNumber, 'Operadora', ph.specs?.carrier],
        ['Correo Gmail', ph.specs?.gmailAccount, 'Almacenamiento', ph.specs?.storage],
        ['Cargador', ph.specs?.hasCharger ? 'Incluye' : 'No incluye', 'Costo del Equipo', ph.specs?.planCost],
        ['No. de Serie', ph.serialNumber, 'Contrato', ph.specs?.contractNumber],
      ]);
    });

    // ── ACCESORIOS PERIFÉRICOS ────────────────────────────
    if (periph.length > 0) {
      y = guard(doc, y, 20 + periph.length * 16);
      y = sectionBand(doc, y, '  ACCESORIOS ENTREGADOS');

      const TYPE_LABEL = {
        monitor: 'Monitor', mouse: 'Mouse', teclado: 'Teclado',
        cargador_laptop: 'Cargador Laptop', cargador_celular: 'Cargador Celular',
        accesorio: 'Accesorio', otro: 'Otro',
      };
      const half = CW / 2;

      periph.forEach((acc, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        if (col === 0) {
          if (i > 0) y += 16;
          if (i % 4 === 0) {
            doc.save().rect(MARGIN, y, CW, 16).fill(BG_STRIPE).restore();
          }
        }
        const x = MARGIN + col * half;
        const label = `${TYPE_LABEL[acc.type] || acc.type}: ${acc.brand} ${acc.model}`.trim();
        const sub = acc.serialNumber ? `Serie: ${acc.serialNumber}` : (acc.inventoryTag ? `Inv: ${acc.inventoryTag}` : '');

        // Checkbox
        doc.save().rect(x + 4, y + 4, 7, 7).stroke(ORANGE).restore();
        doc.save().fillColor(ORANGE).rect(x + 5.5, y + 5.5, 4, 4).fill().restore();

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

    // ── CLÁUSULAS LEGALES ─────────────────────────────────
    y = guard(doc, y, 30);
    y = sectionBand(doc, y, '  TÉRMINOS Y CONDICIONES');

    const clauses = [
      'RESPONSABILIDAD GENERAL: A partir de la fecha de entrega, el colaborador reconoce haber recibido en correcto funcionamiento el equipo, dispositivo o accesorio asignado, comprometiéndose a: utilizarlo únicamente para actividades laborales autorizadas; conservarlo en condiciones normales de uso, protegiendo la confidencialidad e integridad de la información; no alterar configuraciones de seguridad ni desactivar herramientas de protección (antivirus, MDM, etc.); no instalar software no autorizado; y permitir revisiones técnicas, inventarios, auditorías de seguridad y accesos remotos cuando la empresa lo requiera.',
      'DEVOLUCIÓN: El colaborador deberá entregar el equipo asignado en caso de cambio de puesto, término de la relación laboral, renovación tecnológica o requerimiento del área correspondiente. La devolución deberá realizarse SIN bloqueos, sin formateos no autorizados, sin eliminación de información corporativa, con accesorios completos y en condiciones normales de uso. El incumplimiento podrá derivar en medidas administrativas conforme al Reglamento Interior de Trabajo.',
      'ACCESO REMOTO (CÓMPUTO): El área de Sistemas/TI tiene la facultad de ingresar de manera remota al equipo mediante herramientas seguras y VPN para: soporte técnico, diagnóstico, instalación de software autorizado, auditorías de seguridad, mantenimiento preventivo y recuperación de información corporativa.',
      'ROBO O EXTRAVÍO: El colaborador deberá: reportar inmediatamente a su jefe directo y al área de Sistemas/TI; levantar la denuncia correspondiente ante el Ministerio Público; entregar copia del acuse a la empresa. Tratándose de robo comprobado y documentado, no procederán cobros automáticos al trabajador (Art. 110 Fracc. I LFT).',
      'DAÑOS POR NEGLIGENCIA: Los daños por descuido, mal uso comprobado o pérdida por descuido podrán derivar en responsabilidades administrativas. Cualquier recuperación económica se sujetará al Art. 110 Fracc. I LFT, mediante convenio voluntario de pago personal documentado, sin descuento automático vía nómina.',
      'TELÉFONO MÓVIL: Destinado exclusivamente a actividades operativas, administrativas y de comunicación institucional. El colaborador se compromete a mantener activa la cuenta institucional, no vincular cuentas personales y mantener comunicación estrictamente profesional. Queda prohibido compartir información confidencial o alterar configuraciones de seguridad.',
    ];

    clauses.forEach((text, i) => {
      y = clause(doc, y, i, text);
    });

    y += 8;

    // ── FIRMAS ────────────────────────────────────────────
    y = guard(doc, y, 100);

    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8)
       .text('FIRMAS DE CONFORMIDAD', MARGIN, y, { width: CW, align: 'center', lineBreak: false });
    y += 14;

    const sigW = (CW - 20) / 3;
    const sigH = 72;
    const sigLabels = ['ENTREGA', 'RECIBE', 'AUTORIZA'];
    const sigRoles  = ['IT / SISTEMAS', 'EMPLEADO', 'JEFE INMEDIATO'];
    const sigNames  = ['', employee.name, ''];

    sigLabels.forEach((lbl, i) => {
      const x = MARGIN + i * (sigW + 10);
      doc.save().rect(x, y, sigW, sigH).stroke(BORDER).restore();
      // Top band
      doc.save().rect(x, y, sigW, 14).fill(BG_ORANGE).restore();
      doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(7)
         .text(lbl, x, y + 4, { width: sigW, align: 'center', lineBreak: false });
      // Signature line
      doc.save().strokeColor(BORDER).lineWidth(0.7)
         .moveTo(x + 8, y + sigH - 22).lineTo(x + sigW - 8, y + sigH - 22)
         .stroke().restore();
      // Pre-filled name
      if (sigNames[i]) {
        doc.fillColor(DARK).font('Helvetica').fontSize(7)
           .text(sigNames[i], x, y + sigH - 35, { width: sigW, align: 'center', lineBreak: false });
      }
      // Role label
      doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6.5)
         .text(`Nombre, fecha y firma`, x, y + sigH - 18, { width: sigW, align: 'center', lineBreak: false });
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(7)
         .text(sigRoles[i], x, y + sigH - 8, { width: sigW, align: 'center', lineBreak: false });
    });

    y += sigH + 8;

    doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6)
       .text('c.c.p. Departamento de Legal  ·  c.c.p. Departamento de Recursos Humanos', MARGIN, y, { width: CW, align: 'left', lineBreak: false });

    doc.end();

  } catch (err) {
    console.error('Error generating responsiva:', err);
    if (!res.headersSent) res.status(500).json({ message: 'Error al generar la responsiva' });
  }
});

module.exports = router;
