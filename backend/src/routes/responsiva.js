const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const Employee = require('../models/Employee');
const Assignment = require('../models/Assignment');
const ResponsivaArchive = require('../models/ResponsivaArchive');
const {
  getEmpresaConfig, LOGOS_DIR,
  MARGIN, PAGE_W, PAGE_H, CW, DARK, GRAY_LT, BORDER, BG_STRIPE,
  guard, sectionBand, blendWithWhite, kvPair, kvRow, clauseBlock, measureKvHeight,
} = require('../utils/pdfBranding');
const { archiveAndRespond } = require('../utils/archiveResponsiva');
const {
  buildEquiposLegacyPdf, buildAccesoriosLegacyPdf, buildCelularLegacyPdf,
} = require('../utils/responsivaLegacyPdf');
const { formatMx } = require('../utils/dateFormat');

// Mismo criterio del Excel "Master" del formato anterior: Computadora/Laptop/
// Tableta caen en RESPONSIVA EQUIPOS; Celular tiene su propio formato aparte;
// todo lo demás (periféricos/otros) cae en RESPONSIVA ACCESORIOS.
const EQUIPO_ARTICULO_LEGACY = { laptop: 'LAPTOP', escritorio: 'COMPUTADORA', all_in_one: 'COMPUTADORA', tablet: 'TABLETA' };
const ACCESORIO_LABEL_LEGACY = {
  monitor: 'MONITOR', mouse: 'MOUSE', teclado: 'TECLADO', kit_perifericos: 'KIT TECLADO',
  audifonos: 'AUDÍFONOS', webcam: 'WEBCAM', hub_usb: 'HUB USB', impresora: 'IMPRESORA', escaner: 'ESCÁNER',
  cable: 'CABLE', consumible: 'CONSUMIBLE', herramienta: 'HERRAMIENTA', disco_duro: 'DISCO DURO',
  adaptador: 'ADAPTADOR', accesorio: 'ACCESORIO', cargador_laptop: 'CARGADOR LAPTOP',
  cargador_celular: 'CARGADOR CELULAR', base_laptop: 'BASE PARA LAPTOP', otro: 'OTRO',
  linea_telefonica: 'LÍNEA TELEFÓNICA',
};

// Responsiva en el formato ANTERIOR (Excel) que Sistemas sigue usando hoy por
// temas de RH/políticas — siempre por un solo activo (así funcionan esos 3
// formatos), nunca combinada como la Responsiva nueva de arriba. No comparte
// código con esa ruta a propósito, para no arriesgar romper ninguna de las
// dos al tocar la otra.
router.get('/:employeeId/legacy', auth, async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.employeeId);
    if (!employee) return res.status(404).json({ message: 'Empleado no encontrado' });

    const { assetId } = req.query;
    if (!assetId) return res.status(400).json({ message: 'El formato anterior es por activo — selecciona uno' });

    const assignment = await Assignment.findOne({ employee: employee._id, asset: assetId, active: true }).populate('asset');
    if (!assignment || !assignment.asset) {
      return res.status(404).json({ message: 'Activo no encontrado o no asignado a este empleado' });
    }
    const asset = assignment.asset;

    const dateStr = formatMx(new Date(), { day: 'numeric', month: 'long', year: 'numeric' });
    const safeName = (employee.name || 'empleado').replace(/[^a-zA-Z0-9\- ]/g, '_').replace(/\s+/g, '_');

    let pdfData, relatedLabel, suffix;

    if (EQUIPO_ARTICULO_LEGACY[asset.type]) {
      const articulo = EQUIPO_ARTICULO_LEGACY[asset.type];
      pdfData = await buildEquiposLegacyPdf({ employee, asset, dateStr, articulo });
      relatedLabel = `${articulo} (formato anterior)`;
      suffix = 'EquipoAnterior';
    } else if (asset.type === 'celular') {
      // pairedAssignment (2026-08-04) — si este celular no trae su propia
      // línea (se asignó por separado de una Línea Telefónica, ver
      // AssignModal/botón Vincular en EmployeeDetail.jsx), se busca la
      // línea pareja para no mandar el formato anterior con el número
      // vacío — bug real reportado por el usuario justo en este caso.
      let lineSpecs = asset.specs || {};
      if (!lineSpecs.lineNumber && assignment.pairedAssignment) {
        const pairedAssignment = await Assignment.findById(assignment.pairedAssignment).populate('asset');
        if (pairedAssignment?.asset?.type === 'linea_telefonica') lineSpecs = pairedAssignment.asset.specs || {};
      }
      pdfData = await buildCelularLegacyPdf({ employee, asset, dateStr, lineSpecs });
      relatedLabel = 'Celular (formato anterior)';
      suffix = 'CelularAnterior';
    } else {
      const tipoAccesorio = ACCESORIO_LABEL_LEGACY[asset.type] || asset.type.toUpperCase();
      const cantidad = assignment.quantity || 1;
      // linea_telefonica no tiene brand/model (no hay aparato) — sin esto
      // la descripción se quedaba en el genérico "LÍNEA TELEFÓNICA", sin
      // decir cuál número es.
      const descripcion = asset.type === 'linea_telefonica'
        ? `Línea ${asset.specs?.lineNumber || ''}${asset.specs?.carrier ? ` (${asset.specs.carrier})` : ''}`.trim()
        : [asset.brand, asset.model].filter(Boolean).join(' ') || tipoAccesorio;
      pdfData = await buildAccesoriosLegacyPdf({ employee, asset, dateStr, tipoAccesorio, cantidad, descripcion });
      relatedLabel = `${tipoAccesorio} (formato anterior)`;
      suffix = 'AccesorioAnterior';
    }

    const fileName = `Responsiva_${employee.employeeId}_${safeName}_${suffix}.pdf`;

    try {
      await ResponsivaArchive.create({
        type: 'activo',
        employee: employee._id,
        employeeName: employee.name,
        employeeIdNum: employee.employeeId,
        relatedLabel,
        fileName,
        pdfData,
        generatedByName: req.user.name,
        generatedBy: req.user.id,
      });
    } catch (err) {
      console.error('Error archivando responsiva (formato anterior):', err);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.end(pdfData);
  } catch (err) {
    console.error('Error generando responsiva (formato anterior):', err);
    if (!res.headersSent) res.status(500).json({ message: 'Error al generar la responsiva' });
  }
});

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

// ── ROUTE ────────────────────────────────────────────────────────────────────
router.get('/:employeeId', auth, async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.employeeId);
    if (!employee) return res.status(404).json({ message: 'Empleado no encontrado' });

    const assignments = await Assignment.find({ employee: employee._id, active: true })
      .populate('asset').sort({ 'asset.type': 1 });

    // pairedAssignment (2026-08-04) — celular+línea asignados juntos (ver
    // AssignModal en EmployeeDetail.jsx): estos mapas sirven para, más abajo,
    // ir del celular a su línea pareja (o viceversa) y mostrarlos juntos en
    // un solo renglón, en vez de dos renglones sueltos.
    const assignmentByAssetId = new Map(
      assignments.filter((a) => a.asset).map((a) => [String(a.asset._id), a])
    );
    const assignmentById = new Map(assignments.map((a) => [String(a._id), a]));

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
    // linea_telefonica (2026-08-04) entra aquí también — sin aparato pero
    // sigue siendo "telefonía", no un accesorio genérico. Ver más abajo
    // (EQUIPO DE TELEFONÍA) cómo se junta con su celular pareja si lo tiene.
    const phones    = assets.filter((a) => ['celular', 'tablet', 'linea_telefonica'].includes(a.type));
    // Catch-all: cualquier tipo que no sea laptop/escritorio/all_in_one/
    // celular/tablet/linea_telefonica cae aquí — así un tipo de accesorio
    // nuevo (ej. el "Base para Laptop" que se agregó después) no desaparece
    // de la responsiva solo por no estar en una lista fija.
    const coreTypes = ['laptop', 'escritorio', 'all_in_one', 'celular', 'tablet', 'linea_telefonica'];
    const periph    = assets.filter((a) => !coreTypes.includes(a.type));

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

    const dateStr  = formatMx(new Date(), { day: 'numeric', month: 'long', year: 'numeric' });
    const safeName = (employee.name || 'empleado').replace(/[^a-zA-Z0-9\- ]/g, '_').replace(/\s+/g, '_');

    // ── BUILD PDF ───────────────────────────────────────────────────────────
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      autoFirstPage: true,
      bufferPages: true,
    });

    archiveAndRespond(doc, res, {
      type: 'activo',
      employee: employee._id,
      employeeName: employee.name,
      employeeIdNum: employee.employeeId,
      relatedLabel: deliveryType,
      fileName: `Responsiva_${employee.employeeId}_${safeName}.pdf`,
      generatedByName: req.user.name,
      generatedBy: req.user.id,
    });

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
    // Altura dinámica — "Empresa" puede venir con la razón social completa
    // (ej. "COMERCIALIZADORA DE MARCAS JSB, S.A DE C.V.") y no siempre cabe
    // en una sola línea dentro de la columna angosta.
    const tipoEmpresaH = Math.max(
      measureKvHeight(doc, CW / 2, 'Tipo de entrega', deliveryType),
      measureKvHeight(doc, CW / 2, 'Empresa', company)
    );
    doc.save().rect(MARGIN, y, CW, tipoEmpresaH + 3).fill(BG_STRIPE).restore();
    kvPair(doc, MARGIN, y, CW / 2, 'Tipo de entrega', deliveryType);
    kvPair(doc, MARGIN + CW / 2, y, CW / 2, 'Empresa', company);
    y += tipoEmpresaH + 5;

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

    // ── CELULARES / TABLETS / LÍNEAS TELEFÓNICAS ─────────────────────────────
    // pairedAssignment (2026-08-04): un celular sin línea propia y una línea
    // telefónica asignados juntos (ver AssignModal en EmployeeDetail.jsx) se
    // muestran en UN solo renglón de "EQUIPO DE TELEFONÍA", como si fuera el
    // caso de siempre (celular con su línea embebida) — para quien lee la
    // responsiva es exactamente lo mismo que reciben: un teléfono con un
    // número. Una línea que no tiene pareja (asignada sola, sin celular) se
    // muestra en su propio renglón, sin campos de aparato.
    const linkedLineaIds = new Set();
    const devices = phones.filter((a) => ['celular', 'tablet'].includes(a.type));
    devices.forEach((ph) => {
      if (ph.specs?.lineNumber) return; // ya trae su propia línea embebida
      const thisAssignment = assignmentByAssetId.get(String(ph._id));
      const pairedAssignment = assignmentById.get(String(thisAssignment?.pairedAssignment));
      const pairedAsset = pairedAssignment?.asset;
      if (pairedAsset?.type === 'linea_telefonica') linkedLineaIds.add(String(pairedAsset._id));
    });
    const standaloneLineas = phones.filter((a) => a.type === 'linea_telefonica' && !linkedLineaIds.has(String(a._id)));
    const telItems = devices.length + standaloneLineas.length;

    if (hasTel) {
      let telIndex = 0;
      devices.forEach((ph) => {
        telIndex++;
        const isTablet = ph.type === 'tablet';
        let lineSpecs = ph.specs || {};
        if (!lineSpecs.lineNumber) {
          const thisAssignment = assignmentByAssetId.get(String(ph._id));
          const pairedAssignment = assignmentById.get(String(thisAssignment?.pairedAssignment));
          if (pairedAssignment?.asset?.type === 'linea_telefonica') lineSpecs = pairedAssignment.asset.specs || {};
        }
        y = assetSection(doc, y,
          `  EQUIPO DE TELEFONÍA — ${isTablet ? 'TABLET' : 'CELULAR'}${telItems > 1 ? ` (${telIndex})` : ''}`,
          [
            ['Marca', ph.brand,                    'Modelo',         ph.model],
            ['IMEI 1', ph.specs?.imei,             'IMEI 2',         ph.specs?.imei2],
            ['Núm. Marcación', lineSpecs.lineNumber, 'Operadora',    lineSpecs.carrier],
            ['Correo Gmail', lineSpecs.gmailAccount, 'Almacenamiento', ph.specs?.storage],
            ['Cargador', ph.specs?.hasCharger ? 'Incluye' : 'No incluye', 'Costo del Plan', lineSpecs.planCost],
            ['No. de Serie', ph.serialNumber,      'Contrato',       lineSpecs.contractNumber],
          ],
          null,
          ACCENT
        );
      });
      standaloneLineas.forEach((ln) => {
        telIndex++;
        y = assetSection(doc, y,
          `  EQUIPO DE TELEFONÍA — LÍNEA TELEFÓNICA${telItems > 1 ? ` (${telIndex})` : ''}`,
          [
            ['Núm. Marcación', ln.specs?.lineNumber, 'Operadora',    ln.specs?.carrier],
            ['Correo Gmail', ln.specs?.gmailAccount, 'Costo del Plan', ln.specs?.planCost],
            ['Razón Social', ln.specs?.businessName, 'Contrato',      ln.specs?.contractNumber],
          ],
          null,
          ACCENT
        );
      });
    }

    // ── ACCESORIOS PERIFÉRICOS ────────────────────────────────────────────────
    // La altura de cada fila (par de columnas) se mide en vez de asumir 16pt
    // fijos — un accesorio con marca/modelo largo envolvía a una segunda
    // línea que se encimaba con la fila de abajo (bug real, reportado por el
    // usuario: "la información está sobrepuesta uno con el otro").
    if (hasAcc) {
      y = sectionBand(doc, y, '  ACCESORIOS ENTREGADOS', ACCENT);

      const TYPE_LABEL = {
        monitor: 'Monitor', mouse: 'Mouse', teclado: 'Teclado',
        cargador_laptop: 'Cargador Laptop', cargador_celular: 'Cargador Celular',
        kit_perifericos: 'Kit Teclado+Mouse', audifonos: 'Audífonos', webcam: 'Webcam',
        hub_usb: 'Hub USB', impresora: 'Impresora', escaner: 'Escáner', cable: 'Cable',
        consumible: 'Consumible', herramienta: 'Herramienta', disco_duro: 'Disco Duro / SSD',
        adaptador: 'Adaptador', base_laptop: 'Base para Laptop',
        accesorio: 'Accesorio', otro: 'Otro',
        // Nunca debería llegar aquí (linea_telefonica ya sale por
        // EQUIPO DE TELEFONÍA, ver arriba) — solo por si acaso, para no
        // imprimir el string crudo del tipo si algún día cambia el filtro.
        linea_telefonica: 'Línea Telefónica',
      };
      const half = CW / 2;
      const colW = half - 20;
      const accText = (acc) => ({
        label: `${TYPE_LABEL[acc.type] || acc.type}: ${acc.brand} ${acc.model}`.trim(),
        sub: acc.serialNumber ? `Serie: ${acc.serialNumber}` : (acc.inventoryTag ? `Inv: ${acc.inventoryTag}` : ''),
      });

      for (let i = 0; i < periph.length; i += 2) {
        const pair = [periph[i], periph[i + 1]].filter(Boolean);
        const rowH = Math.max(16, ...pair.map((acc) => {
          const { label, sub } = accText(acc);
          const labelH = doc.heightOfString(label, { width: colW, fontSize: 7 });
          const subH = sub ? doc.heightOfString(sub, { width: colW, fontSize: 6 }) + 2 : 0;
          return labelH + subH + 7;
        }));
        y = guard(doc, y, rowH);
        if ((i / 2) % 2 === 0) doc.save().rect(MARGIN, y, CW, rowH).fill(BG_STRIPE).restore();

        pair.forEach((acc, col) => {
          const x = MARGIN + col * half;
          const { label, sub } = accText(acc);
          doc.save().rect(x + 4, y + 4, 7, 7).stroke(ACCENT).restore();
          doc.save().fillColor(ACCENT).rect(x + 5.5, y + 5.5, 4, 4).fill().restore();
          doc.fillColor(DARK).font('Helvetica').fontSize(7).text(label, x + 16, y + 3, { width: colW });
          if (sub) {
            const labelH = doc.heightOfString(label, { width: colW, fontSize: 7 });
            doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6).text(sub, x + 16, y + 3 + labelH + 1, { width: colW });
          }
        });
        y += rowH;
      }
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
