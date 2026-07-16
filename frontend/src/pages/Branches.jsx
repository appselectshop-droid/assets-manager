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

// Divide una sucursal vieja en dos nuevas según un checklist real de
// empleados (evita typos de escribir nombres a mano) — mismo patrón para
// GOLDEN → Cisnes/Piso 16 y Torre Polanco → Piso 13/Piso 16.
function SplitSection({ title, fetchUrl, splitUrl, targetLabel, defaultLabel, describeResult, onDone }) {
  const [pending, setPending] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [splitting, setSplitting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => { api.get(fetchUrl).then(({ data }) => setPending(data)); }, [fetchUrl]);

  const toggle = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSplit = async () => {
    if (selectedIds.size === 0) { alert(`Marca al menos un empleado de ${targetLabel}.`); return; }
    if (!confirm(`Los ${selectedIds.size} marcados pasan a ${targetLabel}; el resto (${pending.length - selectedIds.size}) pasa a ${defaultLabel}. ¿Confirmas?`)) return;
    setSplitting(true);
    setResult(null);
    try {
      const { data } = await api.post(splitUrl, { piso16Ids: [...selectedIds] });
      setResult(data);
      setPending([]);
      onDone();
    } catch (err) {
      alert(err.response?.data?.message || 'No se pudo aplicar la división');
    } finally {
      setSplitting(false);
    }
  };

  if (pending === null) return null;

  if (pending.length === 0) {
    return result ? (
      <p style={{ fontSize: '0.82rem', color: '#555' }}>{describeResult(result)}</p>
    ) : (
      <p className={styles.muted}>No hay empleados pendientes en {title} — la división ya no aplica.</p>
    );
  }

  return (
    <>
      <p style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem' }}>
        Dividir {title} → marca quiénes van a {targetLabel} (el resto pasa a {defaultLabel}):
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
        {pending.map((e) => (
          <label key={e._id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', border: '1px solid #eee', borderRadius: '8px', padding: '0.4rem 0.7rem' }}>
            <input type="checkbox" checked={selectedIds.has(e._id)} onChange={() => toggle(e._id)} />
            {e.name} {e.department ? `— ${e.department}` : ''}
          </label>
        ))}
      </div>
      <button className={styles.btnPrimary} onClick={handleSplit} disabled={splitting}>
        {splitting ? 'Aplicando...' : `Aplicar división de ${title}`}
      </button>
    </>
  );
}

// Panel de migración — el 16 jul el usuario confirmó que la lista vieja de
// 11 sucursales estaba desactualizada y dio la correspondencia real contra
// la tabla de levantamiento. "Corregir nomenclatura" aplica los 8 renombres
// 1 a 1 sin ambigüedad (Employee.office + Asset.location + catálogo);
// las 2 divisiones (GOLDEN y Torre Polanco) separan a sus empleados según un
// checklist real, porque cada una resultó tener excepciones que no se podían
// resolver solo con el nombre de la sucursal.
function MigrationPanel({ onDone }) {
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState(null);

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

  return (
    <div className={styles.tableWrap} style={{ padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
      <h2 className={styles.title} style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Corrección de nomenclatura (16 jul)</h2>
      <p className={styles.subtitle} style={{ marginBottom: '1rem' }}>
        Aplica los renombres confirmados sobre los empleados/activos que ya existen — no solo sobre el catálogo.
      </p>

      <div className={styles.actions} style={{ marginBottom: migrateResult ? '0.75rem' : 0 }}>
        <button className={styles.btnPrimary} onClick={handleMigrate} disabled={migrating}>
          {migrating ? 'Aplicando...' : 'Aplicar corrección de nombres (8 renombres 1 a 1)'}
        </button>
      </div>
      {migrateResult && (
        <ul style={{ fontSize: '0.82rem', color: '#555', marginBottom: '1rem' }}>
          {migrateResult.map((r) => (
            <li key={r.oldName}>{r.oldName} → <strong>{r.newName}</strong>: {r.employeesUpdated} empleado(s), {r.assetsUpdated} activo(s)</li>
          ))}
        </ul>
      )}

      <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '1rem 0' }} />
      <SplitSection
        title="GOLDEN"
        fetchUrl="/branches/golden-employees"
        splitUrl="/branches/split-golden"
        targetLabel="POLANCO PISO 16"
        defaultLabel="CISNES"
        describeResult={(r) => `${r.piso16Count} a Polanco Piso 16, ${r.cisnesCount} a Cisnes.${r.goldenAssetsLeft > 0 ? ` (${r.goldenAssetsLeft} activo(s) con ubicación "GOLDEN" quedan para revisión manual.)` : ''}`}
        onDone={onDone}
      />

      <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '1rem 0' }} />
      <SplitSection
        title="Torre Polanco"
        fetchUrl="/branches/torre-polanco-employees"
        splitUrl="/branches/split-torre-polanco"
        targetLabel="POLANCO PISO 16"
        defaultLabel="POLANCO PISO 13"
        describeResult={(r) => `${r.piso16Count} a Polanco Piso 16, ${r.piso13Count} a Polanco Piso 13, ${r.assetsUpdated} activo(s) a Polanco Piso 13.`}
        onDone={onDone}
      />
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
