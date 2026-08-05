import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import styles from './Tickets.module.css';

// "Accesos de Empleados" — pedido explícito del usuario (2026-08-03): no
// quiere ver ni guardar las contraseñas reales del portal de Mesa de Ayuda
// (cada empleado la maneja él mismo — se le dijo así explícitamente — y
// además son bcrypt, de un solo sentido: no se pueden mostrar bajo ninguna
// circunstancia). Lo que sí necesita es poder entrar como esa persona de
// vez en cuando para verificar que algo funcione bien desde su
// perspectiva, sin tocar su contraseña. "Entrar como" abre una sesión de
// 1 hora vía POST /employee-auth/:id/impersonate (admin-only en el
// backend), y siempre queda registrada en Auditoría.
export default function TicketsAccesos() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/employees')
      .then((res) => setEmployees(res.data.filter((e) => e.active !== false)))
      .finally(() => setLoading(false));
  }, []);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    const sorted = employees.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (!query) return sorted;
    return sorted.filter((e) => (
      e.name?.toLowerCase().includes(query)
      || e.employeeId?.toLowerCase().includes(query)
      || (e.corporateEmails || []).some((em) => em.toLowerCase().includes(query))
    ));
  }, [employees, q]);

  // Distinto de localStorage.token/user (esos son tu sesión de Sistemas) —
  // mismas llaves que ya usa el portal (EmployeeLoginWidget.jsx), así que
  // abrir Mesa de Ayuda en otra pestaña no cierra tu propia sesión de
  // admin. Ojo: si ya tenías una sesión de EMPLEADO propia guardada en
  // este navegador (poco común), esto la reemplaza.
  const handleImpersonate = async (emp) => {
    setError('');
    setBusyId(emp._id);
    try {
      const { data } = await api.post(`/employee-auth/${emp._id}/impersonate`);
      localStorage.setItem('employeeToken', data.token);
      localStorage.setItem('employeeUser', JSON.stringify({
        name: data.name,
        canManageOnboarding: data.canManageOnboarding,
        canRequestOffboarding: data.canRequestOffboarding,
        canManageOffboarding: data.canManageOffboarding,
        isSharedAccount: data.isSharedAccount,
        // impersonated (2026-08-05) — PortalLayout.jsx lo usa para no
        // registrar la suscripción push del navegador del admin bajo este
        // empleado (bug real reportado por el usuario: después de "Entrar
        // como" alguien, le empezaban a llegar los push de esa persona).
        impersonated: data.impersonated,
      }));
      window.open('/mesa-de-ayuda', '_blank');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo iniciar sesión como este empleado');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>🔑</div>
          <div>
            <h1 className={styles.title}>Accesos de Empleados</h1>
            <p className={styles.subtitle}>
              Entra a la Mesa de Ayuda como cualquier empleado para verificar que algo funcione bien —
              sin ver ni tocar su contraseña real (esa la maneja cada quien). Sesión de 1 hora, queda en Auditoría.
            </p>
          </div>
        </div>
      </div>

      {error && <p className={styles.formError}>{error}</p>}

      <input
        className={styles.searchInput}
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Busca por nombre, no. de empleado o correo..."
        autoFocus
      />

      {loading ? (
        <p className={styles.empty}>Cargando...</p>
      ) : results.length === 0 ? (
        <p className={styles.empty}>{q.trim() ? `Sin resultados para "${q.trim()}"` : 'Sin empleados activos'}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.zabbixTable}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>No. Empleado</th>
                <th>Correo</th>
                <th>Portal</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {results.map((e) => (
                <tr key={e._id}>
                  <td>{e.name}</td>
                  <td>{e.employeeId || '—'}</td>
                  <td>{(e.corporateEmails || [])[0] || '—'}</td>
                  <td>{e.passwordSetAt ? '✅ Activado' : '⏳ Sin activar'}</td>
                  <td>
                    <button
                      type="button"
                      className={styles.btnCancel}
                      onClick={() => handleImpersonate(e)}
                      disabled={busyId === e._id}
                    >
                      {busyId === e._id ? 'Entrando...' : 'Entrar como'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
