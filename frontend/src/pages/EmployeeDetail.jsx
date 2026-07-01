import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { ASSET_TYPE_LABELS, TYPE_ICONS, ASSET_GROUPS, SPECS_FIELDS } from '../config/assetFields';
import styles from './EmployeeDetail.module.css';
import pageStyles from './Page.module.css';
import assetStyles from './Assets.module.css';

const TYPE_TABS = [
  { key: '',              label: 'Todos',             icon: '📋' },
  { key: 'laptop',        label: 'Laptop',            icon: '💻' },
  { key: 'escritorio',    label: 'Escritorio',        icon: '🖥️' },
  { key: 'all_in_one',    label: 'All-in-One',        icon: '🖥️' },
  { key: 'celular',       label: 'Celular',           icon: '📱' },
  { key: 'tablet',        label: 'Tablet',            icon: '📱' },
  { key: 'monitor',       label: 'Monitor',           icon: '🖥️' },
  { key: 'mouse',         label: 'Mouse',             icon: '🖱️' },
  { key: 'teclado',       label: 'Teclado',           icon: '⌨️' },
  { key: 'cargador_laptop',  label: 'Cargador Laptop',  icon: '🔌' },
  { key: 'cargador_celular', label: 'Cargador Celular', icon: '🔌' },
  { key: 'accesorio',     label: 'Accesorio',         icon: '🎧' },
  { key: 'otro',          label: 'Otro',              icon: '📦' },
];

function assetSearchText(a) {
  return [
    a.brand, a.model, a.serialNumber, a.inventoryTag,
    a.specs?.imei, a.specs?.imei2, a.specs?.lineNumber,
    a.specs?.carrier, a.specs?.contractNumber, a.specs?.businessName,
    a.specs?.processor, a.specs?.ram,
  ].filter(Boolean).join(' ').toLowerCase();
}

function buildEmptySpecs(type) {
  const fields = SPECS_FIELDS[type] || [];
  const specs = {};
  fields.forEach((f) => { specs[f.key] = f.type === 'boolean' ? false : ''; });
  return specs;
}

function SpecsField({ field, value, onChange }) {
  if (field.type === 'boolean') {
    return (
      <label className={assetStyles.checkLabel}>
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(field.key, e.target.checked)}
          className={assetStyles.checkbox}
        />
        {field.label}
      </label>
    );
  }
  if (field.type === 'select') {
    return (
      <div className={`${assetStyles.field} ${field.col === 2 ? assetStyles.colSpan2 : ''}`}>
        <label>{field.label}</label>
        <select value={value || ''} onChange={(e) => onChange(field.key, e.target.value)}>
          <option value="">Seleccionar...</option>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }
  return (
    <div className={`${assetStyles.field} ${field.col === 2 ? assetStyles.colSpan2 : ''}`}>
      <label>{field.label}</label>
      <input
        value={value || ''}
        onChange={(e) => onChange(field.key, e.target.value)}
        placeholder={field.placeholder}
      />
    </div>
  );
}

function CreateAssetModal({ onClose, onCreated }) {
  const [common, setCommon] = useState({
    type: 'laptop', brand: '', model: '', serialNumber: '',
    inventoryTag: '', purchaseDate: '', notes: '',
  });
  const [specs, setSpecs] = useState(buildEmptySpecs('laptop'));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleTypeChange = (type) => {
    setCommon((c) => ({ ...c, type }));
    setSpecs(buildEmptySpecs(type));
  };

  const setSpec = (key, val) => setSpecs((s) => ({ ...s, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const { data } = await api.post('/assets', { ...common, specs, status: 'disponible' });
      onCreated(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al registrar');
      setSaving(false);
    }
  };

  const specFields = SPECS_FIELDS[common.type] || [];
  const boolFields = specFields.filter((f) => f.type === 'boolean');
  const otherFields = specFields.filter((f) => f.type !== 'boolean');

  return (
    <div className={styles.overlayTop} onClick={onClose}>
      <div className={assetStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={assetStyles.modalHeader}>
          <span className={assetStyles.modalIcon}>{TYPE_ICONS[common.type]}</span>
          <h2 className={assetStyles.modalTitle}>Registrar nuevo activo</h2>
          <button className={assetStyles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className={assetStyles.form}>
          {error && <p className={assetStyles.formError}>{error}</p>}

          <div className={assetStyles.section}>
            <p className={assetStyles.sectionLabel}>Tipo de activo</p>
            <div className={assetStyles.typeGrid}>
              {ASSET_GROUPS.map((g) => (
                <div key={g.label}>
                  <p className={assetStyles.groupLabel}>{g.icon} {g.label}</p>
                  <div className={assetStyles.typeBtns}>
                    {g.types.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`${assetStyles.typeBtn} ${common.type === t ? assetStyles.typeBtnActive : ''}`}
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

          <div className={assetStyles.section}>
            <p className={assetStyles.sectionLabel}>Datos generales</p>
            <div className={assetStyles.grid}>
              <div className={assetStyles.field}>
                <label>Marca</label>
                <input value={common.brand} onChange={(e) => setCommon({ ...common, brand: e.target.value })} placeholder="Dell / Apple / HP..." />
              </div>
              <div className={assetStyles.field}>
                <label>Modelo</label>
                <input value={common.model} onChange={(e) => setCommon({ ...common, model: e.target.value })} placeholder="Latitude 5540 / iPhone 14..." />
              </div>
              <div className={assetStyles.field}>
                <label>No. de serie</label>
                <input value={common.serialNumber} onChange={(e) => setCommon({ ...common, serialNumber: e.target.value })} placeholder="SN12345678" />
              </div>
              <div className={assetStyles.field}>
                <label>Etiqueta inventario</label>
                <input value={common.inventoryTag} onChange={(e) => setCommon({ ...common, inventoryTag: e.target.value })} placeholder="INV-001" />
              </div>
              <div className={assetStyles.field}>
                <label>Fecha de compra</label>
                <input type="date" value={common.purchaseDate} onChange={(e) => setCommon({ ...common, purchaseDate: e.target.value })} />
              </div>
            </div>
          </div>

          {otherFields.length > 0 && (
            <div className={assetStyles.section}>
              <p className={assetStyles.sectionLabel}>Especificaciones — {ASSET_TYPE_LABELS[common.type]}</p>
              <div className={assetStyles.grid}>
                {otherFields.map((f) => (
                  <SpecsField key={f.key} field={f} value={specs[f.key]} onChange={setSpec} />
                ))}
              </div>
            </div>
          )}

          {boolFields.length > 0 && (
            <div className={assetStyles.section}>
              <p className={assetStyles.sectionLabel}>Accesorios incluidos</p>
              <div className={assetStyles.checkGrid}>
                {boolFields.map((f) => (
                  <SpecsField key={f.key} field={f} value={specs[f.key]} onChange={setSpec} />
                ))}
              </div>
            </div>
          )}

          <div className={assetStyles.section}>
            <div className={assetStyles.field}>
              <label>Notas adicionales</label>
              <input value={common.notes} onChange={(e) => setCommon({ ...common, notes: e.target.value })} placeholder="Observaciones, condición, etc." />
            </div>
          </div>

          <div className={assetStyles.modalActions}>
            <button type="button" className={assetStyles.btnCancel} onClick={onClose}>Cancelar</button>
            <button type="submit" className={assetStyles.btnPrimary} disabled={saving}>
              {saving ? 'Registrando...' : 'Registrar activo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AssetCard({ asset, selected, onSelect }) {
  const isPhone = ['celular', 'tablet'].includes(asset.type);
  const isComputo = ['laptop', 'escritorio', 'all_in_one'].includes(asset.type);

  return (
    <div
      className={`${styles.assetCard} ${selected ? styles.assetCardSelected : ''}`}
      onClick={() => onSelect(asset._id)}
    >
      <div className={styles.cardCheck}>
        {selected ? '✓' : ''}
      </div>
      <div className={styles.cardIcon}>{TYPE_ICONS[asset.type] || '📦'}</div>
      <div className={styles.cardBody}>
        <div className={styles.cardTop}>
          <span className={styles.cardType}>{ASSET_TYPE_LABELS[asset.type] || asset.type}</span>
          <span className={styles.cardBrand}>{asset.brand} {asset.model}</span>
        </div>
        <div className={styles.cardMeta}>
          {asset.serialNumber && <span>Serie: <strong>{asset.serialNumber}</strong></span>}
          {asset.inventoryTag  && <span>Inv: <strong>{asset.inventoryTag}</strong></span>}
          {isPhone && asset.specs?.imei       && <span>IMEI: <strong>{asset.specs.imei}</strong></span>}
          {isPhone && asset.specs?.lineNumber && <span>Línea: <strong>{asset.specs.lineNumber}</strong></span>}
          {isPhone && asset.specs?.carrier    && <span>{asset.specs.carrier}</span>}
          {isComputo && asset.specs?.processor && <span>{asset.specs.processor}</span>}
          {isComputo && asset.specs?.ram       && <span>{asset.specs.ram}</span>}
          {asset.specs?.contractNumber && <span>Contrato: <strong>{asset.specs.contractNumber}</strong></span>}
        </div>
      </div>
    </div>
  );
}

function EditAssignmentModal({ assignment, onClose, onDone }) {
  const asset = assignment.asset;
  const [common, setCommon] = useState({
    type: asset.type,
    brand: asset.brand || '',
    model: asset.model || '',
    serialNumber: asset.serialNumber || '',
    inventoryTag: asset.inventoryTag || '',
    purchaseDate: asset.purchaseDate ? asset.purchaseDate.slice(0, 10) : '',
    notes: asset.notes || '',
  });
  const [specs, setSpecs] = useState({ ...(buildEmptySpecs(asset.type)), ...(asset.specs || {}) });
  const [assignmentNotes, setAssignmentNotes] = useState(assignment.notes || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleTypeChange = (type) => {
    setCommon((c) => ({ ...c, type }));
    setSpecs(buildEmptySpecs(type));
  };

  const setSpec = (key, val) => setSpecs((s) => ({ ...s, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.put(`/assets/${asset._id}`, { ...common, specs });
      await api.put(`/assignments/${assignment._id}`, { notes: assignmentNotes });
      onDone();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Error al guardar');
      setSaving(false);
    }
  };

  const specFields = SPECS_FIELDS[common.type] || [];
  const boolFields = specFields.filter((f) => f.type === 'boolean');
  const otherFields = specFields.filter((f) => f.type !== 'boolean');

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={assetStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={assetStyles.modalHeader}>
          <span className={assetStyles.modalIcon}>{TYPE_ICONS[common.type]}</span>
          <h2 className={assetStyles.modalTitle}>Editar activo asignado</h2>
          <button className={assetStyles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className={assetStyles.form}>
          {error && <p className={assetStyles.formError}>{error}</p>}

          <div className={assetStyles.section}>
            <p className={assetStyles.sectionLabel}>Tipo de activo</p>
            <div className={assetStyles.typeGrid}>
              {ASSET_GROUPS.map((g) => (
                <div key={g.label}>
                  <p className={assetStyles.groupLabel}>{g.icon} {g.label}</p>
                  <div className={assetStyles.typeBtns}>
                    {g.types.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`${assetStyles.typeBtn} ${common.type === t ? assetStyles.typeBtnActive : ''}`}
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

          <div className={assetStyles.section}>
            <p className={assetStyles.sectionLabel}>Datos generales</p>
            <div className={assetStyles.grid}>
              <div className={assetStyles.field}>
                <label>Marca</label>
                <input value={common.brand} onChange={(e) => setCommon({ ...common, brand: e.target.value })} placeholder="Dell / Apple / HP..." />
              </div>
              <div className={assetStyles.field}>
                <label>Modelo</label>
                <input value={common.model} onChange={(e) => setCommon({ ...common, model: e.target.value })} placeholder="Latitude 5540 / iPhone 14..." />
              </div>
              <div className={assetStyles.field}>
                <label>No. de serie</label>
                <input value={common.serialNumber} onChange={(e) => setCommon({ ...common, serialNumber: e.target.value })} placeholder="SN12345678" />
              </div>
              <div className={assetStyles.field}>
                <label>Etiqueta inventario</label>
                <input value={common.inventoryTag} onChange={(e) => setCommon({ ...common, inventoryTag: e.target.value })} placeholder="INV-001" />
              </div>
              <div className={assetStyles.field}>
                <label>Fecha de compra</label>
                <input type="date" value={common.purchaseDate} onChange={(e) => setCommon({ ...common, purchaseDate: e.target.value })} />
              </div>
            </div>
          </div>

          {otherFields.length > 0 && (
            <div className={assetStyles.section}>
              <p className={assetStyles.sectionLabel}>Especificaciones — {ASSET_TYPE_LABELS[common.type]}</p>
              <div className={assetStyles.grid}>
                {otherFields.map((f) => (
                  <SpecsField key={f.key} field={f} value={specs[f.key]} onChange={setSpec} />
                ))}
              </div>
            </div>
          )}

          {boolFields.length > 0 && (
            <div className={assetStyles.section}>
              <p className={assetStyles.sectionLabel}>Accesorios incluidos</p>
              <div className={assetStyles.checkGrid}>
                {boolFields.map((f) => (
                  <SpecsField key={f.key} field={f} value={specs[f.key]} onChange={setSpec} />
                ))}
              </div>
            </div>
          )}

          <div className={assetStyles.section}>
            <p className={assetStyles.sectionLabel}>Notas</p>
            <div className={assetStyles.grid}>
              <div className={assetStyles.field}>
                <label>Notas del activo</label>
                <input value={common.notes} onChange={(e) => setCommon({ ...common, notes: e.target.value })} placeholder="Observaciones, condición, etc." />
              </div>
              <div className={assetStyles.field}>
                <label>Notas de asignación</label>
                <input value={assignmentNotes} onChange={(e) => setAssignmentNotes(e.target.value)} placeholder="Razón de asignación, etc." />
              </div>
            </div>
          </div>

          <div className={assetStyles.modalActions}>
            <button type="button" className={assetStyles.btnCancel} onClick={onClose}>Cancelar</button>
            <button type="submit" className={assetStyles.btnPrimary} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AssignAccountModal({ availableAccounts, onClose, onAssign, saving }) {
  const [selectedId, setSelectedId] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedId) return;
    onAssign(selectedId);
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={assetStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={assetStyles.modalHeader}>
          <h2 className={assetStyles.modalTitle}>Asignar cuenta de plataforma</h2>
          <button className={assetStyles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className={assetStyles.form}>
          {availableAccounts.length === 0 ? (
            <p className={pageStyles.empty}>No hay cuentas disponibles para reciclar. Crea una nueva desde Cuentas de Plataformas.</p>
          ) : (
            <div className={assetStyles.field}>
              <label>Cuenta disponible *</label>
              <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} required>
                <option value="">Selecciona una cuenta</option>
                {availableAccounts.map((a) => (
                  <option key={a._id} value={a._id}>{a.platform} — {a.username}</option>
                ))}
              </select>
            </div>
          )}

          <div className={assetStyles.modalActions}>
            <button type="button" className={assetStyles.btnCancel} onClick={onClose}>Cancelar</button>
            <button type="submit" className={assetStyles.btnPrimary} disabled={saving || availableAccounts.length === 0}>
              {saving ? 'Asignando...' : 'Asignar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AssignModal({ employee, onClose, onDone }) {
  const [allAssets, setAllAssets] = useState([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selected, setSelected] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const loadAssets = () => {
    api.get('/assets?status=disponible').then(({ data }) => setAllAssets(data));
  };

  useEffect(() => { loadAssets(); }, []);

  const filtered = allAssets.filter((a) => {
    const matchType = !typeFilter || a.type === typeFilter;
    const matchSearch = !search || assetSearchText(a).includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!selected) return;
    setLoading(true);
    try {
      await api.post('/assignments', { employee: employee._id, asset: selected, notes });
      onDone();
      onClose();
    } catch (err) {
      alert(err.response?.data?.message || 'Error al asignar');
    } finally {
      setLoading(false);
    }
  };

  const selectedAsset = allAssets.find((a) => a._id === selected);

  const handleAssetCreated = (newAsset) => {
    setShowCreate(false);
    setAllAssets((prev) => [...prev, newAsset]);
    loadAssets();
    setSelected(newAsset._id);
    setTypeFilter('');
    setSearch('');
  };

  return (
    <>
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.assignModal} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className={styles.assignHeader}>
          <div>
            <h2 className={styles.assignTitle}>Asignar activo</h2>
            <p className={styles.assignSub}>Para: <strong>{employee.name}</strong></p>
          </div>
          <div className={styles.assignHeaderActions}>
            <button className={styles.btnNewAsset} onClick={() => setShowCreate(true)}>
              + Registrar activo
            </button>
            <button className={styles.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Tipo tabs */}
        <div className={styles.typeTabs}>
          {TYPE_TABS.map((t) => {
            const count = t.key
              ? allAssets.filter((a) => a.type === t.key).length
              : allAssets.length;
            if (t.key && count === 0) return null;
            return (
              <button
                key={t.key}
                className={`${styles.typeTab} ${typeFilter === t.key ? styles.typeTabActive : ''}`}
                onClick={() => { setTypeFilter(t.key); setSelected(''); setSearch(''); }}
              >
                <span>{t.icon}</span>
                <span className={styles.typeTabLabel}>{t.label}</span>
                <span className={styles.typeTabCount}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Búsqueda */}
        <div className={styles.searchWrap}>
          <input
            className={styles.searchInput}
            placeholder="Buscar por serie, IMEI, línea, marca, modelo, contrato..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelected(''); }}
            autoFocus
          />
          {search && (
            <button className={styles.clearSearch} onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        {/* Lista de activos */}
        <div className={styles.assetList}>
          {filtered.length === 0 ? (
            <div className={styles.emptyList}>
              <span>🔍</span>
              <p>Sin activos disponibles{typeFilter ? ` del tipo seleccionado` : ''}</p>
              <button className={styles.btnNewAssetEmpty} onClick={() => setShowCreate(true)}>
                + Registrar nuevo activo
              </button>
            </div>
          ) : (
            filtered.map((a) => (
              <AssetCard
                key={a._id}
                asset={a}
                selected={selected === a._id}
                onSelect={setSelected}
              />
            ))
          )}
        </div>

        {/* Footer con activo seleccionado + notas + botón */}
        <form onSubmit={handleAssign} className={styles.assignFooter}>
          {selectedAsset ? (
            <div className={styles.selectedSummary}>
              <span className={styles.selectedIcon}>{TYPE_ICONS[selectedAsset.type]}</span>
              <div>
                <p className={styles.selectedName}>{selectedAsset.brand} {selectedAsset.model}</p>
                <p className={styles.selectedSub}>
                  {ASSET_TYPE_LABELS[selectedAsset.type]}
                  {selectedAsset.serialNumber && ` · ${selectedAsset.serialNumber}`}
                </p>
              </div>
            </div>
          ) : (
            <p className={styles.noSelection}>Selecciona un activo de la lista</p>
          )}

          <div className={styles.footerRow}>
            <input
              className={styles.notesInput}
              placeholder="Notas (opcional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <button
              type="submit"
              className={styles.btnAssign}
              disabled={!selected || loading}
            >
              {loading ? 'Asignando...' : 'Asignar'}
            </button>
          </div>
        </form>

      </div>
    </div>
    {showCreate && (
      <CreateAssetModal
        onClose={() => setShowCreate(false)}
        onCreated={handleAssetCreated}
      />
    )}
    </>
  );
}

const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [showAssign, setShowAssign] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const [gmailAccounts, setGmailAccounts] = useState([]);
  const [platformAccounts, setPlatformAccounts] = useState([]);
  const [visiblePw, setVisiblePw] = useState(new Set());
  const [showAssignAccount, setShowAssignAccount] = useState(false);
  const [availableAccounts, setAvailableAccounts] = useState([]);
  const [assignAccountSaving, setAssignAccountSaving] = useState(false);
  const [confirmUnassignAccount, setConfirmUnassignAccount] = useState(null);
  const [unassignAccountLoading, setUnassignAccountLoading] = useState(false);
  const [reassignMode, setReassignMode] = useState(false);
  const [reassignEmployeeId, setReassignEmployeeId] = useState('');
  const [reassignEmployees, setReassignEmployees] = useState([]);

  const load = async () => {
    const res = await api.get(`/employees/${id}`);
    setData(res.data);
  };

  const loadAccounts = async () => {
    if (currentUser.canManageGmailAccounts) {
      try {
        const { data: gmailData } = await api.get('/gmail-accounts');
        setGmailAccounts(gmailData.filter((a) => a.employee?._id === id));
      } catch { /* sin permiso o error transitorio: se omite la sección */ }
    }
    if (currentUser.canManagePlatformAccounts) {
      try {
        const { data: platData } = await api.get('/platform-accounts');
        setPlatformAccounts(platData.filter((a) => a.employee?._id === id));
      } catch { /* sin permiso o error transitorio: se omite la sección */ }
    }
  };

  useEffect(() => { load(); loadAccounts(); }, [id]);

  const togglePw = (accId) => {
    setVisiblePw((prev) => {
      const next = new Set(prev);
      next.has(accId) ? next.delete(accId) : next.add(accId);
      return next;
    });
  };

  const copyPw = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      alert('No se pudo copiar automáticamente. Cópialo manualmente.');
    }
  };

  const openAssignAccount = async () => {
    setShowAssignAccount(true);
    try {
      const { data: platData } = await api.get('/platform-accounts');
      setAvailableAccounts(platData.filter((a) => !a.employee));
    } catch {
      setAvailableAccounts([]);
    }
  };

  const handleAssignAccount = async (accountId) => {
    setAssignAccountSaving(true);
    try {
      await api.put(`/platform-accounts/${accountId}`, { employeeId: id });
      setShowAssignAccount(false);
      loadAccounts();
    } catch (err) {
      alert(err.response?.data?.message || 'Error al asignar');
    } finally {
      setAssignAccountSaving(false);
    }
  };

  const openUnassignAccount = (account) => {
    setConfirmUnassignAccount(account);
    setReassignMode(false);
    setReassignEmployeeId('');
  };

  const openReassignMode = async () => {
    setReassignMode(true);
    if (reassignEmployees.length === 0) {
      const { data: empData } = await api.get('/employees');
      setReassignEmployees(empData.filter((e) => e.active && e._id !== id));
    }
  };

  const confirmUnassignPlatformAccount = async () => {
    if (!confirmUnassignAccount) return;
    if (reassignMode && !reassignEmployeeId) return;
    setUnassignAccountLoading(true);
    try {
      const payload = reassignMode ? { employeeId: reassignEmployeeId } : { unassign: true };
      await api.put(`/platform-accounts/${confirmUnassignAccount._id}`, payload);
      setConfirmUnassignAccount(null);
      loadAccounts();
    } catch (err) {
      alert(err.response?.data?.message || 'Error al procesar');
    } finally {
      setUnassignAccountLoading(false);
    }
  };

  const handleReturn = async (assignmentId) => {
    if (!confirm('¿Regresar este activo?')) return;
    await api.delete(`/assignments/${assignmentId}`);
    load();
  };

  const downloadResponsiva = async (assetId = null) => {
    const params = assetId ? `?assetId=${assetId}` : '';
    const resp = await api.get(`/responsiva/${id}${params}`, { responseType: 'blob' });
    const blob = new Blob([resp.data], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix = assetId ? `_${assetId.slice(-6)}` : '_TODOS';
    a.download = `Responsiva_${data.employee.employeeId}_${data.employee.name.replace(/\s+/g, '_')}${suffix}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleGenerateResponsiva = async () => {
    setGeneratingPdf('all');
    try {
      await downloadResponsiva(null);
    } catch {
      alert('No se pudo generar la responsiva. Intenta de nuevo.');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleGenerateSingle = async (assetId) => {
    setGeneratingPdf(assetId);
    try {
      await downloadResponsiva(assetId);
    } catch {
      alert('No se pudo generar la responsiva. Intenta de nuevo.');
    } finally {
      setGeneratingPdf(false);
    }
  };

  if (!data) return <p style={{ padding: '2rem', color: '#888' }}>Cargando...</p>;

  const { employee, assignments } = data;

  return (
    <div>
      <button className={pageStyles.btnBack} onClick={() => navigate('/employees')}>← Volver</button>

      <div className={pageStyles.detailHeader}>
        <div>
          <h1 className={pageStyles.title}>{employee.name}</h1>
          <p className={pageStyles.subtitle}>
            No. <strong>{employee.employeeId}</strong>
            {employee.businessName && ` · ${employee.businessName}`}
            {employee.office       && ` · ${employee.office}`}
            {employee.position     && ` · ${employee.position}`}
            {employee.area         && ` · ${employee.area}`}
            {employee.department   && ` · ${employee.department}`}
          </p>
          {(employee.corporateEmails?.length > 0) && (
            <p className={pageStyles.subtitle}>
              📧 {employee.corporateEmails.join(' · ')}
            </p>
          )}
          {(employee.gmailAccounts?.length > 0) && (
            <p className={pageStyles.subtitle}>
              📨 {employee.gmailAccounts.join(' · ')}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className={pageStyles.btnSecondary}
            onClick={handleGenerateResponsiva}
            disabled={generatingPdf !== false}
          >
            {generatingPdf === 'all' ? 'Generando...' : 'Responsiva completa'}
          </button>
          <button className={pageStyles.btnPrimary} onClick={() => setShowAssign(true)}>
            + Asignar activo
          </button>
        </div>
      </div>

      <h2 className={pageStyles.sectionTitle}>Activos asignados ({assignments.length})</h2>

      {assignments.length === 0 ? (
        <p className={pageStyles.empty}>Este empleado no tiene activos asignados.</p>
      ) : (
        <div className={pageStyles.tableWrap}>
          <table className={pageStyles.table}>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Marca / Modelo</th>
                <th>No. Serie</th>
                <th>Etiqueta</th>
                <th>Fecha asignación</th>
                <th>Notas</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a._id}>
                  <td>
                    <span className={pageStyles.typeBadge}>
                      {TYPE_ICONS[a.asset.type]} {ASSET_TYPE_LABELS[a.asset.type] || a.asset.type}
                    </span>
                  </td>
                  <td><strong>{a.asset.brand}</strong> {a.asset.model}</td>
                  <td><code>{a.asset.serialNumber || '—'}</code></td>
                  <td>{a.asset.inventoryTag || '—'}</td>
                  <td>{new Date(a.assignedDate).toLocaleDateString('es-MX')}</td>
                  <td>{a.notes || '—'}</td>
                  <td>
                    <div className={pageStyles.actions}>
                      <button className={pageStyles.btnEdit} onClick={() => setEditingAssignment(a)}>
                        Editar
                      </button>
                      <button
                        className={pageStyles.btnResponsiva}
                        onClick={() => handleGenerateSingle(a.asset._id)}
                        disabled={generatingPdf !== false}
                        title="Generar responsiva de este activo"
                      >
                        {generatingPdf === a.asset._id ? '...' : 'Responsiva'}
                      </button>
                      <button className={pageStyles.btnDelete} onClick={() => handleReturn(a._id)}>
                        Regresar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(currentUser.canManageGmailAccounts || currentUser.canManagePlatformAccounts) && (
        <>
          <div className={pageStyles.header} style={{ marginTop: '2rem' }}>
            <h2 className={pageStyles.sectionTitle} style={{ margin: 0 }}>Cuentas</h2>
            {currentUser.canManagePlatformAccounts && (
              <button className={pageStyles.btnPrimary} onClick={openAssignAccount}>
                + Asignar cuenta de plataforma
              </button>
            )}
          </div>

          {currentUser.canManageGmailAccounts && gmailAccounts.length > 0 && (
            <div className={pageStyles.tableWrap} style={{ marginBottom: '1rem' }}>
              <table className={pageStyles.table}>
                <thead>
                  <tr>
                    <th>Gmail</th>
                    <th>Contraseña</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {gmailAccounts.map((g) => (
                    <tr key={g._id}>
                      <td>{g.email}</td>
                      <td className={styles.passwordCell}>
                        <span className={styles.passwordText}>
                          {visiblePw.has(g._id) ? g.password : '•'.repeat(10)}
                        </span>
                        <button className={styles.iconBtn} title="Mostrar/ocultar" onClick={() => togglePw(g._id)}>
                          {visiblePw.has(g._id) ? '🙈' : '👁️'}
                        </button>
                        <button className={styles.iconBtn} title="Copiar contraseña" onClick={() => copyPw(g.password)}>📋</button>
                      </td>
                      <td>
                        <span className={pageStyles.statusBadge} style={{
                          color: g.status === 'activa' ? '#16a34a' : '#888',
                          background: g.status === 'activa' ? '#f0fdf4' : '#f0f0f0',
                        }}>
                          {g.status === 'activa' ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {currentUser.canManagePlatformAccounts && (
            platformAccounts.length === 0 ? (
              <p className={pageStyles.empty}>Este empleado no tiene cuentas de plataformas asignadas.</p>
            ) : (
              <div className={pageStyles.tableWrap}>
                <table className={pageStyles.table}>
                  <thead>
                    <tr>
                      <th>Plataforma</th>
                      <th>Usuario / Correo</th>
                      <th>Contraseña</th>
                      <th>Estado</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {platformAccounts.map((a) => (
                      <tr key={a._id}>
                        <td><span className={pageStyles.typeBadge}>{a.platform}</span></td>
                        <td>{a.username}</td>
                        <td className={styles.passwordCell}>
                          <span className={styles.passwordText}>
                            {visiblePw.has(a._id) ? a.password : '•'.repeat(10)}
                          </span>
                          <button className={styles.iconBtn} title="Mostrar/ocultar" onClick={() => togglePw(a._id)}>
                            {visiblePw.has(a._id) ? '🙈' : '👁️'}
                          </button>
                          <button className={styles.iconBtn} title="Copiar contraseña" onClick={() => copyPw(a.password)}>📋</button>
                        </td>
                        <td>
                          <span className={pageStyles.statusBadge} style={{
                            color: a.status === 'activa' ? '#16a34a' : '#888',
                            background: a.status === 'activa' ? '#f0fdf4' : '#f0f0f0',
                          }}>
                            {a.status === 'activa' ? 'Activa' : 'Inactiva'}
                          </span>
                        </td>
                        <td>
                          <button className={pageStyles.btnEdit} onClick={() => openUnassignAccount(a)}>↩️ Desasignar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )}

      {showAssign && (
        <AssignModal
          employee={employee}
          onClose={() => setShowAssign(false)}
          onDone={load}
        />
      )}

      {editingAssignment && (
        <EditAssignmentModal
          assignment={editingAssignment}
          onClose={() => setEditingAssignment(null)}
          onDone={load}
        />
      )}

      {showAssignAccount && (
        <AssignAccountModal
          availableAccounts={availableAccounts}
          saving={assignAccountSaving}
          onClose={() => setShowAssignAccount(false)}
          onAssign={handleAssignAccount}
        />
      )}

      {confirmUnassignAccount && (
        <div className={styles.overlay} onClick={() => !unassignAccountLoading && setConfirmUnassignAccount(null)}>
          <div className={assetStyles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={assetStyles.modalHeader}>
              <h2 className={assetStyles.modalTitle}>↩️ Desasignar cuenta</h2>
              <button className={assetStyles.closeBtn} onClick={() => setConfirmUnassignAccount(null)} disabled={unassignAccountLoading}>✕</button>
            </div>

            <div className={assetStyles.form}>
              <p>
                <strong>{confirmUnassignAccount.platform} · {confirmUnassignAccount.username}</strong> dejará de estar asociada a <strong>{employee.name}</strong>.
              </p>
              <p>
                La contraseña guardada no cambia con ninguna de las dos opciones, a menos que la regeneres desde Cuentas de Plataformas.
              </p>

              {!reassignMode ? (
                <div className={assetStyles.modalActions} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <button type="button" className={assetStyles.btnCancel} onClick={() => setConfirmUnassignAccount(null)} disabled={unassignAccountLoading}>
                    Cancelar
                  </button>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button type="button" className={pageStyles.btnSecondary} onClick={openReassignMode} disabled={unassignAccountLoading}>
                      Asignar a otro empleado
                    </button>
                    <button type="button" className={pageStyles.btnDelete} onClick={confirmUnassignPlatformAccount} disabled={unassignAccountLoading}>
                      {unassignAccountLoading ? 'Procesando...' : 'Mandar a disponible'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={assetStyles.field}>
                    <label>Nuevo empleado *</label>
                    <select value={reassignEmployeeId} onChange={(e) => setReassignEmployeeId(e.target.value)}>
                      <option value="">Selecciona un empleado</option>
                      {reassignEmployees.map((e) => (
                        <option key={e._id} value={e._id}>{e.name} — #{e.employeeId}</option>
                      ))}
                    </select>
                  </div>
                  <div className={assetStyles.modalActions}>
                    <button type="button" className={assetStyles.btnCancel} onClick={() => setReassignMode(false)} disabled={unassignAccountLoading}>
                      Atrás
                    </button>
                    <button type="button" className={assetStyles.btnPrimary} onClick={confirmUnassignPlatformAccount} disabled={unassignAccountLoading || !reassignEmployeeId}>
                      {unassignAccountLoading ? 'Asignando...' : 'Confirmar asignación'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
