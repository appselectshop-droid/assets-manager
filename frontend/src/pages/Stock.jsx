import { useEffect, useState, useMemo } from 'react';
import api from '../services/api';
import { ASSET_TYPE_LABELS, ACCESSORY_TYPE_LABELS, TYPE_ICONS } from '../config/assetFields';
import { matchesSearch, specsValues } from '../utils/search';
import styles from './Stock.module.css';

const ALL_LABELS = { ...ASSET_TYPE_LABELS, ...ACCESSORY_TYPE_LABELS };

const STOCK_SECTIONS = [
  { key: 'computo',      label: 'Equipo de cómputo', icon: '💻', types: ['laptop', 'escritorio', 'all_in_one'] },
  { key: 'moviles',      label: 'Móviles',            icon: '📱', types: ['celular', 'cargador_celular'] },
  { key: 'tablets',      label: 'Tablets',             icon: '📱', types: ['tablet'] },
  { key: 'perifericos',  label: 'Periféricos',         icon: '🖥️', types: ['monitor', 'mouse', 'teclado', 'cargador_laptop', 'kit_perifericos', 'audifonos', 'webcam', 'hub_usb', 'base_laptop'] },
  { key: 'impresion',    label: 'Impresión',            icon: '🖨️', types: ['impresora', 'escaner'] },
  { key: 'cables',       label: 'Cables',               icon: '🔌', types: ['cable'] },
  { key: 'adaptadores',  label: 'Adaptadores',          icon: '🔄', types: ['adaptador'] },
  { key: 'almacenamiento', label: 'Almacenamiento',     icon: '💾', types: ['disco_duro'] },
  { key: 'consumibles',  label: 'Consumibles',          icon: '🧹', types: ['consumible'] },
  { key: 'herramientas', label: 'Herramientas',         icon: '🔧', types: ['herramienta'] },
  { key: 'infraestructura', label: 'Infraestructura',  icon: '🌐', types: ['router', 'switch', 'access_point', 'camara_ip', 'nvr', 'poe_injector', 'ups', 'insumo_red'] },
  { key: 'otros',        label: 'Otros',                icon: '📦', types: ['accesorio', 'otro'] },
];

function buildGroups(assets) {
  const map = {};
  for (const a of assets) {
    let key = a.type;
    let label = ALL_LABELS[a.type] || a.type;

    if (a.type === 'cable') {
      const sub = a.specs?.cableType || 'Sin tipo';
      key = `cable__${sub}`;
      label = `Cable — ${sub}`;
    } else if (a.type === 'consumible') {
      const sub = a.specs?.consumibleType || 'Sin tipo';
      key = `consumible__${sub}`;
      label = sub;
    }

    if (!map[key]) {
      map[key] = {
        key, label,
        baseType: a.type,
        icon: TYPE_ICONS[a.type] || '📦',
        total: 0, disponible: 0, asignado: 0, baja: 0,
        available: [],
        dispByLocation: {},
      };
    }

    if (a._bulkAvail !== undefined) {
      // Bulk product: use quantity-based accounting
      map[key].total     += a.stockTotal || 0;
      map[key].disponible += a._bulkAvail;
      map[key].asignado  += a._bulkAssigned;
      if (a._bulkAvail > 0) {
        map[key].available.push(a);
        const loc = a.location || 'Sin sucursal';
        map[key].dispByLocation[loc] = (map[key].dispByLocation[loc] || 0) + a._bulkAvail;
      }
    } else {
      map[key].total++;
      map[key][a.status] = (map[key][a.status] || 0) + 1;
      if (a.status === 'disponible') {
        map[key].available.push(a);
        const loc = a.location || 'Sin sucursal';
        map[key].dispByLocation[loc] = (map[key].dispByLocation[loc] || 0) + 1;
      }
    }
  }
  return map;
}

function AssignModal({ group, onClose, onAssigned }) {
  const [selected, setSelected] = useState(group.available.length === 1 ? group.available[0] : null);
  const [employees, setEmployees] = useState([]);
  const [empSearch, setEmpSearch] = useState('');
  const [assignTo, setAssignTo] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isBulk = selected?._bulkAvail !== undefined;
  const maxQty = isBulk ? selected._bulkAvail : 1;

  useEffect(() => {
    api.get('/employees').then(({ data }) => setEmployees(data.filter((e) => e.active)));
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
    if (!selected || !assignTo) { setError('Selecciona un artículo y un empleado.'); return; }
    setLoading(true);
    setError('');
    try {
      if (isBulk) {
        await api.post('/assignments', {
          employee: assignTo._id, asset: selected._id, notes,
          quantity: Math.min(maxQty, Math.max(1, parseInt(quantity) || 1)),
        });
      } else {
        if (selected._sistemasAssignmentId) {
          await api.delete(`/assignments/${selected._sistemasAssignmentId}`);
        }
        await api.put(`/assets/${selected._id}`, { status: 'asignado' });
        await api.post('/assignments', { employee: assignTo._id, asset: selected._id, notes });
      }
      onAssigned();
    } catch (e) {
      setError(e.response?.data?.message || 'Error al asignar');
      setLoading(false);
    }
  };

  const itemLabel = (a) => {
    const name = [a.brand, a.model].filter(Boolean).join(' ') || ALL_LABELS[a.type] || a.type;
    const tag = a.inventoryTag || a.serialNumber;
    const location = a.location || 'Sin sucursal';
    return { name, tag, location };
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>{group.icon}</span>
          <h2 className={styles.modalTitle}>Asignar — {group.label}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.modalBody}>
          {error && <p className={styles.formError}>{error}</p>}

          {/* Item selection */}
          <div>
            <span className={styles.modalLabel}>Artículo a asignar ({group.available.length} disponibles)</span>
            <div className={styles.itemList}>
              {group.available.map((a) => {
                const { name, tag, location } = itemLabel(a);
                const isActive = selected?._id === a._id;
                return (
                  <label
                    key={a._id}
                    className={`${styles.itemOption} ${isActive ? styles.itemOptionActive : ''}`}
                  >
                    <input
                      type="radio"
                      name="stockItem"
                      value={a._id}
                      checked={isActive}
                      onChange={() => setSelected(a)}
                      style={{ accentColor: '#E8431A', flexShrink: 0 }}
                    />
                    <span style={{ flex: 1 }}>{name}</span>
                    <span className={styles.itemOptLocation}>📍 {location}</span>
                    {tag && <span className={styles.itemOptTag}>{tag}</span>}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Employee selection */}
          <div>
            <span className={styles.modalLabel}>Empleado</span>
            {assignTo ? (
              <div className={styles.empSelected}>
                <div className={styles.empSelectedInfo}>
                  <span className={styles.empSelAvatar}>
                    {assignTo.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <p className={styles.empSelName}>{assignTo.name}</p>
                    <p className={styles.empSelSub}>
                      {assignTo.employeeId}{assignTo.department && ` · ${assignTo.department}`}
                    </p>
                  </div>
                </div>
                <button className={styles.btnChange} onClick={() => { setAssignTo(null); setEmpSearch(''); }}>
                  Cambiar
                </button>
              </div>
            ) : (
              <div className={styles.empSearchWrap}>
                <input
                  className={styles.empInput}
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
                          <span className={styles.empAvatar}>
                            {emp.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </span>
                          <div>
                            <p className={styles.empName}>{emp.name}</p>
                            <p className={styles.empSub}>
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

          {/* Quantity (bulk products only) */}
          {isBulk && (
            <div>
              <span className={styles.modalLabel}>Cantidad a asignar ({maxQty} disponibles)</span>
              <input
                className={styles.notesInput}
                type="number"
                min="1"
                max={maxQty}
                value={quantity}
                onChange={(e) =>
                  setQuantity(Math.min(maxQty, Math.max(1, parseInt(e.target.value) || 1)))
                }
                style={{ width: 120 }}
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <span className={styles.modalLabel}>Notas (opcional)</span>
            <input
              className={styles.notesInput}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones sobre la entrega..."
            />
          </div>

          <div className={styles.modalActions}>
            <button className={styles.btnCancel} onClick={onClose}>Cancelar</button>
            <button
              className={styles.btnPrimary}
              onClick={handleAssign}
              disabled={loading || !selected || !assignTo}
            >
              {loading ? 'Asignando...' : 'Confirmar asignación'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountAssignModal({ group, onClose, onAssigned }) {
  const [selected, setSelected] = useState(group.accounts.length === 1 ? group.accounts[0] : null);
  const [employees, setEmployees] = useState([]);
  const [empSearch, setEmpSearch] = useState('');
  const [assignTo, setAssignTo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/employees').then(({ data }) => setEmployees(data.filter((e) => e.active)));
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
    if (!selected || !assignTo) { setError('Selecciona una cuenta y un empleado.'); return; }
    setLoading(true);
    setError('');
    try {
      await api.put(`${group.apiBase || '/platform-accounts'}/${selected._id}`, { employeeId: assignTo._id });
      onAssigned();
    } catch (e) {
      setError(e.response?.data?.message || 'Error al asignar');
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>🔐</span>
          <h2 className={styles.modalTitle}>Asignar — {group.platform}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.modalBody}>
          {error && <p className={styles.formError}>{error}</p>}

          <div>
            <span className={styles.modalLabel}>Cuenta a asignar ({group.accounts.length} disponibles)</span>
            <div className={styles.itemList}>
              {group.accounts.map((a) => {
                const isActive = selected?._id === a._id;
                return (
                  <label key={a._id} className={`${styles.itemOption} ${isActive ? styles.itemOptionActive : ''}`}>
                    <input
                      type="radio"
                      name="accountItem"
                      value={a._id}
                      checked={isActive}
                      onChange={() => setSelected(a)}
                      style={{ accentColor: '#E8431A', flexShrink: 0 }}
                    />
                    <span style={{ flex: 1 }}>{a.username}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <span className={styles.modalLabel}>Empleado</span>
            {assignTo ? (
              <div className={styles.empSelected}>
                <div className={styles.empSelectedInfo}>
                  <span className={styles.empSelAvatar}>
                    {assignTo.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <p className={styles.empSelName}>{assignTo.name}</p>
                    <p className={styles.empSelSub}>
                      {assignTo.employeeId}{assignTo.department && ` · ${assignTo.department}`}
                    </p>
                  </div>
                </div>
                <button className={styles.btnChange} onClick={() => { setAssignTo(null); setEmpSearch(''); }}>
                  Cambiar
                </button>
              </div>
            ) : (
              <div className={styles.empSearchWrap}>
                <input
                  className={styles.empInput}
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
                          <span className={styles.empAvatar}>
                            {emp.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </span>
                          <div>
                            <p className={styles.empName}>{emp.name}</p>
                            <p className={styles.empSub}>
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

          <div className={styles.modalActions}>
            <button className={styles.btnCancel} onClick={onClose}>Cancelar</button>
            <button
              className={styles.btnPrimary}
              onClick={handleAssign}
              disabled={loading || !selected || !assignTo}
            >
              {loading ? 'Asignando...' : 'Confirmar asignación'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Stock() {
  // Leído dentro del componente (no a nivel de módulo) para que sea el
  // permiso vigente en cada visita — si se lee una sola vez al cargar el
  // bundle, se queda pegado a como estaba localStorage antes de iniciar
  // sesión (todo en {}), y las secciones de Cuentas de Plataformas/ERP no
  // aparecen hasta refrescar la página a fuerzas.
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignGroup, setAssignGroup] = useState(null);
  const [filterSucursal, setFilterSucursal] = useState('');
  const [search, setSearch] = useState('');
  const [availableAccounts, setAvailableAccounts] = useState([]);
  const [availableErpAccounts, setAvailableErpAccounts] = useState([]);
  const [accountAssignGroup, setAccountAssignGroup] = useState(null);

  const loadAccounts = async () => {
    if (currentUser.canManagePlatformAccounts) {
      try {
        const { data } = await api.get('/platform-accounts');
        setAvailableAccounts(data.filter((a) => !a.employee));
      } catch { /* sin permiso o error transitorio: se omite la sección */ }
    }
    if (currentUser.canManagePlatformAccountsErp) {
      try {
        const { data } = await api.get('/platform-accounts-erp');
        setAvailableErpAccounts(data.filter((a) => !a.employee));
      } catch { /* sin permiso o error transitorio: se omite la sección */ }
    }
  };

  const load = async () => {
    const [{ data: assetData }, { data: assignData }] = await Promise.all([
      api.get('/assets'),
      api.get('/assignments'),
    ]);
    const sistemasMap = {};
    assignData.forEach((a) => {
      if (a.employee?.name?.toLowerCase() === 'sistemas' && a.asset?._id) {
        sistemasMap[a.asset._id] = a._id;
      }
    });
    const adjusted = assetData.map((a) => {
      if (sistemasMap[a._id]) {
        return { ...a, status: 'disponible', _sistemasAssignmentId: sistemasMap[a._id] };
      }
      if (a.stockTotal != null) {
        // Bulk product: compute available/assigned from assignment records
        const myAssigns = assignData.filter(
          (aa) => String(aa.asset?._id || aa.asset) === String(a._id)
        );
        const _bulkAssigned = myAssigns.reduce((sum, aa) => sum + (aa.quantity || 1), 0);
        const _bulkAvail = Math.max(0, a.stockTotal - _bulkAssigned);
        return { ...a, _bulkAvail, _bulkAssigned };
      }
      return a;
    });
    setAssets(adjusted);
    setLoading(false);
  };

  useEffect(() => { load(); loadAccounts(); }, []);

  const accountGroups = useMemo(() => {
    const map = {};
    availableAccounts.forEach((a) => {
      if (!map[a.platform]) map[a.platform] = { platform: a.platform, accounts: [], apiBase: '/platform-accounts' };
      map[a.platform].accounts.push(a);
    });
    return Object.values(map).sort((a, b) => b.accounts.length - a.accounts.length);
  }, [availableAccounts]);

  const erpAccountGroups = useMemo(() => {
    const map = {};
    availableErpAccounts.forEach((a) => {
      if (!map[a.platform]) map[a.platform] = { platform: a.platform, accounts: [], apiBase: '/platform-accounts-erp' };
      map[a.platform].accounts.push(a);
    });
    return Object.values(map).sort((a, b) => b.accounts.length - a.accounts.length);
  }, [availableErpAccounts]);

  // Offices that have at least one asset registered there
  const offices = useMemo(() => {
    const set = new Set(assets.map((a) => a.location).filter(Boolean));
    return [...set].sort();
  }, [assets]);

  // Filter by the asset's registered location
  const viewAssets = useMemo(() => {
    if (!filterSucursal) return assets;
    return assets.filter((a) => a.location === filterSucursal);
  }, [assets, filterSucursal]);

  // Búsqueda: por marca/modelo/serie/etiqueta/specs (IMEI, línea, etc.) o por
  // el empleado del que se liberó (para encontrar, ej., el teléfono de
  // alguien que se dio de baja y reasignarlo).
  const searchedAssets = useMemo(() => viewAssets.filter((a) => matchesSearch(
    search,
    a.brand, a.model, a.serialNumber, a.inventoryTag, a.notes, a.location,
    specsValues(a.specs),
    a.freedFromEmployee?.name, a.freedFromEmployee?.position, a.freedFromEmployee?.office,
  )), [viewAssets, search]);

  const groups = useMemo(() => buildGroups(searchedAssets), [searchedAssets]);

  // Activos que quedaron disponibles por dar de baja al empleado que los tenía
  // (ver PUT /employees/:id) — se muestran aparte para saber de qué puesto
  // vienen, en vez de perderse mezclados con el resto de "disponibles".
  const bajaAssets = useMemo(
    () => searchedAssets.filter((a) => a.status === 'disponible' && a.freedFromEmployee?.name),
    [searchedAssets]
  );

  const totalDisp = searchedAssets.reduce((s, a) =>
    s + (a._bulkAvail !== undefined ? a._bulkAvail : (a.status === 'disponible' ? 1 : 0)), 0);
  const totalAsig = searchedAssets.reduce((s, a) =>
    s + (a._bulkAvail !== undefined ? a._bulkAssigned : (a.status === 'asignado' ? 1 : 0)), 0);
  const totalBaja = searchedAssets.filter((a) => a._bulkAvail === undefined && a.status === 'baja').length;

  if (loading) return (
    <div className={styles.page}>
      <p style={{ color: '#aaa', marginTop: '2rem' }}>Cargando inventario...</p>
    </div>
  );

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Disponibilidad de Inventario</h1>
          <p className={styles.pageSubtitle}>
            {filterSucursal ? (
              <>
                {filterSucursal} —{' '}
                <strong style={{ color: '#16a34a' }}>{totalDisp} disponibles</strong>
                {' · '}
                <strong style={{ color: '#d97706' }}>{totalAsig} asignados</strong>
              </>
            ) : (
              <>
                {assets.length} registros —{' '}
                <strong style={{ color: '#16a34a' }}>{totalDisp} disponibles</strong>
                {' · '}
                <strong style={{ color: '#d97706' }}>{totalAsig} asignados</strong>
                {' · '}
                <span style={{ color: '#dc2626' }}>{totalBaja} de baja</span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Búsqueda y filtro de sucursal */}
      <div className={styles.filterRow}>
        <input
          className={styles.filterSelect}
          style={{ flex: 1, minWidth: 260 }}
          placeholder="Buscar por marca, modelo, no. de serie, IMEI, línea, o empleado del que se liberó..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={styles.filterSelect}
          value={filterSucursal}
          onChange={(e) => { setFilterSucursal(e.target.value); setAssignGroup(null); }}
        >
          <option value="">Todas las sucursales</option>
          {offices.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        {filterSucursal && (
          <button className={styles.clearFilterBtn} onClick={() => setFilterSucursal('')}>
            ✕ Ver todas
          </button>
        )}
      </div>

      {bajaAssets.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span>🔁</span>
            <span>Liberado por salida de personal</span>
            <span className={styles.sectionDisp}>{bajaAssets.length} disponibles para reasignar</span>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#888', margin: '-0.5rem 0 0.75rem' }}>
            Este equipo está <strong>disponible</strong> (no "de baja") — quedó libre porque el empleado que lo tenía dejó la empresa.
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Artículo</th>
                  <th>Datos</th>
                  <th>Venía de</th>
                  <th>Sucursal</th>
                  <th>Liberado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {bajaAssets.map((a) => {
                  const name = [a.brand, a.model].filter(Boolean).join(' ') || ALL_LABELS[a.type] || a.type;
                  const tag = a.inventoryTag || a.serialNumber;
                  const isPhone = ['celular', 'tablet'].includes(a.type);
                  const details = isPhone
                    ? [
                        a.specs?.lineNumber && `📞 ${a.specs.lineNumber}`,
                        a.specs?.imei && `IMEI: ${a.specs.imei}`,
                      ].filter(Boolean)
                    : [a.serialNumber && `No. Serie: ${a.serialNumber}`].filter(Boolean);
                  const days = Math.floor((Date.now() - new Date(a.freedFromEmployee.date)) / 86400000);
                  return (
                    <tr key={a._id}>
                      <td>
                        <div className={styles.typeCell}>
                          <span className={styles.typeIcon}>{TYPE_ICONS[a.type] || '📦'}</span>
                          <span className={styles.typeLabel}>{name}{tag ? ` · ${tag}` : ''}</span>
                        </div>
                      </td>
                      <td>{details.length > 0 ? details.join(' · ') : '—'}</td>
                      <td>
                        {a.freedFromEmployee.name}
                        {a.freedFromEmployee.position && ` — ${a.freedFromEmployee.position}`}
                      </td>
                      <td>{a.freedFromEmployee.office || '—'}</td>
                      <td>{days === 0 ? 'Hoy' : `Hace ${days} día${days !== 1 ? 's' : ''}`}</td>
                      <td>
                        <button
                          className={styles.btnAssign}
                          onClick={() => setAssignGroup({
                            key: a._id,
                            icon: TYPE_ICONS[a.type] || '📦',
                            label: name,
                            available: [a],
                          })}
                        >
                          Asignar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {search && bajaAssets.length === 0 && Object.keys(groups).length === 0 && (
        <p style={{ color: '#888', fontSize: '0.9rem', margin: '1rem 0' }}>
          Sin resultados para "{search}".
        </p>
      )}

      {STOCK_SECTIONS.map((section) => {
        const sectionGroups = Object.values(groups)
          .filter((g) => section.types.includes(g.baseType))
          .sort((a, b) => b.total - a.total);

        if (sectionGroups.length === 0) return null;

        const sectionDisp = sectionGroups.reduce((s, g) => s + g.disponible, 0);

        return (
          <div key={section.key} className={styles.section}>
            <div className={styles.sectionHeader}>
              <span>{section.icon}</span>
              <span>{section.label}</span>
              <span className={styles.sectionDisp}>
                {sectionDisp > 0 ? `${sectionDisp} disponibles` : 'Sin stock disponible'}
              </span>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Tipo / Artículo</th>
                    <th style={{ textAlign: 'center' }}>Total</th>
                    <th style={{ textAlign: 'center' }}>Disponibles</th>
                    <th style={{ textAlign: 'center' }}>Asignados</th>
                    <th style={{ textAlign: 'center' }}>Baja</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sectionGroups.map((group) => (
                    <tr key={group.key} className={group.disponible === 0 ? styles.rowDimmed : ''}>
                      <td>
                        <div className={styles.typeCell}>
                          <span className={styles.typeIcon}>{group.icon}</span>
                          <span className={styles.typeLabel}>{group.label}</span>
                        </div>
                      </td>
                      <td className={styles.numCell}>
                        <span className={styles.numTotal}>{group.total}</span>
                      </td>
                      <td className={styles.numCell}>
                        <span className={group.disponible > 0 ? styles.numDisp : styles.numDispZero}>
                          {group.disponible}
                        </span>
                        {!filterSucursal && group.disponible > 0 && (
                          <div className={styles.dispByLocation}>
                            {Object.entries(group.dispByLocation)
                              .sort((a, b) => b[1] - a[1])
                              .map(([loc, n]) => (
                                <span key={loc} className={styles.dispLocTag}>{loc}: {n}</span>
                              ))}
                          </div>
                        )}
                      </td>
                      <td className={styles.numCell}>
                        <span className={styles.numAsig}>{group.asignado || 0}</span>
                      </td>
                      <td className={styles.numCell}>
                        <span className={styles.numBaja}>{group.baja || 0}</span>
                      </td>
                      <td>
                        {group.disponible > 0 ? (
                          <button
                            className={styles.btnAssign}
                            onClick={() => setAssignGroup(group)}
                          >
                            Asignar
                          </button>
                        ) : (
                          <span className={styles.noStock}>Sin stock</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {currentUser.canManagePlatformAccounts && accountGroups.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span>🔐</span>
            <span>Cuentas de Plataformas</span>
            <span className={styles.sectionDisp}>
              {availableAccounts.length} disponibles para reciclar
            </span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Plataforma</th>
                  <th style={{ textAlign: 'center' }}>Disponibles</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {accountGroups.map((group) => (
                  <tr key={group.platform}>
                    <td>
                      <div className={styles.typeCell}>
                        <span className={styles.typeIcon}>🔐</span>
                        <span className={styles.typeLabel}>{group.platform}</span>
                      </div>
                    </td>
                    <td className={styles.numCell}>
                      <span className={styles.numDisp}>{group.accounts.length}</span>
                    </td>
                    <td>
                      <button className={styles.btnAssign} onClick={() => setAccountAssignGroup(group)}>
                        Asignar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {currentUser.canManagePlatformAccountsErp && erpAccountGroups.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span>🏭</span>
            <span>Cuentas de Plataformas ERP</span>
            <span className={styles.sectionDisp}>
              {availableErpAccounts.length} disponibles para reciclar
            </span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Plataforma</th>
                  <th style={{ textAlign: 'center' }}>Disponibles</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {erpAccountGroups.map((group) => (
                  <tr key={group.platform}>
                    <td>
                      <div className={styles.typeCell}>
                        <span className={styles.typeIcon}>🏭</span>
                        <span className={styles.typeLabel}>{group.platform}</span>
                      </div>
                    </td>
                    <td className={styles.numCell}>
                      <span className={styles.numDisp}>{group.accounts.length}</span>
                    </td>
                    <td>
                      <button className={styles.btnAssign} onClick={() => setAccountAssignGroup(group)}>
                        Asignar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {assignGroup && (
        <AssignModal
          key={assignGroup.key}
          group={assignGroup}
          onClose={() => setAssignGroup(null)}
          onAssigned={() => { setAssignGroup(null); load(); }}
        />
      )}

      {accountAssignGroup && (
        <AccountAssignModal
          key={`${accountAssignGroup.apiBase}-${accountAssignGroup.platform}`}
          group={accountAssignGroup}
          onClose={() => setAccountAssignGroup(null)}
          onAssigned={() => { setAccountAssignGroup(null); loadAccounts(); }}
        />
      )}
    </div>
  );
}
