import { useEffect, useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import api from '../services/api';
import { ASSET_TYPE_LABELS } from '../config/assetFields';
import styles from './Page.module.css';

/* ── Categorías de filtro ───────────────────────────────────────── */
const FILTER_CATS = [
  { key: 'todos',      label: 'Todo el inventario', types: null },
  { key: 'computo',    label: 'Equipo de cómputo',  types: ['laptop', 'escritorio', 'all_in_one'] },
  { key: 'celulares',  label: 'Celulares',           types: ['celular'] },
  { key: 'tablets',    label: 'Tablets',             types: ['tablet'] },
  { key: 'perifericos',label: 'Periféricos',         types: ['monitor', 'mouse', 'teclado', 'cargador_laptop', 'kit_perifericos', 'audifonos', 'webcam', 'hub_usb'] },
  { key: 'impresion',  label: 'Impresión',           types: ['impresora', 'escaner'] },
  { key: 'cables',     label: 'Cables',              types: ['cable'] },
  { key: 'otros',      label: 'Otros / Accesorios',  types: ['accesorio', 'herramienta', 'consumible', 'otro'] },
];

/* ── Columnas de tabla por categoría ───────────────────────────── */
const fmt = (v) => v || '—';
const fmtDate = (v) => v ? new Date(v).toLocaleDateString('es-MX') : '—';

const EMP_COLS = [
  { label: 'No. Empleado',  render: (a) => <code style={{ fontFamily: 'monospace', fontSize: '0.8rem', background: '#f5f5f5', padding: '0.1rem 0.4rem', borderRadius: 4 }}>{fmt(a.employee?.employeeId)}</code> },
  { label: 'Nombre',        render: (a) => <strong>{fmt(a.employee?.name)}</strong> },
  { label: 'Empresa',       render: (a) => fmt(a.employee?.businessName) },
  { label: 'Oficina',       render: (a) => fmt(a.employee?.office) },
  { label: 'Puesto',        render: (a) => <span style={{ fontSize: '0.8rem', color: '#666' }}>{fmt(a.employee?.position)}</span> },
];

const TYPE_COL   = { label: 'Tipo',         render: (a) => <span className={styles.typeBadge}>{ASSET_TYPE_LABELS[a.asset?.type] || a.asset?.type || '—'}</span> };
const BRAND_COL  = { label: 'Marca / Modelo',render: (a) => <span style={{ fontWeight: 600 }}>{[a.asset?.brand, a.asset?.model].filter(Boolean).join(' ') || '—'}</span> };
const SERIAL_COL = { label: 'No. Serie',    render: (a) => <code style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{fmt(a.asset?.serialNumber)}</code> };
const TAG_COL    = { label: 'Etiqueta',     render: (a) => <code style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{fmt(a.asset?.inventoryTag)}</code> };
const DATE_COL   = { label: 'Fecha asig.',  render: (a) => fmtDate(a.assignedDate) };
const NOTES_COL  = { label: 'Notas',        render: (a) => <span style={{ fontSize: '0.8rem', color: '#888' }}>{fmt(a.notes)}</span> };

const TABLE_COLS = {
  todos: [
    ...EMP_COLS,
    TYPE_COL, BRAND_COL, SERIAL_COL,
    DATE_COL, NOTES_COL,
  ],
  computo: [
    ...EMP_COLS,
    TYPE_COL, BRAND_COL, SERIAL_COL, TAG_COL,
    { label: 'Propiedad',     render: (a) => fmt(a.asset?.specs?.ownership) },
    { label: 'No. Contrato',  render: (a) => <code style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{fmt(a.asset?.specs?.contractNumber)}</code> },
    { label: 'AnyDesk',       render: (a) => <code style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{fmt(a.asset?.specs?.anydesk)}</code> },
    { label: 'Procesador',    render: (a) => <span style={{ fontSize: '0.8rem' }}>{fmt(a.asset?.specs?.processor)}</span> },
    { label: 'RAM',           render: (a) => fmt(a.asset?.specs?.ram) },
    { label: 'Almacenamiento',render: (a) => fmt(a.asset?.specs?.storage) },
    DATE_COL, NOTES_COL,
  ],
  celulares: [
    ...EMP_COLS,
    TYPE_COL, BRAND_COL, SERIAL_COL,
    { label: 'No. Línea',    render: (a) => fmt(a.asset?.specs?.lineNumber) },
    { label: 'IMEI 1',       render: (a) => <code style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{fmt(a.asset?.specs?.imei)}</code> },
    { label: 'Operadora',    render: (a) => fmt(a.asset?.specs?.carrier) },
    { label: 'Costo Plan',   render: (a) => fmt(a.asset?.specs?.planCost) },
    { label: 'No. Contrato', render: (a) => <code style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{fmt(a.asset?.specs?.contractNumber)}</code> },
    { label: 'Razón Social', render: (a) => fmt(a.asset?.specs?.businessName) },
    { label: 'Gmail',        render: (a) => <span style={{ fontSize: '0.8rem' }}>{fmt(a.asset?.specs?.gmailAccount)}</span> },
    DATE_COL, NOTES_COL,
  ],
  tablets: [
    ...EMP_COLS,
    BRAND_COL, SERIAL_COL,
    { label: 'IMEI',         render: (a) => <code style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{fmt(a.asset?.specs?.imei)}</code> },
    { label: 'No. Contrato', render: (a) => <code style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{fmt(a.asset?.specs?.contractNumber)}</code> },
    { label: 'Razón Social', render: (a) => fmt(a.asset?.specs?.businessName) },
    { label: 'Gmail',        render: (a) => <span style={{ fontSize: '0.8rem' }}>{fmt(a.asset?.specs?.gmailAccount)}</span> },
    DATE_COL, NOTES_COL,
  ],
  perifericos: [
    ...EMP_COLS,
    TYPE_COL, BRAND_COL, SERIAL_COL, TAG_COL,
    { label: 'Detalle', render: (a) => <span style={{ fontSize: '0.8rem', color: '#666' }}>{a.asset?.specs?.connectionType || a.asset?.specs?.screenSize || '—'}</span> },
    DATE_COL, NOTES_COL,
  ],
  impresion: [
    ...EMP_COLS,
    TYPE_COL, BRAND_COL, SERIAL_COL, TAG_COL,
    { label: 'Tipo',         render: (a) => fmt(a.asset?.specs?.printerType || a.asset?.specs?.scannerType) },
    { label: 'Conectividad', render: (a) => fmt(a.asset?.specs?.connectivity) },
    { label: 'IP Red',       render: (a) => <code style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{fmt(a.asset?.specs?.ipAddress)}</code> },
    DATE_COL, NOTES_COL,
  ],
  cables: [
    ...EMP_COLS,
    { label: 'Tipo de cable', render: (a) => fmt(a.asset?.specs?.cableType) },
    BRAND_COL, TAG_COL,
    { label: 'Longitud',      render: (a) => fmt(a.asset?.specs?.length) },
    DATE_COL, NOTES_COL,
  ],
  otros: [
    ...EMP_COLS,
    TYPE_COL, BRAND_COL, SERIAL_COL, TAG_COL,
    { label: 'Descripción', render: (a) => <span style={{ fontSize: '0.8rem', color: '#666' }}>{a.asset?.specs?.toolType || a.asset?.specs?.accessoryType || a.asset?.specs?.consumibleType || '—'}</span> },
    DATE_COL, NOTES_COL,
  ],
};

/* ── Exportación Excel ──────────────────────────────────────────── */
function buildExcelRows(assignments, catKey) {
  const base = (a) => ({
    'No. Empleado':  a.employee?.employeeId  || '',
    'Nombre':        a.employee?.name        || '',
    'Empresa':       a.employee?.businessName|| '',
    'Oficina':       a.employee?.office      || '',
    'Puesto':        a.employee?.position    || '',
    'Área':          a.employee?.area        || '',
    'Departamento':  a.employee?.department  || '',
    'Tipo':          ASSET_TYPE_LABELS[a.asset?.type] || a.asset?.type || '',
    'Marca':         a.asset?.brand          || '',
    'Modelo':        a.asset?.model          || '',
    'No. Serie':     a.asset?.serialNumber   || '',
    'Etiqueta':      a.asset?.inventoryTag   || '',
  });

  return assignments.map((a) => {
    const row = base(a);
    const sp = a.asset?.specs || {};

    if (catKey === 'computo') {
      Object.assign(row, {
        'Propiedad':       sp.ownership       || '',
        'No. Contrato':    sp.contractNumber  || '',
        'AnyDesk ID':      sp.anydesk         || '',
        'Procesador':      sp.processor       || '',
        'RAM':             sp.ram             || '',
        'Almacenamiento':  sp.storage         || '',
        'S.O.':            sp.os              || '',
        'Color':           sp.color           || '',
        'Cargador':        sp.hasCharger      ? 'Sí' : 'No',
      });
    } else if (catKey === 'celulares') {
      Object.assign(row, {
        'No. Línea':    sp.lineNumber      || '',
        'IMEI 1':       sp.imei            || '',
        'IMEI 2':       sp.imei2           || '',
        'Operadora':    sp.carrier         || '',
        'Costo Plan':   sp.planCost        || '',
        'No. Contrato': sp.contractNumber  || '',
        'Razón Social': sp.businessName    || '',
        'Gmail':        sp.gmailAccount    || '',
        'Almacenamiento': sp.storage       || '',
        'S.O.':         sp.os              || '',
        'SIM Bloqueada': sp.simLock        ? 'Sí' : 'No',
      });
    } else if (catKey === 'tablets') {
      Object.assign(row, {
        'IMEI':          sp.imei            || '',
        'No. Contrato':  sp.contractNumber  || '',
        'Razón Social':  sp.businessName    || '',
        'Gmail':         sp.gmailAccount    || '',
        'Almacenamiento':sp.storage         || '',
        'Pantalla':      sp.screenSize      || '',
        'S.O.':          sp.os              || '',
      });
    } else if (catKey === 'impresion') {
      Object.assign(row, {
        'Tipo impresora': sp.printerType || sp.scannerType || '',
        'Color':          sp.colorSupport || '',
        'Conectividad':   sp.connectivity  || '',
        'Velocidad (ppm)':sp.ppm           || '',
        'IP de red':      sp.ipAddress     || '',
      });
    } else if (catKey === 'cables') {
      Object.assign(row, {
        'Tipo de cable': sp.cableType || '',
        'Longitud':      sp.length    || '',
        'Color':         sp.color     || '',
      });
    } else if (catKey === 'otros') {
      Object.assign(row, {
        'Descripción': sp.toolType || sp.accessoryType || sp.consumibleType || sp.description || '',
      });
    }

    row['Fecha Asignación'] = fmtDate(a.assignedDate);
    row['Notas'] = a.notes || '';
    return row;
  });
}

function exportToExcel(assignments, catKey, catLabel, filters) {
  const rows = buildExcelRows(assignments, catKey);
  if (rows.length === 0) { alert('No hay datos para exportar con los filtros actuales.'); return; }

  const ws = XLSX.utils.json_to_sheet(rows);

  // Auto column width
  const colWidths = Object.keys(rows[0] || {}).map((key) => ({
    wch: Math.max(key.length, ...rows.map((r) => String(r[key] || '').length), 10),
  }));
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Asignaciones');

  const filterStr = [
    filters.empresa && `Empresa-${filters.empresa}`,
    filters.oficina && `Ofic-${filters.oficina}`,
  ].filter(Boolean).join('_') || 'todos';

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `auditoria_${catKey}_${filterStr}_${date}.xlsx`);
}

/* ── Componente principal ───────────────────────────────────────── */
export default function Assignments() {
  const [assignments, setAssignments] = useState([]);
  const [filterCat,    setFilterCat]    = useState('todos');
  const [filterEmpresa,setFilterEmpresa]= useState('');
  const [filterOficina,setFilterOficina]= useState('');
  const [search,       setSearch]       = useState('');

  const load = async () => {
    const { data } = await api.get('/assignments');
    setAssignments(data);
  };

  useEffect(() => { load(); }, []);

  const handleReturn = async (id) => {
    if (!confirm('¿Regresar este activo al inventario?')) return;
    await api.delete(`/assignments/${id}`);
    load();
  };

  /* Opciones únicas de empresa y oficina */
  const empresas = useMemo(() => {
    const s = new Set(assignments.map((a) => a.employee?.businessName).filter(Boolean));
    return [...s].sort();
  }, [assignments]);

  const oficinas = useMemo(() => {
    const base = filterEmpresa
      ? assignments.filter((a) => a.employee?.businessName === filterEmpresa)
      : assignments;
    const s = new Set(base.map((a) => a.employee?.office).filter(Boolean));
    return [...s].sort();
  }, [assignments, filterEmpresa]);

  /* Filtrado */
  const catDef = FILTER_CATS.find((c) => c.key === filterCat);

  const filtered = useMemo(() => {
    return assignments.filter((a) => {
      const q = search.toLowerCase();
      const matchSearch = !q || [
        a.employee?.name, a.employee?.employeeId, a.employee?.businessName,
        a.employee?.office, a.employee?.position,
        a.asset?.brand, a.asset?.model, a.asset?.serialNumber,
        a.asset?.inventoryTag, a.asset?.specs?.lineNumber,
        a.asset?.specs?.contractNumber, a.asset?.specs?.anydesk,
      ].some((v) => v?.toLowerCase().includes(q));

      const matchCat = !catDef?.types || catDef.types.includes(a.asset?.type);
      const matchEmp = !filterEmpresa || a.employee?.businessName === filterEmpresa;
      const matchOfi = !filterOficina || a.employee?.office === filterOficina;
      return matchSearch && matchCat && matchEmp && matchOfi;
    });
  }, [assignments, search, catDef, filterEmpresa, filterOficina]);

  /* Resumen por tipo */
  const typeSummary = useMemo(() => {
    const counts = {};
    filtered.forEach((a) => {
      const t = ASSET_TYPE_LABELS[a.asset?.type] || a.asset?.type || 'Sin tipo';
      counts[t] = (counts[t] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const cols = TABLE_COLS[filterCat] || TABLE_COLS.todos;

  const clearFilters = () => {
    setFilterCat('todos');
    setFilterEmpresa('');
    setFilterOficina('');
    setSearch('');
  };

  const hasFilters = filterCat !== 'todos' || filterEmpresa || filterOficina || search;

  return (
    <div>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Asignaciones activas</h1>
          <p className={styles.subtitle}>Vista de auditoría — {assignments.length} asignaciones totales</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {hasFilters && (
            <button className={styles.btnCancel} onClick={clearFilters} style={{ fontSize: '0.82rem' }}>
              ✕ Limpiar filtros
            </button>
          )}
          <button
            className={styles.btnSecondary}
            onClick={() => exportToExcel(filtered, filterCat, catDef?.label, { empresa: filterEmpresa, oficina: filterOficina })}
          >
            📤 Exportar Excel
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className={styles.toolbar}>
        <select
          className={styles.select}
          value={filterCat}
          onChange={(e) => { setFilterCat(e.target.value); setSearch(''); }}
        >
          {FILTER_CATS.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>

        <select
          className={styles.select}
          value={filterEmpresa}
          onChange={(e) => { setFilterEmpresa(e.target.value); setFilterOficina(''); }}
        >
          <option value="">Todas las empresas</option>
          {empresas.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>

        <select
          className={styles.select}
          value={filterOficina}
          onChange={(e) => setFilterOficina(e.target.value)}
        >
          <option value="">Todas las oficinas</option>
          {oficinas.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>

        <input
          className={styles.search}
          placeholder="Buscar empleado, equipo, serie, contrato, AnyDesk..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Resumen */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111' }}>
          {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
        </span>
        {typeSummary.length > 0 && (
          <>
            <span style={{ color: '#ccc' }}>·</span>
            {typeSummary.map(([tipo, count]) => (
              <span key={tipo} style={{ fontSize: '0.78rem', background: '#f0f0f0', borderRadius: 999, padding: '0.2rem 0.65rem', color: '#555', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {tipo}: <strong>{count}</strong>
              </span>
            ))}
          </>
        )}
      </div>

      {/* Tabla */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {cols.map((c) => <th key={c.label}>{c.label}</th>)}
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={cols.length + 1} className={styles.empty}>
                  {hasFilters
                    ? 'Ninguna asignación coincide con los filtros actuales.'
                    : 'Sin asignaciones activas.'}
                </td>
              </tr>
            )}
            {filtered.map((a) => (
              <tr key={a._id}>
                {cols.map((c) => (
                  <td key={c.label}>{c.render(a)}</td>
                ))}
                <td>
                  <button className={styles.btnDelete} onClick={() => handleReturn(a._id)}>
                    Regresar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
