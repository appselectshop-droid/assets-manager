import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import employeeApi from '../services/employeeApi';
import PortalLayout from '../components/PortalLayout';
import styles from './MisSolicitudes.module.css';

const ACCOUNT_TYPE_LABELS = { gmail: 'Gmail', platform: 'Plataformas', platform_erp: 'ERP' };

const STATUS_CONFIG = {
  pendiente: { label: 'pendiente', pillClass: 'pillAmber' },
  aprobada:  { label: 'aprobada',  pillClass: 'pillGreen' },
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

function formatDate(d) {
  return new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Junta las 3 solicitudes que se envían desde Mesa de Ayuda (Solicitar
// Cuenta/Recurso/Ingreso) en una sola fila normalizada — cada modelo tiene
// campos distintos, esto es solo para mostrarlas juntas por fecha.
function normalizeAccount(r) {
  return {
    _id: r._id,
    folio: r._id.toString().slice(-6).toUpperCase(),
    label: `Cuenta · ${ACCOUNT_TYPE_LABELS[r.requestType] || r.requestType} — ${r.employeeName}`,
    statusConfig: STATUS_CONFIG[r.status] || STATUS_CONFIG.pendiente,
    createdAt: r.createdAt,
  };
}
function normalizeResource(r) {
  const items = (r.resourceItems || []).join(', ') || 'Recurso';
  return {
    _id: r._id,
    folio: r._id.toString().slice(-6).toUpperCase(),
    label: `Recurso · ${items} — ${r.employeeName}`,
    statusConfig: STATUS_CONFIG[r.status] || STATUS_CONFIG.pendiente,
    createdAt: r.createdAt,
  };
}
function normalizeOnboarding(r) {
  return {
    _id: r._id,
    folio: r._id.toString().slice(-6).toUpperCase(),
    label: `Ingreso · ${r.employeeName}`,
    statusConfig: STATUS_CONFIG[r.status] || STATUS_CONFIG.pendiente,
    createdAt: r.createdAt,
  };
}
function normalizeOffboarding(r) {
  return {
    _id: r._id,
    folio: r._id.toString().slice(-6).toUpperCase(),
    label: `Baja · ${r.employeeName}`,
    statusConfig: OFFBOARDING_STATUS_CONFIG[r.status] || OFFBOARDING_STATUS_CONFIG.pendiente_rh,
    createdAt: r.createdAt,
  };
}
// A diferencia de las otras 4 (derivan un folio de los últimos 6 caracteres
// del _id porque su modelo no tiene uno real), el Ticket de BI YA trae un
// folio real (`TICK-XXXXXX`) — se usa tal cual. Cubre los 2 caminos de
// Soporte BI (biRequestKind), cada uno con su propio label descriptivo.
function normalizeBiRequest(t) {
  const isProyecto = t.biRequestKind === 'proyecto';
  const label = isProyecto
    ? `Proyecto BI · ${t.biProjectData?.nombreReporte || 'Sin nombre'} — ${t.employeeName}`
    : `Bases de datos BI · ${BI_TIPO_LABELS[t.biDatabaseRequest?.tipo] || t.biDatabaseRequest?.tipo} — ${t.employeeName}`;
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
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      employeeApi.get('/account-requests/mine').then(({ data }) => data.map(normalizeAccount)).catch(() => []),
      employeeApi.get('/resource-requests/mine').then(({ data }) => data.map(normalizeResource)).catch(() => []),
      employeeApi.get('/onboarding-requests/mine').then(({ data }) => data.map(normalizeOnboarding)).catch(() => []),
      employeeApi.get('/offboarding-requests/mine').then(({ data }) => data.map(normalizeOffboarding)).catch(() => []),
      employeeApi.get('/tickets/mine/bi-requests').then(({ data }) => data.map(normalizeBiRequest)).catch(() => []),
    ]).then(([accounts, resources, onboarding, offboarding, biRequests]) => {
      const merged = [...accounts, ...resources, ...onboarding, ...offboarding, ...biRequests]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setItems(merged);
    }).finally(() => setLoading(false));
  }, []);

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
                return (
                  <tr key={it._id}>
                    <td><span className={styles.folioLink}>{it.folio}</span></td>
                    <td>{it.label}</td>
                    <td><span className={`${styles.pill} ${styles[sc.pillClass]}`}><span className={styles.dot} />{sc.label}</span></td>
                    <td className={styles.date}>{formatDate(it.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PortalLayout>
  );
}
