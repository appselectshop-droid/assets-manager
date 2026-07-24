import { useEffect, useState } from 'react';
import api from '../services/api';
import { BUSINESS_NAMES, OFFICES } from './Employees';
import styles from './Page.module.css';

// Cuentas de USO MÚLTIPLE — pedido explícito del usuario (2026-07-24): antes
// de esto, un login compartido (ej. "Auxiliar Devoluciones" para
// Safeguarding, usado por varias personas de un mismo puesto/área) se tenía
// que dar de alta como si fuera un Employee normal, sin ninguna forma de
// distinguirlo. Sigue siendo un Employee por dentro (mismo modelo, mismo
// login/activación del portal — ver employeeAuth.js), solo que marcado con
// `isSharedAccount: true`, lo que el backend usa para:
//   1. Excluirlo de /employees/public-lookup (no aparece como sugerencia en
//      Solicitar Cuenta/Recurso/Ingreso/Baja/Confirmar Envío).
//   2. Rechazar del lado del servidor si de todos modos intenta pedir un
//      Gmail/plataforma (accountRequests.js) o un recurso personal
//      (resourceRequests.js) — no tiene sentido que una cuenta compartida
//      pida algo que es, por definición, de una sola persona.
// Sigue pudiendo entrar al portal (Mesa de Ayuda) y reportar/ver tickets
// normal — para eso existe.
//
// Pensada específicamente para tablets de Mesa de Ayuda en las CEDIs
// (pedido explícito del usuario, 2026-07-24): el login es un CORREO (no un
// No. de empleado inventado), porque quien reporta desde ahí puede ser un
// capturista o técnico de paso en la empresa que ni siquiera está dado de
// alta como Employee — para eso existe el paso "¿Quién eres?" en
// ReportarTicket.jsx, que pide su nombre como texto libre sin validarlo
// contra el catálogo de Empleados.
const EMPTY = { email: '', name: '', businessName: '', office: '', department: '' };

export default function CuentasCompartidas() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/employees');
      setAccounts(data.filter((e) => e.isSharedAccount));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const openNew = () => { setForm(EMPTY); setEditing(null); setError(''); setShowModal(true); };
  const openEdit = (acc) => {
    setForm({
      email: acc.corporateEmails?.[0] || acc.employeeId, name: acc.name,
      businessName: acc.businessName || '', office: acc.office || '', department: acc.department || '',
    });
    setEditing(acc._id);
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const email = form.email.trim();
    setSaving(true);
    try {
      // `employeeId` sigue siendo el campo único que exige el modelo
      // Employee — se usa el mismo correo como valor, así el login del
      // portal (que acepta No. de empleado O correo, ver employeeAuth.js)
      // funciona sin importar cuál de los dos escriban.
      const payload = {
        name: form.name, businessName: form.businessName, office: form.office, department: form.department,
        employeeId: email, corporateEmails: [email], isSharedAccount: true,
      };
      if (editing) {
        await api.put(`/employees/${editing}`, payload);
      } else {
        await api.post('/employees', payload);
      }
      setShowModal(false);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar la cuenta.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (acc) => {
    if (!confirm(`¿Eliminar la cuenta compartida "${acc.name}"? Esta acción no se puede deshacer.`)) return;
    await api.delete(`/employees/${acc._id}`);
    load();
  };

  const handleResetAccess = async (acc) => {
    if (!confirm(`¿Restablecer el acceso al portal de "${acc.name}"? La próxima vez que alguien entre con este usuario, tendrá que crear una contraseña nueva.`)) return;
    await api.put(`/employees/${acc._id}/reset-portal-access`);
    alert('Acceso restablecido.');
  };

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Cuentas de Uso Múltiple</h1>
          <p className={styles.subtitle}>
            Logins compartidos por varias personas de un mismo puesto (ej. "Auxiliar Devoluciones") —
            entran al portal y reportan tickets normal, pero no pueden pedir cuentas ni recursos personales.
          </p>
        </div>
        <button className={styles.btnPrimary} onClick={openNew}>+ Nueva cuenta</button>
      </div>

      <div className={styles.tableWrap}>
        {loading && <p className={styles.empty}>Cargando...</p>}
        {!loading && accounts.length === 0 && (
          <p className={styles.empty}>Todavía no hay cuentas de uso múltiple — crea la primera con "+ Nueva cuenta".</p>
        )}
        {!loading && accounts.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Razón social</th>
                <th>Oficina</th>
                <th>Acceso al portal</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <tr key={acc._id}>
                  <td className={styles.nameCell}>{acc.name}</td>
                  <td>{acc.corporateEmails?.[0] || acc.employeeId}</td>
                  <td>{acc.businessName || '—'}</td>
                  <td>{acc.office || '—'}</td>
                  <td>{acc.password ? '✓ Activada' : 'Sin activar'}</td>
                  <td className={styles.actions}>
                    <button className={styles.btnEdit} onClick={() => openEdit(acc)}>Editar</button>
                    <button className={styles.btnView} onClick={() => handleResetAccess(acc)}>🔑 Restablecer</button>
                    <button className={styles.btnDelete} onClick={() => handleDelete(acc)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className={styles.overlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{editing ? 'Editar cuenta compartida' : 'Nueva cuenta compartida'}</h2>
            {error && <p className={styles.empty} style={{ color: '#c0392b' }}>{error}</p>}
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>Correo (usuario del portal) *</label>
                  <input type="email" value={form.email} onChange={set('email')} placeholder="ej. mesadeayuda.cedi1@selectshop.com.mx" required disabled={!!editing} />
                </div>
                <div className={styles.field}>
                  <label>Nombre *</label>
                  <input value={form.name} onChange={set('name')} placeholder="ej. Auxiliar Devoluciones" required />
                </div>
              </div>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>Razón social</label>
                  <select className={styles.select} value={form.businessName} onChange={set('businessName')}>
                    <option value="">— Selecciona —</option>
                    {BUSINESS_NAMES.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className={styles.field}>
                  <label>Oficina / Sucursal</label>
                  <select className={styles.select} value={form.office} onChange={set('office')}>
                    <option value="">— Selecciona —</option>
                    {OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div className={styles.field}>
                <label>Departamento / para qué se usa (opcional)</label>
                <input value={form.department} onChange={set('department')} placeholder="ej. Safeguarding" />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnCancel} onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
