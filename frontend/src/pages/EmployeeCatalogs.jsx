import { useEffect, useState } from 'react';
import api from '../services/api';
// Mismos estilos que Solicitudes de Cuentas/Ingreso/Recursos — misma
// tabla/modal, contenido distinto.
import styles from './AccountRequests.module.css';

// Pedido explícito del usuario (2026-08-07): antes cada uno de estos 5
// catálogos era una lista fija en el código (o texto libre, sin lista)
// repetida en varios formularios (Employees.jsx, assetFields.js, etc.) —
// ahora se gestionan desde aquí y todos los formularios leen de la misma
// fuente (ver hooks/useEmployeeCatalog.js).
const TABS = [
  { type: 'departamento', label: 'Departamentos' },
  { type: 'area', label: 'Áreas' },
  { type: 'razon_social', label: 'Razones Sociales' },
  { type: 'puesto', label: 'Puestos' },
  { type: 'oficina', label: 'Oficinas' },
];

function EditModal({ type, item, onClose, onDone }) {
  const [label, setLabel] = useState(item?.label || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!label.trim()) { setError('Falta el nombre'); return; }
    setError('');
    setSaving(true);
    try {
      if (item) await api.put(`/employee-catalogs/item/${item._id}`, { label });
      else await api.post(`/employee-catalogs/${type}`, { label });
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{item ? 'Editar' : 'Agregar'}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            {error && <p className={styles.formError}>{error}</p>}
            <div className={styles.field}>
              <label>Nombre *</label>
              <input className={styles.input} value={label} onChange={(e) => setLabel(e.target.value)} autoFocus placeholder="Ej. Recursos Humanos" />
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function EmployeeCatalogs() {
  const [activeType, setActiveType] = useState('departamento');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState(null); // null=cerrado, {}=agregar, item=editar

  const load = async () => {
    setLoading(true);
    const { data } = await api.get(`/employee-catalogs/${activeType}`);
    setItems(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [activeType]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (item) => {
    if (!confirm(`¿Eliminar "${item.label}"? Los empleados que ya tengan este valor no cambian — solo deja de aparecer como opción para altas/ediciones nuevas.`)) return;
    await api.delete(`/employee-catalogs/item/${item._id}`);
    load();
  };

  const activeLabel = TABS.find((t) => t.type === activeType)?.label;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Catálogos de Empleados</h1>
          <p className={styles.subtitle}>
            Departamentos, áreas, razones sociales, puestos y oficinas — agrega, edita o elimina las opciones
            que aparecen en el formulario de Empleados y demás pantallas que las usan.
          </p>
        </div>
        <button className={styles.btnPrimary} onClick={() => setEditTarget({})}>+ Agregar</button>
      </div>

      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t.type}
            className={`${styles.tab} ${activeType === t.type ? styles.tabActive : ''}`}
            onClick={() => setActiveType(t.type)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>{activeLabel}</th><th>Acciones</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={2} className={styles.empty}>Cargando...</td></tr>}
            {!loading && items.length === 0 && (
              <tr><td colSpan={2} className={styles.empty}>Todavía no hay opciones en {activeLabel}</td></tr>
            )}
            {items.map((item) => (
              <tr key={item._id}>
                <td className={styles.nameCell}>{item.label}</td>
                <td>
                  <div className={styles.actions}>
                    <button className={styles.btnView} onClick={() => setEditTarget(item)}>Editar</button>
                    <button className={styles.btnReject} onClick={() => handleDelete(item)}>Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editTarget !== null && (
        <EditModal
          type={activeType}
          item={editTarget._id ? editTarget : null}
          onClose={() => setEditTarget(null)}
          onDone={() => { setEditTarget(null); load(); }}
        />
      )}
    </div>
  );
}
