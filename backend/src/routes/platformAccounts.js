const router = require('express').Router();
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const PlatformAccount = require('../models/PlatformAccount');
const Employee = require('../models/Employee');
const Assignment = require('../models/Assignment');
const AccountRequest = require('../models/AccountRequest');
const auth = require('../middleware/auth');
const platformManagerOnly = require('../middleware/platformManagerOnly');
const logAction = require('../utils/audit');
const { encryptPassword, decryptPassword, generatePassword } = require('../utils/gmailVault');
const { createPlatformAccount, resolveAliasOf } = require('../utils/createAccount');
const {
  getEmpresaConfig, LOGOS_DIR, MARKETPLACE_OPTIONS, GERENTE_SISTEMAS_EMAIL,
  MARGIN, PAGE_W, CW, DARK, GRAY_LT, BORDER,
  guard, hline, sectionBand, blendWithWhite, kvPair, kvRow, clauseBlock,
} = require('../utils/pdfBranding');
const { archiveAndRespond } = require('../utils/archiveResponsiva');

router.use(auth, platformManagerOnly);

// Mismas etiquetas que ya usa el checklist de permisos en la Solicitud
// pública (accountRequestPdf.js) — para sintetizar un "rol de acceso" legible
// a partir de los permisos marcados ahí. Mercado Libre usa sus propios roles
// fijos en vez de este checklist (ver ML_ROLE_LABELS en accountRequestPdf.js).
const PERMISSION_LABELS = {
  ventas: 'Ventas al detalle', publicaciones: 'Publicaciones', inventarios: 'Inventarios',
  envio: 'Gestión de envío (Full)', pagos: 'Pagos', facturas: 'Facturas', admin: 'Admin (total)',
};
const ML_ROLE_LABELS = {
  KAM: 'KAM / Comercial', AC: 'Atención al Cliente', ALM: 'Operación / Almacén', BI: 'Business Intelligence',
  CyC: 'Crédito y Cobranza / Finanzas', MKT: 'Marketing / Contenido', AUD: 'Auditoría', BO: 'Back Office',
};

// Si esta cuenta se creó al aprobar una Solicitud pública (ver
// accountRequests.js), regresa lo que esa persona ya puso (tienda, jefe
// directo, vigencia, permisos marcados para esa plataforma) para precargar
// el modal de la Responsiva en vez de partir en blanco — sigue siendo
// editable, no se guarda nada nuevo aquí.
router.get('/:id/request-defaults', async (req, res) => {
  try {
    const account = await PlatformAccount.findById(req.params.id);
    if (!account) return res.status(404).json({ message: 'Cuenta no encontrada' });
    const source = await AccountRequest.findOne({
      createdAccountId: account._id, requestType: 'platform', status: 'aprobada',
    });
    if (!source) return res.json({ store: account.store || '' });
    const entry = (source.platforms || []).find((p) => p.platform === account.platform) || source.platforms?.[0];
    const roleParts = entry?.roles?.length
      ? entry.roles.map((key) => ML_ROLE_LABELS[key] || key)
      : entry?.permissions
        ? Object.entries(PERMISSION_LABELS).filter(([key]) => entry.permissions[key]).map(([, label]) => label)
        : [];
    res.json({
      // La Tienda capturada directo en la cuenta (ver PlatformAccount.store)
      // manda sobre la de la Solicitud original, si ya la corrigieron aquí.
      store: account.store || entry?.store || '',
      directManager: source.directManager || '',
      accessValidity: source.validity || '',
      accessRole: roleParts.join(', '),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const accounts = await PlatformAccount.find()
      .populate('employee', 'employeeId name businessName office department active')
      .populate('aliasOf', 'username platform')
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

// Genera en PDF la "Solicitud y Carta Responsiva de Cuenta de Acceso a
// Plataformas Digitales", llenada con los datos del empleado y la cuenta.
// Nunca incluye la contraseña — el formulario original tampoco la pide.
router.get('/:id/responsiva', async (req, res) => {
  try {
    const account = await PlatformAccount.findById(req.params.id).populate('employee');
    if (!account) return res.status(404).json({ message: 'Cuenta no encontrada' });
    if (!account.employee) return res.status(400).json({ message: 'Esta cuenta no tiene un empleado asignado; asígnala antes de generar la solicitud.' });

    const employee = account.employee;
    // Datos de la solicitud puntual (tienda, jefe directo, rol, vigencia): nunca
    // se guardan — cada responsiva es para una persona/tienda distinta, así que
    // el formulario siempre debe partir en blanco.
    const requestData = {
      store: (req.query.store || '').trim(),
      directManager: (req.query.directManager || '').trim(),
      accessRole: (req.query.accessRole || '').trim(),
      accessValidity: (req.query.accessValidity || '').trim(),
    };
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
    const safeName = (employee.name || 'empleado').replace(/[^a-zA-Z0-9\- ]/g, '_').replace(/\s+/g, '_');
    const folio = `PLAT-${account._id.toString().slice(-6).toUpperCase()}`;

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      autoFirstPage: true,
      bufferPages: true,
    });

    archiveAndRespond(doc, res, {
      type: 'cuenta_plataforma',
      employee: employee._id,
      employeeName: employee.name,
      employeeIdNum: employee.employeeId,
      relatedLabel: `${account.platform} — ${account.username}`,
      fileName: `Responsiva_Cuentas_Plataformas_${employee.employeeId}_${safeName}.pdf`,
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
       .text('PLATAFORMA', MARGIN + 3, y + 3, { width: 72, lineBreak: false });
    const isKnownMarketplace = MARKETPLACE_OPTIONS.includes(account.platform);
    const checkLine = [...MARKETPLACE_OPTIONS, 'Otra'].map((opt) => {
      if (opt === 'Otra') {
        return !isKnownMarketplace ? `[X] Otra: ${account.platform}` : '[ ] Otra';
      }
      return `${account.platform === opt ? '[X]' : '[ ]'} ${opt}`;
    }).join('    ');
    doc.fillColor(DARK).font('Helvetica').fontSize(7)
       .text(checkLine, MARGIN + 78, y + 2, { width: CW - 82 });
    y += 15;
    hline(doc, y, '#f0f0f0', 0.3);

    y = kvRow(doc, y,
      { label: 'Tienda / Cuenta / Seller', value: requestData.store || null },
      { label: 'Rol o tipo de acceso', value: requestData.accessRole || null });
    y = kvRow(doc, y,
      { label: 'Correo asociado a la cuenta', value: account.username },
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
  } catch (err) {
    console.error('Error generando responsiva de cuenta de plataforma:', err);
    if (!res.headersSent) res.status(500).json({ message: 'Error al generar la solicitud' });
  }
});

// Correos ya cargados en Employee.corporateEmails[] (alta de empleado) que todavía
// no tienen contraseña guardada como cuenta de Microsoft en este gestor.
// No modifica Employee.corporateEmails — solo detecta qué falta copiar.
router.get('/unregistered-corporate', async (req, res) => {
  try {
    const employees = await Employee.find({ corporateEmails: { $exists: true, $ne: [] } })
      .select('employeeId name businessName office department corporateEmails');
    const registered = new Set(
      await PlatformAccount.find({ platform: 'Microsoft 365' }).distinct('username')
    );

    const pending = [];
    employees.forEach((emp) => {
      (emp.corporateEmails || []).forEach((raw) => {
        const username = (raw || '').trim().toLowerCase();
        if (username && !registered.has(username)) {
          pending.push({
            username,
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
    res.json(pending);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { employeeId, platform, username, notes, store, aliasOf } = req.body;
    if (!employeeId) return res.status(400).json({ message: 'Selecciona un empleado' });

    const employee = await Employee.findById(employeeId);
    if (!employee) return res.status(404).json({ message: 'Empleado no encontrado' });

    const { account, plainPassword } = await createPlatformAccount(employee, { platform, username, notes, store, aliasOf }, req.user);

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
    const { employeeId, platform, username, password, notes, store, aliasOf } = req.body;
    if (!employeeId) return res.status(400).json({ message: 'Selecciona un empleado' });
    if (!platform?.trim()) return res.status(400).json({ message: 'Indica la plataforma' });
    if (!username?.trim()) return res.status(400).json({ message: 'Indica el correo o usuario de la cuenta' });
    if (!password) return res.status(400).json({ message: 'Captura la contraseña actual de la cuenta' });

    const employee = await Employee.findById(employeeId);
    if (!employee) return res.status(404).json({ message: 'Empleado no encontrado' });

    const finalPlatform = platform.trim();
    const finalUsername = username.trim().toLowerCase();

    const dup = await PlatformAccount.findOne({ platform: finalPlatform, username: finalUsername });
    if (dup) return res.status(400).json({ message: 'Ya existe una cuenta con ese usuario en esa plataforma' });

    const account = await PlatformAccount.create({
      employee: employee._id,
      platform: finalPlatform,
      username: finalUsername,
      passwordEncrypted: encryptPassword(password),
      notes: notes || '',
      createdByName: req.user.name,
      store: (store || '').trim(),
      aliasOf: await resolveAliasOf(aliasOf),
    });

    logAction(req.user, 'crear', 'cuenta_plataforma', account._id, `${finalPlatform}: ${finalUsername}`, `Registró contraseña de cuenta existente de ${finalPlatform} para ${employee.name}`);

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
    const account = await PlatformAccount.findById(req.params.id);
    if (!account) return res.status(404).json({ message: 'Cuenta no encontrada' });

    const { notes, status, regeneratePassword, manualPassword, unassign, employeeId, username, store, aliasOf } = req.body;
    if (notes !== undefined) account.notes = notes;
    if (status !== undefined) account.status = status;
    if (store !== undefined) account.store = store.trim();
    if (aliasOf !== undefined) account.aliasOf = await resolveAliasOf(aliasOf);

    // Corregir el usuario/correo de la cuenta (ej. un typo al capturarlo).
    let previousUsername;
    if (username !== undefined) {
      const finalUsername = username.trim().toLowerCase();
      if (!finalUsername) return res.status(400).json({ message: 'El usuario/correo no puede quedar vacío' });
      if (finalUsername !== account.username) {
        const dup = await PlatformAccount.findOne({ platform: account.platform, username: finalUsername, _id: { $ne: account._id } });
        if (dup) return res.status(400).json({ message: 'Ya existe una cuenta con ese usuario en esa plataforma' });
        previousUsername = account.username;
        account.username = finalUsername;
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

    let auditAction = 'editar';
    let auditDetails = `Editó datos de la cuenta de ${account.platform}`;
    if (regeneratePassword) auditDetails = `Regeneró la contraseña de la cuenta de ${account.platform}`;
    if (manualPassword) auditDetails = `Corrigió manualmente la contraseña de la cuenta de ${account.platform} (única vez)`;
    if (previousUsername) auditDetails = `Corrigió el usuario de la cuenta de ${account.platform} de ${previousUsername} a ${account.username}`;

    if (unassign) {
      account.employee = null;
      auditAction = 'devolver';
      auditDetails = `Liberó la cuenta de ${account.platform} (quedó disponible para reciclar)`;
    } else if (employeeId) {
      const newEmployee = await Employee.findById(employeeId);
      if (!newEmployee) return res.status(404).json({ message: 'Empleado no encontrado' });
      account.employee = newEmployee._id;
      auditAction = 'asignar';
      auditDetails = `Asignó la cuenta de ${account.platform} a ${newEmployee.name}`;
    }

    await account.save();

    logAction(req.user, auditAction, 'cuenta_plataforma', account._id, `${account.platform}: ${account.username}`, auditDetails);

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
    const account = await PlatformAccount.findByIdAndDelete(req.params.id);
    if (!account) return res.status(404).json({ message: 'Cuenta no encontrada' });

    logAction(req.user, 'eliminar', 'cuenta_plataforma', account._id, `${account.platform}: ${account.username}`, `Eliminó cuenta de ${account.platform}`);
    res.json({ message: 'Cuenta eliminada' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
