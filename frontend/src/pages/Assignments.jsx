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
  { key: 'infra',      label: 'Infraestructura',     types: ['router', 'switch', 'camara_ip', 'nvr', 'poe_injector', 'ups', 'insumo_red'] },
  { key: 'otros',      label: 'Otros / Accesorios',  types: ['accesorio', 'herramienta', 'consumible', 'disco_duro', 'adaptador', 'otro'] },
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

function exportToExcel(assignments, catKey, filters) {
  if (assignments.length === 0) {
    alert('No hay registros para exportar con los filtros actuales.');
    return;
  }

  const rows = buildExcelRows(assignments, catKey);
  const headers = Object.keys(rows[0]);
  const dataRows = rows.map((r) => headers.map((h) => r[h]));

  // Cabecera de auditoría
  const meta = [
    ['AUDITORÍA DE ASIGNACIONES'],
    ['Fecha de exportación:', new Date().toLocaleDateString('es-MX', { dateStyle: 'long' })],
    ['Categoría:', filters.catLabel || 'Todo el inventario'],
    ['Tipo de dispositivo:', filters.tipo ? (ASSET_TYPE_LABELS[filters.tipo] || filters.tipo) : 'Todos'],
    ['Empresa:', filters.empresa || 'Todas'],
    ['Oficina:', filters.oficina || 'Todas'],
    ['Total de registros:', assignments.length],
    [],
    headers,
    ...dataRows,
  ];

  const ws = XLSX.utils.aoa_to_sheet(meta);
  ws['!cols'] = headers.map((h, i) => ({
    wch: Math.max(h.length, ...rows.map((r) => String(r[h] || '').length), 12),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Auditoria');

  const slug = [
    filters.catLabel,
    filters.tipo ? (ASSET_TYPE_LABELS[filters.tipo] || filters.tipo) : '',
    filters.empresa,
    filters.oficina,
  ].filter(Boolean).join('_') || 'completo';
  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `auditoria_${slug}_${date}.xlsx`);
}

/* ── Auditoría de correos registrados por empleado ──────────────── */
function exportEmailsToExcel(employees, filters) {
  if (employees.length === 0) {
    alert('No hay empleados para exportar con los filtros actuales.');
    return;
  }

  const rows = employees.map((e) => ({
    'No. Empleado':          e.employeeId || '',
    'Nombre':                e.name || '',
    'Razón Social':          e.businessName || '',
    'Oficina':               e.office || '',
    'Puesto':                e.position || '',
    'Departamento':          e.department || '',
    'Correos Corporativos':  (e.corporateEmails || []).join(' / '),
    'Correos Gmail':         (e.gmailAccounts || []).join(' / '),
    'Total Correos':         (e.corporateEmails?.length || 0) + (e.gmailAccounts?.length || 0),
  }));

  const headers = Object.keys(rows[0]);
  const dataRows = rows.map((r) => headers.map((h) => r[h]));
  const sinCorreo = rows.filter((r) => r['Total Correos'] === 0).length;

  const meta = [
    ['AUDITORÍA DE CORREOS DE EMPLEADOS'],
    ['Fecha de exportación:', new Date().toLocaleDateString('es-MX', { dateStyle: 'long' })],
    ['Empresa:', filters.empresa || 'Todas'],
    ['Oficina:', filters.oficina || 'Todas'],
    ['Total de empleados:', employees.length],
    ['Empleados sin correo registrado:', sinCorreo],
    [],
    headers,
    ...dataRows,
  ];

  const ws = XLSX.utils.aoa_to_sheet(meta);
  ws['!cols'] = headers.map((h) => ({
    wch: Math.max(h.length, ...rows.map((r) => String(r[h] ?? '').length), 12),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Correos');

  const slug = [filters.empresa, filters.oficina].filter(Boolean).join('_') || 'completo';
  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `auditoria_correos_${slug}_${date}.xlsx`);
}

/* ── Componente principal ───────────────────────────────────────── */
export default function Assignments() {
  const [assignments, setAssignments] = useState([]);
  const [employees,   setEmployees]   = useState([]);
  const [filterCat,    setFilterCat]    = useState('todos');
  const [filterType,   setFilterType]   = useState('');
  const [filterEmpresa,setFilterEmpresa]= useState('');
  const [filterOficina,setFilterOficina]= useState('');
  const [search,       setSearch]       = useState('');

  const load = async () => {
    const { data } = await api.get('/assignments');
    setAssignments(data);
  };

  useEffect(() => {
    load();
    api.get('/employees').then(({ data }) => setEmployees(data));
  }, []);

  /* Empleados para la auditoría de correos — respeta los filtros de empresa/oficina */
  const employeesForEmailAudit = useMemo(() => {
    return employees
      .filter((e) => e.name?.toLowerCase() !== 'sistemas')
      .filter((e) => !filterEmpresa || e.businessName === filterEmpresa)
      .filter((e) => !filterOficina || e.office === filterOficina)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [employees, filterEmpresa, filterOficina]);

  /* Base sin Sistemas para construir los dropdowns */
  const nonSistemas = useMemo(() =>
    assignments.filter((a) => a.employee?.name?.toLowerCase() !== 'sistemas'),
  [assignments]);

  const catDef = FILTER_CATS.find((c) => c.key === filterCat);

  /* Tipos disponibles dentro de la categoría seleccionada */
  const availableTypes = useMemo(() => {
    const base = catDef?.types
      ? nonSistemas.filter((a) => catDef.types.includes(a.asset?.type))
      : nonSistemas;
    const s = new Set(base.map((a) => a.asset?.type).filter(Boolean));
    return [...s].sort((a, b) =>
      (ASSET_TYPE_LABELS[a] || a).localeCompare(ASSET_TYPE_LABELS[b] || b)
    );
  }, [nonSistemas, catDef]);

  /* Empresas y oficinas (excluyen a Sistemas) */
  const empresas = useMemo(() => {
    const s = new Set(nonSistemas.map((a) => a.employee?.businessName).filter(Boolean));
    return [...s].sort();
  }, [nonSistemas]);

  const oficinas = useMemo(() => {
    const base = filterEmpresa
      ? nonSistemas.filter((a) => a.employee?.businessName === filterEmpresa)
      : nonSistemas;
    const s = new Set(base.map((a) => a.employee?.office).filter(Boolean));
    return [...s].sort();
  }, [nonSistemas, filterEmpresa]);

  /* Filtrado completo */
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return nonSistemas.filter((a) => {
      const matchSearch = !q || [
        a.employee?.name, a.employee?.employeeId, a.employee?.businessName,
        a.employee?.office, a.employee?.position,
        a.asset?.brand, a.asset?.model, a.asset?.serialNumber,
        a.asset?.inventoryTag, a.asset?.specs?.lineNumber,
        a.asset?.specs?.contractNumber, a.asset?.specs?.anydesk,
      ].some((v) => v?.toLowerCase().includes(q));
      const matchCat  = !catDef?.types || catDef.types.includes(a.asset?.type);
      const matchType = !filterType   || a.asset?.type === filterType;
      const matchEmp  = !filterEmpresa || a.employee?.businessName === filterEmpresa;
      const matchOfi  = !filterOficina || a.employee?.office === filterOficina;
      return matchSearch && matchCat && matchType && matchEmp && matchOfi;
    });
  }, [nonSistemas, search, catDef, filterType, filterEmpresa, filterOficina]);

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
    setFilterType('');
    setFilterEmpresa('');
    setFilterOficina('');
    setSearch('');
  };

  const hasFilters = filterCat !== 'todos' || filterType || filterEmpresa || filterOficina || search;

  return (
    <div>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Asignaciones activas</h1>
          <p className={styles.subtitle}>
            {nonSistemas.length} asignaciones totales
          </p>
        </div>
        {hasFilters && (
          <button className={styles.btnCancel} onClick={clearFilters}>
            ✕ Limpiar filtros
          </button>
        )}
      </div>

      {/* Filtros — 4 selects en grid auto-ajustable */}
      <div className={styles.filtersGrid}>
        <select
          className={styles.select}
          value={filterCat}
          onChange={(e) => { setFilterCat(e.target.value); setFilterType(''); setSearch(''); }}
        >
          {FILTER_CATS.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>

        <select
          className={styles.select}
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          disabled={availableTypes.length === 0}
        >
          <option value="">Todos los tipos</option>
          {availableTypes.map((t) => (
            <option key={t} value={t}>{ASSET_TYPE_LABELS[t] || t}</option>
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
      </div>

      {/* Búsqueda — renglón completo */}
      <div className={styles.searchRow}>
        <input
          className={styles.search}
          style={{ width: '100%', boxSizing: 'border-box' }}
          placeholder="Buscar empleado, equipo, serie, contrato, AnyDesk..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Barra de resultados + export */}
      <div className={styles.exportBar}>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111', whiteSpace: 'nowrap' }}>
          {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
        </span>
        {typeSummary.map(([tipo, count]) => (
          <span key={tipo} style={{ fontSize: '0.78rem', background: '#f0f0f0', borderRadius: 999, padding: '0.2rem 0.65rem', color: '#555', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {tipo}: <strong>{count}</strong>
          </span>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className={styles.btnPrimary}
            style={{ background: '#111' }}
            onClick={() => exportEmailsToExcel(employeesForEmailAudit, {
              empresa: filterEmpresa,
              oficina: filterOficina,
            })}
          >
            📧 Exportar correos ({employeesForEmailAudit.length})
          </button>
          <button
            className={styles.btnPrimary}
            onClick={() => exportToExcel(filtered, filterCat, {
              catLabel: catDef?.label,
              tipo: filterType,
              empresa: filterEmpresa,
              oficina: filterOficina,
            })}
          >
            📤 Exportar Excel ({filtered.length})
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {cols.map((c) => <th key={c.label}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={cols.length} className={styles.empty}>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
