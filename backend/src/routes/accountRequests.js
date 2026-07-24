const router = require('express').Router();
const crypto = require('crypto');
const AccountRequest = require('../models/AccountRequest');
const CustomErpSystemOption = require('../models/CustomErpSystemOption');
const Employee = require('../models/Employee');
const auth = require('../middleware/auth');
const employeeAuth = require('../middleware/employeeAuth');
const optionalEmployeeAuth = require('../middleware/optionalEmployeeAuth');
const { createGmailAccount, createPlatformAccount, createPlatformErpAccount } = require('../utils/createAccount');
const { buildAccountRequestPdf } = require('../utils/accountRequestPdf');
const { notifyTelegram } = require('../utils/telegram');
const logAction = require('../utils/audit');

// Roles fijos de Mercado Libre (definición oficial que compartió el
// director) — reemplazan la lista genérica de permisos solo para esta
// plataforma. Mismo set de claves en frontend/src/pages/SolicitarCuenta.jsx
// (ML_ROLE_FIELDS) y utils/accountRequestPdf.js (ML_ROLE_LABELS).
const ML_ROLE_KEYS = ['KAM', 'AC', 'ALM', 'BI', 'CyC', 'MKT', 'AUD', 'BO'];

// Catálogo cerrado de sistemas ERP — pedido explícito del usuario
// (2026-07-23): cada tienda tiene su PROPIO ERP, así que el catálogo ya
// incluye la tienda en cada opción (a diferencia del viejo catálogo
// genérico de software — SAP/Odoo/Aspel — que necesitaba un campo aparte
// para la tienda). Mismo set en frontend/src/pages/SolicitarCuenta.jsx
// (ERP_SYSTEM_CATALOG) — se revalida aquí por si alguien llama la ruta
// directo con valores manipulados.
const ERP_SYSTEM_CATALOG = ['ERP SelectShop', 'ERP Nexustore', 'ERP Medicalstore', 'ERP Tlab'];

const PERMISSION_BY_TYPE = {
  gmail: 'canManageGmailAccounts',
  platform: 'canManagePlatformAccounts',
  platform_erp: 'canManagePlatformAccountsErp',
};

function secretsMatch(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Límite simple por IP para la ruta pública del formulario (sin login, así
// que no hay usuario a quien limitar) — en memoria, se reinicia con cada
// despliegue, suficiente para un formulario de uso interno de la empresa.
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 8;
const rateLimitHits = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const hits = (rateLimitHits.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  rateLimitHits.set(ip, hits);
  return hits.length > RATE_LIMIT_MAX;
}

// Webhook público (sin JWT) — lo llama Power Automate cuando alguien llena el
// Microsoft Form de solicitud de cuenta. Va sin login porque puede solicitar
// cualquier persona de la empresa, no solo quienes tienen cuenta en esta app.
// Se protege con un secreto compartido (header x-webhook-secret) en vez de un
// token de usuario. Nunca crea la cuenta directo — solo deja la solicitud en
// "pendiente" para que alguien con permiso la revise y apruebe a mano.
router.post('/webhook', async (req, res) => {
  try {
    if (!secretsMatch(req.headers['x-webhook-secret'], process.env.FORMS_WEBHOOK_SECRET)) {
      return res.status(401).json({ message: 'Secreto inválido' });
    }

    const { requestType, employeeName, employeeIdNum, platform, username, reason, requestedByEmail } = req.body;
    if (!['gmail', 'platform', 'platform_erp'].includes(requestType)) {
      return res.status(400).json({ message: 'requestType inválido (usa gmail, platform o platform_erp)' });
    }
    if (!employeeName?.trim()) {
      return res.status(400).json({ message: 'Falta employeeName' });
    }

    const request = await AccountRequest.create({
      requestType,
      employeeName: employeeName.trim(),
      employeeIdNum: (employeeIdNum || '').trim(),
      platform: (platform || '').trim(),
      username: (username || '').trim(),
      reason: (reason || '').trim(),
      requestedByEmail: (requestedByEmail || '').trim(),
      raw: req.body,
    });

    res.status(201).json({ id: request._id });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Formulario público (sin JWT) — lo llena directamente cualquier persona de
// la empresa desde la página pública frontend/src/pages/SolicitarCuenta.jsx
// (sin sidebar, sin login). Protegido con límite por IP + un campo trampa
// (honeypot) en vez de un secreto de servidor, porque cualquier "secreto" en
// el código del frontend sería visible para quien abra las herramientas de
// desarrollador del navegador. Igual que el webhook: nunca crea la cuenta
// directo, solo dejar la(s) solicitud(es) en "pendiente".
//
// Si se marca más de un tipo de cuenta (ej. Gmail + ERP) se crea UN
// AccountRequest por tipo, cada uno solo con los datos de su propia sección
// — así un revisor de ERP nunca ve la parte de Gmail/Plataformas de esa
// misma solicitud, y viceversa (mismo criterio de aislamiento que ya usa la
// lista de abajo, filtrada por permiso).
router.post('/public', optionalEmployeeAuth, async (req, res) => {
  try {
    if (isRateLimited(req.ip)) {
      return res.status(429).json({ message: 'Demasiadas solicitudes, intenta de nuevo más tarde.' });
    }
    const body = req.body || {};
    if (body.website) {
      // Honeypot: un humano nunca llena este campo (está oculto en el
      // formulario). Se responde éxito falso para no delatar el filtro.
      return res.status(201).json({ folios: [] });
    }

    const common = {
      actionType:       ['alta', 'modificacion', 'baja'].includes(body.actionType) ? body.actionType : 'alta',
      employeeName:     (body.employeeName || '').trim(),
      employeeIdNum:    (body.employeeIdNum || '').trim(),
      position:         (body.position || '').trim(),
      department:       (body.department || '').trim(),
      directManager:    (body.directManager || '').trim(),
      currentEmail:     (body.currentEmail || '').trim(),
      phone:            (body.phone || '').trim(),
      businessName:     (body.businessName || '').trim(),
      reason:           (body.reason || '').trim(),
      validity:         (body.validity || '').trim(),
      referenceProfile: (body.referenceProfile || '').trim(),
      requestedByEmail: (body.requestedByEmail || '').trim(),
      acceptedTerms:    body.acceptedTerms === true,
      acceptedAt:       body.acceptedTerms === true ? new Date() : undefined,
      submitterRef:     req.employee?.employeeRef,
    };

    if (!common.employeeName) return res.status(400).json({ message: 'Falta el nombre del solicitante' });
    if (!common.acceptedTerms) return res.status(400).json({ message: 'Debes aceptar las condiciones de uso para enviar la solicitud' });

    // El formulario público solo deja elegir un nombre ya validado contra
    // Empleados (ver GET /employees/public-lookup) — esta es la misma
    // validación del lado del servidor, por si alguien llama esta ruta
    // directo sin pasar por el formulario.
    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matchedEmployee = await Employee.findOne({
      active: true,
      name: { $regex: `^${escapeRegex(common.employeeName)}$`, $options: 'i' },
    });
    if (!matchedEmployee) {
      return res.status(400).json({ message: 'No encontramos ese nombre en la base de empleados. Escríbelo tal como aparece registrado.' });
    }
    // Una cuenta de uso múltiple (ej. "Auxiliar Devoluciones") ya no aparece
    // como sugerencia en /employees/public-lookup, pero se revalida aquí por
    // si alguien llama la ruta directo con el nombre exacto a mano.
    if (matchedEmployee.isSharedAccount) {
      return res.status(400).json({ message: 'Esta es una cuenta de uso múltiple — no puede solicitar cuentas o accesos personales.' });
    }

    const wantsGmail    = !!body.wantsGmail;
    const wantsPlatform = !!body.wantsPlatforms;
    const wantsErp      = !!body.wantsErp;
    if (!wantsGmail && !wantsPlatform && !wantsErp) {
      return res.status(400).json({ message: 'Selecciona al menos un tipo de cuenta (Gmail, Plataformas o ERP)' });
    }

    const submissionGroup = crypto.randomUUID();
    const created = [];

    async function createAndFile(requestType, extra) {
      const request = await AccountRequest.create({
        ...common, requestType, submissionGroup, raw: body,
        ...extra,
      });
      try {
        const pdfData = await buildAccountRequestPdf(request);
        request.pdfData = pdfData;
        request.fileName = `Solicitud_${requestType}_${request._id.toString().slice(-6)}.pdf`;
        await request.save();
      } catch (err) {
        console.error('Error generando PDF de solicitud de cuenta:', err);
      }
      created.push({ type: requestType, id: request._id, folio: request.fileName || request._id.toString().slice(-6).toUpperCase() });
    }

    if (wantsGmail) {
      await createAndFile('gmail', {
        username:               (body.gmail?.username || '').trim(),
        gmailDisplayName:       (body.gmail?.displayName || '').trim(),
        gmailAccountKind:       (body.gmail?.accountKind || '').trim(),
        gmailMainUse:           (body.gmail?.mainUse || '').trim(),
        gmailSharedResponsible: (body.gmail?.sharedResponsible || '').trim(),
      });
    }
    if (wantsPlatform) {
      const platforms = Array.isArray(body.platforms) ? body.platforms : [];
      await createAndFile('platform', {
        platforms: platforms.map((p) => ({
          platform: (p.platform || '').trim(),
          store: (p.store || '').trim(),
          username: (p.username || '').trim(),
          permissions: {
            ventas: !!p.permissions?.ventas,
            publicaciones: !!p.permissions?.publicaciones,
            inventarios: !!p.permissions?.inventarios,
            envio: !!p.permissions?.envio,
            pagos: !!p.permissions?.pagos,
            facturas: !!p.permissions?.facturas,
            admin: !!p.permissions?.admin,
          },
          // Solo aplica a Mercado Libre — se descarta cualquier clave que no
          // esté en la lista fija, por si alguien llama la ruta directo.
          roles: Array.isArray(p.roles) ? p.roles.filter((r) => ML_ROLE_KEYS.includes(r)) : [],
        })),
      });
    }
    if (wantsErp) {
      const erpSystems = Array.isArray(body.erp?.systems)
        ? body.erp.systems.filter((s) => ERP_SYSTEM_CATALOG.includes(s))
        : [];
      if (erpSystems.length === 0) {
        return res.status(400).json({ message: 'Selecciona al menos un sistema ERP.' });
      }
      await createAndFile('platform_erp', {
        erpSystems,
        // `platform` (compartido con Gmail/Plataformas) es lo que de
        // verdad usa la aprobación para crear la cuenta (un solo valor,
        // ver PUT /:id/approve) — se prellena con la lista pedida para
        // que "Solicitudes de Cuentas" tenga algo que mostrar antes de
        // aprobar; quien aprueba lo puede ajustar a un solo sistema si
        // hace falta.
        platform: erpSystems.join(', '),
        erpModuleOther: (body.erp?.moduleOther || '').trim(),
      });
    }

    const TYPE_LABELS = { gmail: 'Gmail', platform: 'Plataformas', platform_erp: 'ERP' };
    notifyTelegram(
      `🔔 <b>Nueva Solicitud de Cuentas</b>\n` +
      `👤 ${common.employeeName}\n` +
      `📋 Tipo(s): ${created.map((c) => TYPE_LABELS[c.type] || c.type).join(', ')}\n` +
      `Revisa en Solicitudes de Cuentas.`
    );

    res.status(201).json({ folios: created });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Catálogo de sistemas ERP que ya se han pedido antes (ver PUT /:id/approve
// más abajo) — público para que el formulario los muestre en el <select>
// sin necesitar login. Mismo patrón que el catálogo de Solicitud de
// Recursos (resourceRequests.js: GET /custom-options/public).
router.get('/custom-erp-systems/public', async (req, res) => {
  try {
    const options = await CustomErpSystemOption.find().sort({ label: 1 }).select('label');
    res.json(options.map((o) => o.label));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Solicitudes que YO envié logueado en el portal de empleado (ver "Mis
// Solicitudes") — no requiere permiso de admin, solo sesión de empleado.
router.get('/mine', employeeAuth, async (req, res) => {
  try {
    const requests = await AccountRequest.find({ submitterRef: req.employee.employeeRef }).sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.use(auth);

// Lista de solicitudes — cada quien solo ve los tipos de cuenta que puede
// gestionar (mismo criterio que ya se usa para las cuentas disponibles en
// Disponibilidad).
router.get('/', async (req, res) => {
  try {
    const allowedTypes = Object.entries(PERMISSION_BY_TYPE)
      .filter(([, perm]) => req.user[perm])
      .map(([type]) => type);
    if (allowedTypes.length === 0) return res.json([]);

    // ?type=gmail,platform — para separar ERP a su propia página (ver
    // AccountRequestsErp) sin dejar de filtrar primero por lo que el
    // usuario realmente puede gestionar.
    let types = allowedTypes;
    if (req.query.type) {
      const requested = req.query.type.split(',');
      types = allowedTypes.filter((t) => requested.includes(t));
    }
    if (types.length === 0) return res.json([]);

    const filter = { requestType: { $in: types } };
    if (req.query.status) filter.status = req.query.status;

    const requests = await AccountRequest.find(filter)
      .populate('matchedEmployee', 'employeeId name businessName office department')
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

function assertCanManage(req, requestType) {
  if (!req.user[PERMISSION_BY_TYPE[requestType]]) {
    const err = new Error('No tienes permiso para gestionar este tipo de cuenta');
    err.status = 403;
    throw err;
  }
}

// Descarga el PDF tal como se generó al momento de enviar la solicitud
// (mismo criterio de aislamiento: solo lo puede ver quien administra ese
// tipo de cuenta — un admin de ERP nunca puede pedir el PDF de una
// solicitud de Gmail/Plataformas, y viceversa).
router.get('/:id/pdf', async (req, res) => {
  try {
    const request = await AccountRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Solicitud no encontrada' });
    assertCanManage(req, request.requestType);
    if (!request.pdfData) return res.status(404).json({ message: 'Esta solicitud no tiene un PDF generado' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${request.fileName || 'solicitud.pdf'}"`);
    res.end(request.pdfData);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

// Aprobar = crear la cuenta real con los datos ya confirmados/corregidos por
// quien revisa (el empleado real elegido a mano, no el texto libre del form).
router.put('/:id/approve', async (req, res) => {
  try {
    const request = await AccountRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Solicitud no encontrada' });
    if (request.status !== 'pendiente') return res.status(400).json({ message: 'Esta solicitud ya fue resuelta' });
    assertCanManage(req, request.requestType);

    const { employeeId, platform, username, email, notes } = req.body;
    if (!employeeId) return res.status(400).json({ message: 'Selecciona el empleado real al que corresponde' });
    const employee = await Employee.findById(employeeId);
    if (!employee) return res.status(404).json({ message: 'Empleado no encontrado' });

    const finalNotes = notes || request.reason;
    let result;
    if (request.requestType === 'gmail') {
      result = await createGmailAccount(employee, { email: email || request.username, notes: finalNotes }, req.user);
    } else if (request.requestType === 'platform') {
      result = await createPlatformAccount(employee, { platform: platform || request.platform, username: username || request.username, notes: finalNotes }, req.user);
    } else {
      result = await createPlatformErpAccount(employee, { platform: platform || request.platform, username: username || request.username, notes: finalNotes }, req.user);
    }

    request.status = 'aprobada';
    request.matchedEmployee = employee._id;
    request.createdAccountId = result.account._id;
    request.reviewedByName = req.user.name;
    request.reviewedAt = new Date();
    await request.save();

    // Sistema ERP escrito como "Otro / no está en la lista" en el formulario
    // — si se marca agregarlo, queda como opción del <select> para la
    // próxima solicitud (mismo patrón que el catálogo de Solicitud de
    // Recursos). Nunca bloquea la aprobación si falla.
    if (req.body.addToCatalog && request.requestType === 'platform_erp' && (platform || request.platform)) {
      try {
        await CustomErpSystemOption.create({ label: (platform || request.platform).trim(), addedByName: req.user.name });
      } catch (err) {
        if (err.code !== 11000) console.error('Error agregando sistema ERP al catálogo:', err);
      }
    }

    res.json({ request, password: result.plainPassword });
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
});

router.put('/:id/reject', async (req, res) => {
  try {
    const request = await AccountRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Solicitud no encontrada' });
    if (request.status !== 'pendiente') return res.status(400).json({ message: 'Esta solicitud ya fue resuelta' });
    assertCanManage(req, request.requestType);

    request.status = 'rechazada';
    request.rejectionReason = req.body.reason || '';
    request.reviewedByName = req.user.name;
    request.reviewedAt = new Date();
    await request.save();

    logAction(req.user, 'rechazar', 'solicitud_cuenta', request._id, request.employeeName, `Rechazó solicitud de cuenta (${request.requestType}) de ${request.employeeName}`);

    res.json(request);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const request = await AccountRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Solicitud no encontrada' });
    assertCanManage(req, request.requestType);
    await AccountRequest.findByIdAndDelete(req.params.id);
    logAction(req.user, 'eliminar', 'solicitud_cuenta', request._id, request.employeeName, `Eliminó solicitud de cuenta (${request.requestType}) de ${request.employeeName}`);
    res.json({ message: 'Solicitud eliminada' });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

module.exports = router;
