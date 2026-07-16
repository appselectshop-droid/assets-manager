import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import styles from './Dashboard.module.css';

// Landing simple: saludo + accesos directos + "qué necesita mi atención hoy"
// (Solicitudes/Envíos pendientes). El detalle analítico (KPIs de inventario,
// actividad del equipo, tickets) vive en Indicadores.jsx — separación pedida
// por dirección para que la navegación se sienta en bloques claros, no todo
// mezclado en una sola pantalla.
export default function Dashboard() {
  const [opsRaw, setOpsRaw] = useState(null);
  const navigate = useNavigate();
  const user     = JSON.parse(localStorage.getItem('user') || '{}');
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const today    = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Pendientes de revisión (Solicitudes de Cuentas/ERP/Ingreso/Recursos, Envíos
  // en curso) — mismos criterios de visibilidad que el sidebar (Layout.jsx):
  // cada módulo solo se pide si el usuario realmente lo puede ver, así que
  // nunca se intenta una llamada que vaya a regresar 403 por permisos.
  const canAccounts = user.canManageGmailAccounts || user.canManagePlatformAccounts;
  const canErp      = user.canManagePlatformAccountsErp;
  const isAdmin     = user.role === 'admin';
  useEffect(() => {
    const jobs = {};
    if (canAccounts) jobs.accountRequests = api.get('/account-requests', { params: { type: 'gmail,platform', status: 'pendiente' } });
    if (canErp)      jobs.erpRequests     = api.get('/account-requests', { params: { type: 'platform_erp', status: 'pendiente' } });
    if (isAdmin)      jobs.onboarding     = api.get('/onboarding-requests', { params: { status: 'pendiente' } });
    if (isAdmin)      jobs.resource       = api.get('/resource-requests',   { params: { status: 'pendiente' } });
    if (isAdmin)      jobs.shipments      = api.get('/shipments');
    if (isAdmin)      jobs.tickets        = api.get('/tickets', { params: { status: 'abierto,en_proceso' } });

    const keys = Object.keys(jobs);
    if (keys.length === 0) { setOpsRaw({}); return; }
    Promise.allSettled(Object.values(jobs)).then((results) => {
      const out = {};
      keys.forEach((key, i) => { out[key] = results[i].status === 'fulfilled' ? results[i].value.data : []; });
      setOpsRaw(out);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  let pendingCards = [];
  if (opsRaw) {
    if (opsRaw.accountRequests) {
      pendingCards.push({ key: 'accounts', label: 'Solicitudes de Cuentas', icon: '📝', color: '#2563eb', count: opsRaw.accountRequests.length, sub: 'pendientes', path: '/account-requests' });
    }
    if (opsRaw.erpRequests) {
      pendingCards.push({ key: 'erp', label: 'Solicitudes ERP', icon: '🏭', color: '#7c3aed', count: opsRaw.erpRequests.length, sub: 'pendientes', path: '/account-requests-erp' });
    }
    if (opsRaw.onboarding) {
      pendingCards.push({ key: 'onboarding', label: 'Ingresos RH', icon: '🧑‍💼', color: '#16a34a', count: opsRaw.onboarding.length, sub: 'pendientes', path: '/onboarding-requests' });
    }
    if (opsRaw.resource) {
      pendingCards.push({ key: 'resource', label: 'Solicitudes de Recursos', icon: '📦', color: '#d97706', count: opsRaw.resource.length, sub: 'pendientes', path: '/resource-requests' });
    }
    if (opsRaw.shipments) {
      const enCurso = opsRaw.shipments.filter((s) => s.status !== 'recibido').length;
      pendingCards.push({ key: 'shipments', label: 'Envíos entre Sucursales', icon: '🚚', color: '#E8431A', count: enCurso, sub: 'en curso', path: '/shipments' });
    }
    if (opsRaw.tickets) {
      pendingCards.push({ key: 'tickets', label: 'Tickets', icon: '🎫', color: '#0d9488', count: opsRaw.tickets.length, sub: 'abiertos', path: '/tickets' });
    }
  }

  return (
    <div className={styles.page}>

      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.greeting}>{greeting}, <span>{user.name?.split(' ')[0]}</span> 👋</h1>
          <p className={styles.date}>{today.charAt(0).toUpperCase() + today.slice(1)}</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.btnAction} onClick={() => navigate('/assets')}>+ Nuevo activo</button>
          <button className={styles.btnActionSecondary} onClick={() => navigate('/employees')}>+ Empleado</button>
        </div>
      </div>

      {/* Accesos directos a los 3 bloques de la app */}
      <div className={styles.quickRow}>
        <div className={styles.quickCard} onClick={() => navigate('/mesa-de-ayuda')}>
          <span className={styles.quickIcon}>🙋</span>
          <div>
            <p className={styles.quickTitle}>Mesa de Ayuda</p>
            <p className={styles.quickSub}>Portal del empleado</p>
          </div>
        </div>
        <div className={styles.quickCard} onClick={() => navigate('/employees')}>
          <span className={styles.quickIcon}>🗂️</span>
          <div>
            <p className={styles.quickTitle}>Administración de Usuarios y Activos</p>
            <p className={styles.quickSub}>Catálogos, activos, cuentas, envíos</p>
          </div>
        </div>
        <div className={styles.quickCard} onClick={() => navigate('/indicadores')}>
          <span className={styles.quickIcon}>📊</span>
          <div>
            <p className={styles.quickTitle}>Indicadores</p>
            <p className={styles.quickSub}>KPIs de servicio del área</p>
          </div>
        </div>
      </div>

      {/* Pendientes de revisión — Solicitudes de Cuentas/ERP/Ingreso/Recursos y
          Envíos en curso, cada quien ve solo lo que ya puede ver en el sidebar. */}
      {pendingCards.length > 0 && (
        <>
          <h2 className={styles.sectionHeading}>Pendientes de revisión</h2>
          <div className={styles.pendingRow}>
            {pendingCards.map((c) => (
              <div key={c.key} className={styles.kpi} onClick={() => navigate(c.path)} style={{ '--accent': c.color }}>
                <div className={styles.kpiTop}>
                  <span className={styles.kpiIcon}>{c.icon}</span>
                  <span className={styles.kpiValue} style={{ color: c.color }}>{c.count}</span>
                </div>
                <p className={styles.kpiLabel}>{c.label}</p>
                <p className={styles.kpiSub}>{c.sub}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
