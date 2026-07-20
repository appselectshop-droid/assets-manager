import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import ImportModal from '../components/ImportModal';
import { matchesSearch } from '../utils/search';
import styles from './Page.module.css';

// Última pendiente de la corrección de sucursales (16 jul): dividir "SUC.6
// CEDI Naucalpan" en NAUCALPAN (CRISTALERIA) / NAUCALPAN (TLB) — mismo
// patrón de checklist que ya se usó para GOLDEN/Torre Polanco (y que ya se
// quitó de la app una vez usado). Se muestra solo si sigue habiendo alguien
// con esa oficina.
function NaucalpanSplitPanel({ employees, onDone }) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const pending = employees.filter((e) => e.active !== false && e.office === 'SUC.6 CEDI Naucalpan');

  const toggle = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleApply = async () => {
    if (selectedIds.size === 0) { alert('Marca al menos un empleado de TLB.'); return; }
    if (!confirm(`Los ${selectedIds.size} marcados pasan a NAUCALPAN (TLB); el resto (${pending.length - selectedIds.size}) pasa a NAUCALPAN (CRISTALERIA). ¿Confirmas?`)) return;
    setSaving(true);
    setResult(null);
    try {
      const { data } = await api.post('/employees/split-naucalpan', { tlbIds: [...selectedIds] });
      setResult(data);
      setSelectedIds(new Set());
      onDone();
    } catch (err) {
      alert(err.response?.data?.message || 'No se pudo aplicar la división');
    } finally {
      setSaving(false);
    }
  };

  if (pending.length === 0 && !result) return null;

  return (
    <div className={styles.tableWrap} style={{ padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
      <h2 className={styles.title} style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Dividir Naucalpan (16 jul)</h2>
      <p className={styles.subtitle} style={{ marginBottom: '0.75rem' }}>
        Marca quiénes van a NAUCALPAN (TLB) — el resto pasa a NAUCALPAN (CRISTALERIA).
      </p>
      {pending.length > 0 ? (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {pending.map((e) => (
              <label key={e._id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', border: '1px solid #eee', borderRadius: '8px', padding: '0.4rem 0.7rem' }}>
                <input type="checkbox" checked={selectedIds.has(e._id)} onChange={() => toggle(e._id)} />
                {e.name} {e.department ? `— ${e.department}` : ''}
              </label>
            ))}
          </div>
          <button className={styles.btnPrimary} onClick={handleApply} disabled={saving || selectedIds.size === 0}>
            {saving ? 'Aplicando...' : 'Aplicar división de Naucalpan'}
          </button>
        </>
      ) : (
        <p style={{ fontSize: '0.82rem', color: '#555' }}>
          {result.tlbCount} a TLB, {result.cristaleriaCount} a Cristalería, {result.assetsUpdated} activo(s) a Cristalería.
        </p>
      )}
    </div>
  );
}

const BUSINESS_NAMES = [
  'ALEAGARAT',
  'BH SOLAR',
  'BH. BE HEALTHY COMERCIALIZADORA',
  'BLOOM AND BLUSH',
  'COMERCIALIZADORA ONLINE NH',
  'COMERCIALIZADORA DE MARCAS JSB',
  'ENFERMERAS UNIDAS PLUS',
  'DONKERTECH',
  'ZONA ZELU',
  'SELECT SHOP MB',
  'KOSHER',
];

// Nomenclatura correcta confirmada por el usuario el 16 jul (la lista vieja
// de 11 nombres estaba desactualizada). "GOLDEN" ya se dividió (CISNES/
// POLANCO PISO 16) y se quitó de aquí. "SUC.6 CEDI Naucalpan" sigue pendiente
// de dividir en NAUCALPAN (CRISTALERIA)/NAUCALPAN (TLB) — se deja tal cual
// hasta que se resuelva esa división a mano en cada empleado.
export const OFFICES = [
  'CISNES',
  'HORACIO',
  'IZTAPALAPA',
  'NAUCALPAN (CRISTALERIA)',
  'NAUCALPAN (TLB)',
  'NEBRASKA',
  'POLANCO PISO 13',
  'POLANCO PISO 16',
  'T. ARAGON',
  'T. CUERNAVACA',
  'T. POLANCO',
  'TEPOTZOTLAN II',
  'TEPOTZOTLAN III',
  'TEPOTZOTLAN IV',
  'T. PORTAL CENTRO',
  'T. PERINORTE',
  'SUC.6 CEDI Naucalpan',
];

const DEPARTMENTS = [
  'Asuntos Corporativos',
  'Comercial',
  'Cristalería',
  'Dirección General',
  'E-Commerce',
  'Finanzas',
  'Gestión Patrimonial',
  'Logística',
];

const EMPTY = {
  employeeId: '', name: '', businessName: '', office: '',
  position: '', area: '', department: '', phone: '',
  corporateEmails: [], gmailAccounts: [], canManageOnboarding: false,
  canRequestOffboarding: false, canManageOffboarding: false,
};

// El checkbox de "Alta de un nuevo ingreso" (RH) solo debe ofrecerse para
// quien de verdad es de RH — pedido explícito: no tiene caso mostrárselo a
// todos los empleados en el formulario. `área` es texto libre (no un
// catálogo fijo), así que se compara sin distinguir mayúsculas/espacios.
function isRHArea(area) {
  return (area || '').trim().toLowerCase() === 'recursos humanos';
}

function ComboSelect({ label, value, onChange, options }) {
  const isCustom = value !== '' && !options.includes(value);
  const [showCustom, setShowCustom] = useState(isCustom);

  useEffect(() => {
    setShowCustom(value !== '' && !options.includes(value));
  }, [value]);

  const selectVal = showCustom ? '__other__' : value;

  const handleSelect = (e) => {
    if (e.target.value === '__other__') {
      setShowCustom(true);
      onChange('');
    } else {
      setShowCustom(false);
      onChange(e.target.value);
    }
  };

  return (
    <div className={styles.field}>
      <label>{label}</label>
      <select value={selectVal} onChange={handleSelect}>
        <option value="">— Selecciona —</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value="__other__">Otro (escribe aquí)...</option>
      </select>
      {showCustom && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Escribe el valor..."
          autoFocus
        />
      )}
    </div>
  );
}

function TagInput({ label, values, onChange, reject, rejectMessage }) {
  const [input, setInput] = useState('');
  const [warning, setWarning] = useState('');

  const add = () => {
    const val = input.trim();
    if (!val) return;
    if (reject && reject(val)) {
      setWarning(rejectMessage || 'Ese valor no se puede agregar aquí.');
      return;
    }
    setWarning('');
    if (!values.includes(val)) onChange([...values, val]);
    setInput('');
  };

  const remove = (v) => onChange(values.filter((x) => x !== v));

  return (
    <div className={styles.field}>
      <label>{label}</label>
      <div className={styles.tagWrap}>
        {values.map((v) => (
          <span key={v} className={styles.tag}>
            {v}
            <button type="button" className={styles.tagRemove} onClick={() => remove(v)}>✕</button>
          </span>
        ))}
        <div className={styles.tagInputRow}>
          <input
            value={input}
            onChange={(e) => { setInput(e.target.value); setWarning(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            placeholder="Escribe y presiona Enter"
          />
          <button type="button" className={styles.tagAdd} onClick={add}>+</button>
        </div>
      </div>
      {warning && <span style={{ color: '#E8431A', fontSize: '0.75rem', fontWeight: 500 }}>{warning}</span>}
    </div>
  );
}

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [assetsByEmployee, setAssetsByEmployee] = useState({});
  // Celular asignado → su número de línea (specs.lineNumber), para
  // precargar "Teléfono" al editar en vez de dejarlo en blanco — pedido
  // explícito. Solo se usa como respaldo si el campo ya no tiene algo
  // capturado a mano (ver openEdit), para no pisar un dato real existente.
  const [phoneByEmployee, setPhoneByEmployee] = useState({});
  // Computadora(s) asignada(s) → su(s) AnyDesk ID (specs.anydesk) — para
  // tenerlo a la mano en la tabla sin tener que entrar a Activos. Si tiene
  // más de un equipo con AnyDesk capturado, se muestran todos separados
  // por coma.
  const [anydeskByEmployee, setAnydeskByEmployee] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [filterOffice, setFilterOffice] = useState(searchParams.get('office') || '');
  const tab = searchParams.get('estado') === 'baja' ? 'baja' : 'activos';
  const setTab = (t) => {
    const next = new URLSearchParams(searchParams);
    if (t === 'baja') next.set('estado', 'baja'); else next.delete('estado');
    setSearchParams(next);
  };
  const navigate = useNavigate();

  const load = async () => {
    const [{ data: employeesData }, { data: assignmentsData }] = await Promise.all([
      api.get('/employees'),
      api.get('/assignments'),
    ]);
    setEmployees(employeesData);
    const byEmployee = {};
    const phoneByEmp = {};
    const anydeskByEmp = {};
    const COMPUTER_TYPES = ['laptop', 'escritorio', 'all_in_one'];
    assignmentsData.forEach((asgn) => {
      const empId = asgn.employee?._id || asgn.employee;
      if (!empId || !asgn.asset) return;
      const text = [asgn.asset.brand, asgn.asset.model, asgn.asset.serialNumber, asgn.asset.inventoryTag]
        .filter(Boolean).join(' ').toLowerCase();
      byEmployee[empId] = byEmployee[empId] ? `${byEmployee[empId]} ${text}` : text;
      if (asgn.asset.type === 'celular' && asgn.asset.specs?.lineNumber && !phoneByEmp[empId]) {
        phoneByEmp[empId] = asgn.asset.specs.lineNumber;
      }
      if (COMPUTER_TYPES.includes(asgn.asset.type) && asgn.asset.specs?.anydesk) {
        anydeskByEmp[empId] = anydeskByEmp[empId]
          ? `${anydeskByEmp[empId]}, ${asgn.asset.specs.anydesk}`
          : asgn.asset.specs.anydesk;
      }
    });
    setAssetsByEmployee(byEmployee);
    setPhoneByEmployee(phoneByEmp);
    setAnydeskByEmployee(anydeskByEmp);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(EMPTY); setEditing(null); setShowModal(true); };
  const openEdit = (emp) => {
    setForm({
      ...EMPTY,
      ...emp,
      // Si "Teléfono" está vacío, se precarga con el número de línea del
      // celular que tenga asignado (si tiene) — no pisa un dato ya
      // capturado a mano.
      phone: emp.phone || phoneByEmployee[emp._id] || '',
      corporateEmails: emp.corporateEmails || [],
      gmailAccounts:   emp.gmailAccounts   || [],
    });
    setEditing(emp._id);
    setShowModal(true);
  };

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editing) {
      await api.put(`/employees/${editing}`, form);
    } else {
      await api.post('/employees', form);
    }
    setShowModal(false);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar empleado?')) return;
    await api.delete(`/employees/${id}`);
    load();
  };

  const handleToggleActive = async (emp) => {
    const goingInactive = emp.active !== false;
    const msg = goingInactive
      ? `¿Dar de baja a "${emp.name}"? Todos sus activos asignados quedarán disponibles automáticamente (se verán en Disponibilidad, en el apartado "Liberado por salida de personal").`
      : `¿Reactivar a "${emp.name}"?`;
    if (!confirm(msg)) return;
    const { data } = await api.put(`/employees/${emp._id}`, { active: !goingInactive });
    if (goingInactive && data.freedCount > 0) {
      alert(`Se liberaron ${data.freedCount} activo${data.freedCount !== 1 ? 's' : ''} de "${emp.name}".`);
    }
    load();
  };

  // El empleado se activa solo en el portal de Mis Tickets (ver
  // EmployeeLogin.jsx) — no hay recuperación por correo (el sistema no
  // manda correos), así que si olvida su contraseña, Sistemas la limpia
  // aquí para que se vuelva a activar desde cero.
  const handleResetPortalAccess = async (emp) => {
    if (!confirm(`¿Restablecer el acceso al portal de Tickets de "${emp.name}"? La próxima vez que entre, tendrá que crear una contraseña nueva.`)) return;
    await api.put(`/employees/${emp._id}/reset-portal-access`);
    load();
  };

  const offices = [...new Set(employees.map((e) => e.office).filter(Boolean))].sort();
  const inactiveCount = employees.filter((e) => e.active === false).length;

  const matchesFilters = (e) => {
    const matchSearch = matchesSearch(
      search,
      e.name, e.employeeId, e.department, e.area, e.office, e.businessName,
      e.position, e.phone, e.corporateEmails, e.gmailAccounts,
      assetsByEmployee[e._id],
    );
    const matchOffice = !filterOffice || e.office === filterOffice;
    return matchSearch && matchOffice;
  };

  const filtered         = employees.filter((e) => e.active !== false && matchesFilters(e));
  const filteredInactive = employees.filter((e) => e.active === false && matchesFilters(e));

  const renderActions = (emp) => (
    <div className={styles.actions}>
      <button className={styles.btnView} onClick={() => navigate(`/employees/${emp._id}`)}>Ver activos</button>
      <button className={styles.btnEdit} onClick={() => openEdit(emp)}>Editar</button>
      <button className={styles.btnDelete} onClick={() => handleToggleActive(emp)}>
        {emp.active !== false ? 'Dar de baja' : 'Reactivar'}
      </button>
      {emp.passwordSetAt && (
        <button className={styles.btnEdit} onClick={() => handleResetPortalAccess(emp)} title="Ya activó su cuenta de Mis Tickets">
          🔑 Restablecer Tickets
        </button>
      )}
      <button className={styles.btnDelete} onClick={() => handleDelete(emp._id)}>Eliminar</button>
    </div>
  );

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Empleados</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className={styles.btnView} style={{ background: '#111', color: '#fff', padding: '0.55rem 1rem' }} onClick={() => setShowImport(true)}>
            📥 Importar Excel
          </button>
          <button className={styles.btnPrimary} onClick={openNew}>+ Nuevo empleado</button>
        </div>
      </div>

      <NaucalpanSplitPanel employees={employees} onDone={load} />

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'activos' ? styles.tabActive : ''}`}
          onClick={() => setTab('activos')}
        >
          <span className={styles.tabIcon}>✅</span>
          <span>Activos</span>
          <span className={styles.tabCount}>{employees.filter((e) => e.active !== false).length}</span>
        </button>
        <button
          className={`${styles.tab} ${tab === 'baja' ? styles.tabActive : ''}`}
          onClick={() => setTab('baja')}
        >
          <span className={styles.tabIcon}>🔴</span>
          <span>Bajas</span>
          <span className={styles.tabCount}>{inactiveCount}</span>
        </button>
      </div>

      <div className={styles.toolbar}>
        <input
          className={styles.search}
          placeholder="Buscar por nombre, número, departamento, oficina, o activo asignado (marca, modelo, serie)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={styles.select}
          value={filterOffice}
          onChange={(e) => setFilterOffice(e.target.value)}
        >
          <option value="">Todas las sucursales</option>
          {offices.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>No. Empleado</th>
              <th>Nombre</th>
              <th>Razón Social</th>
              <th>Oficina / Sucursal</th>
              <th>Puesto</th>
              <th>Área</th>
              <th>Departamento</th>
              <th>AnyDesk</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(tab === 'baja' ? filteredInactive : filtered).length === 0 && (
              <tr><td colSpan={9} className={styles.empty}>Sin resultados</td></tr>
            )}
            {(tab === 'baja' ? filteredInactive : filtered).map((emp) => (
              <tr key={emp._id} style={tab === 'baja' ? { opacity: 0.7 } : undefined}>
                <td><code>{emp.employeeId}</code></td>
                <td className={styles.nameCell}>{emp.name}</td>
                <td>{emp.businessName || '—'}</td>
                <td>{emp.office || '—'}</td>
                <td>{emp.position || '—'}</td>
                <td>{emp.area || '—'}</td>
                <td>{emp.department || '—'}</td>
                <td>{anydeskByEmployee[emp._id] ? <code>{anydeskByEmployee[emp._id]}</code> : '—'}</td>
                <td>{renderActions(emp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showImport && (
        <ImportModal
          entityType="employees"
          onClose={() => setShowImport(false)}
          onDone={load}
        />
      )}

      {showModal && (
        <div className={styles.overlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{editing ? 'Editar empleado' : 'Nuevo empleado'}</h2>
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>No. Empleado *</label>
                  <input value={form.employeeId} onChange={set('employeeId')} required />
                </div>
                <div className={styles.field}>
                  <label>Nombre completo *</label>
                  <input value={form.name} onChange={set('name')} required />
                </div>
              </div>
              <div className={styles.row}>
                <ComboSelect
                  label="Razón social de contrato"
                  value={form.businessName}
                  onChange={(v) => setForm({ ...form, businessName: v })}
                  options={BUSINESS_NAMES}
                />
                <ComboSelect
                  label="Oficina / Sucursal"
                  value={form.office}
                  onChange={(v) => setForm({ ...form, office: v })}
                  options={OFFICES}
                />
              </div>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>Puesto</label>
                  <input value={form.position} onChange={set('position')} />
                </div>
                <div className={styles.field}>
                  <label>Área</label>
                  <input value={form.area} onChange={set('area')} />
                </div>
              </div>
              <div className={styles.field}>
                <label>Teléfono</label>
                <input value={form.phone} onChange={set('phone')} placeholder="55 1234 5678" />
              </div>
              <ComboSelect
                label="Departamento"
                value={form.department}
                onChange={(v) => setForm({ ...form, department: v })}
                options={DEPARTMENTS}
              />
              <TagInput
                label="Correos corporativos"
                values={form.corporateEmails}
                onChange={(v) => setForm({ ...form, corporateEmails: v })}
                reject={(v) => /@gmail\.com$/i.test(v)}
                rejectMessage='Ese es un correo de Gmail — agrégalo en el campo "Gmail" de abajo, no aquí.'
              />
              <TagInput
                label="Gmail"
                values={form.gmailAccounts}
                onChange={(v) => setForm({ ...form, gmailAccounts: v })}
              />
              {isRHArea(form.area) && (
                <div className={styles.field}>
                  <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={!!form.canManageOnboarding}
                      onChange={(e) => setForm({ ...form, canManageOnboarding: e.target.checked })}
                    />
                    Puede ver y enviar "Alta de un nuevo ingreso" en Mesa de Ayuda (RH)
                  </label>
                </div>
              )}
              {/* "Baja de personal" — 2 permisos separados a propósito
                  (pedido explícito del usuario): el de jefe NO se limita a
                  RH, porque un jefe puede ser de cualquier área. El de RH sí
                  se limita, mismo criterio que canManageOnboarding. */}
              <div className={styles.field}>
                <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={!!form.canRequestOffboarding}
                    onChange={(e) => setForm({ ...form, canRequestOffboarding: e.target.checked })}
                  />
                  Puede reportar "Baja de personal" en Mesa de Ayuda (jefe)
                </label>
              </div>
              {isRHArea(form.area) && (
                <div className={styles.field}>
                  <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={!!form.canManageOffboarding}
                      onChange={(e) => setForm({ ...form, canManageOffboarding: e.target.checked })}
                    />
                    Puede revisar solicitudes de "Baja de personal" en Mesa de Ayuda (RH)
                  </label>
                </div>
              )}
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnCancel} onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className={styles.btnPrimary}>Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
