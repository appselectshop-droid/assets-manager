const router = require('express').Router();
const auth = require('../middleware/auth');
const Ticket = require('../models/Ticket');
const ResourceRequest = require('../models/ResourceRequest');
const AccountRequest = require('../models/AccountRequest');
const OnboardingRequest = require('../models/OnboardingRequest');
const OffboardingRequest = require('../models/OffboardingRequest');
const NotificationSeen = require('../models/NotificationSeen');

router.use(auth);

// Campanita de notificaciones del panel admin — pedido explícito del
// usuario (2026-08-10): "si no veo el telegram no me entero de las
// solicitudes". La base es un contador COMPARTIDO entre todo Sistemas — en
// cuanto alguien toma el ticket/solicitud (se asigna, se aprueba/rechaza),
// el numerito baja solo para todos. Cada categoría define una query de
// "sigue pendiente, nadie lo ha tomado" sobre el mismo campo que ya usa la
// bandeja de ese módulo — no se inventa un estado nuevo para eso.
// `canView` replica exactamente el gate de cada categoría en
// components/Layout.jsx, para no mostrarle a alguien un contador de una
// sección que ni siquiera puede ver.
//
// "Visto" por persona (mismo día, pedido explícito de seguimiento): "una
// vez que ya lo haya visualizado, que se quite... porque ahí va a seguir".
// Encima del conteo compartido de arriba, cada usuario puede apagar un
// pendiente puntual PARA SÍ MISMO sin que eso lo resuelva de verdad — ver
// NotificationSeen.js + POST /seen abajo. Dos personas pueden ver la misma
// solicitud en momentos distintos, cada quien la apaga por su cuenta; en
// cuanto alguien la toma de verdad, desaparece para todos sin importar
// quién la había visto.
const CATEGORIES = [
  {
    key: 'tickets',
    label: 'Tickets',
    link: '/tickets',
    param: 'ticket', // TicketsLayout.jsx ya soporta ?ticket=<id> (abre TicketDetailModal)
    canView: (u) => u.role === 'admin' || u.canManageTickets,
    Model: Ticket,
    query: { ticketType: { $ne: 'soporte_bi' }, status: 'abierto', assignedTo: null },
    mapItem: (t) => ({ title: t.subject, subtitle: `${t.employeeName} · ${t.folio}` }),
  },
  {
    key: 'soporte_bi',
    label: 'Soporte BI',
    link: '/bi/database-requests',
    param: 'ticket', // BiLayout.jsx soporta ?ticket=<id> (abre BiRequestDetailModal)
    canView: (u) => u.canManageBiRequests || u.canViewManagerDashboard,
    Model: Ticket,
    query: {
      ticketType: 'soporte_bi',
      $or: [
        { biRequestKind: 'bases_datos', biApprovedAt: null, biRejectedAt: null },
        { biRequestKind: { $ne: 'bases_datos' }, assignedTo: null, status: { $ne: 'cerrado' } },
      ],
    },
    mapItem: (t) => ({ title: t.subject, subtitle: `${t.employeeName} · ${t.folio}` }),
  },
  {
    key: 'resource_requests',
    label: 'Solicitudes de Recursos',
    link: '/resource-requests',
    param: 'request', // ResourceRequests.jsx soporta ?request=<id> (abre DetailModal)
    canView: (u) => u.role === 'admin',
    Model: ResourceRequest,
    query: { status: 'pendiente' },
    mapItem: (r) => ({ title: (r.resourceItems || []).join(', ') || 'Recurso', subtitle: r.employeeName }),
  },
  {
    key: 'account_requests',
    label: 'Solicitudes de Cuentas',
    link: '/account-requests',
    param: 'request', // AccountRequests.jsx soporta ?request=<id> (resalta la fila — no hay modal de solo ver)
    canView: (u) => u.canManageGmailAccounts || u.canManagePlatformAccounts,
    Model: AccountRequest,
    query: { status: 'pendiente', requestType: { $in: ['gmail', 'platform'] } },
    mapItem: (a) => ({ title: a.requestType === 'gmail' ? 'Cuenta Gmail' : `Plataforma${a.platform ? ` — ${a.platform}` : ''}`, subtitle: a.employeeName }),
  },
  {
    key: 'account_requests_erp',
    label: 'Solicitudes ERP',
    link: '/account-requests-erp',
    param: 'request', // mismo componente que Solicitudes de Cuentas (ver types prop en App.jsx)
    canView: (u) => u.canManagePlatformAccountsErp,
    Model: AccountRequest,
    query: { status: 'pendiente', requestType: 'platform_erp' },
    mapItem: (a) => ({ title: `ERP${a.platform ? ` — ${a.platform}` : ''}`, subtitle: a.employeeName }),
  },
  {
    key: 'onboarding',
    label: 'Ingresos RH',
    link: '/onboarding-requests',
    param: 'request', // OnboardingRequests.jsx soporta ?request=<id> (resalta la fila)
    canView: (u) => u.role === 'admin',
    Model: OnboardingRequest,
    query: { status: 'pendiente' },
    mapItem: (o) => ({ title: 'Alta de personal', subtitle: o.employeeName }),
  },
  {
    key: 'offboarding',
    label: 'Bajas RH',
    link: '/offboarding-requests',
    param: 'request', // OffboardingRequests.jsx soporta ?request=<id> (abre DetailModal)
    canView: (u) => u.role === 'admin',
    Model: OffboardingRequest,
    query: { status: { $in: ['pendiente_rh', 'pendiente_sistemas'] } },
    mapItem: (o) => ({ title: 'Baja de personal', subtitle: o.employeeName }),
  },
];

router.get('/summary', async (req, res) => {
  try {
    const seenRows = await NotificationSeen.find({ user: req.user.id }, 'itemKey').lean();
    const seenIdsByCategory = {};
    seenRows.forEach(({ itemKey }) => {
      const sepIdx = itemKey.indexOf(':');
      const catKey = itemKey.slice(0, sepIdx);
      const id = itemKey.slice(sepIdx + 1);
      (seenIdsByCategory[catKey] || (seenIdsByCategory[catKey] = [])).push(id);
    });

    const visible = CATEGORIES.filter((c) => c.canView(req.user));
    const results = await Promise.all(visible.map(async (c) => {
      const seenIds = seenIdsByCategory[c.key];
      const query = seenIds?.length ? { ...c.query, _id: { $nin: seenIds } } : c.query;
      const [count, recent] = await Promise.all([
        c.Model.countDocuments(query),
        c.Model.find(query).sort({ createdAt: -1 }).limit(5),
      ]);
      return {
        key: c.key,
        label: c.label,
        link: c.link,
        param: c.param,
        count,
        items: recent.map((doc) => ({
          id: doc._id,
          createdAt: doc.createdAt,
          ...c.mapItem(doc),
        })),
      };
    }));
    const categories = results.filter((c) => c.count > 0);
    const total = categories.reduce((sum, c) => sum + c.count, 0);
    res.json({ total, categories });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Marca un pendiente puntual como visto PARA QUIEN LO MANDA — pedido
// explícito del usuario (2026-08-10). No valida que `key`/`id` sean de una
// categoría real: si no coinciden con nada, el `$nin` de arriba
// simplemente no filtra nada (inofensivo).
router.post('/seen', async (req, res) => {
  try {
    const { key, id } = req.body;
    if (!key || !id) return res.status(400).json({ message: 'Falta key o id' });
    await NotificationSeen.updateOne(
      { user: req.user.id, itemKey: `${key}:${id}` },
      {},
      { upsert: true }
    );
    res.status(204).end();
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
