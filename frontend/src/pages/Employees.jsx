import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import ImportModal from '../components/ImportModal';
import styles from './Page.module.css';

const OFFICES = [
  'SUC.1 Corporativo Torre Polanco',
  'SUC.3 Tienda Cuernavaca',
  'SUC.4 Tienda Aragón',
  'SUC.5 CEDI Iztapalapa',
  'SUC.6 CEDI Naucalpan',
  'SUC.7 CEDI TEPOTZ JSB',
  'SUC.8 CEDI TEPOTZ B&B',
  'SUC.10 Fontastic',
  'SUC.11 Tienda Portal Centro',
  'SUC.12 Tienda Perinorte',
  'GOLDEN',
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
  position: '', area: '', department: '',
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

function TagInput({ label, values, onChange }) {
  const [input, setInput] = useState('');

  const add = () => {
    const val = input.trim();
    if (val && !values.includes(val)) onChange([...values, val]);
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
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            placeholder="Escribe y presiona Enter"
          />
          <button type="button" className={styles.tagAdd} onClick={add}>+</button>
        </div>
      </div>
    </div>
  );
}

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [filterOffice, setFilterOffice] = useState('');
  const navigate = useNavigate();

  const load = async () => {
    const { data } = await api.get('/employees');
    setEmployees(data);
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

  const offices = [...new Set(employees.map((e) => e.office).filter(Boolean))].sort();

  const filtered = employees.filter((e) => {
    const q = search.toLowerCase();
    const matchSearch =
      e.name.toLowerCase().includes(q) ||
      e.employeeId.toLowerCase().includes(q) ||
      e.department?.toLowerCase().includes(q) ||
      e.area?.toLowerCase().includes(q) ||
      e.office?.toLowerCase().includes(q) ||
      e.businessName?.toLowerCase().includes(q);
    const matchOffice = !filterOffice || e.office === filterOffice;
    return matchSearch && matchOffice;
  });

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

      <div className={styles.toolbar}>
        <input
          className={styles.search}
          placeholder="Buscar por nombre, número, departamento, área, oficina..."
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
            {filtered.length === 0 && (
              <tr><td colSpan={8} className={styles.empty}>Sin resultados</td></tr>
            )}
            {filtered.map((emp) => (
              <tr key={emp._id}>
                <td><code>{emp.employeeId}</code></td>
                <td className={styles.nameCell}>{emp.name}</td>
                <td>{emp.businessName || '—'}</td>
                <td>{emp.office || '—'}</td>
                <td>{emp.position || '—'}</td>
                <td>{emp.area || '—'}</td>
                <td>{emp.department || '—'}</td>
                <td>
                  <div className={styles.actions}>
                    <button className={styles.btnView} onClick={() => navigate(`/employees/${emp._id}`)}>Ver activos</button>
                    <button className={styles.btnEdit} onClick={() => openEdit(emp)}>Editar</button>
                    <button className={styles.btnDelete} onClick={() => handleDelete(emp._id)}>Eliminar</button>
                  </div>
                </td>
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
                <div className={styles.field}>
                  <label>Razón social de contrato</label>
                  <input value={form.businessName} onChange={set('businessName')} />
                </div>
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
