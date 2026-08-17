import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import employeeApi from '../services/employeeApi';
import PortalLayout from '../components/PortalLayout';
import BiSolicitudDetailModal from '../components/BiSolicitudDetailModal';
import AccountRequestChatModal from '../components/AccountRequestChatModal';
import ResourceRequestDetailModal from '../components/ResourceRequestDetailModal';
import ShipmentDetailModal from '../components/ShipmentDetailModal';
import styles from './MisSolicitudes.module.css';

const ACCOUNT_TYPE_LABELS = { gmail: 'Gmail', platform: 'Plataformas', platform_erp: 'ERP' };

const STATUS_CONFIG = {
  pendiente: { label: 'pendiente', pillClass: 'pillAmber' },
  aprobada:  { label: 'aprobada',  pillClass: 'pillGreen' },
  // Pedido explícito del usuario (2026-08-03): al aprobarse una Solicitud
  // de Cuenta (Gmail/Plataformas/ERP), ya no pasa directo a "aprobada" —
  // primero se coordina con el empleado (ej. su AnyDesk) por un chat, ver
  // AccountRequestChatModal.jsx.
  esperando_activacion: { label: 'esperando activación', pillClass: 'pillBlue' },
  // Solo aplica a Solicitudes de Recursos (2026-08-06) — distinto de
  // "pendiente": ya se revisó, ya se pidió a compras, sigue sin llegar.
  // Pedido explícito del usuario: que el empleado sepa que no se le está
  // ignorando, solo se está esperando a que llegue el activo.
  en_espera: { label: 'en espera de compras', pillClass: 'pillBlue' },
  rechazada: { label: 'rechazada', pillClass: 'pillRed' },
};

// Baja de Personal tiene su propio estatus de 2 etapas (RH → Sistemas) — se
// muestra tal cual, no se reduce a los 3 genéricos de arriba, para que el
// jefe sepa en cuál de las 2 etapas va su solicitud.
const OFFBOARDING_STATUS_CONFIG = {
  pendiente_rh:       { label: 'con RH',                  pillClass: 'pillAmber' },
  rechazada_rh:       { label: 'rechazada por RH',        pillClass: 'pillRed' },
  pendiente_sistemas: { label: 'con Sistemas',             pillClass: 'pillAmber' },
  rechazada_sistemas: { label: 'rechazada por Sistemas',  pillClass: 'pillRed' },
  completada:         { label: 'baja procesada',          pillClass: 'pillGreen' },
};

// Soporte BI (proyecto Y bases de datos) se guarda como Ticket (folio,
// SLA, panel admin — nada de eso cambió), pero pedido explícito del
// usuario (2026-07-23): del lado del empleado NINGUNO de los 2 caminos es
// "un ticket que atender", son solicitudes de soporte — así que ambos se
// muestran aquí, no en Mis Tickets (ver GET /tickets/mine/bi-requests en
// routes/tickets.js, que excluye Soporte BI del /tickets/mine normal).
// Estatus de Ticket (abierto/en_proceso/resuelto/cerrado) no tiene nada
// que ver con el de Cuentas/Recursos (pendiente/aprobada/rechazada), así
// que usa su propio mapeo.
const BI_STATUS_CONFIG = {
  abierto:    { label: 'pendiente',   pillClass: 'pillAmber' },
  en_proceso: { label: 'en proceso',  pillClass: 'pillOrange' },
  resuelto:   { label: 'resuelto',    pillClass: 'pillGreen' },
  cerrado:    { label: 'cerrado',     pillClass: 'pillGray' },
};
const BI_TIPO_LABELS = { ventas: 'Ventas', inventarios: 'Inventarios' };

// Solicitud de envío (Shipment) — pedido explícito del usuario (2026-08-14):
// "necesito que en su mesa de ayuda en mis solicitudes le habilites el link
// de entrega" — para cuando quien recibe el equipo SÍ tiene sesión en el
// portal, en vez de depender solo del link público que se comparte por
// WhatsApp (ver routes/shipments.js). Estatus propio (enviado → en tránsito
// → recibido), nada que ver con pendiente/aprobada/rechazada de arriba.
const SHIPMENT_STATUS_CONFIG = {
  enviado:     { label: 'enviado',     pillClass: 'pillAmber' },
  en_transito: { label: 'en tránsito', pillClass: 'pillBlue' },
  recibido:    { label: 'recibido',    pillClass: 'pillGreen' },
};
function normalizeShipment(s) {
  return {
    _id: s._id,
    type: 'shipment',
    raw: s,
    folio: s.folio,
    label: `Solicitud de envío: ${s.destinationOffice}`,
    statusConfig: SHIPMENT_STATUS_CONFIG[s.status] || SHIPMENT_STATUS_CONFIG.enviado,
    createdAt: s.createdAt,
  };
}

function formatDate(d) {
  return new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Junta las 3 solicitudes que se envían desde Mesa de Ayuda (Solicitar
// Cuenta/Recurso/Ingreso) en una sola fila normalizada — cada modelo tiene
// campos distintos, esto es solo para mostrarlas juntas por fecha.
function normalizeAccount(r) {
  return {
    _id: r._id,
    type: 'account',
    folio: r._id.toString().slice(-6).toUpperCase(),
    label: `Cuenta · ${ACCOUNT_TYPE_LABELS[r.requestType] || r.requestType} — ${r.employeeName}`,
    statusConfig: STATUS_CONFIG[r.status] || STATUS_CONFIG.pendiente,
    createdAt: r.createdAt,
    raw: r,
    rejectionReason: r.rejectionReason || '',
  };
}
function normalizeResource(r) {
  const items = (r.resourceItems || []).join(', ') || 'Recurso';
  return {
    _id: r._id,
    type: 'resource',
    raw: r,
    folio: r._id.toString().slice(-6).toUpperCase(),
    label: `Recurso · ${items} — ${r.employeeName}`,
    statusConfig: STATUS_CONFIG[r.status] || STATUS_CONFIG.pendiente,
    createdAt: r.createdAt,
    // Pedido explícito del usuario (2026-08-04): "para que no haya quejas
    // después" — el motivo de rechazo ya se guardaba (rejectionReason),
    // pero nunca se mostraba en ningún lado del portal del empleado.
    rejectionReason: r.rejectionReason || '',
    // Mismo hueco encontrado el mismo día, en la aprobación: `resolutionNotes`
    // (ej. "Se entrega Mouse y Teclado Lenovo") tampoco se mostraba.
    resolutionNotes: r.resolutionNotes || '',
    // Ahora se aprueba/rechaza/pone en espera POR ACTIVO (2026-08-06) — el
    // detalle explica exactamente cuál (ej. "Falta decidir: Mouse" o "En
    // espera de compras: Teclado"), en vez de un solo estatus para toda la
    // solicitud sin decir por qué.
    statusDetail: r.statusDetail || '',
    // Redirigida a Ticket (2026-08-11) — pedido explícito del usuario: que
    // se siga viendo aquí (no desaparece) pero marcada, para que quede
    // claro que el seguimiento real es en Mis Tickets, no aquí.
    redirected: !!r.redirectedToTicket,
    redirectReason: r.redirectReason || '',
    // Creada a partir de un Ticket redirigido (2026-08-11, dirección
    // contraria) — pedido explícito del usuario: "si lo muevo de
    // solicitudes a tickets debe verse así y viceversa".
    fromTicket: !!r.raw?.redirectedFromTicket,
    fromTicketReason: r.raw?.redirectedFromReason || '',
    // "Software o Licencia" (2026-08-13, pedido explícito del usuario):
    // "se acepta y se queda aceptado, sin comentarios ni nada, se mueve
    // directamente a ticket... en mis solicitudes al apretarlo, me abre
    // chat de ticket" — a diferencia de `redirected` (redirect manual, se
    // OCULTA de aquí), esta sigue viéndose en Mis Solicitudes pero abre
    // directo el chat del ticket generado al hacerle clic (ver
    // followUpTicketId en itemDecisions).
    followUpTicketId: (r.itemDecisions || []).find((d) => d.followUpTicketId)?.followUpTicketId || null,
  };
}
function normalizeOnboarding(r) {
  return {
    _id: r._id,
    folio: r._id.toString().slice(-6).toUpperCase(),
    label: `Ingreso · ${r.employeeName}`,
    statusConfig: STATUS_CONFIG[r.status] || STATUS_CONFIG.pendiente,
    createdAt: r.createdAt,
    rejectionReason: r.rejectionReason || '',
  };
}
function normalizeOffboarding(r) {
  return {
    _id: r._id,
    folio: r._id.toString().slice(-6).toUpperCase(),
    label: `Baja · ${r.employeeName}`,
    statusConfig: OFFBOARDING_STATUS_CONFIG[r.status] || OFFBOARDING_STATUS_CONFIG.pendiente_rh,
    createdAt: r.createdAt,
    // Baja tiene 2 etapas, cada una con su propio motivo — se muestra el
    // que corresponda según en cuál se haya rechazado.
    rejectionReason: r.status === 'rechazada_rh' ? (r.rhRejectionReason || '') : r.status === 'rechazada_sistemas' ? (r.sistemasRejectionReason || '') : '',
  };
}
// A diferencia de las otras 4 (derivan un folio de los últimos 6 caracteres
// del _id porque su modelo no tiene uno real), el Ticket de BI YA trae un
// folio real (`TICK-XXXXXX`) — se usa tal cual. Cubre los 2 caminos de
// Soporte BI (biRequestKind), cada uno con su propio label descriptivo.
function normalizeBiRequest(t) {
  const label = t.biRequestKind === 'proyecto'
    ? `Proyecto BI · ${t.biProjectData?.nombreReporte || 'Sin nombre'} — ${t.employeeName}`
    : t.biRequestKind === 'bases_datos'
      ? `Bases de datos BI · ${BI_TIPO_LABELS[t.biDatabaseRequest?.tipo] || t.biDatabaseRequest?.tipo} — ${t.employeeName}`
      : `Soporte BI · ${t.subject}`;
  return {
    _id: t._id,
    folio: t.folio,
    label,
    statusConfig: BI_STATUS_CONFIG[t.status] || BI_STATUS_CONFIG.abierto,
    createdAt: t.createdAt,
    // A diferencia de las otras 5 (sin detalle todavía) — pedido explícito
    // del usuario (2026-07-30): "que cuando abran el ticket ahí esté la
    // BD". `raw` trae el ticket completo para BiSolicitudDetailModal.jsx.
    type: 'bi',
    raw: t,
  };
}

// Solicitud de Pagos (apartados Centro de Costos/Motivo de Pago y Alta de
// Proveedores) se guarda como Ticket igual que Soporte BI arriba, pero
// pedido explícito del usuario (2026-07-28): esos apartados los atiende
// Contabilidad/Pagos, ajenos a Sistemas — así que tampoco deben verse en
// "Mis Tickets", se muestran aquí (ver GET /tickets/mine/external-requests,
// que agrupa cualquier ticket con requestAudience 'externo', no solo estos
// apartados de Solicitud de Pagos).
function normalizeExternalRequest(t) {
  const app = t.appRef?.name || 'Solicitud';
  const label = `${app}${t.otherTypeDetail ? ` · ${t.otherTypeDetail}` : ''} — ${t.employeeName}`;
  return {
    _id: t._id,
    folio: t.folio,
    label,
    statusConfig: BI_STATUS_CONFIG[t.status] || BI_STATUS_CONFIG.abierto,
    createdAt: t.createdAt,
  };
}

// Portal del empleado (requiere sesión): sus propias Solicitudes de
// Cuenta/Recurso/Ingreso, ligadas a su identidad vía `submitterRef` (ver
// backend/src/routes/{accountRequests,resourceRequests,onboardingRequests}.js,
// GET /mine) — mismo criterio que "Mis Tickets".
export default function MisSolicitudes() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBi, setSelectedBi] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [selectedResource, setSelectedResource] = useState(null);
  const [selectedShipment, setSelectedShipment] = useState(null);

  const loadShipments = () => employeeApi.get('/shipments/mine').then(({ data }) => data.map(normalizeShipment)).catch(() => []);

  useEffect(() => {
    Promise.all([
      employeeApi.get('/account-requests/mine').then(({ data }) => data.map(normalizeAccount)).catch(() => []),
      employeeApi.get('/resource-requests/mine').then(({ data }) => data.map(normalizeResource)).catch(() => []),
      employeeApi.get('/onboarding-requests/mine').then(({ data }) => data.map(normalizeOnboarding)).catch(() => []),
      employeeApi.get('/offboarding-requests/mine').then(({ data }) => data.map(normalizeOffboarding)).catch(() => []),
      employeeApi.get('/tickets/mine/bi-requests').then(({ data }) => data.map(normalizeBiRequest)).catch(() => []),
      employeeApi.get('/tickets/mine/external-requests').then(({ data }) => data.map(normalizeExternalRequest)).catch(() => []),
      loadShipments(),
    ]).then(([accounts, resources, onboarding, offboarding, biRequests, externalRequests, shipments]) => {
      const merged = [...accounts, ...resources, ...onboarding, ...offboarding, ...biRequests, ...externalRequests, ...shipments]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setItems(merged);
      // ?ticket=<id> (2026-08-17, ver notificación push en tickets.js —
      // employeePortalUrl) — que el clic en el aviso de una solicitud de BI
      // de verdad abra su detalle, no solo la lista. Mismo criterio que
      // MisTickets.jsx.
      const fromUrl = searchParams.get('ticket');
      if (fromUrl) {
        const match = biRequests.find((b) => b._id === fromUrl);
        if (match) setSelectedBi(match.raw);
      }
    }).finally(() => setLoading(false));
  }, [searchParams]);

  return (
    <PortalLayout activeNav="solicitudes-mias">
      <Link to="/mesa-de-ayuda" className={styles.backLink}>← Volver a Solicitudes</Link>
      <div className={styles.mainHead}>
        <h1>Mis solicitudes</h1>
        <p>Cuentas, recursos, altas y bajas de personal, y Soporte BI que has pedido, y en qué van.</p>
      </div>

      {loading && <p className={styles.tableEmpty}>Cargando tus solicitudes...</p>}
      {!loading && items.length === 0 && (
        <div className={styles.tableEmpty}>Todavía no has enviado ninguna solicitud.</div>
      )}

      {!loading && items.length > 0 && (
        <div className={styles.tablePanel}>
          <table>
            <thead>
              <tr><th>Folio</th><th>Solicitud</th><th>Estatus</th><th>Fecha</th></tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const sc = it.statusConfig;
                const isBi = it.type === 'bi';
                // Pedido explícito del usuario (2026-08-03): solo tiene caso
                // abrir el chat mientras está "esperando_activacion" — antes
                // de eso (pendiente) no hay nada que platicar todavía, y ya
                // resuelta (aprobada/rechazada) el chat queda de solo lectura
                // desde el lado admin, no hace falta ofrecerlo aquí.
                const isAccountChat = it.type === 'account' && it.raw?.status === 'esperando_activacion';
                // Pedido explícito del usuario (2026-08-07): igual que los
                // tickets, poder dar clic a una Solicitud de Recursos y ver
                // el detalle completo por activo (notas completas de cada
                // decisión, no solo el resumen de una línea).
                const isResource = it.type === 'resource';
                // "Software o Licencia" aprobada (2026-08-13, pedido
                // explícito del usuario) — no abre el detalle de la
                // solicitud (ya no hay nada más que decidir ahí), abre
                // directo el chat del ticket generado.
                const hasFollowUpTicket = isResource && !!it.followUpTicketId;
                const isShipment = it.type === 'shipment';
                const clickable = isBi || isAccountChat || isResource || isShipment;
                return (
                  <tr
                    key={it._id}
                    onClick={
                      hasFollowUpTicket ? () => navigate(`/mesa-de-ayuda/mis-tickets?ticket=${it.followUpTicketId}`)
                        : isBi ? () => setSelectedBi(it.raw)
                        : isAccountChat ? () => setSelectedAccount(it.raw)
                        : isResource ? () => setSelectedResource(it.raw)
                        : isShipment ? () => setSelectedShipment(it.raw)
                        : undefined
                    }
                    style={(it.redirected || it.fromTicket) ? { cursor: clickable ? 'pointer' : undefined, background: 'var(--p-amber-soft)' } : clickable ? { cursor: 'pointer' } : undefined}
                  >
                    <td><span className={styles.folioLink}>{it.folio}</span></td>
                    <td>
                      {it.label}
                      {it.redirected && <span className={styles.statusDetailNote}>🟡 Movida a Ticket — el seguimiento sigue en "Mis Tickets"{it.redirectReason ? `: ${it.redirectReason}` : ''}</span>}
                      {it.fromTicket && <span className={styles.statusDetailNote}>🟡 Creada a partir de un Ticket redirigido{it.fromTicketReason ? `: ${it.fromTicketReason}` : ''}</span>}
                      {hasFollowUpTicket && <span className={styles.statusDetailNote}>🎫 Aprobada — el seguimiento de la instalación se da en Tickets, dale clic para verlo</span>}
                      {it.rejectionReason && <span className={styles.rejectionNote}>✕ Motivo: {it.rejectionReason}</span>}
                      {it.resolutionNotes && <span className={styles.approvalNote}>✓ {it.resolutionNotes}</span>}
                      {it.statusDetail && <span className={styles.statusDetailNote}>{it.statusDetail}</span>}
                    </td>
                    <td><span className={`${styles.pill} ${styles[sc.pillClass]}`}><span className={styles.dot} />{sc.label}</span></td>
                    <td className={styles.date}>{formatDate(it.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedBi && (
        <BiSolicitudDetailModal
          ticket={selectedBi}
          onClose={() => setSelectedBi(null)}
          onUpdated={(updated) => {
            setSelectedBi(updated);
            setItems((prev) => prev.map((it) => (
              it._id === updated._id ? { ...it, statusConfig: BI_STATUS_CONFIG[updated.status] || it.statusConfig } : it
            )));
          }}
        />
      )}

      {selectedResource && (
        <ResourceRequestDetailModal request={selectedResource} onClose={() => setSelectedResource(null)} />
      )}

      {selectedAccount && (
        <AccountRequestChatModal
          request={selectedAccount}
          role="employee"
          api={employeeApi}
          onClose={() => setSelectedAccount(null)}
          onUpdated={(updated) => {
            setSelectedAccount(updated);
            setItems((prev) => prev.map((it) => (
              it._id === updated._id ? { ...it, raw: updated, statusConfig: STATUS_CONFIG[updated.status] || it.statusConfig } : it
            )));
          }}
        />
      )}

      {selectedShipment && (
        <ShipmentDetailModal
          shipment={selectedShipment}
          onClose={() => setSelectedShipment(null)}
          onUpdated={(updated) => {
            // No se cierra el modal al confirmar (2026-08-14, pedido
            // explícito del usuario) — así ve de inmediato el botón de
            // descargar el PDF de recepción, sin tener que reabrir la fila.
            setSelectedShipment(updated);
            setItems((prev) => prev.map((it) => (
              it._id === updated._id ? { ...it, raw: updated, statusConfig: SHIPMENT_STATUS_CONFIG[updated.status] || it.statusConfig } : it
            )));
          }}
        />
      )}
    </PortalLayout>
  );
}
