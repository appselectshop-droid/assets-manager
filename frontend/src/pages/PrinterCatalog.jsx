import { useEffect, useState } from 'react';
import api from '../services/api';
import styles from './Page.module.css';

// Catálogo de impresoras por sucursal — pedido explícito del usuario
// (2026-07-24): antes vivía hardcodeado en
// `frontend/src/config/printerCatalog.js`, así que cualquier cambio (una
// impresora nueva, una que se dio de baja) requería tocar código o entrar a
// Mongo Atlas directamente. Ahora es un catálogo real editable aquí mismo.
// Vive dentro de Tickets (no en Catálogos y Activos) porque solo alimenta el
// selector "¿Cuál impresora es?" de Reportar un problema — ver
// `GET /printers/public` (sin sesión, mismo criterio que Aplicaciones
// Internas) consumido desde `ReportarTicket.jsx`.
const EMPTY = { branch: '', nombre: '', modelo: '', serie: '', ip: '' };

export default function PrinterCatalog() {
  const [printers, setPrinters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/printers');
      setPrinters(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const branches = [...new Set(printers.map((p) => p.branch))].sort();

  const openNew = () => { setForm(EMPTY); setEditing(null); setError(''); setShowModal(true); };
  const openEdit = (p) => {
    setForm({ branch: p.branch, nombre: p.nombre, modelo: p.modelo, serie: p.serie || '', ip: p.ip || '' });
    setEditing(p._id);
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/printers/${editing}`, form);
      } else {
        await api.post('/printers', form);
      }
      setShowModal(false);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar la impresora.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p) => {
    if (!confirm(`¿Eliminar "${p.nombre}" (${p.branch})? Esta acción no se puede deshacer.`)) return;
    await api.delete(`/printers/${p._id}`);
    load();
  };

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Impresoras</h1>
          <p className={styles.subtitle}>
            Catálogo por sucursal que alimenta "¿Cuál impresora es?" al reportar un ticket.
          </p>
        </div>
        <button className={styles.btnPrimary} onClick={openNew}>+ Nueva impresora</button>
      </div>

      <div className={styles.tableWrap}>
        {loading && <p className={styles.empty}>Cargando...</p>}
        {!loading && printers.length === 0 && (
          <p className={styles.empty}>Todavía no hay impresoras en el catálogo — crea la primera con "+ Nueva impresora".</p>
        )}
        {!loading && printers.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Sucursal</th>
                <th>Nombre / Ubicación</th>
                <th>Modelo</th>
                <th>Serie</th>
                <th>IP</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {printers.map((p) => (
                <tr key={p._id}>
                  <td>{p.branch}</td>
                  <td className={styles.nameCell}>{p.nombre}</td>
                  <td>{p.modelo}</td>
                  <td>{p.serie || '—'}</td>
                  <td>{p.ip || '—'}</td>
                  <td className={styles.actions}>
                    <button className={styles.btnEdit} onClick={() => openEdit(p)}>Editar</button>
                    <button className={styles.btnDelete} onClick={() => handleDelete(p)}>Eliminar</button>
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
            <h2 className={styles.modalTitle}>{editing ? 'Editar impresora' : 'Nueva impresora'}</h2>
            {error && <p className={styles.empty} style={{ color: '#c0392b' }}>{error}</p>}
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>Sucursal *</label>
                  <input value={form.branch} onChange={set('branch')} placeholder="ej. TEPOTZOTLAN II" list="printer-branches" required />
                  <datalist id="printer-branches">
                    {branches.map((b) => <option key={b} value={b} />)}
                  </datalist>
                </div>
                <div className={styles.field}>
                  <label>Nombre / Ubicación *</label>
                  <input value={form.nombre} onChange={set('nombre')} placeholder="ej. SHARP DEVOLUCIONES" required />
                </div>
              </div>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>Modelo *</label>
                  <input value={form.modelo} onChange={set('modelo')} placeholder="ej. MX-B455W" required />
                </div>
                <div className={styles.field}>
                  <label>Serie (opcional)</label>
                  <input value={form.serie} onChange={set('serie')} placeholder="ej. 8F001165" />
                </div>
              </div>
              <div className={styles.field}>
                <label>IP (opcional)</label>
                <input value={form.ip} onChange={set('ip')} placeholder="ej. 192.168.62.192" />
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
