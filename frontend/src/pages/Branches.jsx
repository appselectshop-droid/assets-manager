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

// Panel de migración — el 16 jul el usuario confirmó que la lista vieja de
// 11 sucursales estaba desactualizada y dio la correspondencia real contra
// la tabla de levantamiento. "Corregir nomenclatura" aplica los 9 renombres
// 1 a 1 sin ambigüedad (Employee.office + Asset.location + catálogo);
// "Dividir GOLDEN" separa a los empleados de esa sucursal en Cisnes/Polanco
// Piso 16 según un checklist real (evita typos de escribir nombres a mano).
function MigrationPanel({ onDone }) {
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState(null);
  const [goldenEmployees, setGoldenEmployees] = useState(null);
  const [piso16Ids, setPiso16Ids] = useState(new Set());
  const [splitting, setSplitting] = useState(false);
  const [splitResult, setSplitResult] = useState(null);

  const loadGolden = async () => {
    const { data } = await api.get('/branches/golden-employees');
    setGoldenEmployees(data);
  };

  useEffect(() => { loadGolden(); }, []);

  const handleMigrate = async () => {
    setMigrating(true);
    setMigrateResult(null);
    try {
      const { data } = await api.post('/branches/migrate-office-names');
      setMigrateResult(data.results);
      onDone();
    } catch (err) {
      alert(err.response?.data?.message || 'No se pudo aplicar la corrección');
    } finally {
      setMigrating(false);
    }
  };

  const toggleId = (id) => {
    setPiso16Ids((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSplit = async () => {
    if (piso16Ids.size === 0) { alert('Marca al menos un empleado de Polanco Piso 16.'); return; }
    if (!confirm(`Los ${piso16Ids.size} marcados pasan a POLANCO PISO 16; el resto de GOLDEN (${goldenEmployees.length - piso16Ids.size}) pasa a CISNES. ¿Confirmas?`)) return;
    setSplitting(true);
    setSplitResult(null);
    try {
      const { data } = await api.post('/branches/split-golden', { piso16Ids: [...piso16Ids] });
      setSplitResult(data);
      setGoldenEmployees([]);
      onDone();
    } catch (err) {
      alert(err.response?.data?.message || 'No se pudo dividir GOLDEN');
    } finally {
      setSplitting(false);
    }
  };

  return (
    <div className={styles.tableWrap} style={{ padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
      <h2 className={styles.title} style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Corrección de nomenclatura (16 jul)</h2>
      <p className={styles.subtitle} style={{ marginBottom: '1rem' }}>
        Aplica los renombres confirmados sobre los empleados/activos que ya existen — no solo sobre el catálogo.
      </p>

      <div className={styles.actions} style={{ marginBottom: migrateResult ? '0.75rem' : 0 }}>
        <button className={styles.btnPrimary} onClick={handleMigrate} disabled={migrating}>
          {migrating ? 'Aplicando...' : 'Aplicar corrección de nombres (9 renombres 1 a 1)'}
        </button>
      </div>
      {migrateResult && (
        <ul style={{ fontSize: '0.82rem', color: '#555', marginBottom: '1rem' }}>
          {migrateResult.map((r) => (
            <li key={r.oldName}>{r.oldName} → <strong>{r.newName}</strong>: {r.employeesUpdated} empleado(s), {r.assetsUpdated} activo(s)</li>
          ))}
        </ul>
      )}

      {goldenEmployees === null ? null : goldenEmployees.length === 0 && !splitResult ? (
        <p className={styles.muted}>No hay empleados pendientes en GOLDEN — la división ya no aplica.</p>
      ) : goldenEmployees.length > 0 ? (
        <>
          <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '1rem 0' }} />
          <p style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Dividir GOLDEN → marca quiénes van a POLANCO PISO 16 (el resto pasa a CISNES):
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {goldenEmployees.map((e) => (
              <label key={e._id} className={styles.choiceOption || ''} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', border: '1px solid #eee', borderRadius: '8px', padding: '0.4rem 0.7rem' }}>
                <input type="checkbox" checked={piso16Ids.has(e._id)} onChange={() => toggleId(e._id)} />
                {e.name} {e.department ? `— ${e.department}` : ''}
              </label>
            ))}
          </div>
          <button className={styles.btnPrimary} onClick={handleSplit} disabled={splitting}>
            {splitting ? 'Aplicando...' : 'Aplicar división de GOLDEN'}
          </button>
        </>
      ) : null}
      {splitResult && (
        <p style={{ fontSize: '0.82rem', color: '#555', marginTop: '0.75rem' }}>
          {splitResult.piso16Count} a Polanco Piso 16, {splitResult.cisnesCount} a Cisnes.
          {splitResult.goldenAssetsLeft > 0 && ` (${splitResult.goldenAssetsLeft} activo(s) con ubicación "GOLDEN" quedan para revisión manual.)`}
        </p>
      )}
    </div>
  );
}

// Catálogo real de sucursales — pedido de la junta de Finanzas del 10 jul:
// unifica lo que antes era texto libre duplicado en 3 archivos del frontend,
// y agrega el estatus de levantamiento físico de inventario que la dirección
// dio en la sesión. El 16 jul el usuario confirmó la correspondencia real
// entre la lista vieja y la nueva (ver MigrationPanel arriba) — "GOLDEN" y
// "SUC.6 CEDI Naucalpan" quedan hasta correr/confirmar su división.
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

      <MigrationPanel onDone={load} />

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
