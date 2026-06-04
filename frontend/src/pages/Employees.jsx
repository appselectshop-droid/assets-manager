import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import ImportModal from '../components/ImportModal';
import styles from './Page.module.css';

const EMPTY = { employeeId: '', name: '', department: '', position: '', email: '' };

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const load = async () => {
    const { data } = await api.get('/employees');
    setEmployees(data);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(EMPTY); setEditing(null); setShowModal(true); };
  const openEdit = (emp) => { setForm(emp); setEditing(emp._id); setShowModal(true); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editing) {
      await api.put(`/employees/${editing}`, form);
    } else {
      await api.post('/employees', form);
    }
    setShowModal(false);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar empleado?')) return;
    await api.delete(`/employees/${id}`);
    load();
  };

  const filtered = employees.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.employeeId.toLowerCase().includes(search.toLowerCase()) ||
      e.department?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Empleados</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className={styles.btnView} style={{ background: '#111', color: '#fff', padding: '0.55rem 1rem' }} onClick={() => setShowImport(true)}>
            📥 Importar Excel
          </button>
          <button className={styles.btnPrimary} onClick={openNew}>+ Nuevo empleado</button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <input
          className={styles.search}
          placeholder="Buscar por nombre, número o departamento..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>No. Empleado</th>
              <th>Nombre</th>
              <th>Departamento</th>
              <th>Puesto</th>
              <th>Correo</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} className={styles.empty}>Sin resultados</td></tr>
            )}
            {filtered.map((emp) => (
              <tr key={emp._id}>
                <td><code>{emp.employeeId}</code></td>
                <td className={styles.nameCell}>{emp.name}</td>
                <td>{emp.department}</td>
                <td>{emp.position}</td>
                <td>{emp.email}</td>
                <td>
                  <div className={styles.actions}>
                    <button className={styles.btnView} onClick={() => navigate(`/employees/${emp._id}`)}>Ver activos</button>
                    <button className={styles.btnEdit} onClick={() => openEdit(emp)}>Editar</button>
                    <button className={styles.btnDelete} onClick={() => handleDelete(emp._id)}>Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showImport && (
        <ImportModal
          entityType="employees"
          onClose={() => setShowImport(false)}
          onDone={load}
        />
      )}

      {showModal && (
        <div className={styles.overlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{editing ? 'Editar empleado' : 'Nuevo empleado'}</h2>
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>No. Empleado *</label>
                  <input value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} required />
                </div>
                <div className={styles.field}>
                  <label>Nombre completo *</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
              </div>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>Departamento</label>
                  <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
                </div>
                <div className={styles.field}>
                  <label>Puesto</label>
                  <input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
                </div>
              </div>
              <div className={styles.field}>
                <label>Correo</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnCancel} onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className={styles.btnPrimary}>Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
