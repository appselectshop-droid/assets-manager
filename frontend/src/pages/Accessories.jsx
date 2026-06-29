import { useEffect, useState, Fragment } from 'react';
import api from '../services/api';
import {
  ACCESSORY_TYPE_LABELS, ACCESSORY_GROUPS, SPECS_FIELDS, TYPE_ICONS, OFFICES,
} from '../config/assetFields';
import styles from './Assets.module.css';

const TABS = [
  { key: 'todos',        label: 'Todos',        icon: '📋', types: null },
  { key: 'perifericos',  label: 'Periféricos',  icon: '🖥️', types: ['monitor', 'mouse', 'teclado', 'kit_perifericos', 'audifonos', 'webcam', 'hub_usb'] },
  { key: 'cables',       label: 'Cables',       icon: '🔌', types: ['cable'] },
  { key: 'consumibles',  label: 'Consumibles',  icon: '🧹', types: ['consumible'] },
  { key: 'herramientas', label: 'Herramientas', icon: '🔧', types: ['herramienta'] },
  { key: 'otros',        label: 'Otros',        icon: '📦', types: ['accesorio'] },
];

function buildEmptySpecs(type) {
  const fields = SPECS_FIELDS[type] || [];
  const specs = {};
  fields.forEach((f) => { specs[f.key] = f.type === 'boolean' ? false : ''; });
  return specs;
}

function SpecsField({ field, value, onChange }) {
  if (field.type === 'boolean') {
    return (
      <label className={styles.checkLabel}>
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(field.key, e.target.checked)} className={styles.checkbox} />
        {field.label}
      </label>
    );
  }
  if (field.type === 'select') {
    return (
      <div className={`${styles.field} ${field.col === 2 ? styles.colSpan2 : ''}`}>
        <label>{field.label}</label>
        <select value={value || ''} onChange={(e) => onChange(field.key, e.target.value)}>
          <option value="">Seleccionar...</option>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }
  return (
    <div className={`${styles.field} ${field.col === 2 ? styles.colSpan2 : ''}`}>
      <label>{field.label}</label>
      <input value={value || ''} onChange={(e) => onChange(field.key, e.target.value)} placeholder={field.placeholder} />
    </div>
  );
}

function ProductModal({ editing, onClose, onSaved }) {
  const initType = editing?.type || 'mouse';
  const [type, setType] = useState(initType);
  const [form, setForm] = useState({
    brand:        editing?.brand        || '',
    model:        editing?.model        || '',
    serialNumber: editing?.serialNumber || '',
    inventoryTag: editing?.inventoryTag || '',
    stockTotal:   editing?.stockTotal ?? 1,
    purchaseDate: editing?.purchaseDate ? String(editing.purchaseDate).slice(0, 10) : '',
    notes:        editing?.notes        || '',
    location:     editing?.location     || '',
  });
  const [specs, setSpecs] = useState(
    editing
      ? { ...buildEmptySpecs(editing.type), ...(editing.specs || {}) }
      : buildEmptySpecs(initType)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleTypeChange = (newType) => {
    setType(newType);
    setSpecs(buildEmptySpecs(newType));
  };

  const setSpec = (key, val) => setSpecs((s) => ({ ...s, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        category: 'accesorio',
        type,
        brand:        form.brand,
        model:        form.model,
        serialNumber: form.serialNumber,
        inventoryTag: form.inventoryTag,
        stockTotal:   Math.max(1, parseInt(form.stockTotal) || 1),
        purchaseDate: form.purchaseDate || undefined,
        notes:        form.notes,
        location:     form.location,
        specs,
      };
      if (editing) {
        await api.put(`/assets/${editing._id}`, payload);
      } else {
        await api.post('/assets', payload);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Error al guardar');
      setSaving(false);
    }
  };

  const specFields = SPECS_FIELDS[type] || [];
  const boolFields = specFields.filter((f) => f.type === 'boolean');
  const otherFields = specFields.filter((f) => f.type !== 'boolean');

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>{TYPE_ICONS[type] || '📦'}</span>
          <h2 className={styles.modalTitle}>{editing ? 'Editar producto' : 'Registrar producto'}</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          {error && <p className={styles.formError}>{error}</p>}

          <div className={styles.section}>
            <p className={styles.sectionLabel}>Tipo de accesorio</p>
            <div className={styles.typeGrid}>
              {ACCESSORY_GROUPS.map((g) => (
                <div key={g.label}>
                  <p className={styles.groupLabel}>{g.icon} {g.label}</p>
                  <div className={styles.typeBtns}>
                    {g.types.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`${styles.typeBtn} ${type === t ? styles.typeBtnActive : ''}`}
                        onClick={() => handleTypeChange(t)}
                      >
                        {ACCESSORY_TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.section}>
            <p className={styles.sectionLabel}>Identificación del producto</p>
            <div className={styles.grid}>
              <div className={styles.field}>
                <label>Marca</label>
                <input value={form.brand} onChange={set('brand')} placeholder="Logitech / Dell / Genérico..." />
              </div>
              <div className={styles.field}>
                <label>Modelo / Descripción</label>
                <input value={form.model} onChange={set('model')} placeholder="MX Master / HDMI 2.0..." />
              </div>
              <div className={styles.field}>
                <label>No. de serie / Lote</label>
                <input value={form.serialNumber} onChange={set('serialNumber')} placeholder="Opcional" />
              </div>
              <div className={styles.field}>
                <label>Etiqueta inventario</label>
                <input value={form.inventoryTag} onChange={set('inventoryTag')} placeholder="ACC-001" />
              </div>
              <div className={styles.field}>
                <label>Cantidad en stock</label>
                <input
                  type="number"
                  min="1"
                  value={form.stockTotal}
                  onChange={set('stockTotal')}
                  placeholder="1"
                  required
                />
              </div>
              <div className={styles.field}>
                <label>Fecha de compra</label>
                <input type="date" value={form.purchaseDate} onChange={set('purchaseDate')} />
              </div>
              <div className={`${styles.field} ${styles.colSpan2}`}>
                <label>Sucursal / Ubicación</label>
                <select value={form.location} onChange={set('location')}>
                  <option value="">— Sin asignar —</option>
                  {OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
          </div>

          {otherFields.length > 0 && (
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Detalles — {ACCESSORY_TYPE_LABELS[type]}</p>
              <div className={styles.grid}>
                {otherFields.map((f) => (
                  <SpecsField key={f.key} field={f} value={specs[f.key]} onChange={setSpec} />
                ))}
              </div>
            </div>
          )}

          {boolFields.length > 0 && (
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Características adicionales</p>
              <div className={styles.checkGrid}>
                {boolFields.map((f) => (
                  <SpecsField key={f.key} field={f} value={specs[f.key]} onChange={setSpec} />
                ))}
              </div>
            </div>
          )}

          <div className={styles.section}>
            <div className={styles.field}>
              <label>Notas adicionales</label>
              <input value={form.notes} onChange={set('notes')} placeholder="Observaciones, condición, etc." />
            </div>
          </div>

          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.btnPrimary} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AssignModal({ product, onClose, onAssigned }) {
  const [employees, setEmployees] = useState([]);
  const [empSearch, setEmpSearch] = useState('');
  const [assignTo, setAssignTo] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const maxQty = product._availableQty;

  useEffect(() => {
    api.get('/employees').then(({ data }) => setEmployees(data));
  }, []);

  const filteredEmps = employees.filter((e) => {
    const q = empSearch.toLowerCase();
    return (
      e.employeeId.toLowerCase().includes(q) ||
      e.phone?.toLowerCase().includes(q) ||
      e.name.toLowerCase().includes(q)
    );
  }).slice(0, 8);

  const handleAssign = async () => {
    if (!assignTo) { setError('Selecciona un empleado'); return; }
    const qty = Math.min(maxQty, Math.max(1, parseInt(quantity) || 1));
    setLoading(true);
    setError('');
    try {
      await api.post('/assignments', {
        employee: assignTo._id,
        asset: product._id,
        quantity: qty,
        notes,
      });
      onAssigned();
    } catch (e) {
      setError(e.response?.data?.message || 'Error al asignar');
      setLoading(false);
    }
  };

  const name = [product.brand, product.model].filter(Boolean).join(' ') ||
    ACCESSORY_TYPE_LABELS[product.type] || product.type;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>{TYPE_ICONS[product.type] || '📦'}</span>
          <h2 className={styles.modalTitle}>Asignar — {name}</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.form}>
          {error && <p className={styles.formError}>{error}</p>}

          <div className={styles.section}>
            <p className={styles.sectionLabel}>
              {maxQty === 1 ? '1 unidad disponible' : `${maxQty} unidades disponibles`}
            </p>
            <div className={styles.field} style={{ maxWidth: 200 }}>
              <label>Cantidad a asignar</label>
              <input
                type="number"
                min="1"
                max={maxQty}
                value={quantity}
                onChange={(e) =>
                  setQuantity(Math.min(maxQty, Math.max(1, parseInt(e.target.value) || 1)))
                }
              />
            </div>
          </div>

          <div className={styles.section}>
            <p className={styles.sectionLabel}>Empleado</p>
            {assignTo ? (
              <div className={styles.assignSelected}>
                <div className={styles.assignSelectedInfo}>
                  <span className={styles.assignAvatar}>
                    {assignTo.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <p className={styles.assignName}>{assignTo.name}</p>
                    <p className={styles.assignSub}>
                      {assignTo.employeeId}
                      {assignTo.office && ` · ${assignTo.office}`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.assignClear}
                  onClick={() => { setAssignTo(null); setEmpSearch(''); }}
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <div className={styles.empSearchWrap}>
                <input
                  className={styles.empSearchInput}
                  placeholder="No. de empleado o teléfono..."
                  value={empSearch}
                  onChange={(e) => setEmpSearch(e.target.value)}
                  autoFocus
                />
                {empSearch && (
                  <div className={styles.empDropdown}>
                    {filteredEmps.length === 0 ? (
                      <p className={styles.empEmpty}>Sin resultados</p>
                    ) : (
                      filteredEmps.map((emp) => (
                        <button
                          key={emp._id}
                          type="button"
                          className={styles.empOption}
                          onClick={() => { setAssignTo(emp); setEmpSearch(''); }}
                        >
                          <span className={styles.empOptionAvatar}>
                            {emp.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </span>
                          <div>
                            <p className={styles.empOptionName}>{emp.name}</p>
                            <p className={styles.empOptionSub}>
                              <strong>{emp.employeeId}</strong>
                              {emp.phone && ` · 📞 ${emp.phone}`}
                              {emp.office && ` · ${emp.office}`}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles.field}>
              <label>Notas (opcional)</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observaciones sobre la entrega..."
              />
            </div>
          </div>

          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={handleAssign}
              disabled={loading || !assignTo}
            >
              {loading ? 'Asignando...' : 'Confirmar asignación'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Accessories() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('todos');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [assignTarget, setAssignTarget] = useState(null);
  const [expanded, setExpanded] = useState(new Set());

  const load = async () => {
    const [{ data: assetData }, { data: assignData }] = await Promise.all([
      api.get('/assets'),
      api.get('/assignments'),
    ]);
    const accData = assetData.filter((a) => a.category === 'accesorio');
    const enriched = accData.map((acc) => {
      const myAssigns = assignData.filter(
        (a) => String(a.asset?._id || a.asset) === String(acc._id)
      );
      const assignedQty = myAssigns.reduce((sum, a) => sum + (a.quantity || 1), 0);
      const totalStock = acc.stockTotal ?? 1;
      return {
        ...acc,
        _total: totalStock,
        _assignedQty: assignedQty,
        _availableQty: Math.max(0, totalStock - assignedQty),
        _assignments: myAssigns,
      };
    });
    setProducts(enriched);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const currentTab = TABS.find((t) => t.key === activeTab);

  const filtered = products.filter((p) => {
    const matchTab = !currentTab?.types || currentTab.types.includes(p.type);
    const q = search.toLowerCase();
    const matchSearch = !q || [
      p.brand, p.model,
      p.specs?.cableType, p.specs?.consumibleType,
      p.specs?.printerType, p.specs?.toolType, p.specs?.accessoryType,
    ].some((v) => v?.toLowerCase().includes(q));
    return matchTab && matchSearch;
  });

  const toggleExpand = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleReturn = async (assignId) => {
    if (!confirm('¿Devolver estas unidades al stock?')) return;
    await api.delete(`/assignments/${assignId}`);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este producto del catálogo? Esta acción no se puede deshacer.')) return;
    await api.delete(`/assets/${id}`);
    load();
  };

  // Solo cambia el campo `category` (misma lógica segura que "Mover a
  // Accesorios" en Activos): no borra ni recrea nada. Bloqueado si el
  // producto tiene más de una asignación activa o stock >1, porque Activos
  // solo modela un asignatario por registro y se perdería esa información.
  const handleReturnToAssets = async (product) => {
    const name = [product.brand, product.model].filter(Boolean).join(' ') ||
      ACCESSORY_TYPE_LABELS[product.type] || product.type;
    if (product._assignments.length > 1 || (product.stockTotal ?? 1) > 1) {
      alert(
        `"${name}" tiene stock/asignaciones múltiples y no se puede regresar directo a Activos (esa página solo admite un asignatario por registro).\n\nPrimero devuelve las unidades sobrantes desde aquí hasta dejar como máximo 1 en stock y 1 asignación, y luego repite esta acción.`
      );
      return;
    }
    if (!confirm(
      `¿Regresar "${name}" a Activos?\n\nNo se borra ni se modifica ningún dato: solo cambia de categoría y conserva su mismo registro, número de serie e historial de asignaciones.`
    )) return;
    await api.put(`/assets/${product._id}`, { category: 'equipo' });
    load();
  };

  const totalDisp = products.reduce((s, p) => s + p._availableQty, 0);
  const totalAsig = products.reduce((s, p) => s + p._assignedQty, 0);

  const fmtDate = (d) =>
    d
      ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
      : '—';

  if (loading) {
    return (
      <div className={styles.page}>
        <p style={{ marginTop: '2rem', color: '#aaa' }}>Cargando...</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Accesorios TI</h1>
          <p className={styles.pageSubtitle}>
            {products.length} productos —{' '}
            <strong style={{ color: '#16a34a' }}>{totalDisp} disponibles</strong>
            {' · '}
            <strong style={{ color: '#d97706' }}>{totalAsig} asignados</strong>
          </p>
        </div>
        <button
          className={styles.btnPrimary}
          onClick={() => { setEditing(null); setModalOpen(true); }}
        >
          + Nuevo producto
        </button>
      </div>

      <div className={styles.tabs}>
        {TABS.map((t) => {
          const count = products.filter((p) => !t.types || t.types.includes(p.type)).length;
          return (
            <button
              key={t.key}
              className={`${styles.tab} ${activeTab === t.key ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.icon} {t.label}
              <span className={styles.tabCount}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.toolbar}>
        <input
          className={styles.search}
          placeholder="Buscar por marca, modelo, tipo de cable..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Producto</th>
              <th style={{ textAlign: 'center' }}>Stock total</th>
              <th style={{ textAlign: 'center' }}>Disponible</th>
              <th style={{ textAlign: 'center' }}>Asignado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  {search ? 'Sin resultados.' : 'Sin productos registrados en esta categoría.'}
                </td>
              </tr>
            )}
            {filtered.map((p) => {
              const isExp = expanded.has(p._id);
              const detail =
                p.specs?.cableType ||
                p.specs?.consumibleType ||
                p.specs?.printerType ||
                p.specs?.toolType ||
                p.specs?.accessoryType ||
                '';
              const name =
                [p.brand, p.model].filter(Boolean).join(' ') ||
                ACCESSORY_TYPE_LABELS[p.type] ||
                p.type;

              return (
                <Fragment key={p._id}>
                  <tr>
                    <td>
                      <div className={styles.typeCell}>
                        <span className={styles.typeIcon}>{TYPE_ICONS[p.type] || '📦'}</span>
                        <span className={styles.typeText}>{ACCESSORY_TYPE_LABELS[p.type] || p.type}</span>
                      </div>
                    </td>
                    <td>
                      <div className={styles.brandModel}>{name}</div>
                      {detail && (
                        <div style={{ fontSize: '0.75rem', color: '#aaa', marginTop: '0.1rem' }}>
                          {detail}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <strong>{p._total}</strong>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <strong
                        style={{
                          color: p._availableQty > 0 ? '#16a34a' : '#dc2626',
                          fontSize: '1rem',
                        }}
                      >
                        {p._availableQty}
                      </strong>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ color: p._assignedQty > 0 ? '#d97706' : '#ccc' }}>
                        {p._assignedQty}
                      </span>
                    </td>
                    <td>
                      <div className={styles.actions}>
                        {p._availableQty > 0 && (
                          <button
                            className={styles.btnPrimary}
                            style={{ padding: '0.3rem 0.75rem', fontSize: '0.78rem' }}
                            onClick={() => setAssignTarget(p)}
                          >
                            Asignar
                          </button>
                        )}
                        {p._assignments.length > 0 && (
                          <button
                            className={styles.btnEdit}
                            onClick={() => toggleExpand(p._id)}
                            title={isExp ? 'Ocultar asignaciones' : 'Ver asignaciones'}
                          >
                            {isExp ? '▲' : '▼'} {p._assignments.length}
                          </button>
                        )}
                        <button
                          className={styles.btnEdit}
                          onClick={() => { setEditing(p); setModalOpen(true); }}
                        >
                          Editar
                        </button>
                        <button
                          className={styles.btnEdit}
                          onClick={() => handleReturnToAssets(p)}
                          title="Regresar este registro a la página de Activos"
                        >
                          ↩️ A Activos
                        </button>
                        <button
                          className={styles.btnDelete}
                          onClick={() => handleDelete(p._id)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>

                  {isExp && p._assignments.map((assign) => (
                    <tr key={assign._id} style={{ background: '#f8f8f8' }}>
                      <td style={{ paddingLeft: '2rem', color: '#ccc', fontSize: '0.75rem' }}>└</td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#333' }}>
                          {assign.employee?.name || '—'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#aaa' }}>
                          {assign.employee?.office || assign.employee?.department || ''}
                        </div>
                      </td>
                      <td />
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#d97706' }}>
                          {assign.quantity || 1} uds.
                        </span>
                      </td>
                      <td style={{ fontSize: '0.75rem', color: '#bbb', textAlign: 'center' }}>
                        {fmtDate(assign.assignedDate)}
                      </td>
                      <td>
                        <button
                          className={styles.btnDelete}
                          style={{ fontSize: '0.75rem' }}
                          onClick={() => handleReturn(assign._id)}
                        >
                          Devolver
                        </button>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <ProductModal
          editing={editing}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={() => { setModalOpen(false); setEditing(null); load(); }}
        />
      )}
      {assignTarget && (
        <AssignModal
          product={assignTarget}
          onClose={() => setAssignTarget(null)}
          onAssigned={() => { setAssignTarget(null); load(); }}
        />
      )}
    </div>
  );
}
