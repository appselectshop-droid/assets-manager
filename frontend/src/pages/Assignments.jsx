import { useEffect, useState } from 'react';
import api from '../services/api';
import styles from './Page.module.css';

const TYPE_LABEL = { equipo_computo: 'Equipo de cómputo', celular: 'Celular', accesorio: 'Accesorio', otro: 'Otro' };

export default function Assignments() {
  const [assignments, setAssignments] = useState([]);
  const [search, setSearch] = useState('');

  const load = async () => {
    const { data } = await api.get('/assignments');
    setAssignments(data);
  };

  useEffect(() => { load(); }, []);

  const handleReturn = async (id) => {
    if (!confirm('¿Regresar este activo?')) return;
    await api.delete(`/assignments/${id}`);
    load();
  };

  const filtered = assignments.filter((a) => {
    const q = search.toLowerCase();
    return (
      a.employee?.name?.toLowerCase().includes(q) ||
      a.employee?.employeeId?.toLowerCase().includes(q) ||
      a.asset?.brand?.toLowerCase().includes(q) ||
      a.asset?.model?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Asignaciones activas</h1>
        <span className={styles.count}>{assignments.length} asignaciones</span>
      </div>

      <div className={styles.toolbar}>
        <input
          className={styles.search}
          placeholder="Buscar empleado o activo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>No. Empleado</th>
              <th>Empleado</th>
              <th>Tipo</th>
              <th>Marca / Modelo</th>
              <th>No. Serie</th>
              <th>Fecha asignación</th>
              <th>Notas</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className={styles.empty}>Sin asignaciones activas</td></tr>
            )}
            {filtered.map((a) => (
              <tr key={a._id}>
                <td><code>{a.employee?.employeeId}</code></td>
                <td>{a.employee?.name}</td>
                <td><span className={styles.typeBadge}>{TYPE_LABEL[a.asset?.type] || a.asset?.type}</span></td>
                <td>{a.asset?.brand} {a.asset?.model}</td>
                <td><code>{a.asset?.serialNumber || '—'}</code></td>
                <td>{new Date(a.assignedDate).toLocaleDateString('es-MX')}</td>
                <td>{a.notes || '—'}</td>
                <td>
                  <button className={styles.btnDelete} onClick={() => handleReturn(a._id)}>Regresar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
