const router = require('express').Router();
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const GmailAccount = require('../models/GmailAccount');
const Employee = require('../models/Employee');
const Asset = require('../models/Asset');
const Assignment = require('../models/Assignment');
const AccountRequest = require('../models/AccountRequest');
const ResponsivaArchive = require('../models/ResponsivaArchive');
const auth = require('../middleware/auth');
const gmailManagerOnly = require('../middleware/gmailManagerOnly');
const logAction = require('../utils/audit');
const { encryptPassword, decryptPassword, generatePassword, suggestEmail } = require('../utils/gmailVault');
const { createGmailAccount } = require('../utils/createAccount');
const {
  getEmpresaConfig, LOGOS_DIR, MARKETPLACE_OPTIONS, GERENTE_SISTEMAS_EMAIL,
  MARGIN, PAGE_W, CW, DARK, GRAY_LT, BORDER,
  guard, hline, sectionBand, blendWithWhite, kvRow, clauseBlock,
} = require('../utils/pdfBranding');

router.use(auth, gmailManagerOnly);

// Dibuja la "Solicitud y Carta Responsiva de Cuenta de Acceso a Plataformas
// Digitales" para una cuenta Gmail y regresa el PDF ya armado como Buffer.
// Se usa tanto al generarla la primera vez (GET /:id/responsiva) como al
// regenerarla automáticamente si la cuenta se edita después (PUT /:id) —
// misma función, mismo resultado, para que ambas siempre coincidan.
async function renderGmailResponsivaPdf(account, employee, requestData) {
  const sistemasSigner = await Employee.findOne({ corporateEmails: GERENTE_SISTEMAS_EMAIL }).select('name');
  const sistemasSignerName = sistemasSigner?.name || null;
  const company = employee.businessName || 'SELECT SHOP MB, S.A DE C.V.';
  const { color: ACCENT, logo: logoFile } = getEmpresaConfig(company);
  const logoPath = path.join(LOGOS_DIR, logoFile);
  const hasLogo = fs.existsSync(logoPath);

  // El teléfono casi nunca está en Employee.phone (capturado a mano); lo real
  // es el número de línea del celular que la empresa le asignó al empleado.
  const phoneAssignments = await Assignment.find({ employee: employee._id, active: true }).populate('asset');
  const assignedPhone = phoneAssignments
    .map((a) => a.asset)
    .find((asset) => asset?.type === 'celular' && asset.specs?.lineNumber);
  const phoneDisplay = assignedPhone?.specs?.lineNumber || employee.phone || null;

  const dateStr = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  const folio = `GML-${account._id.toString().slice(-6).toUpperCase()}`;

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    autoFirstPage: true,
    bufferPages: true,
  });

  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let y = MARGIN;

    // ── HEADER ──────────────────────────────────────────────────────────────
    if (hasLogo) {
      try { doc.image(logoPath, MARGIN, y, { fit: [100, 40] }); } catch (_) {}
    }

    doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(11)
       .text(
         'SOLICITUD Y CARTA RESPONSIVA DE CUENTA DE ACCESO A PLATAFORMAS DIGITALES',
         MARGIN + (hasLogo ? 110 : 0), y + 2,
         { width: CW - (hasLogo ? 230 : 130), align: 'center' }
       );

    doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6.5)
       .text(`Folio: ${folio}`, PAGE_W - MARGIN - 130, y, { width: 130, align: 'right', lineBreak: false });
    doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6.5)
       .text(`Fecha: ${dateStr}`, PAGE_W - MARGIN - 130, y + 10, { width: 130, align: 'right', lineBreak: false });

    y += 46;
    doc.fillColor(DARK).font('Helvetica').fontSize(7.5)
       .text('Área de Sistemas IT & Business Intelligence', MARGIN, y, { width: CW, align: 'center', lineBreak: false });
    y += 11;
    doc.fillColor(DARK).font('Helvetica').fontSize(8.5)
       .text(company, MARGIN, y, { width: CW, align: 'center', lineBreak: false });

    y += 13;
    doc.save().rect(MARGIN, y, CW, 2.5).fill(ACCENT).restore();
    y += 8;

    // ── 1. DATOS DEL USUARIO SOLICITANTE ────────────────────────────────────
    y = sectionBand(doc, y, '  1. DATOS DEL USUARIO SOLICITANTE', ACCENT);
    y = kvRow(doc, y,
      { label: 'Nombre completo', value: employee.name },
      { label: 'Puesto', value: employee.position });
    y = kvRow(doc, y,
      { label: 'Área / Departamento', value: [employee.area, employee.department].filter(Boolean).join(' / ') },
      { label: 'Jefe directo', value: requestData.directManager || null });
    y = kvRow(doc, y,
      { label: 'Correo corporativo', value: employee.corporateEmails?.join(', ') },
      { label: 'Teléfono / Ext.', value: phoneDisplay });
    y += 5;

    // ── 2. DATOS DE LA CUENTA SOLICITADA ────────────────────────────────────
    y = sectionBand(doc, y, '  2. DATOS DE LA CUENTA SOLICITADA', ACCENT);

    y = guard(doc, y, 20);
    doc.fillColor(GRAY_LT).font('Helvetica-Bold').fontSize(5.8)
       .text('PLATAFORMAS', MARGIN + 3, y + 3, { width: 72, lineBreak: false });
    const checkLine = [...MARKETPLACE_OPTIONS, 'Otra'].map((opt) => {
      if (opt === 'Otra') {
        return requestData.platformOther ? `[X] Otra: ${requestData.platformOther}` : '[ ] Otra';
      }
      return `${(requestData.platforms || []).includes(opt) ? '[X]' : '[ ]'} ${opt}`;
    }).join('    ');
    doc.fillColor(DARK).font('Helvetica').fontSize(7)
       .text(checkLine, MARGIN + 78, y + 2, { width: CW - 82 });
    y += 15;
    hline(doc, y, '#f0f0f0', 0.3);

    y = kvRow(doc, y,
      { label: 'Tienda / Cuenta / Seller', value: requestData.store || null },
      { label: 'Rol o tipo de acceso', value: requestData.accessRole || null });
    y = kvRow(doc, y,
      { label: 'Correo asociado a la cuenta', value: account.email },
      { label: 'Vigencia del acceso', value: requestData.accessValidity || null });
    y = kvRow(doc, y,
      { label: 'Justificación / Funciones', value: account.notes || null });
    y += 8;

    // ── 3. OBLIGACIONES Y RESPONSABILIDADES ─────────────────────────────────
    y = sectionBand(doc, y, '  3. OBLIGACIONES Y RESPONSABILIDADES DEL USUARIO', ACCENT);

    const intro = 'El usuario que firma la presente declara haber leído y aceptado las siguientes condiciones de uso de la cuenta, correo electrónico y credenciales que le son asignados:';
    let clauseIdx = 0;
    y = clauseBlock(doc, y, clauseIdx++, intro);

    const obligations = [
      'La cuenta, usuario y/o correo electrónico asignados son propiedad de la empresa y se otorgan únicamente para el desempeño de las funciones laborales del usuario. Queda prohibido su uso para fines personales o ajenos a la operación.',
      'Las credenciales de acceso (usuario, contraseña, códigos de verificación) son personales e intransferibles. El usuario se compromete a no compartirlas, prestarlas ni divulgarlas a terceros, incluyendo compañeros de trabajo, salvo autorización expresa y por escrito del área de Sistemas.',
      'El usuario es responsable de todas las acciones, publicaciones, modificaciones de catálogo, respuestas a clientes, transacciones y movimientos realizados desde su cuenta o sesión, por lo que deberá cerrar sesión al terminar de utilizarla y no dejar equipos desatendidos con la sesión abierta.',
      'El usuario se obliga a guardar estricta confidencialidad sobre la información a la que tenga acceso a través de la plataforma (datos de clientes, ventas, precios, estrategias comerciales, reportes), absteniéndose de extraerla, copiarla o difundirla sin autorización.',
      'Cualquier incidente de seguridad (acceso no autorizado, pérdida de credenciales, actividad sospechosa, bloqueo de cuenta) deberá reportarse de inmediato al área de Sistemas y al jefe directo.',
      'Queda prohibido modificar la configuración de la cuenta, correos de recuperación, teléfonos asociados, métodos de pago o permisos de otros colaboradores sin autorización del área de Sistemas.',
      'En caso de baja, cambio de puesto o término de la necesidad operativa, el usuario deberá notificar y entregar el acceso, quedando el área de Sistemas facultada para revocarlo, y se abstendrá de conservar credenciales o sesiones activas.',
      'El incumplimiento de las presentes obligaciones podrá derivar en la revocación inmediata del acceso y en las medidas disciplinarias, administrativas o legales que correspondan conforme al Reglamento Interior de Trabajo, la Ley Federal del Trabajo y demás disposiciones aplicables.',
    ];
    obligations.forEach((text) => { y = clauseBlock(doc, y, clauseIdx++, `•  ${text}`); });

    const closing = 'Con la firma del presente documento, el usuario acepta la responsabilidad sobre el uso correcto de la cuenta y del correo electrónico asignados; el jefe directo autoriza la solicitud y valida que el acceso es necesario para las funciones del puesto; y el área de Sistemas registra y otorga el acceso conforme a lo aquí descrito.';
    y = clauseBlock(doc, y, clauseIdx++, closing);
    y += 8;

    // ── 4. AUTORIZACIÓN Y FIRMAS ─────────────────────────────────────────────
    y = guard(doc, y, 100);
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8)
       .text('4. AUTORIZACIÓN Y FIRMAS', MARGIN, y, { width: CW, align: 'center', lineBreak: false });
    y += 14;

    const sigW = (CW - 20) / 3;
    const sigH = 72;
    const sigLabels = ['USUARIO RESPONSABLE', 'JEFE DIRECTO', 'SISTEMAS'];
    const sigSub = ['Acepta y firma', 'Autoriza', 'Otorga acceso'];
    const sigNames = [employee.name, requestData.directManager || null, sistemasSignerName];

    sigLabels.forEach((lbl, i) => {
      const x = MARGIN + i * (sigW + 10);
      doc.save().rect(x, y, sigW, sigH).stroke(BORDER).restore();
      doc.save().rect(x, y, sigW, 14).fill(blendWithWhite(ACCENT, 0.1)).restore();
      doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(7)
         .text(lbl, x, y + 4, { width: sigW, align: 'center', lineBreak: false });
      if (sigNames[i]) {
        doc.fillColor(DARK).font('Helvetica').fontSize(7)
           .text(sigNames[i], x, y + sigH - 36, { width: sigW, align: 'center', lineBreak: false });
      }
      doc.save().strokeColor(BORDER).lineWidth(0.7)
         .moveTo(x + 8, y + sigH - 22).lineTo(x + sigW - 8, y + sigH - 22).stroke().restore();
      doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6.5)
         .text('Nombre, fecha y firma', x, y + sigH - 18, { width: sigW, align: 'center', lineBreak: false });
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(7)
         .text(sigSub[i], x, y + sigH - 8, { width: sigW, align: 'center', lineBreak: false });
    });

    y += sigH + 8;
    doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6)
       .text('Uso interno — Sistemas IT & Business Intelligence · Select Shop MB. Conservar el original firmado en el expediente del usuario.',
             MARGIN, y, { width: CW, lineBreak: false });

    doc.end();
  });
}

// Regenera (si existen y aún no han sido firmadas/subidas) las responsivas ya
// archivadas de esta cuenta para que su PDF coincida con los datos actuales —
// pedido explícito: "si el gmail se modificó, también la responsiva". Las que
// ya tienen una copia firmada subida NUNCA se tocan (no se reescribe un
// documento que ya se firmó en papel).
async function resyncGmailResponsivas(account) {
  const pending = await ResponsivaArchive.find({
    type: 'cuenta_gmail',
    sourceId: account._id,
    signedFileData: { $exists: false },
  });
  if (pending.length === 0) return;

  for (const archive of pending) {
    try {
      const employee = await Employee.findById(archive.employee);
      if (!employee) continue;
      const pdfBuffer = await renderGmailResponsivaPdf(account, employee, archive.requestData || {});
      archive.pdfData = pdfBuffer;
      archive.relatedLabel = `Gmail — ${account.email}`;
      await archive.save();
    } catch (err) {
      console.error('Error resincronizando responsiva Gmail:', err);
    }
  }
}

router.get('/', async (req, res) => {
  try {
    const accounts = await GmailAccount.find()
      .populate('employee', 'employeeId name businessName office department active')
      .sort({ createdAt: -1 });

    const data = accounts.map((a) => {
      const obj = a.toObject();
      delete obj.passwordEncrypted;
      obj.password = decryptPassword(a.passwordEncrypted);
      return obj;
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Si esta cuenta se creó al aprobar una Solicitud pública (ver
// accountRequests.js), regresa lo que esa persona ya puso (jefe directo,
// vigencia) para precargar el modal de la Responsiva en vez de partir en
// blanco — sigue siendo editable, no se guarda nada nuevo aquí.
router.get('/:id/request-defaults', async (req, res) => {
  try {
    const source = await AccountRequest.findOne({
      createdAccountId: req.params.id, requestType: 'gmail', status: 'aprobada',
    });
    if (!source) return res.json({});
    res.json({
      directManager: source.directManager || '',
      accessValidity: source.validity || '',
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Genera en PDF la "Solicitud y Carta Responsiva de Cuenta de Acceso a
// Plataformas Digitales" para una cuenta Gmail usada para entrar a marketplaces
// (Mercado Libre, Amazon, etc.) — a diferencia de Cuentas de Plataformas, aquí
// una sola cuenta puede dar acceso a VARIAS plataformas a la vez, así que el
// checklist es de selección múltiple. Nunca incluye la contraseña.
router.get('/:id/responsiva', async (req, res) => {
  try {
    const account = await GmailAccount.findById(req.params.id).populate('employee');
    if (!account) return res.status(404).json({ message: 'Cuenta no encontrada' });
    if (!account.employee) return res.status(400).json({ message: 'Esta cuenta no tiene un empleado asignado; asígnala antes de generar la solicitud.' });

    const employee = account.employee;
    // Datos de la solicitud puntual: nunca se guardan — cada responsiva es para
    // una persona/tienda/combinación de plataformas distinta, así que el
    // formulario siempre debe partir en blanco.
    const selectedPlatforms = (req.query.platforms || '')
      .split(',').map((p) => p.trim()).filter(Boolean);
    const requestData = {
      platforms: selectedPlatforms,
      platformOther: (req.query.platformOther || '').trim(),
      store: (req.query.store || '').trim(),
      directManager: (req.query.directManager || '').trim(),
      accessRole: (req.query.accessRole || '').trim(),
      accessValidity: (req.query.accessValidity || '').trim(),
    };
    const safeName = (employee.name || 'empleado').replace(/[^a-zA-Z0-9\- ]/g, '_').replace(/\s+/g, '_');
    const fileName = `Responsiva_Cuenta_Gmail_${employee.employeeId}_${safeName}.pdf`;

    const pdfBuffer = await renderGmailResponsivaPdf(account, employee, requestData);

    try {
      await ResponsivaArchive.create({
        type: 'cuenta_gmail',
        sourceId: account._id,
        employee: employee._id,
        employeeName: employee.name,
        employeeIdNum: employee.employeeId,
        relatedLabel: `Gmail — ${account.email}`,
        fileName,
        pdfData: pdfBuffer,
        requestData,
        generatedByName: req.user.name,
        generatedBy: req.user.id,
      });
    } catch (err) {
      console.error('Error archivando responsiva:', err);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.end(pdfBuffer);
  } catch (err) {
    console.error('Error generando responsiva de cuenta Gmail:', err);
    if (!res.headersSent) res.status(500).json({ message: 'Error al generar la solicitud' });
  }
});

// Correos ya usados en otras partes del sistema (Employee.gmailAccounts[] o el
// campo Gmail de un celular/tablet) que todavía no tienen contraseña guardada
// en el gestor. No modifica Employee ni Asset — solo detecta qué falta copiar.
router.get('/unregistered', async (req, res) => {
  try {
    const registeredEmails = new Set(
      (await GmailAccount.find().distinct('email')).map((e) => e.toLowerCase().trim())
    );
    const pendingByEmail = new Map();

    // 1) Correos ya cargados en Employee.gmailAccounts[] (alta de empleado)
    const employees = await Employee.find({ gmailAccounts: { $exists: true, $ne: [] } })
      .select('employeeId name businessName office department gmailAccounts');
    employees.forEach((emp) => {
      (emp.gmailAccounts || []).forEach((raw) => {
        const email = (raw || '').trim().toLowerCase();
        if (email && !registeredEmails.has(email) && !pendingByEmail.has(email)) {
          pendingByEmail.set(email, {
            email,
            employee: {
              _id: emp._id,
              employeeId: emp.employeeId,
              name: emp.name,
              businessName: emp.businessName,
              office: emp.office,
              department: emp.department,
            },
          });
        }
      });
    });

    // 2) Correos capturados en el campo Gmail de celulares/tablets (specs.gmailAccount),
    // usando el empleado con la asignación activa de ese equipo.
    const phones = await Asset.find({
      type: { $in: ['celular', 'tablet'] },
      'specs.gmailAccount': { $exists: true, $ne: '' },
    }).select('specs.gmailAccount');

    if (phones.length > 0) {
      const assignments = await Assignment.find({ asset: { $in: phones.map((p) => p._id) }, active: true })
        .populate('employee', 'employeeId name businessName office department');
      const assignmentByAsset = new Map(assignments.map((a) => [String(a.asset), a]));

      phones.forEach((p) => {
        const email = (p.specs?.gmailAccount || '').trim().toLowerCase();
        if (!email || registeredEmails.has(email) || pendingByEmail.has(email)) return;
        const assign = assignmentByAsset.get(String(p._id));
        if (!assign?.employee) return; // sin empleado asignado hoy: no hay a quién ligarla todavía
        pendingByEmail.set(email, {
          email,
          employee: {
            _id: assign.employee._id,
            employeeId: assign.employee.employeeId,
            name: assign.employee.name,
            businessName: assign.employee.businessName,
            office: assign.employee.office,
            department: assign.employee.department,
          },
        });
      });
    }

    res.json([...pendingByEmail.values()]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/suggest-email', async (req, res) => {
  try {
    const employee = await Employee.findById(req.query.employeeId);
    if (!employee) return res.status(404).json({ message: 'Empleado no encontrado' });
    const existing = await GmailAccount.find().distinct('email');
    res.json({ email: suggestEmail(employee.name, existing) });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { employeeId, email, notes } = req.body;
    if (!employeeId) return res.status(400).json({ message: 'Selecciona un empleado' });

    const employee = await Employee.findById(employeeId);
    if (!employee) return res.status(404).json({ message: 'Empleado no encontrado' });

    const { account, plainPassword } = await createGmailAccount(employee, { email, notes }, req.user);

    const result = account.toObject();
    delete result.passwordEncrypted;
    result.password = plainPassword;
    result.employee = { _id: employee._id, employeeId: employee.employeeId, name: employee.name, businessName: employee.businessName, office: employee.office, department: employee.department };
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
});

// Da de alta en el gestor una cuenta que ya existía en Employee.gmailAccounts[]
// (creada antes de este módulo) capturando la contraseña real que ya tiene en Gmail.
router.post('/import', async (req, res) => {
  try {
    const { employeeId, email, password, notes } = req.body;
    if (!employeeId) return res.status(400).json({ message: 'Selecciona un empleado' });
    if (!password) return res.status(400).json({ message: 'Captura la contraseña actual de la cuenta' });

    const employee = await Employee.findById(employeeId);
    if (!employee) return res.status(404).json({ message: 'Empleado no encontrado' });

    const finalEmail = (email || '').trim().toLowerCase();
    if (!finalEmail.endsWith('@gmail.com')) {
      return res.status(400).json({ message: 'El correo debe terminar en @gmail.com' });
    }

    const dup = await GmailAccount.findOne({ email: finalEmail });
    if (dup) return res.status(400).json({ message: 'Ese correo ya está registrado en el gestor' });

    const account = await GmailAccount.create({
      employee: employee._id,
      email: finalEmail,
      passwordEncrypted: encryptPassword(password),
      notes: notes || '',
      createdByName: req.user.name,
    });

    if (!employee.gmailAccounts.includes(finalEmail)) {
      employee.gmailAccounts.push(finalEmail);
      await employee.save();
    }

    logAction(req.user, 'crear', 'cuenta_gmail', account._id, finalEmail, `Registró contraseña de cuenta Gmail existente de ${employee.name}`);

    const result = account.toObject();
    delete result.passwordEncrypted;
    result.password = password;
    result.employee = { _id: employee._id, employeeId: employee.employeeId, name: employee.name, businessName: employee.businessName, office: employee.office, department: employee.department };
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const account = await GmailAccount.findById(req.params.id);
    if (!account) return res.status(404).json({ message: 'Cuenta no encontrada' });

    const { notes, status, regeneratePassword, manualPassword, email } = req.body;
    if (notes !== undefined) account.notes = notes;
    if (status !== undefined) account.status = status;

    // Corregir el correo (ej. un typo al capturarlo) — mantiene sincronizado
    // Employee.gmailAccounts[], igual que al crear/eliminar la cuenta.
    let previousEmail;
    if (email !== undefined) {
      const finalEmail = email.trim().toLowerCase();
      if (!finalEmail) return res.status(400).json({ message: 'El correo no puede quedar vacío' });
      if (!finalEmail.endsWith('@gmail.com')) return res.status(400).json({ message: 'El correo debe terminar en @gmail.com' });
      if (finalEmail !== account.email) {
        const dup = await GmailAccount.findOne({ email: finalEmail, _id: { $ne: account._id } });
        if (dup) return res.status(400).json({ message: 'Ya existe una cuenta con ese correo' });
        previousEmail = account.email;
        account.email = finalEmail;
      }
    }

    let plainPassword;
    if (regeneratePassword) {
      plainPassword = generatePassword();
      account.passwordEncrypted = encryptPassword(plainPassword);
    } else if (manualPassword) {
      if (account.passwordManuallySet) {
        return res.status(400).json({ message: 'Ya se corrigió la contraseña manualmente una vez; usa "Regenerar" para cambios futuros.' });
      }
      plainPassword = manualPassword;
      account.passwordEncrypted = encryptPassword(manualPassword);
      account.passwordManuallySet = true;
    }

    await account.save();

    if (previousEmail) {
      const employee = await Employee.findById(account.employee);
      if (employee) {
        const idx = employee.gmailAccounts.indexOf(previousEmail);
        if (idx !== -1) employee.gmailAccounts[idx] = account.email;
        else if (!employee.gmailAccounts.includes(account.email)) employee.gmailAccounts.push(account.email);
        await employee.save();
      }
    }

    logAction(
      req.user, 'editar', 'cuenta_gmail', account._id, account.email,
      previousEmail ? `Corrigió el correo de la cuenta Gmail de ${previousEmail} a ${account.email}`
        : manualPassword ? 'Corrigió manualmente la contraseña de la cuenta Gmail (única vez)'
        : regeneratePassword ? 'Regeneró la contraseña de la cuenta Gmail' : 'Editó datos de la cuenta Gmail'
    );

    // Si esta cuenta ya tiene responsiva(s) archivada(s) y aún no se firmó/subió
    // la copia firmada, se regeneran para que coincidan con la edición.
    await resyncGmailResponsivas(account);

    const result = account.toObject();
    delete result.passwordEncrypted;
    if (plainPassword) result.password = plainPassword;
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const account = await GmailAccount.findByIdAndDelete(req.params.id);
    if (!account) return res.status(404).json({ message: 'Cuenta no encontrada' });

    await Employee.updateOne({ _id: account.employee }, { $pull: { gmailAccounts: account.email } });

    logAction(req.user, 'eliminar', 'cuenta_gmail', account._id, account.email, 'Eliminó cuenta Gmail');
    res.json({ message: 'Cuenta eliminada' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
