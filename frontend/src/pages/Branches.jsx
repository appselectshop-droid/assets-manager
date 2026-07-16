import { useEffect, useState } from 'react';
import api from '../services/api';
// Mismos estilos que Solicitudes de Cuentas/Ingreso/Recursos/Aplicaciones
// Internas — misma tabla/modal, contenido distinto.
import styles from './AccountRequests.module.css';

const INVENTORY_STATUS_CONFIG = {
  levantado: { label: 'Levantado', color: '#16a34a', bg: '#f0fdf4' },
  pendiente: { label: 'Pendiente', color: '#d97706', bg: '#fffbeb' },
};
const EQUIPMENT_SCOPE_LABELS = {
  solo_telefonico: 'Solo telefónico',
  computo_completo: 'Cómputo completo',
};

const EMPTY = { name: '', inventoryStatus: 'pendiente', equipmentScope: '', notes: '' };

function EditModal({ branch, onClose, onDone }) {
  const [form, setForm] = useState(branch ? {
    name: branch.name || '',
    inventoryStatus: branch.inventoryStatus || 'pendiente',
    equipmentScope: branch.equipmentScope || '',
    notes: branch.notes || '',
  } : EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Falta el nombre de la sucursal.'); return; }
    setError('');
    setSaving(true);
    try {
      if (branch) await api.put(`/branches/${branch._id}`, form);
      else await api.post('/branches', form);
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar la sucursal');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>🏢</span>
          <h2 className={styles.modalTitle}>{branch ? 'Editar sucursal' : 'Nueva sucursal'}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            {error && <p className={styles.formError}>{error}</p>}
            <div className={styles.field}>
              <label>Nombre *</label>
              <input className={styles.input} value={form.name} onChange={set('name')} placeholder="Ej. T. Cuernavaca" />
            </div>
            <div className={styles.field}>
              <label>Estatus del levantamiento físico de inventario</label>
              <select className={styles.input} value={form.inventoryStatus} onChange={set('inventoryStatus')}>
                <option value="pendiente">Pendiente</option>
                <option value="levantado">Levantado</option>
              </select>
            </div>
            <div className={styles.field}>
              <label>Tipo de equipo en esta sucursal</label>
              <select className={styles.input} value={form.equipmentScope} onChange={set('equipmentScope')}>
                <option value="">Sin precisar</option>
                <option value="solo_telefonico">Solo telefónico</option>
                <option value="computo_completo">Cómputo completo</option>
              </select>
            </div>
            <div className={styles.field}>
              <label>Notas (opcional)</label>
              <textarea className={styles.input} rows={2} value={form.notes} onChange={set('notes')}
                placeholder="Cualquier otro detalle útil" />
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// Catálogo real de sucursales — pedido de la junta de Finanzas del 10 jul:
// unifica lo que antes era texto libre duplicado en 3 archivos del frontend,
// y agrega el estatus de levantamiento físico de inventario que la dirección
// dio en la sesión (Naucalpan y Cuernavaca quedaron pendientes). Los nombres
// sembrados de inicio son los mismos ya usados hoy en Empleados/Activos — la
// tabla de la sesión usa otros nombres (Cisnes, Horacio, Tepotzotlán II/III/
// IV, etc.) que no se pudieron reconciliar con certeza; se renombran/agregan
// aquí una vez confirmada la correspondencia real con Sistemas.
export default function Branches() {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState(null); // null = cerrado, {} = crear, branch = editar

  const load = async () => {
    setLoading(true);
    const { data } = await api.get('/branches');
    setBranches(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (branch) => {
    if (!confirm(`¿Eliminar "${branch.name}" del catálogo? Esta acción no se puede deshacer.`)) return;
    await api.delete(`/branches/${branch._id}`);
    load();
  };

  const levantadas = branches.filter((b) => b.inventoryStatus === 'levantado').length;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Sucursales</h1>
          <p className={styles.subtitle}>
            Catálogo único de sucursales — fuente para los selectores de oficina en Empleados y Activos,
            y para trackear el levantamiento físico de inventario ({levantadas}/{branches.length} levantadas).
          </p>
        </div>
        <button className={styles.btnPrimary} onClick={() => setEditTarget({})}>+ Nueva sucursal</button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Sucursal</th>
              <th>Levantamiento de inventario</th>
              <th>Tipo de equipo</th>
              <th>Notas</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className={styles.empty}>Cargando...</td></tr>}
            {!loading && branches.length === 0 && (
              <tr><td colSpan={5} className={styles.empty}>Todavía no hay ninguna sucursal en el catálogo</td></tr>
            )}
            {branches.map((b) => {
              const sc = INVENTORY_STATUS_CONFIG[b.inventoryStatus] || INVENTORY_STATUS_CONFIG.pendiente;
              return (
                <tr key={b._id}>
                  <td className={styles.nameCell}>{b.name}</td>
                  <td>
                    <span className={styles.statusBadge} style={{ color: sc.color, background: sc.bg }}>{sc.label}</span>
                  </td>
                  <td>{b.equipmentScope ? EQUIPMENT_SCOPE_LABELS[b.equipmentScope] : <span className={styles.muted}>Sin precisar</span>}</td>
                  <td className={styles.reasonCell}>{b.notes || <span className={styles.muted}>—</span>}</td>
                  <td>
                    <div className={styles.actions}>
                      <button className={styles.btnView} onClick={() => setEditTarget(b)}>Editar</button>
                      <button className={styles.btnReject} onClick={() => handleDelete(b)}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editTarget !== null && (
        <EditModal
          branch={editTarget._id ? editTarget : null}
          onClose={() => setEditTarget(null)}
          onDone={() => { setEditTarget(null); load(); }}
        />
      )}
    </div>
  );
}
