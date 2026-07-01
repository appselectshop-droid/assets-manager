import { useEffect, useState } from 'react';
import api from '../services/api';
import styles from './Users.module.css';

const EMPTY = { name: '', email: '', role: 'viewer', password: '' };

const ROLE_CONFIG = {
  admin: { label: 'Administrador', color: '#E8431A', bg: '#fff0ee' },
  viewer: { label: 'Solo lectura', color: '#555', bg: '#f0f0f0' },
};

const GMAIL_ROOT_EMAIL = 'sistemas.2@selectshop.com.mx';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const isGmailRoot = currentUser.email === GMAIL_ROOT_EMAIL;

  const toggleGmailPermission = async (u) => {
    try {
      await api.put(`/users/${u._id}`, { canManageGmailAccounts: !u.canManageGmailAccounts });
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Error al actualizar el permiso');
    }
  };

  const togglePlatformPermission = async (u) => {
    try {
      await api.put(`/users/${u._id}`, { canManagePlatformAccounts: !u.canManagePlatformAccounts });
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Error al actualizar el permiso');
    }
  };

  const togglePlatformErpPermission = async (u) => {
    try {
      await api.put(`/users/${u._id}`, { canManagePlatformAccountsErp: !u.canManagePlatformAccountsErp });
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Error al actualizar el permiso');
    }
  };

  const load = async () => {
    const { data } = await api.get('/users');
    setUsers(data);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setForm(EMPTY);
    setEditing(null);
    setError('');
    setShowModal(true);
  };

  const openEdit = (u) => {
    setForm({ name: u.name, email: u.email, role: u.role, password: '' });
    setEditing(u._id);
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = { ...form };
      if (editing && !payload.password) delete payload.password;
      if (editing) {
        await api.put(`/users/${editing}`, payload);
      } else {
        await api.post('/users', payload);
      }
      setShowModal(false);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Error al guardar');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`¿Eliminar al usuario "${name}"?`)) return;
    try {
      await api.delete(`/users/${id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Error al eliminar');
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Usuarios</h1>
          <p className={styles.subtitle}>Gestión de acceso al sistema</p>
        </div>
        <button className={styles.btnPrimary} onClick={openNew}>+ Nuevo usuario</button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Correo electrónico</th>
              <th>Rol</th>
              {isGmailRoot && <th>Cuentas Gmail</th>}
              {isGmailRoot && <th>Cuentas Plataformas</th>}
              {isGmailRoot && <th>Plataformas ERP</th>}
              <th>Creado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr><td colSpan={isGmailRoot ? 8 : 5} className={styles.empty}>Sin usuarios registrados</td></tr>
            )}
            {users.map((u) => {
              const rc = ROLE_CONFIG[u.role] || ROLE_CONFIG.viewer;
              const isMe = u.name === currentUser.name;
              return (
                <tr key={u._id}>
                  <td>
                    <div className={styles.userCell}>
                      <div className={styles.avatar} style={{ background: u.role === 'admin' ? '#E8431A' : '#888' }}>
                        {u.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <span className={styles.userName}>{u.name}</span>
                        {isMe && <span className={styles.meTag}>Tú</span>}
                      </div>
                    </div>
                  </td>
                  <td className={styles.email}>{u.email}</td>
                  <td>
                    <span className={styles.roleBadge} style={{ color: rc.color, background: rc.bg }}>
                      {rc.label}
                    </span>
                  </td>
                  {isGmailRoot && (
                    <td>
                      <label className={styles.gmailToggle} title="Puede crear/gestionar cuentas Gmail y sus contraseñas">
                        <input
                          type="checkbox"
                          checked={!!u.canManageGmailAccounts}
                          onChange={() => toggleGmailPermission(u)}
                          disabled={u.email === GMAIL_ROOT_EMAIL}
                        />
                        {u.email === GMAIL_ROOT_EMAIL ? 'Siempre activo' : (u.canManageGmailAccounts ? 'Sí' : 'No')}
                      </label>
                    </td>
                  )}
                  {isGmailRoot && (
                    <td>
                      <label className={styles.gmailToggle} title="Puede crear/gestionar cuentas de otras plataformas (Microsoft, Amazon, etc.) y sus contraseñas">
                        <input
                          type="checkbox"
                          checked={!!u.canManagePlatformAccounts}
                          onChange={() => togglePlatformPermission(u)}
                          disabled={u.email === GMAIL_ROOT_EMAIL}
                        />
                        {u.email === GMAIL_ROOT_EMAIL ? 'Siempre activo' : (u.canManagePlatformAccounts ? 'Sí' : 'No')}
                      </label>
                    </td>
                  )}
                  {isGmailRoot && (
                    <td>
                      <label className={styles.gmailToggle} title="Puede crear/gestionar cuentas de plataformas ERP y sus contraseñas — página exclusiva, separada de Cuentas de Plataformas">
                        <input
                          type="checkbox"
                          checked={!!u.canManagePlatformAccountsErp}
                          onChange={() => togglePlatformErpPermission(u)}
                          disabled={u.email === GMAIL_ROOT_EMAIL}
                        />
                        {u.email === GMAIL_ROOT_EMAIL ? 'Siempre activo' : (u.canManagePlatformAccountsErp ? 'Sí' : 'No')}
                      </label>
                    </td>
                  )}
                  <td className={styles.date}>
                    {new Date(u.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td>
                    <div className={styles.actions}>
                      <button className={styles.btnEdit} onClick={() => openEdit(u)}>Editar</button>
                      {!isMe && (
                        <button className={styles.btnDelete} onClick={() => handleDelete(u._id, u.name)}>
                          Eliminar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className={styles.overlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{editing ? 'Editar usuario' : 'Nuevo usuario'}</h2>
              <button className={styles.closeBtn} onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSubmit} className={styles.form}>
              {error && <p className={styles.formError}>{error}</p>}

              <div className={styles.field}>
                <label>Nombre completo *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Juan Pérez"
                  required
                />
              </div>

              <div className={styles.field}>
                <label>Correo electrónico *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="juan@empresa.com"
                  required
                />
              </div>

              <div className={styles.field}>
                <label>Rol *</label>
                <div className={styles.roleCards}>
                  <label className={`${styles.roleCard} ${form.role === 'admin' ? styles.roleCardActive : ''}`}>
                    <input
                      type="radio"
                      name="role"
                      value="admin"
                      checked={form.role === 'admin'}
                      onChange={() => setForm({ ...form, role: 'admin' })}
                    />
                    <span className={styles.roleIcon}>🔑</span>
                    <div>
                      <span className={styles.roleName}>Administrador</span>
                      <span className={styles.roleDesc}>Acceso total — crear, editar, eliminar, gestionar usuarios</span>
                    </div>
                  </label>
                  <label className={`${styles.roleCard} ${form.role === 'viewer' ? styles.roleCardActive : ''}`}>
                    <input
                      type="radio"
                      name="role"
                      value="viewer"
                      checked={form.role === 'viewer'}
                      onChange={() => setForm({ ...form, role: 'viewer' })}
                    />
                    <span className={styles.roleIcon}>👁️</span>
                    <div>
                      <span className={styles.roleName}>Solo lectura</span>
                      <span className={styles.roleDesc}>Puede ver empleados, activos y asignaciones sin modificar</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className={styles.field}>
                <label>{editing ? 'Nueva contraseña (dejar en blanco para no cambiar)' : 'Contraseña *'}</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={editing ? '••••••••' : 'Mínimo 6 caracteres'}
                  required={!editing}
                  minLength={editing ? 0 : 6}
                />
              </div>

              <div className={styles.modalActions}>
                <button type="button" className={styles.btnCancel} onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={loading}>
                  {loading ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
