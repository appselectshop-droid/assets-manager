const router = require('express').Router();
const auth = require('../middleware/auth');
const Ticket = require('../models/Ticket');
const ResourceRequest = require('../models/ResourceRequest');
const AccountRequest = require('../models/AccountRequest');
const OnboardingRequest = require('../models/OnboardingRequest');
const OffboardingRequest = require('../models/OffboardingRequest');

router.use(auth);

// Campanita de notificaciones del panel admin — pedido explícito del
// usuario (2026-08-10): "si no veo el telegram no me entero de las
// solicitudes". El contador es COMPARTIDO entre todo Sistemas (no un
// visto/no-visto por persona) — en cuanto alguien toma el ticket/solicitud
// (se asigna, se aprueba/rechaza), el numerito baja solo para todos, sin
// que nadie tenga que marcar nada como leído. Por eso cada categoría solo
// define una query de "sigue pendiente, nadie lo ha tomado" sobre el
// mismo campo que ya usa la bandeja de ese módulo — no se inventa un
// estado nuevo ni tracking por usuario.
// `canView` replica exactamente el gate de cada categoría en
// components/Layout.jsx, para no mostrarle a alguien un contador de una
// sección que ni siquiera puede ver.
const CATEGORIES = [
  {
    key: 'tickets',
    label: 'Tickets',
    link: '/tickets',
    canView: (u) => u.role === 'admin' || u.canManageTickets,
    Model: Ticket,
    query: { ticketType: { $ne: 'soporte_bi' }, status: 'abierto', assignedTo: null },
    mapItem: (t) => ({ title: t.subject, subtitle: `${t.employeeName} · ${t.folio}` }),
  },
  {
    key: 'soporte_bi',
    label: 'Soporte BI',
    link: '/bi/database-requests',
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
    canView: (u) => u.role === 'admin',
    Model: ResourceRequest,
    query: { status: 'pendiente' },
    mapItem: (r) => ({ title: (r.resourceItems || []).join(', ') || 'Recurso', subtitle: r.employeeName }),
  },
  {
    key: 'account_requests',
    label: 'Solicitudes de Cuentas',
    link: '/account-requests',
    canView: (u) => u.canManageGmailAccounts || u.canManagePlatformAccounts,
    Model: AccountRequest,
    query: { status: 'pendiente', requestType: { $in: ['gmail', 'platform'] } },
    mapItem: (a) => ({ title: a.requestType === 'gmail' ? 'Cuenta Gmail' : `Plataforma${a.platform ? ` — ${a.platform}` : ''}`, subtitle: a.employeeName }),
  },
  {
    key: 'account_requests_erp',
    label: 'Solicitudes ERP',
    link: '/account-requests-erp',
    canView: (u) => u.canManagePlatformAccountsErp,
    Model: AccountRequest,
    query: { status: 'pendiente', requestType: 'platform_erp' },
    mapItem: (a) => ({ title: `ERP${a.platform ? ` — ${a.platform}` : ''}`, subtitle: a.employeeName }),
  },
  {
    key: 'onboarding',
    label: 'Ingresos RH',
    link: '/onboarding-requests',
    canView: (u) => u.role === 'admin',
    Model: OnboardingRequest,
    query: { status: 'pendiente' },
    mapItem: (o) => ({ title: 'Alta de personal', subtitle: o.employeeName }),
  },
  {
    key: 'offboarding',
    label: 'Bajas RH',
    link: '/offboarding-requests',
    canView: (u) => u.role === 'admin',
    Model: OffboardingRequest,
    query: { status: { $in: ['pendiente_rh', 'pendiente_sistemas'] } },
    mapItem: (o) => ({ title: 'Baja de personal', subtitle: o.employeeName }),
  },
];

router.get('/summary', async (req, res) => {
  try {
    const visible = CATEGORIES.filter((c) => c.canView(req.user));
    const results = await Promise.all(visible.map(async (c) => {
      const [count, recent] = await Promise.all([
        c.Model.countDocuments(c.query),
        c.Model.find(c.query).sort({ createdAt: -1 }).limit(5),
      ]);
      return {
        key: c.key,
        label: c.label,
        link: c.link,
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

module.exports = router;
