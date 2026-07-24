import { useEffect, useState } from 'react';
import api from '../services/api';
import { matchesSearch } from '../utils/search';
import styles from './Page.module.css';

// Vista de SOLO LECTURA de Empleados para el rol ERP-only (lider.erp/
// analista.erp) — pedido explícito del usuario (2026-07-24): antes no
// tenían acceso a Empleados en absoluto (ver NotErpOnlyRoute en App.jsx).
// Deliberadamente un componente aparte y no una versión "recortada" de
// Employees.jsx/EmployeeDetail.jsx: esos dos son grandes y llenos de
// funciones de escritura (activos, cuentas Gmail/Plataformas, altas/bajas)
// que aquí no aplican en absoluto — más simple y seguro tener una página
// chica propia que ir apagando pedazos de una grande.
//
// El backend (GET /api/employees, ver backend/src/routes/employees.js)
// YA decide solo devolver este subconjunto de campos + `hasErpAccess`
// cuando la sesión es ERP-only — este componente no pide ni recibe nunca
// activos/cuentas, ni puede editar/eliminar nada (esas rutas también
// rechazan a ERP-only del lado del servidor, no es solo que el botón no
// se muestre aquí).
export default function EmployeesErp() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/employees').then(({ data }) => setEmployees(data)).finally(() => setLoading(false));
  }, []);

  const filtered = employees.filter((e) => (
    e.active !== false
    && matchesSearch(search, e.name, e.employeeId, e.position, e.area, e.department, e.businessName, e.corporateEmails)
  ));

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Empleados</h1>
          <p className={styles.subtitle}>Solo lectura — para correlacionar un correo corporativo con el empleado y ver si ya tiene acceso ERP.</p>
        </div>
      </div>

      <div className={styles.toolbar}>
        <input
          className={styles.search}
          placeholder="Buscar por nombre, número, puesto, área o departamento..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className={styles.tableWrap}>
        {loading ? (
          <p className={styles.empty}>Cargando...</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>No. Empleado</th>
                <th>Nombre</th>
                <th>Razón Social</th>
                <th>Puesto</th>
                <th>Área</th>
                <th>Departamento</th>
                <th>Correo corporativo</th>
                <th>Acceso ERP</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} className={styles.empty}>Sin resultados</td></tr>
              )}
              {filtered.map((emp) => (
                <tr key={emp._id}>
                  <td><code>{emp.employeeId}</code></td>
                  <td className={styles.nameCell}>{emp.name}</td>
                  <td>{emp.businessName || '—'}</td>
                  <td>{emp.position || '—'}</td>
                  <td>{emp.area || '—'}</td>
                  <td>{emp.department || '—'}</td>
                  <td>{emp.corporateEmails?.join(', ') || '—'}</td>
                  <td>{emp.hasErpAccess ? '✅ Sí' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
