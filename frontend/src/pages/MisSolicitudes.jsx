import { useEffect, useState } from 'react';
import employeeApi from '../services/employeeApi';
import PortalLayout from '../components/PortalLayout';
import styles from './MisSolicitudes.module.css';

const ACCOUNT_TYPE_LABELS = { gmail: 'Gmail', platform: 'Plataformas', platform_erp: 'ERP' };

const STATUS_CONFIG = {
  pendiente: { label: 'pendiente', pillClass: 'pillAmber' },
  aprobada:  { label: 'aprobada',  pillClass: 'pillGreen' },
  rechazada: { label: 'rechazada', pillClass: 'pillRed' },
};

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
    status: r.status,
    createdAt: r.createdAt,
  };
}
function normalizeResource(r) {
  const items = (r.resourceItems || []).join(', ') || 'Recurso';
  return {
    _id: r._id,
    folio: r._id.toString().slice(-6).toUpperCase(),
    label: `Recurso · ${items} — ${r.employeeName}`,
    status: r.status,
    createdAt: r.createdAt,
  };
}
function normalizeOnboarding(r) {
  return {
    _id: r._id,
    folio: r._id.toString().slice(-6).toUpperCase(),
    label: `Ingreso · ${r.employeeName}`,
    status: r.status,
    createdAt: r.createdAt,
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
    ]).then(([accounts, resources, onboarding]) => {
      const merged = [...accounts, ...resources, ...onboarding]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setItems(merged);
    }).finally(() => setLoading(false));
  }, []);

  return (
    <PortalLayout activeNav="solicitudes-mias">
      <div className={styles.mainHead}>
        <h1>Mis solicitudes</h1>
        <p>Cuentas, recursos y altas de ingreso que has pedido, y en qué van.</p>
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
                const sc = STATUS_CONFIG[it.status] || STATUS_CONFIG.pendiente;
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
