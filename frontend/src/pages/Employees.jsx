import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import ImportModal from '../components/ImportModal';
import { matchesSearch } from '../utils/search';
import styles from './Page.module.css';

// Corrección puntual (16 jul): un grupo de empleados debe quedar con
// "KOSHER" como razón social (pago en efectivo, según el director de
// Finanzas). El texto para acotar candidatos (ej. "dirección", "familia") no
// vive en la razón social actual, sino en Sucursal/Oficina o en Área — se
// busca en esos dos campos, y el usuario marca a mano quiénes de verdad
// aplican. A diferencia de la división de sucursales, aquí no hay un "resto"
// que mover a otro valor: quien no se marque se queda como está.
function BusinessNameToolPanel({ employees, onDone }) {
  const [query, setQuery] = useState('direcci');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const q = query.trim().toLowerCase();
  const matches = q
    ? employees.filter((e) => e.active !== false
        && (e.businessName || '').toUpperCase() !== 'KOSHER'
        && ((e.office || '').toLowerCase().includes(q) || (e.area || '').toLowerCase().includes(q)))
    : [];

  const toggle = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleApply = async () => {
    if (selectedIds.size === 0) { alert('Marca al menos un empleado.'); return; }
    if (!confirm(`Vas a cambiar la razón social de ${selectedIds.size} empleado(s) a "KOSHER". ¿Confirmas?`)) return;
    setSaving(true);
    setResult(null);
    try {
      const { data } = await api.post('/employees/set-business-name', { employeeIds: [...selectedIds], businessName: 'KOSHER' });
      setResult(data);
      setSelectedIds(new Set());
      onDone();
    } catch (err) {
      alert(err.response?.data?.message || 'No se pudo aplicar el cambio');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.tableWrap} style={{ padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
      <h2 className={styles.title} style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Corrección de razón social — KOSHER (16 jul)</h2>
      <p className={styles.subtitle} style={{ marginBottom: '0.75rem' }}>
        Filtra por texto en Sucursal/Oficina o Área, y marca a quién debe pasar a "KOSHER" en razón social (pago en efectivo). El resto no se toca.
        Quien ya tenga razón social "KOSHER" no aparece en la lista.
      </p>
      <input
        className={styles.search}
        style={{ maxWidth: '320px', marginBottom: '0.75rem' }}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder='Buscar en Sucursal/Área (ej. "dirección")'
      />
      {q && matches.length === 0 && (
        <p style={{ fontSize: '0.82rem', color: '#999' }}>Sin coincidencias para "{query}".</p>
      )}
      {matches.length > 0 && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {matches.map((e) => (
              <label key={e._id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', border: '1px solid #eee', borderRadius: '8px', padding: '0.4rem 0.7rem' }}>
                <input type="checkbox" checked={selectedIds.has(e._id)} onChange={() => toggle(e._id)} />
                {e.name} — <span style={{ color: '#999' }}>{[e.office, e.area].filter(Boolean).join(' / ') || 'sin sucursal/área'} · razón social actual: {e.businessName || '—'}</span>
              </label>
            ))}
          </div>
          <button className={styles.btnPrimary} onClick={handleApply} disabled={saving || selectedIds.size === 0}>
            {saving ? 'Aplicando...' : `Reasignar ${selectedIds.size || ''} a KOSHER`}
          </button>
        </>
      )}
      {result && (
        <p style={{ fontSize: '0.82rem', color: '#555', marginTop: '0.75rem' }}>
          {result.updated} empleado(s) actualizado(s) a "KOSHER".
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
];

// Nomenclatura correcta confirmada por el usuario el 16 jul (la lista vieja
// de 11 nombres estaba desactualizada). "GOLDEN" y "SUC.6 CEDI Naucalpan" se
// dejan temporalmente hasta que se confirme/corra la división de cada una en
// dos sucursales (ver backend/src/routes/branches.js, POST /split-golden).
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
  'GOLDEN',
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
  corporateEmails: [], gmailAccounts: [],
};

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
    assignmentsData.forEach((asgn) => {
      const empId = asgn.employee?._id || asgn.employee;
      if (!empId || !asgn.asset) return;
      const text = [asgn.asset.brand, asgn.asset.model, asgn.asset.serialNumber, asgn.asset.inventoryTag]
        .filter(Boolean).join(' ').toLowerCase();
      byEmployee[empId] = byEmployee[empId] ? `${byEmployee[empId]} ${text}` : text;
    });
    setAssetsByEmployee(byEmployee);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(EMPTY); setEditing(null); setShowModal(true); };
  const openEdit = (emp) => {
    setForm({
      ...EMPTY,
      ...emp,
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

      <BusinessNameToolPanel employees={employees} onDone={load} />

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
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(tab === 'baja' ? filteredInactive : filtered).length === 0 && (
              <tr><td colSpan={8} className={styles.empty}>Sin resultados</td></tr>
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
