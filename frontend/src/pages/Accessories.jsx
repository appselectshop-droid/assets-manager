import { useEffect, useState } from 'react';
import api from '../services/api';
import {
  ACCESSORY_TYPE_LABELS, ACCESSORY_GROUPS, SPECS_FIELDS,
  STATUS_CONFIG, TYPE_ICONS,
} from '../config/assetFields';
import styles from './Assets.module.css';

const ACC_EMPTY = {
  type: 'mouse', brand: '', model: '', serialNumber: '',
  inventoryTag: '', status: 'disponible', purchaseDate: '', notes: '',
};

const TABS = [
  { key: 'todos',        label: 'Todos',        icon: '📋', types: null },
  { key: 'tablets',      label: 'Tablets',       icon: '📱', types: ['tablet'] },
  { key: 'perifericos',  label: 'Periféricos',   icon: '🖥️', types: ['monitor', 'mouse', 'teclado', 'kit_perifericos', 'audifonos', 'webcam', 'hub_usb'] },
  { key: 'impresion',    label: 'Impresión',     icon: '🖨️', types: ['impresora', 'escaner'] },
  { key: 'cables',       label: 'Cables',        icon: '🔌', types: ['cable'] },
  { key: 'consumibles',  label: 'Consumibles',   icon: '🧹', types: ['consumible'] },
  { key: 'herramientas', label: 'Herramientas',  icon: '🔧', types: ['herramienta'] },
  { key: 'otros',        label: 'Otros',         icon: '📦', types: ['accesorio'] },
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

function AccessoryModal({ editing, initial, onClose, onSaved }) {
  const initCommon = () => {
    if (!editing || !initial) return ACC_EMPTY;
    return {
      type:         initial.type         || 'mouse',
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
    if (!editing || !initial) return buildEmptySpecs('mouse');
    const type = initial.type || 'mouse';
    return { ...buildEmptySpecs(type), ...(initial.specs || {}) };
  };

  const [common, setCommon] = useState(initCommon);
  const [specs, setSpecs] = useState(initSpecs);
  const [error, setError] = useState('');
  const [wantAssign, setWantAssign] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [empSearch, setEmpSearch] = useState('');
  const [assignTo, setAssignTo] = useState(null);
  const [assignNotes, setAssignNotes] = useState('');
  const [currentAssignment, setCurrentAssignment] = useState(null);
  const [assignmentLoaded, setAssignmentLoaded] = useState(!editing);

  useEffect(() => {
    api.get('/employees').then(({ data }) => setEmployees(data));
    if (editing) {
      api.get('/assignments').then(({ data }) => {
        const curr = data.find((a) => (a.asset?._id || a.asset) === editing);
        if (curr) {
          setCurrentAssignment(curr);
          setAssignTo(curr.employee);
          setAssignNotes(curr.notes || '');
          setWantAssign(true);
        }
        setAssignmentLoaded(true);
      });
    }
  }, [editing]);

  const filteredEmps = employees.filter((e) => {
    const q = empSearch.toLowerCase();
    return (
      e.name.toLowerCase().includes(q) ||
      e.employeeId.toLowerCase().includes(q) ||
      e.department?.toLowerCase().includes(q)
    );
  }).slice(0, 8);

  const handleTypeChange = (type) => {
    setCommon((c) => ({ ...c, type }));
    setSpecs(buildEmptySpecs(type));
  };

  const setSpec = (key, val) => setSpecs((s) => ({ ...s, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        ...common,
        category: 'accesorio',
        specs,
        status: wantAssign && assignTo
          ? 'asignado'
          : (editing && currentAssignment && !wantAssign ? 'disponible' : common.status),
      };
      let assetId;
      if (editing) {
        const { data } = await api.put(`/assets/${editing}`, payload);
        assetId = data._id;
        if (currentAssignment) {
          if (!wantAssign) {
            await api.delete(`/assignments/${currentAssignment._id}`);
          } else if (assignTo) {
            const currentEmpId = currentAssignment.employee?._id || currentAssignment.employee;
            if (assignTo._id !== currentEmpId) {
              await api.delete(`/assignments/${currentAssignment._id}`);
              await api.post('/assignments', { employee: assignTo._id, asset: assetId, notes: assignNotes });
            } else {
              await api.put(`/assignments/${currentAssignment._id}`, { notes: assignNotes });
            }
          }
        } else if (wantAssign && assignTo) {
          await api.post('/assignments', { employee: assignTo._id, asset: assetId, notes: assignNotes });
        }
      } else {
        const { data } = await api.post('/assets', payload);
        assetId = data._id;
        if (wantAssign && assignTo) {
          await api.post('/assignments', { employee: assignTo._id, asset: assetId, notes: assignNotes });
        }
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Error al guardar');
    }
  };

  const specFields = SPECS_FIELDS[common.type] || [];
  const boolFields = specFields.filter((f) => f.type === 'boolean');
  const otherFields = specFields.filter((f) => f.type !== 'boolean');

  const empDropdownJSX = (
    <div className={styles.empSearchWrap}>
      <input
        className={styles.empSearchInput}
        placeholder="Buscar empleado por nombre, número..."
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
                    {emp.employeeId}
                    {emp.position && ` · ${emp.position}`}
                    {emp.department && ` · ${emp.department}`}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );

  const assignedCard = (
    <div className={styles.assignSelected}>
      <div className={styles.assignSelectedInfo}>
        <span className={styles.assignAvatar}>
          {assignTo?.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
        </span>
        <div>
          <p className={styles.assignName}>{assignTo?.name}</p>
          <p className={styles.assignSub}>
            {assignTo?.employeeId}
            {assignTo?.position && ` · ${assignTo.position}`}
            {assignTo?.department && ` · ${assignTo.department}`}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>{TYPE_ICONS[common.type]}</span>
          <h2 className={styles.modalTitle}>{editing ? 'Editar accesorio' : 'Registrar accesorio'}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
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
                        className={`${styles.typeBtn} ${common.type === t ? styles.typeBtnActive : ''}`}
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
            <p className={styles.sectionLabel}>Datos generales</p>
            <div className={styles.grid}>
              <div className={styles.field}>
                <label>Marca</label>
                <input value={common.brand} onChange={(e) => setCommon({ ...common, brand: e.target.value })} placeholder="Logitech / Dell / Genérico..." />
              </div>
              <div className={styles.field}>
                <label>Modelo</label>
                <input value={common.model} onChange={(e) => setCommon({ ...common, model: e.target.value })} placeholder="MX Master / HDMI 2.0..." />
              </div>
              <div className={styles.field}>
                <label>No. de serie / Lote</label>
                <input value={common.serialNumber} onChange={(e) => setCommon({ ...common, serialNumber: e.target.value })} placeholder="Opcional" />
              </div>
              <div className={styles.field}>
                <label>Etiqueta inventario</label>
                <input value={common.inventoryTag} onChange={(e) => setCommon({ ...common, inventoryTag: e.target.value })} placeholder="ACC-001" />
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

          {otherFields.length > 0 && (
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Detalles — {ACCESSORY_TYPE_LABELS[common.type]}</p>
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
              <input value={common.notes} onChange={(e) => setCommon({ ...common, notes: e.target.value })} placeholder="Observaciones, condición, etc." />
            </div>
          </div>

          <div className={styles.section}>
            {editing && !assignmentLoaded ? (
              <p style={{ fontSize: '0.85rem', color: '#aaa' }}>Cargando asignación...</p>
            ) : editing && currentAssignment ? (
              <>
                <p className={styles.sectionLabel}>Asignación actual</p>
                <div className={styles.assignSection}>
                  {!wantAssign ? (
                    <p className={styles.returnWarning}>
                      ⚠️ El accesorio se marcará como <strong>disponible</strong> al guardar y se cerrará la asignación actual.
                    </p>
                  ) : assignTo ? (
                    <div className={styles.assignSelected}>
                      <div className={styles.assignSelectedInfo}>
                        <span className={styles.assignAvatar}>
                          {assignTo.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <p className={styles.assignName}>{assignTo.name}</p>
                          <p className={styles.assignSub}>
                            {assignTo.employeeId}
                            {assignTo.position && ` · ${assignTo.position}`}
                          </p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button type="button" className={styles.assignClear} onClick={() => { setAssignTo(null); setEmpSearch(''); }}>Cambiar</button>
                        <button type="button" className={styles.assignReturn} onClick={() => { setWantAssign(false); setAssignTo(null); }}>Devolver</button>
                      </div>
                    </div>
                  ) : empDropdownJSX}
                  {wantAssign && assignTo && (
                    <div className={styles.field} style={{ marginTop: '0.75rem' }}>
                      <label>Notas de asignación (opcional)</label>
                      <input value={assignNotes} onChange={(e) => setAssignNotes(e.target.value)} placeholder="Observaciones sobre la entrega..." />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <label className={styles.assignToggle}>
                  <input
                    type="checkbox"
                    checked={wantAssign}
                    onChange={(e) => { setWantAssign(e.target.checked); setAssignTo(null); setEmpSearch(''); }}
                  />
                  <span>Asignar a un empleado ahora</span>
                </label>
                {wantAssign && (
                  <div className={styles.assignSection}>
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
                              {assignTo.position && ` · ${assignTo.position}`}
                            </p>
                          </div>
                        </div>
                        <button type="button" className={styles.assignClear} onClick={() => { setAssignTo(null); setEmpSearch(''); }}>Cambiar</button>
                      </div>
                    ) : empDropdownJSX}
                    <div className={styles.field} style={{ marginTop: '0.75rem' }}>
                      <label>Notas de asignación (opcional)</label>
                      <input value={assignNotes} onChange={(e) => setAssignNotes(e.target.value)} placeholder="Observaciones sobre la entrega..." />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.btnPrimary}>
              {editing
                ? (currentAssignment && !wantAssign
                    ? 'Guardar y devolver'
                    : wantAssign && assignTo && !currentAssignment
                      ? 'Guardar y asignar'
                      : 'Guardar cambios')
                : (wantAssign && assignTo ? 'Registrar y asignar' : 'Registrar accesorio')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Accessories() {
  const [accessories, setAccessories] = useState([]);
  const [assigneeMap, setAssigneeMap] = useState({});
  const [activeTab, setActiveTab] = useState('todos');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const load = async () => {
    const [{ data: assetsData }, { data: assignmentsData }] = await Promise.all([
      api.get('/assets'),
      api.get('/assignments'),
    ]);
    setAccessories(assetsData.filter((a) => a.category === 'accesorio'));
    const map = {};
    assignmentsData.forEach((asgn) => {
      const assetId = asgn.asset?._id || asgn.asset;
      if (assetId && asgn.employee?.name) map[assetId] = asgn.employee.name;
    });
    setAssigneeMap(map);
    setSelected(new Set());
  };

  useEffect(() => { load(); }, []);

  const currentTab = TABS.find((t) => t.key === activeTab);

  const filtered = accessories.filter((a) => {
    const q = search.toLowerCase();
    const matchSearch =
      a.brand?.toLowerCase().includes(q) ||
      a.model?.toLowerCase().includes(q) ||
      a.serialNumber?.toLowerCase().includes(q) ||
      a.inventoryTag?.toLowerCase().includes(q) ||
      a.notes?.toLowerCase().includes(q) ||
      a.specs?.cableType?.toLowerCase().includes(q) ||
      a.specs?.consumibleType?.toLowerCase().includes(q) ||
      a.specs?.accessoryType?.toLowerCase().includes(q) ||
      a.specs?.printerType?.toLowerCase().includes(q) ||
      a.specs?.toolType?.toLowerCase().includes(q) ||
      a.specs?.scannerType?.toLowerCase().includes(q);
    const matchTab = !currentTab.types || currentTab.types.includes(a.type);
    const matchStatus = !filterStatus || a.status === filterStatus;
    return matchSearch && matchTab && matchStatus;
  });

  const allFilteredIds = filtered.map((a) => a._id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selected.has(id));
  const someSelected = allFilteredIds.some((id) => selected.has(id));

  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleAll = () => setSelected((prev) => {
    const next = new Set(prev);
    if (allSelected) { allFilteredIds.forEach((id) => next.delete(id)); }
    else { allFilteredIds.forEach((id) => next.add(id)); }
    return next;
  });

  const bulkDelete = async () => {
    if (!confirm(`¿Eliminar ${selected.size} accesorio(s)? Esta acción no se puede deshacer.`)) return;
    setBulkLoading(true);
    for (const id of selected) { await api.delete(`/assets/${id}`).catch(() => {}); }
    setBulkLoading(false);
    load();
  };

  const bulkStatus = async (status) => {
    setBulkLoading(true);
    for (const id of selected) { await api.put(`/assets/${id}`, { status }).catch(() => {}); }
    setBulkLoading(false);
    load();
  };

  const bulkMoveToAssets = async () => {
    if (!confirm(`¿Regresar ${selected.size} accesorio(s) a la página de Activos?`)) return;
    setBulkLoading(true);
    for (const id of selected) { await api.put(`/assets/${id}`, { category: 'equipo' }).catch(() => {}); }
    setBulkLoading(false);
    load();
  };

  const disponibles = accessories.filter((a) => a.status === 'disponible').length;
  const asignados   = accessories.filter((a) => a.status === 'asignado').length;
  const baja        = accessories.filter((a) => a.status === 'baja').length;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Accesorios TI</h1>
          <p className={styles.pageSubtitle}>
            {accessories.length} registrados — {disponibles} disponibles · {asignados} asignados · {baja} de baja
          </p>
        </div>
        <button className={styles.btnPrimary} onClick={() => { setEditing(null); setShowModal(true); }}>
          + Registrar accesorio
        </button>
      </div>

      <div className={styles.tabs}>
        {TABS.map((t) => {
          const count = t.types
            ? accessories.filter((a) => t.types.includes(a.type)).length
            : accessories.length;
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

      {someSelected && (
        <div className={styles.bulkBar}>
          <div className={styles.bulkInfo}>
            <span className={styles.bulkCount}>{selected.size}</span>
            <span className={styles.bulkLabel}>accesorio{selected.size !== 1 ? 's' : ''} seleccionado{selected.size !== 1 ? 's' : ''}</span>
          </div>
          <div className={styles.bulkActions}>
            <button className={styles.bulkBtn} onClick={() => bulkStatus('disponible')} disabled={bulkLoading}>✅ Marcar disponible</button>
            <button className={styles.bulkBtn} onClick={() => bulkStatus('baja')} disabled={bulkLoading}>🚫 Dar de baja</button>
            <button className={styles.bulkBtn} onClick={bulkMoveToAssets} disabled={bulkLoading}>↩️ Regresar a Activos</button>
            <button className={`${styles.bulkBtn} ${styles.bulkBtnDanger}`} onClick={bulkDelete} disabled={bulkLoading}>🗑️ Eliminar</button>
            <button className={styles.bulkBtnClear} onClick={() => setSelected(new Set())} disabled={bulkLoading}>Deseleccionar</button>
          </div>
        </div>
      )}

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
              <th>Tipo</th>
              <th>Marca / Modelo</th>
              <th>Detalle</th>
              <th>No. Serie / Etiqueta</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className={styles.empty}>
                  Sin {currentTab.label.toLowerCase()} registrados
                </td>
              </tr>
            )}
            {filtered.map((a) => {
              const sc = STATUS_CONFIG[a.status] || STATUS_CONFIG.disponible;
              const isSelected = selected.has(a._id);
              const detail =
                a.specs?.printerType ||
                a.specs?.toolType ||
                a.specs?.cableType ||
                a.specs?.consumibleType ||
                a.specs?.accessoryType ||
                a.specs?.connectionType ||
                '';
              return (
                <tr
                  key={a._id}
                  className={isSelected ? styles.rowSelected : ''}
                  onClick={(e) => { if (e.target.closest('button') || e.target.type === 'checkbox') return; toggleOne(a._id); }}
                >
                  <td className={styles.checkTd} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className={styles.checkbox} checked={isSelected} onChange={() => toggleOne(a._id)} />
                  </td>
                  <td>
                    <div className={styles.typeCell}>
                      <span className={styles.typeIcon}>{TYPE_ICONS[a.type]}</span>
                      <span className={styles.typeText}>{ACCESSORY_TYPE_LABELS[a.type] || a.type}</span>
                    </div>
                  </td>
                  <td><span className={styles.brandModel}>{[a.brand, a.model].filter(Boolean).join(' ') || '—'}</span></td>
                  <td><span style={{ fontSize: '0.82rem', color: '#666' }}>{detail || '—'}</span></td>
                  <td>
                    {a.serialNumber && <code className={styles.mono}>{a.serialNumber}</code>}
                    {a.inventoryTag && <code className={styles.mono} style={{ marginLeft: a.serialNumber ? '0.3rem' : 0 }}>{a.inventoryTag}</code>}
                    {!a.serialNumber && !a.inventoryTag && '—'}
                  </td>
                  <td>
                    <span className={styles.statusBadge} style={{ color: sc.color, background: sc.bg }}>{sc.label}</span>
                    {a.status === 'asignado' && assigneeMap[a._id] && (
                      <p className={styles.assigneeName}>{assigneeMap[a._id]}</p>
                    )}
                    {a.lastModifiedBy && <p className={styles.modifiedBy}>✏️ {a.lastModifiedBy}</p>}
                  </td>
                  <td>
                    <button className={styles.btnEdit} onClick={() => { setEditing(a); setShowModal(true); }}>Editar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <AccessoryModal
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
