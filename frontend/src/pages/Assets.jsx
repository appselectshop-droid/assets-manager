import { useEffect, useState, useRef } from 'react';
import api from '../services/api';
import {
  ASSET_TYPE_LABELS, ASSET_GROUPS, SPECS_FIELDS,
  STATUS_CONFIG, TYPE_ICONS,
} from '../config/assetFields';
import { IMPORT_CATEGORIES } from '../config/importCategories';
import ImportModal from '../components/ImportModal';
import styles from './Assets.module.css';

const COMMON_EMPTY = {
  type: 'laptop', brand: '', model: '', serialNumber: '',
  inventoryTag: '', status: 'disponible', purchaseDate: '', notes: '',
};

function buildEmptySpecs(type) {
  const fields = SPECS_FIELDS[type] || [];
  const specs = {};
  fields.forEach((f) => {
    specs[f.key] = f.type === 'boolean' ? false : '';
  });
  return specs;
}

function SpecsField({ field, value, onChange }) {
  if (field.type === 'boolean') {
    return (
      <label className={styles.checkLabel}>
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(field.key, e.target.checked)}
          className={styles.checkbox}
        />
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
      <input
        value={value || ''}
        onChange={(e) => onChange(field.key, e.target.value)}
        placeholder={field.placeholder}
      />
    </div>
  );
}

function AssetModal({ editing, initial, onClose, onSaved }) {
  const initCommon = () => {
    if (!editing || !initial) return COMMON_EMPTY;
    return {
      type:         initial.type         || 'laptop',
      brand:        initial.brand        || '',
      model:        initial.model        || '',
      serialNumber: initial.serialNumber || '',
      inventoryTag: initial.inventoryTag || '',
      status:       initial.status       || 'disponible',
      purchaseDate: initial.purchaseDate ? String(initial.purchaseDate).slice(0, 10) : '',
      notes:        initial.notes        || '',
    };
  };

  const initSpecs = () => {
    if (!editing || !initial) return buildEmptySpecs('laptop');
    const type = initial.type || 'laptop';
    // combina defaults con los valores guardados para que todos los campos tengan valor
    return { ...buildEmptySpecs(type), ...(initial.specs || {}) };
  };

  const [common, setCommon] = useState(initCommon);
  const [specs, setSpecs] = useState(initSpecs);
  const [error, setError] = useState('');

  const handleTypeChange = (type) => {
    setCommon((c) => ({ ...c, type }));
    setSpecs(buildEmptySpecs(type));
  };

  const setSpec = (key, val) => setSpecs((s) => ({ ...s, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = { ...common, specs };
      if (editing) {
        await api.put(`/assets/${editing}`, payload);
      } else {
        await api.post('/assets', payload);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Error al guardar');
    }
  };

  const specFields = SPECS_FIELDS[common.type] || [];
  const boolFields = specFields.filter((f) => f.type === 'boolean');
  const otherFields = specFields.filter((f) => f.type !== 'boolean');

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>{TYPE_ICONS[common.type]}</span>
          <h2 className={styles.modalTitle}>{editing ? 'Editar activo' : 'Registrar activo'}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <p className={styles.formError}>{error}</p>}
          {/* Tipo */}
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Tipo de activo</p>
            <div className={styles.typeGrid}>
              {ASSET_GROUPS.map((g) => (
                <div key={g.label}>
                  <p className={styles.groupLabel}>{g.icon} {g.label}</p>
                  <div className={styles.typeBtns}>
                    {g.types.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`${styles.typeBtn} ${common.type === t ? styles.typeBtnActive : ''}`}
                        onClick={() => handleTypeChange(t)}
                      >
                        {ASSET_TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Datos generales */}
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Datos generales</p>
            <div className={styles.grid}>
              <div className={styles.field}>
                <label>Marca</label>
                <input value={common.brand} onChange={(e) => setCommon({ ...common, brand: e.target.value })} placeholder="Dell / Apple / HP..." />
              </div>
              <div className={styles.field}>
                <label>Modelo</label>
                <input value={common.model} onChange={(e) => setCommon({ ...common, model: e.target.value })} placeholder="Latitude 5540 / iPhone 14..." />
              </div>
              <div className={styles.field}>
                <label>No. de serie</label>
                <input value={common.serialNumber} onChange={(e) => setCommon({ ...common, serialNumber: e.target.value })} placeholder="SN12345678" />
              </div>
              <div className={styles.field}>
                <label>Etiqueta inventario</label>
                <input value={common.inventoryTag} onChange={(e) => setCommon({ ...common, inventoryTag: e.target.value })} placeholder="INV-001" />
              </div>
              <div className={styles.field}>
                <label>Estado</label>
                <select value={common.status} onChange={(e) => setCommon({ ...common, status: e.target.value })}>
                  <option value="disponible">Disponible</option>
                  <option value="asignado">Asignado</option>
                  <option value="baja">De baja</option>
                </select>
              </div>
              <div className={styles.field}>
                <label>Fecha de compra</label>
                <input type="date" value={common.purchaseDate} onChange={(e) => setCommon({ ...common, purchaseDate: e.target.value })} />
              </div>
            </div>
          </div>

          {/* Especificaciones del tipo */}
          {otherFields.length > 0 && (
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Especificaciones — {ASSET_TYPE_LABELS[common.type]}</p>
              <div className={styles.grid}>
                {otherFields.map((f) => (
                  <SpecsField key={f.key} field={f} value={specs[f.key]} onChange={setSpec} />
                ))}
              </div>
            </div>
          )}

          {/* Checkboxes */}
          {boolFields.length > 0 && (
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Accesorios incluidos</p>
              <div className={styles.checkGrid}>
                {boolFields.map((f) => (
                  <SpecsField key={f.key} field={f} value={specs[f.key]} onChange={setSpec} />
                ))}
              </div>
            </div>
          )}

          {/* Notas */}
          <div className={styles.section}>
            <div className={styles.field}>
              <label>Notas adicionales</label>
              <input value={common.notes} onChange={(e) => setCommon({ ...common, notes: e.target.value })} placeholder="Observaciones, condición, etc." />
            </div>
          </div>

          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.btnPrimary}>
              {editing ? 'Guardar cambios' : 'Registrar activo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SpecsBadges({ specs, type }) {
  if (!specs) return null;
  const fields = SPECS_FIELDS[type] || [];
  const highlights = fields
    .filter((f) => f.type !== 'boolean' && specs[f.key])
    .slice(0, 3);
  const bools = fields
    .filter((f) => f.type === 'boolean' && specs[f.key] === true)
    .slice(0, 3);

  return (
    <div className={styles.specsBadges}>
      {highlights.map((f) => (
        <span key={f.key} className={styles.specChip}>{specs[f.key]}</span>
      ))}
      {bools.map((f) => (
        <span key={f.key} className={`${styles.specChip} ${styles.specChipGreen}`}>{f.label.replace('Incluye ', '✓ ')}</span>
      ))}
    </div>
  );
}

// Columnas específicas por categoría
const CATEGORY_COLS = {
  computo: [
    { label: 'Tipo',          render: (a) => <div className={styles.typeCell}><span className={styles.typeIcon}>{TYPE_ICONS[a.type]}</span><span className={styles.typeText}>{ASSET_TYPE_LABELS[a.type]}</span></div> },
    { label: 'Marca / Modelo',render: (a) => <span className={styles.brandModel}>{a.brand} {a.model}</span> },
    { label: 'No. Serie',     render: (a) => <code className={styles.mono}>{a.serialNumber || '—'}</code> },
    { label: 'Etiqueta',      render: (a) => <code className={styles.mono}>{a.inventoryTag || '—'}</code> },
    { label: 'Propiedad',     render: (a) => a.specs?.ownership ? <span className={a.specs.ownership === 'Arrendamiento' ? styles.badgeOrange : styles.badgeGray}>{a.specs.ownership}</span> : '—' },
    { label: 'No. Contrato',  render: (a) => a.specs?.contractNumber || '—' },
    { label: 'Procesador',    render: (a) => a.specs?.processor || '—' },
    { label: 'RAM',           render: (a) => a.specs?.ram || '—' },
    { label: 'Estado',        key: 'status' },
    { label: 'Acciones',      key: 'actions' },
  ],
  celulares: [
    { label: 'Tipo',          render: (a) => <div className={styles.typeCell}><span className={styles.typeIcon}>{TYPE_ICONS[a.type]}</span><span className={styles.typeText}>{ASSET_TYPE_LABELS[a.type]}</span></div> },
    { label: 'Marca / Modelo',render: (a) => <span className={styles.brandModel}>{a.brand} {a.model}</span> },
    { label: 'No. Serie',     render: (a) => <code className={styles.mono}>{a.serialNumber || '—'}</code> },
    { label: 'IMEI',          render: (a) => <code className={styles.mono}>{a.specs?.imei || '—'}</code> },
    { label: 'Línea',         render: (a) => a.specs?.lineNumber || '—' },
    { label: 'Operadora',     render: (a) => a.specs?.carrier || '—' },
    { label: 'No. Contrato',  render: (a) => a.specs?.contractNumber || '—' },
    { label: 'Razón Social',  render: (a) => a.specs?.businessName || '—' },
    { label: 'Estado',        key: 'status' },
    { label: 'Acciones',      key: 'actions' },
  ],
  perifericos: [
    { label: 'Tipo',          render: (a) => <div className={styles.typeCell}><span className={styles.typeIcon}>{TYPE_ICONS[a.type]}</span><span className={styles.typeText}>{ASSET_TYPE_LABELS[a.type]}</span></div> },
    { label: 'Marca / Modelo',render: (a) => <span className={styles.brandModel}>{a.brand} {a.model}</span> },
    { label: 'No. Serie',     render: (a) => <code className={styles.mono}>{a.serialNumber || '—'}</code> },
    { label: 'Etiqueta',      render: (a) => <code className={styles.mono}>{a.inventoryTag || '—'}</code> },
    { label: 'Especificaciones', render: (a) => <SpecsBadges specs={a.specs} type={a.type} /> },
    { label: 'Estado',        key: 'status' },
    { label: 'Acciones',      key: 'actions' },
  ],
  todos: [
    { label: 'Tipo',          render: (a) => <div className={styles.typeCell}><span className={styles.typeIcon}>{TYPE_ICONS[a.type]}</span><span className={styles.typeText}>{ASSET_TYPE_LABELS[a.type]}</span></div> },
    { label: 'Marca / Modelo',render: (a) => <span className={styles.brandModel}>{a.brand} {a.model}</span> },
    { label: 'No. Serie',     render: (a) => <code className={styles.mono}>{a.serialNumber || '—'}</code> },
    { label: 'Etiqueta',      render: (a) => <code className={styles.mono}>{a.inventoryTag || '—'}</code> },
    { label: 'Especificaciones', render: (a) => <SpecsBadges specs={a.specs} type={a.type} /> },
    { label: 'Estado',        key: 'status' },
    { label: 'Acciones',      key: 'actions' },
  ],
};

const TABS = [
  { key: 'todos',     label: 'Todos',               icon: '📋', types: null },
  { key: 'computo',   label: 'Equipo de cómputo',   icon: '💻', types: ['laptop', 'escritorio', 'all_in_one'] },
  { key: 'celulares', label: 'Celulares',            icon: '📱', types: ['celular', 'tablet', 'cargador_celular'] },
  { key: 'perifericos', label: 'Periféricos',        icon: '🖱️', types: ['monitor', 'mouse', 'teclado', 'cargador_laptop'] },
  { key: 'accesorios', label: 'Accesorios / Otros',  icon: '📦', types: ['accesorio', 'otro'] },
];

export default function Assets() {
  const [assets, setAssets] = useState([]);
  const [activeTab, setActiveTab] = useState('todos');
  const [showModal, setShowModal] = useState(false);
  const [importCategory, setImportCategory] = useState(null);
  const [importDropdown, setImportDropdown] = useState(false);
  const [editing, setEditing] = useState(null);
  const dropdownRef = useRef();
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const load = async () => {
    const { data } = await api.get('/assets');
    setAssets(data);
    setSelected(new Set());
  };

  useEffect(() => { load(); }, []);

  const currentTab = TABS.find((t) => t.key === activeTab);

  const filtered = assets.filter((a) => {
    const q = search.toLowerCase();
    const matchSearch =
      a.brand?.toLowerCase().includes(q) ||
      a.model?.toLowerCase().includes(q) ||
      a.serialNumber?.toLowerCase().includes(q) ||
      a.inventoryTag?.toLowerCase().includes(q) ||
      a.specs?.imei?.toLowerCase().includes(q) ||
      a.specs?.lineNumber?.toLowerCase().includes(q) ||
      a.specs?.contractNumber?.toLowerCase().includes(q) ||
      a.specs?.businessName?.toLowerCase().includes(q);
    const matchTab = !currentTab.types || currentTab.types.includes(a.type);
    const matchStatus = !filterStatus || a.status === filterStatus;
    return matchSearch && matchTab && matchStatus;
  });

  const cols = CATEGORY_COLS[activeTab] || CATEGORY_COLS.todos;

  /* ── Selección ──────────────────────────────────── */
  const allFilteredIds = filtered.map((a) => a._id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selected.has(id));
  const someSelected = allFilteredIds.some((id) => selected.has(id));

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        allFilteredIds.forEach((id) => next.delete(id));
      } else {
        allFilteredIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  /* ── Acciones en lote ───────────────────────────── */
  const bulkDelete = async () => {
    if (!confirm(`¿Eliminar ${selected.size} activo(s)? Esta acción no se puede deshacer.`)) return;
    setBulkLoading(true);
    for (const id of selected) {
      await api.delete(`/assets/${id}`).catch(() => {});
    }
    setBulkLoading(false);
    load();
  };

  const bulkStatus = async (status) => {
    setBulkLoading(true);
    for (const id of selected) {
      await api.put(`/assets/${id}`, { status }).catch(() => {});
    }
    setBulkLoading(false);
    load();
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Activos</h1>
          <p className={styles.pageSubtitle}>{assets.length} registrados en total</p>
        </div>
        <div className={styles.headerBtns}>
          <div className={styles.dropdownWrap} ref={dropdownRef}>
            <button className={styles.btnSecondary} onClick={() => setImportDropdown((v) => !v)}>
              📥 Importar Excel ▾
            </button>
            {importDropdown && (
              <div className={styles.dropdown}>
                {Object.entries(IMPORT_CATEGORIES).map(([key, cat]) => (
                  <button key={key} className={styles.dropdownItem}
                    onClick={() => { setImportCategory(key); setImportDropdown(false); }}>
                    <span className={styles.dropdownIcon}>{cat.icon}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className={styles.btnPrimary} onClick={() => { setEditing(null); setShowModal(true); }}>
            + Registrar activo
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {TABS.map((t) => {
          const count = t.types
            ? assets.filter((a) => t.types.includes(a.type)).length
            : assets.length;
          return (
            <button
              key={t.key}
              className={`${styles.tab} ${activeTab === t.key ? styles.tabActive : ''}`}
              onClick={() => { setActiveTab(t.key); setSearch(''); setFilterStatus(''); setSelected(new Set()); }}
            >
              <span className={styles.tabIcon}>{t.icon}</span>
              <span className={styles.tabLabel}>{t.label}</span>
              <span className={styles.tabCount}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <input
          className={styles.search}
          placeholder={`Buscar en ${currentTab.label.toLowerCase()}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={styles.select} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="disponible">Disponible</option>
          <option value="asignado">Asignado</option>
          <option value="baja">De baja</option>
        </select>
      </div>

      {/* Barra de acciones en lote */}
      {someSelected && (
        <div className={styles.bulkBar}>
          <div className={styles.bulkInfo}>
            <span className={styles.bulkCount}>{selected.size}</span>
            <span className={styles.bulkLabel}>activo{selected.size !== 1 ? 's' : ''} seleccionado{selected.size !== 1 ? 's' : ''}</span>
          </div>
          <div className={styles.bulkActions}>
            <button className={styles.bulkBtn} onClick={() => bulkStatus('disponible')} disabled={bulkLoading}>
              ✅ Marcar disponible
            </button>
            <button className={styles.bulkBtn} onClick={() => bulkStatus('baja')} disabled={bulkLoading}>
              🚫 Dar de baja
            </button>
            <button className={`${styles.bulkBtn} ${styles.bulkBtnDanger}`} onClick={bulkDelete} disabled={bulkLoading}>
              🗑️ Eliminar
            </button>
            <button className={styles.bulkBtnClear} onClick={() => setSelected(new Set())} disabled={bulkLoading}>
              Deseleccionar
            </button>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.checkTh}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                  onChange={toggleAll}
                />
              </th>
              {cols.map((c) => c.key !== 'actions' && <th key={c.label}>{c.label}</th>)}
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={cols.length + 1} className={styles.empty}>
                Sin {currentTab.label.toLowerCase()} registrados
              </td></tr>
            )}
            {filtered.map((a) => {
              const sc = STATUS_CONFIG[a.status] || STATUS_CONFIG.disponible;
              const isSelected = selected.has(a._id);
              return (
                <tr
                  key={a._id}
                  className={isSelected ? styles.rowSelected : ''}
                  onClick={(e) => {
                    if (e.target.closest('button') || e.target.type === 'checkbox') return;
                    toggleOne(a._id);
                  }}
                >
                  <td className={styles.checkTd} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={isSelected}
                      onChange={() => toggleOne(a._id)}
                    />
                  </td>
                  {cols.map((c) => {
                    if (c.key === 'actions') return null;
                    if (c.key === 'status') return (
                      <td key="status">
                        <span className={styles.statusBadge} style={{ color: sc.color, background: sc.bg }}>
                          {sc.label}
                        </span>
                      </td>
                    );
                    return <td key={c.label}>{c.render(a)}</td>;
                  })}
                  <td>
                    <button className={styles.btnEdit} onClick={() => { setEditing(a); setShowModal(true); }}>
                      Editar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {importCategory && (
        <ImportModal
          entityType="assets"
          categoryKey={importCategory}
          onClose={() => setImportCategory(null)}
          onDone={load}
        />
      )}

      {showModal && (
        <AssetModal
          key={editing?._id || 'new'}
          editing={editing?._id || null}
          initial={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}
