const router = require('express').Router();
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const PlatformAccountErp = require('../models/PlatformAccountErp');
const Employee = require('../models/Employee');
const GmailAccount = require('../models/GmailAccount');
const AccountRequest = require('../models/AccountRequest');
const auth = require('../middleware/auth');
const platformErpManagerOnly = require('../middleware/platformErpManagerOnly');
const logAction = require('../utils/audit');
const { encryptPassword, decryptPassword, generatePassword } = require('../utils/gmailVault');
const { createPlatformErpAccount } = require('../utils/createAccount');
const {
  getEmpresaConfig, LOGOS_DIR, GERENTE_SISTEMAS_EMAIL,
  MARGIN, PAGE_W, CW, DARK, GRAY_LT, BORDER,
  guard, hline, sectionBand, blendWithWhite, kvRow, clauseBlock,
} = require('../utils/pdfBranding');
const { archiveAndRespond } = require('../utils/archiveResponsiva');

// Solo para la Responsiva de ERP — es un formato distinto al de Cuentas de
// Plataformas/Gmail (módulos de un sistema ERP, no marketplaces).
const MODULE_OPTIONS = [
  'Ventas', 'Compras', 'Inventarios / Almacén', 'Facturación', 'CxC', 'CxP',
  'Finanzas / Contabilidad', 'Bancos / Tesorería', 'Nómina / RH', 'Reportes / BI',
];
const ACCESS_LEVEL_OPTIONS = [
  'Consulta (solo lectura)', 'Captura / Operación', 'Autorización / Supervisión', 'Administrador del sistema',
];
const REQUEST_TYPE_OPTIONS = ['Alta', 'Modificación', 'Baja'];

router.use(auth, platformErpManagerOnly);

const ACTION_LABELS = { alta: 'Alta', modificacion: 'Modificación', baja: 'Baja' };

// Si esta cuenta se creó al aprobar una Solicitud pública (ver
// accountRequests.js), regresa lo que esa persona ya puso (empresas del
// grupo, jefe directo, módulos, nivel de acceso, vigencia, uso en
// plataformas) para precargar el modal de la Responsiva en vez de partir en
// blanco — sigue siendo editable, no se guarda nada nuevo aquí.
router.get('/:id/request-defaults', async (req, res) => {
  try {
    const account = await PlatformAccountErp.findById(req.params.id);
    if (!account) return res.status(404).json({ message: 'Cuenta no encontrada' });
    const source = await AccountRequest.findOne({
      createdAccountId: account._id, requestType: 'platform_erp', status: 'aprobada',
    });
    if (!source) return res.json({});
    res.json({
      requestType: ACTION_LABELS[source.actionType] || 'Alta',
      groupCompanies: source.erpGroupCompanies || '',
      directManager: source.directManager || '',
      modules: source.erpModules || [],
      moduleOther: source.erpModuleOther || '',
      accessLevel: source.erpAccessLevel || '',
      accessValidity: source.validity || '',
      referenceProfile: source.referenceProfile || '',
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const accounts = await PlatformAccountErp.find()
      .populate('employee', 'employeeId name businessName office department active')
      .sort({ createdAt: -1 });

    const data = accounts.map((a) => {
      const obj = a.toObject();
      delete obj.passwordEncrypted;
      obj.password = a.passwordPending ? null : decryptPassword(a.passwordEncrypted);
      return obj;
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Muchas cuentas ERP que ya existen usan la MISMA contraseña que la cuenta
// Gmail del empleado (algunas incluso son "iniciar sesión con Google"). Este
// endpoint permite auto-rellenarla al dar de alta sin exigir el permiso
// canManageGmailAccounts — un usuario de ERP no tiene por qué ver el resto de
// Cuentas Gmail, solo la contraseña puntual de la cuenta de este empleado.
router.get('/gmail-lookup', async (req, res) => {
  try {
    const { employeeId } = req.query;
    if (!employeeId) return res.status(400).json({ message: 'Falta el empleado' });
    const accounts = await GmailAccount.find({ employee: employeeId });
    const data = accounts.map((a) => ({
      _id: a._id,
      email: a.email,
      password: decryptPassword(a.passwordEncrypted),
    }));
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Genera en PDF la "Solicitud y Carta Responsiva de Acceso al Sistema ERP",
// basada en la plantilla Responsiva_Acceso_ERP.docx del usuario — es un
// formato distinto al de marketplaces (módulos del ERP, nivel de acceso
// estructurado, tipo de solicitud). Nunca incluye la contraseña.
router.get('/:id/responsiva', async (req, res) => {
  try {
    const account = await PlatformAccountErp.findById(req.params.id).populate('employee');
    if (!account) return res.status(404).json({ message: 'Cuenta no encontrada' });
    if (!account.employee) return res.status(400).json({ message: 'Esta cuenta no tiene un empleado asignado; asígnala antes de generar la solicitud.' });

    const employee = account.employee;
    // Datos de la solicitud puntual: nunca se guardan — cada responsiva es para
    // una persona/acceso distinto, así que el formulario siempre parte en blanco.
    const requestData = {
      requestType: (req.query.requestType || '').trim(),
      groupCompanies: (req.query.groupCompanies || '').trim(),
      directManager: (req.query.directManager || '').trim(),
      modules: (req.query.modules || '').split(',').map((m) => m.trim()).filter(Boolean),
      moduleOther: (req.query.moduleOther || '').trim(),
      accessLevel: (req.query.accessLevel || '').trim(),
      accessValidity: (req.query.accessValidity || '').trim(),
      referenceProfile: (req.query.referenceProfile || '').trim(),
    };
    const sistemasSigner = await Employee.findOne({ corporateEmails: GERENTE_SISTEMAS_EMAIL }).select('name');
    const sistemasSignerName = sistemasSigner?.name || null;
    const company = employee.businessName || 'SELECT SHOP MB, S.A DE C.V.';
    const { color: ACCENT, logo: logoFile } = getEmpresaConfig(company);
    const logoPath = path.join(LOGOS_DIR, logoFile);
    const hasLogo = fs.existsSync(logoPath);

    const dateStr = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
    const safeName = (employee.name || 'empleado').replace(/[^a-zA-Z0-9\- ]/g, '_').replace(/\s+/g, '_');
    const folio = `ERP-${account._id.toString().slice(-6).toUpperCase()}`;

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      autoFirstPage: true,
      bufferPages: true,
    });

    archiveAndRespond(doc, res, {
      type: 'cuenta_plataforma_erp',
      employee: employee._id,
      employeeName: employee.name,
      employeeIdNum: employee.employeeId,
      relatedLabel: `${account.platform} — ${account.username}`,
      fileName: `Responsiva_Acceso_ERP_${employee.employeeId}_${safeName}.pdf`,
      generatedByName: req.user.name,
      generatedBy: req.user.id,
    });

    let y = MARGIN;

    // ── HEADER ──────────────────────────────────────────────────────────────
    if (hasLogo) {
      try { doc.image(logoPath, MARGIN, y, { fit: [100, 40] }); } catch (_) {}
    }

    doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(11)
       .text(
         'SOLICITUD Y CARTA RESPONSIVA DE ACCESO AL SISTEMA ERP',
         MARGIN + (hasLogo ? 110 : 0), y + 2,
         { width: CW - (hasLogo ? 230 : 130), align: 'center' }
       );

    doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6.5)
       .text(`Folio: ${folio}`, PAGE_W - MARGIN - 130, y, { width: 130, align: 'right', lineBreak: false });
    doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6.5)
       .text(`Fecha de solicitud: ${dateStr}`, PAGE_W - MARGIN - 130, y + 10, { width: 130, align: 'right', lineBreak: false });
    doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6.5)
       .text(`Tipo de solicitud: ${requestData.requestType || '—'}`, PAGE_W - MARGIN - 130, y + 20, { width: 130, align: 'right', lineBreak: false });

    y += 56;
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
      { label: 'Empresa / Razón social', value: employee.businessName },
      { label: 'Correo corporativo', value: employee.corporateEmails?.join(', ') });
    y += 5;

    // ── 2. ACCESO SOLICITADO EN EL ERP ───────────────────────────────────────
    y = sectionBand(doc, y, '  2. ACCESO SOLICITADO EN EL ERP', ACCENT);
    y = kvRow(doc, y,
      { label: 'Sistema / ERP', value: account.platform },
      { label: 'Usuario asignado', value: account.username });
    y = kvRow(doc, y,
      { label: 'Empresa(s) del grupo con acceso', value: requestData.groupCompanies || null });

    // Módulos (selección múltiple) — el alto se mide porque con 10 opciones casi
    // siempre ocupa más de una línea.
    y = guard(doc, y, 24);
    doc.fillColor(GRAY_LT).font('Helvetica-Bold').fontSize(5.8)
       .text('MÓDULOS', MARGIN + 3, y + 3, { width: 72, lineBreak: false });
    const moduleCheckLine = [...MODULE_OPTIONS, 'Otro'].map((opt) => {
      if (opt === 'Otro') {
        return requestData.moduleOther ? `[X] Otro: ${requestData.moduleOther}` : '[ ] Otro';
      }
      return `${requestData.modules.includes(opt) ? '[X]' : '[ ]'} ${opt}`;
    }).join('    ');
    const moduleLineW = CW - 82;
    doc.fillColor(DARK).font('Helvetica').fontSize(7)
       .text(moduleCheckLine, MARGIN + 78, y + 2, { width: moduleLineW });
    y += Math.max(15, doc.heightOfString(moduleCheckLine, { width: moduleLineW, fontSize: 7 }) + 6);
    hline(doc, y, '#f0f0f0', 0.3);

    // Nivel de acceso (selección única)
    y = guard(doc, y, 24);
    doc.fillColor(GRAY_LT).font('Helvetica-Bold').fontSize(5.8)
       .text('NIVEL DE ACCESO', MARGIN + 3, y + 3, { width: 72, lineBreak: false });
    const accessLevelLine = ACCESS_LEVEL_OPTIONS.map((opt) =>
      `${requestData.accessLevel === opt ? '[X]' : '[ ]'} ${opt}`
    ).join('    ');
    const accessLevelLineW = CW - 82;
    doc.fillColor(DARK).font('Helvetica').fontSize(7)
       .text(accessLevelLine, MARGIN + 78, y + 2, { width: accessLevelLineW });
    y += Math.max(15, doc.heightOfString(accessLevelLine, { width: accessLevelLineW, fontSize: 7 }) + 6);
    hline(doc, y, '#f0f0f0', 0.3);

    y = kvRow(doc, y,
      { label: 'Vigencia del acceso', value: requestData.accessValidity || null },
      { label: 'Perfil de referencia', value: requestData.referenceProfile || null });
    y = kvRow(doc, y,
      { label: 'Justificación / Funciones', value: account.notes || null });
    y += 8;

    // ── 3. OBLIGACIONES Y RESPONSABILIDADES ─────────────────────────────────
    y = sectionBand(doc, y, '  3. OBLIGACIONES Y RESPONSABILIDADES DEL USUARIO', ACCENT);

    const intro = 'El usuario que firma la presente declara haber leído y aceptado las siguientes condiciones de uso del sistema ERP y de las credenciales que le son asignadas:';
    let clauseIdx = 0;
    y = clauseBlock(doc, y, clauseIdx++, intro);

    const obligations = [
      'El usuario y contraseña del ERP son personales e intransferibles. El usuario se compromete a no compartir, prestar ni divulgar sus credenciales a terceros, incluyendo compañeros de trabajo, salvo autorización expresa y por escrito del área de Sistemas.',
      'El acceso se otorga exclusivamente para el desempeño de las funciones del puesto y se limita a los módulos, empresas y nivel de permisos autorizados en el presente documento. Queda prohibido intentar acceder a módulos, empresas o información no autorizados.',
      'El usuario es responsable de todos los registros, capturas, modificaciones, cancelaciones, autorizaciones y movimientos realizados con su usuario, por lo que deberá verificar la exactitud de la información que registra y cerrar sesión al terminar de utilizar el sistema, sin dejar equipos desatendidos con la sesión abierta.',
      'La información contenida en el ERP (datos de clientes, proveedores, precios, costos, inventarios, información financiera, contable y fiscal) es propiedad de la empresa y de carácter estrictamente confidencial. El usuario se abstendrá de extraerla, copiarla, exportarla o difundirla fuera de los canales autorizados.',
      'Queda prohibido alterar, eliminar o cancelar registros con el propósito de ocultar información, distorsionar resultados o eludir controles internos, así como registrar operaciones inexistentes o con datos falsos.',
      'Cualquier incidente de seguridad (acceso no autorizado, pérdida u olvido de credenciales, actividad sospechosa en su usuario, errores relevantes de captura) deberá reportarse de inmediato al área de Sistemas y al jefe directo.',
      'Toda solicitud de cambio de permisos, módulos o nivel de acceso deberá tramitarse mediante un nuevo formato autorizado por el jefe directo; el área de Sistemas es la única facultada para modificar perfiles y permisos en el sistema.',
      'En caso de baja, cambio de puesto o término de la necesidad operativa, el acceso será revocado por el área de Sistemas, y el usuario se abstendrá de conservar credenciales, sesiones activas o información extraída del sistema.',
      'El incumplimiento de las presentes obligaciones podrá derivar en la revocación inmediata del acceso y en las medidas disciplinarias, administrativas o legales que correspondan conforme al Reglamento Interior de Trabajo, la Ley Federal del Trabajo y demás disposiciones aplicables.',
    ];
    obligations.forEach((text) => { y = clauseBlock(doc, y, clauseIdx++, `•  ${text}`); });

    const closing = 'Con la firma del presente documento, el usuario acepta la responsabilidad sobre el uso correcto de su acceso al ERP; el jefe directo autoriza la solicitud y valida que los módulos y el nivel de acceso son necesarios para las funciones del puesto; y el área de Sistemas registra y configura el acceso conforme a lo aquí descrito.';
    y = clauseBlock(doc, y, clauseIdx++, closing);
    y += 8;

    // ── 4. AUTORIZACIÓN Y FIRMAS ─────────────────────────────────────────────
    y = guard(doc, y, 100);
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8)
       .text('4. AUTORIZACIÓN Y FIRMAS', MARGIN, y, { width: CW, align: 'center', lineBreak: false });
    y += 14;

    const sigW = (CW - 20) / 3;
    const sigH = 72;
    const sigLabels = ['USUARIO RESPONSABLE', 'JEFE DIRECTO (AUTORIZA)', 'SISTEMAS (CONFIGURA ACCESO)'];
    const sigNames = [employee.name, requestData.directManager || null, sistemasSignerName];

    sigLabels.forEach((lbl, i) => {
      const x = MARGIN + i * (sigW + 10);
      doc.save().rect(x, y, sigW, sigH).stroke(BORDER).restore();
      doc.save().rect(x, y, sigW, 18).fill(blendWithWhite(ACCENT, 0.1)).restore();
      doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(6.3)
         .text(lbl, x + 2, y + 5, { width: sigW - 4, align: 'center', lineBreak: false });
      if (sigNames[i]) {
        doc.fillColor(DARK).font('Helvetica').fontSize(7)
           .text(sigNames[i], x, y + sigH - 40, { width: sigW, align: 'center', lineBreak: false });
      }
      doc.save().strokeColor(BORDER).lineWidth(0.7)
         .moveTo(x + 8, y + sigH - 26).lineTo(x + sigW - 8, y + sigH - 26).stroke().restore();
      doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6.5)
         .text('Nombre y firma', x, y + sigH - 22, { width: sigW, align: 'center', lineBreak: false });
      doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6.5)
         .text('Fecha: ____ / ____ / ______', x, y + sigH - 10, { width: sigW, align: 'center', lineBreak: false });
    });

    y += sigH + 8;
    doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6)
       .text('Uso interno — Sistemas IT & Business Intelligence · Select Shop MB. Conservar el original firmado en el expediente del usuario.',
             MARGIN, y, { width: CW, lineBreak: false });

    doc.end();
  } catch (err) {
    console.error('Error generando responsiva de acceso ERP:', err);
    if (!res.headersSent) res.status(500).json({ message: 'Error al generar la solicitud' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { employeeId, platform, username, notes } = req.body;
    if (!employeeId) return res.status(400).json({ message: 'Selecciona un empleado' });

    const employee = await Employee.findById(employeeId);
    if (!employee) return res.status(404).json({ message: 'Empleado no encontrado' });

    const { account, plainPassword } = await createPlatformErpAccount(employee, { platform, username, notes }, req.user);

    const result = account.toObject();
    delete result.passwordEncrypted;
    result.password = plainPassword;
    result.employee = { _id: employee._id, employeeId: employee.employeeId, name: employee.name, businessName: employee.businessName, office: employee.office, department: employee.department };
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
});

// Da de alta una cuenta que ya existía fuera del gestor (ej. se creó manualmente
// antes de tener esta página) capturando la contraseña real que ya tiene.
router.post('/import', async (req, res) => {
  try {
    const { employeeId, platform, username, password, notes } = req.body;
    if (!employeeId) return res.status(400).json({ message: 'Selecciona un empleado' });
    if (!platform?.trim()) return res.status(400).json({ message: 'Indica la plataforma' });
    if (!username?.trim()) return res.status(400).json({ message: 'Indica el correo o usuario de la cuenta' });
    if (!password) return res.status(400).json({ message: 'Captura la contraseña actual de la cuenta' });

    const employee = await Employee.findById(employeeId);
    if (!employee) return res.status(404).json({ message: 'Empleado no encontrado' });

    const finalPlatform = platform.trim();
    const finalUsername = username.trim().toLowerCase();

    const dup = await PlatformAccountErp.findOne({ platform: finalPlatform, username: finalUsername });
    if (dup) return res.status(400).json({ message: 'Ya existe una cuenta con ese usuario en esa plataforma' });

    const account = await PlatformAccountErp.create({
      employee: employee._id,
      platform: finalPlatform,
      username: finalUsername,
      passwordEncrypted: encryptPassword(password),
      notes: notes || '',
      createdByName: req.user.name,
    });

    logAction(req.user, 'crear', 'cuenta_plataforma_erp', account._id, `${finalPlatform}: ${finalUsername}`, `Registró contraseña de cuenta ERP existente de ${finalPlatform} para ${employee.name}`);

    const result = account.toObject();
    delete result.passwordEncrypted;
    result.password = password;
    result.employee = { _id: employee._id, employeeId: employee.employeeId, name: employee.name, businessName: employee.businessName, office: employee.office, department: employee.department };
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Alta masiva de cuentas que ya existían en el ERP (importadas desde Excel):
// se registra el empleado y el correo/usuario, pero SIN contraseña — nunca se
// inventa una para una cuenta real que ya existe. Queda marcada "pendiente" y
// se completa después, una por una, desde "Editar".
router.post('/bulk-import', async (req, res) => {
  try {
    const { platform, accounts } = req.body;
    if (!platform?.trim()) return res.status(400).json({ message: 'Indica la plataforma' });
    if (!Array.isArray(accounts) || accounts.length === 0) {
      return res.status(400).json({ message: 'No hay cuentas para importar' });
    }

    const finalPlatform = platform.trim();
    const created = [];
    const skipped = [];

    for (const row of accounts) {
      const employeeId = row?.employeeId;
      const username = (row?.username || '').trim().toLowerCase();

      if (!employeeId || !username) {
        skipped.push({ username: username || row?.username || '', reason: 'Falta empleado o correo/usuario' });
        continue;
      }

      const employee = await Employee.findById(employeeId);
      if (!employee) {
        skipped.push({ username, reason: 'Empleado no encontrado' });
        continue;
      }

      const dup = await PlatformAccountErp.findOne({ platform: finalPlatform, username });
      if (dup) {
        skipped.push({ username, reason: 'Ya existe una cuenta con ese usuario en esa plataforma' });
        continue;
      }

      const account = await PlatformAccountErp.create({
        employee: employee._id,
        platform: finalPlatform,
        username,
        passwordEncrypted: '',
        passwordPending: true,
        createdByName: req.user.name,
      });

      logAction(req.user, 'crear', 'cuenta_plataforma_erp', account._id, `${finalPlatform}: ${username}`, `Importó por Excel cuenta ERP existente de ${finalPlatform} para ${employee.name} (pendiente de contraseña)`);
      created.push({ username, employeeName: employee.name });
    }

    res.status(201).json({ created, skipped });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const account = await PlatformAccountErp.findById(req.params.id);
    if (!account) return res.status(404).json({ message: 'Cuenta no encontrada' });

    const { notes, status, regeneratePassword, manualPassword, unassign, employeeId } = req.body;
    if (notes !== undefined) account.notes = notes;
    if (status !== undefined) account.status = status;

    let plainPassword;
    if (regeneratePassword) {
      plainPassword = generatePassword();
      account.passwordEncrypted = encryptPassword(plainPassword);
      account.passwordPending = false;
    } else if (manualPassword) {
      if (account.passwordManuallySet) {
        return res.status(400).json({ message: 'Ya se corrigió la contraseña manualmente una vez; usa "Regenerar" para cambios futuros.' });
      }
      plainPassword = manualPassword;
      account.passwordEncrypted = encryptPassword(manualPassword);
      account.passwordManuallySet = true;
      account.passwordPending = false;
    }

    let auditAction = 'editar';
    let auditDetails = `Editó datos de la cuenta ERP de ${account.platform}`;
    if (regeneratePassword) auditDetails = `Regeneró la contraseña de la cuenta ERP de ${account.platform}`;
    if (manualPassword) auditDetails = `Capturó/corrigió manualmente la contraseña de la cuenta ERP de ${account.platform}`;

    if (unassign) {
      account.employee = null;
      auditAction = 'devolver';
      auditDetails = `Liberó la cuenta ERP de ${account.platform} (quedó disponible para reciclar)`;
    } else if (employeeId) {
      const newEmployee = await Employee.findById(employeeId);
      if (!newEmployee) return res.status(404).json({ message: 'Empleado no encontrado' });
      account.employee = newEmployee._id;
      auditAction = 'asignar';
      auditDetails = `Asignó la cuenta ERP de ${account.platform} a ${newEmployee.name}`;
    }

    await account.save();

    logAction(req.user, auditAction, 'cuenta_plataforma_erp', account._id, `${account.platform}: ${account.username}`, auditDetails);

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
    const account = await PlatformAccountErp.findByIdAndDelete(req.params.id);
    if (!account) return res.status(404).json({ message: 'Cuenta no encontrada' });

    logAction(req.user, 'eliminar', 'cuenta_plataforma_erp', account._id, `${account.platform}: ${account.username}`, `Eliminó cuenta ERP de ${account.platform}`);
    res.json({ message: 'Cuenta eliminada' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
