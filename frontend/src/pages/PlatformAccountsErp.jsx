import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import api from '../services/api';
import styles from './PlatformAccountsErp.module.css';

const PLATFORM_OPTIONS = [
  'SAP', 'Oracle NetSuite', 'Microsoft Dynamics', 'Odoo', 'Aspel', 'Contpaqi', 'Otra',
];

const EMPTY = { employeeId: '', platform: PLATFORM_OPTIONS[0], platformOther: '', username: '', notes: '', origin: 'new', password: '' };

const DIACRITICS_RE = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');
const normalizeName = (s) => (s || '')
  .normalize('NFD').replace(DIACRITICS_RE, '')
  .toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();

// Empareja el nombre tal cual viene del Excel contra los empleados ya cargados:
// primero exacto, luego ignorando el orden de las palabras (por si viene "Apellido Nombre").
function matchEmployee(excelName, employees) {
  const norm = normalizeName(excelName);
  if (!norm) return null;
  let match = employees.find((e) => normalizeName(e.name) === norm);
  if (match) return match;
  const sortedNorm = norm.split(' ').sort().join(' ');
  match = employees.find((e) => normalizeName(e.name).split(' ').sort().join(' ') === sortedNorm);
  return match || null;
}

// Los encabezados del Excel pueden variar ("Nombre", "Empleado", "Correo", "Email"...);
// se busca por palabra clave y si no hay match se cae a las dos primeras columnas.
function extractRow(row) {
  const keys = Object.keys(row);
  const nameKey = keys.find((k) => /nombre|empleado/i.test(k));
  const emailKey = keys.find((k) => /correo|email|usuario/i.test(k));
  const values = Object.values(row);
  return {
    name: String((nameKey ? row[nameKey] : values[0]) ?? '').trim(),
    email: String((emailKey ? row[emailKey] : values[1]) ?? '').trim(),
  };
}

export default function PlatformAccountsErp() {
  const [accounts, setAccounts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(new Set());

  const [filterPlatform, setFilterPlatform] = useState('');
  const [filterEmpresa, setFilterEmpresa] = useState('');
  const [filterOficina, setFilterOficina] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [newPasswordVisible, setNewPasswordVisible] = useState(false);
  const [gmailLookup, setGmailLookup] = useState([]); // cuentas Gmail del empleado elegido, para "Ya existe con Gmail"
  const [gmailLookupLoading, setGmailLookupLoading] = useState(false);
  const [selectedGmailAccountId, setSelectedGmailAccountId] = useState('');

  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ status: 'activa', notes: '', manualPassword: '' });
  const [showManualPasswordField, setShowManualPasswordField] = useState(false);
  const [manualPasswordVisible, setManualPasswordVisible] = useState(false);

  const [justCreated, setJustCreated] = useState(null); // { username, platform, password }
  const [confirmRegen, setConfirmRegen] = useState(null);
  const [regenLoading, setRegenLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [respondingAccount, setRespondingAccount] = useState(null); // cuenta para la que se están completando datos de la Responsiva
  const [respForm, setRespForm] = useState({ store: '', directManager: '', accessRole: '', accessValidity: '' });
  const [respSaving, setRespSaving] = useState(false);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importPlatform, setImportPlatform] = useState(PLATFORM_OPTIONS[0]);
  const [importPlatformOther, setImportPlatformOther] = useState('');
  const [importRows, setImportRows] = useState([]); // { name, email, employeeId, isDuplicate, include }
  const [importFileError, setImportFileError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null); // { created: [], skipped: [] }

  const load = async () => {
    setLoading(true);
    const [accRes, empRes] = await Promise.all([
      api.get('/platform-accounts-erp'),
      api.get('/employees'),
    ]);
    setAccounts(accRes.data);
    setEmployees(empRes.data.filter((e) => e.active));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const assignedAccounts = useMemo(() => accounts.filter((a) => a.employee), [accounts]);
  const availableAccounts = useMemo(() => accounts.filter((a) => !a.employee), [accounts]);

  /* ── Opciones de filtro derivadas de los datos cargados ─────────── */
  const platforms = useMemo(() => {
    const s = new Set(assignedAccounts.map((a) => a.platform).filter(Boolean));
    return [...s].sort();
  }, [assignedAccounts]);

  // Opciones para los selects de "Plataforma" al crear/importar: la lista base
  // más cualquier plataforma que ya se haya escrito una vez con "Otra" — así
  // no hay que volver a teclearla, queda disponible para elegir de ahí en adelante.
  const allPlatformOptions = useMemo(() => {
    const base = PLATFORM_OPTIONS.filter((p) => p !== 'Otra');
    const used = accounts.map((a) => a.platform).filter(Boolean);
    const merged = new Set([...base, ...used]);
    return [...merged].sort((a, b) => a.localeCompare(b, 'es'));
  }, [accounts]);

  const empresas = useMemo(() => {
    const s = new Set(assignedAccounts.map((a) => a.employee?.businessName).filter(Boolean));
    return [...s].sort();
  }, [assignedAccounts]);

  const oficinas = useMemo(() => {
    const base = filterEmpresa
      ? assignedAccounts.filter((a) => a.employee?.businessName === filterEmpresa)
      : assignedAccounts;
    const s = new Set(base.map((a) => a.employee?.office).filter(Boolean));
    return [...s].sort();
  }, [assignedAccounts, filterEmpresa]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return assignedAccounts.filter((a) => {
      const matchSearch = !q || [
        a.username, a.platform, a.employee?.name, a.employee?.employeeId,
        a.employee?.businessName, a.employee?.office,
      ].some((v) => v?.toLowerCase().includes(q));
      const matchPlatform = !filterPlatform || a.platform === filterPlatform;
      const matchEmpresa  = !filterEmpresa  || a.employee?.businessName === filterEmpresa;
      const matchOficina  = !filterOficina  || a.employee?.office === filterOficina;
      const matchStatus   = !filterStatus   || a.status === filterStatus;
      return matchSearch && matchPlatform && matchEmpresa && matchOficina && matchStatus;
    });
  }, [assignedAccounts, search, filterPlatform, filterEmpresa, filterOficina, filterStatus]);

  const hasFilters = filterPlatform || filterEmpresa || filterOficina || filterStatus || search;

  const clearFilters = () => {
    setFilterPlatform(''); setFilterEmpresa(''); setFilterOficina(''); setFilterStatus(''); setSearch('');
  };

  const toggleVisible = (id) => {
    setVisible((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      alert('No se pudo copiar automáticamente. Cópialo manualmente.');
    }
  };

  // Los datos de la solicitud (tienda, jefe directo, rol, vigencia) nunca se
  // guardan en la cuenta — cada responsiva es para una persona/tienda distinta,
  // así que solo viajan como parámetros de esta descarga puntual.
  const downloadResponsiva = async (account, extra = {}) => {
    setGeneratingPdf(account._id);
    try {
      const resp = await api.get(`/platform-accounts-erp/${account._id}/responsiva`, {
        params: extra,
        responseType: 'blob',
      });
      const blob = new Blob([resp.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = (account.employee?.name || 'empleado').replace(/\s+/g, '_');
      a.download = `Responsiva_Cuentas_Plataformas_ERP_${account.employee?.employeeId || ''}_${safeName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.message || 'No se pudo generar la solicitud');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const openResponsivaModal = (account) => {
    setRespondingAccount(account);
    setRespForm({ store: '', directManager: '', accessRole: '', accessValidity: '' });
  };

  const handleResponsivaSubmit = async (e) => {
    e.preventDefault();
    setRespSaving(true);
    try {
      await downloadResponsiva(respondingAccount, respForm);
      setRespondingAccount(null);
    } finally {
      setRespSaving(false);
    }
  };

  const openNew = () => {
    setForm(EMPTY);
    setError('');
    setJustCreated(null);
    setNewPasswordVisible(false);
    setGmailLookup([]);
    setSelectedGmailAccountId('');
    setShowModal(true);
  };

  // "Ya existe con Gmail": muchas cuentas ERP ya existentes usan la misma
  // contraseña que la cuenta Gmail del empleado — se busca ahí en vez de
  // pedirla a mano, sin necesitar el permiso de Cuentas Gmail.
  useEffect(() => {
    if (form.origin !== 'existingGmail' || !form.employeeId) {
      setGmailLookup([]);
      setSelectedGmailAccountId('');
      return;
    }
    let cancelled = false;
    setGmailLookupLoading(true);
    api.get('/platform-accounts-erp/gmail-lookup', { params: { employeeId: form.employeeId } })
      .then(({ data }) => {
        if (cancelled) return;
        setGmailLookup(data);
        setSelectedGmailAccountId(data[0]?._id || '');
        setForm((f) => ({ ...f, password: data[0]?.password || '' }));
      })
      .catch(() => { if (!cancelled) setGmailLookup([]); })
      .finally(() => { if (!cancelled) setGmailLookupLoading(false); });
    return () => { cancelled = true; };
  }, [form.origin, form.employeeId]);

  const selectGmailAccount = (id) => {
    setSelectedGmailAccountId(id);
    const found = gmailLookup.find((g) => g._id === id);
    setForm((f) => ({ ...f, password: found?.password || '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const platform = form.platform === 'Otra' ? form.platformOther.trim() : form.platform;
      const payload = {
        employeeId: form.employeeId,
        platform,
        username: form.username,
        notes: form.notes,
      };
      const url = form.origin === 'new' ? '/platform-accounts-erp' : '/platform-accounts-erp/import';
      if (form.origin !== 'new') payload.password = form.password;
      const { data } = await api.post(url, payload);
      setShowModal(false);
      setJustCreated({ username: data.username, platform: data.platform, password: data.password });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Error al crear la cuenta');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (account, focusPassword = false) => {
    setEditing(account);
    setEditForm({ status: account.status, notes: account.notes || '', manualPassword: '' });
    setShowManualPasswordField(focusPassword);
    setManualPasswordVisible(false);
  };

  const openImportModal = () => {
    setImportPlatform(PLATFORM_OPTIONS[0]);
    setImportPlatformOther('');
    setImportRows([]);
    setImportFileError('');
    setImportResult(null);
    setShowImportModal(true);
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo si se corrige algo
    if (!file) return;
    setImportFileError('');
    setImportResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (raw.length === 0) {
        setImportFileError('El archivo no tiene filas de datos.');
        return;
      }
      const existingUsernames = new Set(accounts.map((a) => a.username.toLowerCase()));
      const rows = raw.map((r) => {
        const { name, email } = extractRow(r);
        const matched = matchEmployee(name, employees);
        const usernameLower = email.toLowerCase();
        const isDuplicate = !!email && existingUsernames.has(usernameLower);
        return {
          name,
          email,
          employeeId: matched?._id || '',
          matchedName: matched?.name || '',
          isDuplicate,
          include: !!email && !!matched && !isDuplicate,
        };
      }).filter((r) => r.name || r.email);
      setImportRows(rows);
    } catch (err) {
      setImportFileError('No se pudo leer el archivo. Verifica que sea un .xlsx o .csv válido.');
    }
  };

  const updateImportRow = (index, patch) => {
    setImportRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const importReadyCount = importRows.filter((r) => r.include && r.employeeId && r.email).length;

  const submitImport = async () => {
    const platform = importPlatform === 'Otra' ? importPlatformOther.trim() : importPlatform;
    if (!platform) { setImportFileError('Indica la plataforma.'); return; }
    const toSend = importRows
      .filter((r) => r.include && r.employeeId && r.email)
      .map((r) => ({ employeeId: r.employeeId, username: r.email }));
    if (toSend.length === 0) { setImportFileError('No hay filas listas para importar.'); return; }

    setImporting(true);
    setImportFileError('');
    try {
      const { data } = await api.post('/platform-accounts-erp/bulk-import', { platform, accounts: toSend });
      setImportResult(data);
      setImportRows([]);
      load();
    } catch (err) {
      setImportFileError(err.response?.data?.message || 'Error al importar');
    } finally {
      setImporting(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { notes: editForm.notes, status: editForm.status };
      if (showManualPasswordField && editForm.manualPassword) {
        payload.manualPassword = editForm.manualPassword;
      }
      const { data } = await api.put(`/platform-accounts-erp/${editing._id}`, payload);
      setEditing(null);
      if (data.password) setJustCreated({ username: data.username, platform: data.platform, password: data.password });
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Error al guardar');
    }
  };

  const confirmRegeneratePassword = async () => {
    if (!confirmRegen) return;
    setRegenLoading(true);
    try {
      const { data } = await api.put(`/platform-accounts-erp/${confirmRegen._id}`, { regeneratePassword: true });
      setJustCreated({ username: data.username, platform: data.platform, password: data.password });
      setConfirmRegen(null);
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Error al regenerar la contraseña');
    } finally {
      setRegenLoading(false);
    }
  };

  const confirmDeleteAccount = async () => {
    if (!confirmDelete) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/platform-accounts-erp/${confirmDelete._id}`);
      setConfirmDelete(null);
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Error al eliminar');
    } finally {
      setDeleteLoading(false);
    }
  };

  const exportExcel = () => {
    if (filtered.length === 0) {
      alert('No hay cuentas para exportar con los filtros actuales.');
      return;
    }
    const rows = filtered.map((a) => ({
      'No. Empleado':   a.employee?.employeeId || '',
      'Empleado':       a.employee?.name || '',
      'Empresa':        a.employee?.businessName || '',
      'Oficina':        a.employee?.office || '',
      'Departamento':   a.employee?.department || '',
      'Plataforma':     a.platform,
      'Usuario/Correo': a.username,
      'Contraseña':     a.passwordPending ? 'PENDIENTE' : a.password,
      'Estado':         a.status,
      'Notas':          a.notes || '',
      'Creado por':     a.createdByName || '',
      'Fecha creación': new Date(a.createdAt).toLocaleDateString('es-MX', { dateStyle: 'medium' }),
    }));
    const headers = Object.keys(rows[0]);
    const dataRows = rows.map((r) => headers.map((h) => r[h]));

    const meta = [
      ['CUENTAS DE PLATAFORMAS ERP Y CONTRASEÑAS'],
      ['Fecha de exportación:', new Date().toLocaleDateString('es-MX', { dateStyle: 'long' })],
      ['Plataforma:', filterPlatform || 'Todas'],
      ['Empresa:', filterEmpresa || 'Todas'],
      ['Oficina:', filterOficina || 'Todas'],
      ['Estado:', filterStatus || 'Todos'],
      ['Total de cuentas:', filtered.length],
      ['CONFIDENCIAL — contiene contraseñas en texto plano. Manejar con cuidado.'],
      [],
      headers,
      ...dataRows,
    ];

    const ws = XLSX.utils.aoa_to_sheet(meta);
    ws['!cols'] = headers.map((h) => ({
      wch: Math.max(h.length, ...rows.map((r) => String(r[h] ?? '').length), 12),
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cuentas ERP');

    const slug = [filterPlatform, filterEmpresa, filterOficina, filterStatus].filter(Boolean).join('_') || 'completo';
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `cuentas_plataformas_erp_${slug}_${date}.xlsx`);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Cuentas de Plataformas ERP</h1>
          <p className={styles.subtitle}>Alta y gestión de contraseñas de cuentas ERP asignadas a empleados</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.btnSecondary} onClick={openImportModal}>📥 Importar Excel</button>
          <button className={styles.btnPrimary} onClick={openNew}>+ Nueva cuenta</button>
        </div>
      </div>

      {justCreated && (
        <div className={styles.banner}>
          <div>
            <strong>Cuenta lista:</strong> {justCreated.platform} · {justCreated.username}
            <span className={styles.bannerPassword}>{justCreated.password}</span>
          </div>
          <div className={styles.bannerActions}>
            <button className={styles.btnSecondary} onClick={() => copy(justCreated.password)}>📋 Copiar contraseña</button>
            <button className={styles.closeBtn} onClick={() => setJustCreated(null)}>✕</button>
          </div>
        </div>
      )}

      {assignedAccounts.some((a) => a.passwordPending) && (
        <div className={styles.pendingBlock}>
          <h2 className={styles.pendingTitle}>
            🔑 Pendientes de contraseña ({assignedAccounts.filter((a) => a.passwordPending).length})
          </h2>
          <p className={styles.pendingSubtitle}>
            Estas cuentas ya existían en el ERP y se importaron sin contraseña — agrégala cuando la tengas a la mano.
          </p>
          <div className={styles.recycleList}>
            {assignedAccounts.filter((a) => a.passwordPending).map((a) => (
              <div key={a._id} className={styles.recycleItem}>
                <div>
                  <span className={styles.platformBadge}>{a.platform}</span>
                  <span className={styles.email}> {a.username}</span>
                  <span className={styles.empId}> · {a.employee?.name}</span>
                </div>
                <button className={styles.btnSecondary} onClick={() => openEdit(a, true)}>+ Agregar contraseña</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {availableAccounts.length > 0 && (
        <div className={styles.recycleBlock}>
          <h2 className={styles.recycleTitle}>
            🔁 Disponibles para reciclar ({availableAccounts.length})
          </h2>
          <p className={styles.recycleSubtitle}>
            Cuentas ya creadas que se desasignaron de un empleado que ya no está. Para dárselas a alguien más, entra a la ficha de ese empleado ("Ver activos") y usa "Asignar cuenta ERP" ahí.
          </p>
          <div className={styles.recycleList}>
            {availableAccounts.map((a) => (
              <div key={a._id} className={styles.recycleItem}>
                <div>
                  <span className={styles.platformBadge}>{a.platform}</span>
                  <span className={styles.email}> {a.username}</span>
                  {a.notes && <span className={styles.empId}> · {a.notes}</span>}
                </div>
                <div className={styles.actions}>
                  <button className={styles.btnDelete} onClick={() => setConfirmDelete(a)}>Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className={styles.filtersGrid}>
        <select className={styles.select} value={filterPlatform} onChange={(e) => setFilterPlatform(e.target.value)}>
          <option value="">Todas las plataformas</option>
          {platforms.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>

        <select className={styles.select} value={filterEmpresa} onChange={(e) => { setFilterEmpresa(e.target.value); setFilterOficina(''); }}>
          <option value="">Todas las empresas</option>
          {empresas.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>

        <select className={styles.select} value={filterOficina} onChange={(e) => setFilterOficina(e.target.value)}>
          <option value="">Todas las oficinas</option>
          {oficinas.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>

        <select className={styles.select} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="activa">Activa</option>
          <option value="inactiva">Inactiva</option>
        </select>
      </div>

      <div className={styles.searchRow}>
        <input
          className={styles.search}
          placeholder="Buscar por usuario, plataforma, empleado o número de empleado..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Barra de resultados + export */}
      <div className={styles.exportBar}>
        <span className={styles.resultCount}>
          {filtered.length} cuenta{filtered.length !== 1 ? 's' : ''}
        </span>
        {hasFilters && (
          <button className={styles.btnCancel} onClick={clearFilters}>✕ Limpiar filtros</button>
        )}
        <div className={styles.exportBarSpacer}>
          <button className={styles.btnSecondary} onClick={exportExcel}>⬇ Exportar Excel ({filtered.length})</button>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Empleado</th>
              <th>Plataforma</th>
              <th>Usuario / Correo</th>
              <th>Contraseña</th>
              <th>Estado</th>
              <th>Creado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} className={styles.empty}>
                {hasFilters ? 'Ninguna cuenta coincide con los filtros actuales.' : 'Sin cuentas de plataformas ERP registradas'}
              </td></tr>
            )}
            {filtered.map((a) => (
              <tr key={a._id}>
                <td>
                  <span className={styles.empName}>{a.employee?.name || '—'}</span>
                  {a.employee?.employeeId && <span className={styles.empId}> #{a.employee.employeeId}</span>}
                </td>
                <td><span className={styles.platformBadge}>{a.platform}</span></td>
                <td className={styles.email}>{a.username}</td>
                <td>
                  {a.passwordPending ? (
                    <div className={styles.passwordCell}>
                      <span className={styles.pendingTag}>⏳ Pendiente</span>
                      <button className={styles.btnSecondary} onClick={() => openEdit(a, true)}>+ Agregar</button>
                    </div>
                  ) : (
                    <div className={styles.passwordCell}>
                      <span className={styles.passwordText}>
                        {visible.has(a._id) ? a.password : '•'.repeat(10)}
                      </span>
                      <button className={styles.iconBtn} title={visible.has(a._id) ? 'Ocultar' : 'Mostrar'} onClick={() => toggleVisible(a._id)}>
                        {visible.has(a._id) ? '🙈' : '👁️'}
                      </button>
                      <button className={styles.iconBtn} title="Copiar contraseña" onClick={() => copy(a.password)}>📋</button>
                    </div>
                  )}
                </td>
                <td>
                  <span className={`${styles.statusBadge} ${a.status === 'activa' ? styles.statusActive : styles.statusInactive}`}>
                    {a.status === 'activa' ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td className={styles.date}>
                  {new Date(a.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                </td>
                <td>
                  <div className={styles.actions}>
                    <button className={styles.btnEdit} onClick={() => openEdit(a)}>Editar</button>
                    <button className={styles.btnWarn} onClick={() => setConfirmRegen(a)}>🔄 Contraseña</button>
                    <button
                      className={styles.btnResponsiva}
                      onClick={() => openResponsivaModal(a)}
                      disabled={generatingPdf === a._id}
                      title="Generar solicitud/responsiva de la cuenta en PDF"
                    >
                      {generatingPdf === a._id ? '...' : '📄 Responsiva'}
                    </button>
                    <button className={styles.btnDelete} onClick={() => setConfirmDelete(a)}>Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className={styles.overlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Nueva cuenta ERP</h2>
              <button className={styles.closeBtn} onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSubmit} className={styles.form}>
              {error && <p className={styles.formError}>{error}</p>}

              <div className={styles.field}>
                <label>Empleado *</label>
                <select
                  value={form.employeeId}
                  onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                  required
                >
                  <option value="">Selecciona un empleado</option>
                  {employees.map((e) => (
                    <option key={e._id} value={e._id}>{e.name} — #{e.employeeId}</option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label>Plataforma *</label>
                <select
                  value={form.platform}
                  onChange={(e) => setForm({ ...form, platform: e.target.value })}
                  required
                >
                  {allPlatformOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                  <option value="Otra">Otra</option>
                </select>
              </div>

              {form.platform === 'Otra' && (
                <div className={styles.field}>
                  <label>Nombre de la plataforma *</label>
                  <input
                    value={form.platformOther}
                    onChange={(e) => setForm({ ...form, platformOther: e.target.value })}
                    placeholder="Ej. SAP Business One, Sage..."
                    required
                  />
                </div>
              )}

              <div className={styles.field}>
                <label>Usuario o correo de la cuenta *</label>
                <input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="correo@empresa.com o nombre de usuario"
                  required
                />
              </div>

              <div className={styles.field}>
                <label>Notas</label>
                <textarea
                  className={styles.textarea}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Opcional"
                  rows={2}
                />
              </div>

              <div className={styles.field}>
                <label>¿Esta cuenta ya existe o es nueva? *</label>
                <div className={styles.choiceRow}>
                  <label className={styles.choiceOption}>
                    <input
                      type="radio"
                      name="origin"
                      checked={form.origin === 'new'}
                      onChange={() => setForm({ ...form, origin: 'new', password: '' })}
                    />
                    Nueva — generar contraseña
                  </label>
                  <label className={styles.choiceOption}>
                    <input
                      type="radio"
                      name="origin"
                      checked={form.origin === 'existing'}
                      onChange={() => setForm({ ...form, origin: 'existing', password: '' })}
                    />
                    Ya existe — ya tiene contraseña
                  </label>
                  <label className={styles.choiceOption}>
                    <input
                      type="radio"
                      name="origin"
                      checked={form.origin === 'existingGmail'}
                      onChange={() => setForm({ ...form, origin: 'existingGmail', password: '' })}
                    />
                    ¿Ya existe con Gmail? — usa la contraseña de su cuenta Gmail
                  </label>
                </div>
              </div>

              {form.origin === 'existing' && (
                <div className={styles.field}>
                  <label>Contraseña actual de la cuenta *</label>
                  <div className={styles.passwordInputRow}>
                    <input
                      type={newPasswordVisible ? 'text' : 'password'}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="La contraseña que ya usa esta cuenta"
                      required
                    />
                    <button
                      type="button"
                      className={styles.iconBtn}
                      title={newPasswordVisible ? 'Ocultar' : 'Mostrar'}
                      onClick={() => setNewPasswordVisible((v) => !v)}
                    >
                      {newPasswordVisible ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
              )}

              {form.origin === 'existingGmail' && (
                <div className={styles.field}>
                  <label>Contraseña (tomada de su cuenta Gmail)</label>
                  {!form.employeeId ? (
                    <span className={styles.hint}>Primero selecciona un empleado arriba.</span>
                  ) : gmailLookupLoading ? (
                    <span className={styles.hint}>Buscando cuentas Gmail de este empleado...</span>
                  ) : gmailLookup.length === 0 ? (
                    <p className={styles.formError}>
                      Este empleado no tiene ninguna cuenta Gmail registrada en el sistema. Usa "Ya existe" y escribe la contraseña a mano.
                    </p>
                  ) : (
                    <>
                      {gmailLookup.length > 1 && (
                        <select value={selectedGmailAccountId} onChange={(e) => selectGmailAccount(e.target.value)}>
                          {gmailLookup.map((g) => <option key={g._id} value={g._id}>{g.email}</option>)}
                        </select>
                      )}
                      <div className={styles.passwordInputRow}>
                        <input type={newPasswordVisible ? 'text' : 'password'} value={form.password} readOnly />
                        <button
                          type="button"
                          className={styles.iconBtn}
                          title={newPasswordVisible ? 'Ocultar' : 'Mostrar'}
                          onClick={() => setNewPasswordVisible((v) => !v)}
                        >
                          {newPasswordVisible ? '🙈' : '👁️'}
                        </button>
                      </div>
                      <span className={styles.hint}>
                        Tomada de {gmailLookup.find((g) => g._id === selectedGmailAccountId)?.email} — no se puede editar aquí.
                      </span>
                    </>
                  )}
                </div>
              )}

              {form.origin === 'new' ? (
                <div className={styles.passwordNotice}>
                  🔒 La contraseña se genera automáticamente y de forma única al guardar — no se reutiliza entre cuentas.
                </div>
              ) : form.origin === 'existingGmail' ? (
                <div className={styles.hint}>Se guardará cifrada la misma contraseña que ya tiene su cuenta Gmail.</div>
              ) : (
                <div className={styles.hint}>Se guardará cifrada la contraseña que capturaste arriba.</div>
              )}

              <div className={styles.modalActions}>
                <button type="button" className={styles.btnCancel} onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={styles.btnPrimary}
                  disabled={saving || (form.origin === 'existingGmail' && !form.password)}
                >
                  {saving ? 'Creando...' : 'Crear cuenta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && (
        <div className={styles.overlay} onClick={() => setEditing(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Editar cuenta</h2>
              <button className={styles.closeBtn} onClick={() => setEditing(null)}>✕</button>
            </div>

            <form onSubmit={handleEditSubmit} className={styles.form}>
              <div className={styles.field}>
                <label>Plataforma</label>
                <input value={editing.platform} disabled />
              </div>

              <div className={styles.field}>
                <label>Usuario / Correo</label>
                <input value={editing.username} disabled />
              </div>

              <div className={styles.field}>
                <label>Estado</label>
                <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                  <option value="activa">Activa</option>
                  <option value="inactiva">Inactiva</option>
                </select>
              </div>

              <div className={styles.field}>
                <label>Notas</label>
                <textarea
                  className={styles.textarea}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={3}
                />
              </div>

              {editing.passwordPending && (
                <div className={styles.passwordNotice}>
                  🔑 Esta cuenta se importó del ERP sin contraseña — captúrala abajo.
                </div>
              )}

              {!editing.passwordManuallySet && !showManualPasswordField && (
                <button type="button" className={styles.btnSecondary} onClick={() => setShowManualPasswordField(true)}>
                  ✏️ Corregir contraseña manualmente
                </button>
              )}

              {showManualPasswordField && (
                <div className={styles.field}>
                  <label>{editing.passwordPending ? 'Contraseña de la cuenta' : 'Nueva contraseña manual'}</label>
                  <div className={styles.passwordInputRow}>
                    <input
                      type={manualPasswordVisible ? 'text' : 'password'}
                      value={editForm.manualPassword}
                      onChange={(e) => setEditForm({ ...editForm, manualPassword: e.target.value })}
                      placeholder="Escribe la contraseña correcta"
                    />
                    <button
                      type="button"
                      className={styles.iconBtn}
                      title={manualPasswordVisible ? 'Ocultar' : 'Mostrar'}
                      onClick={() => setManualPasswordVisible((v) => !v)}
                    >
                      {manualPasswordVisible ? '🙈' : '👁️'}
                    </button>
                  </div>
                  <span className={styles.hint}>Solo se puede usar una vez por cuenta. Después, los cambios de contraseña serán con "🔄 Contraseña" (aleatoria).</span>
                </div>
              )}

              <div className={styles.modalActions}>
                <button type="button" className={styles.btnCancel} onClick={() => setEditing(null)}>
                  Cancelar
                </button>
                <button type="submit" className={styles.btnPrimary}>Guardar cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmRegen && (
        <div className={styles.overlay} onClick={() => !regenLoading && setConfirmRegen(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>⚠️ Regenerar contraseña</h2>
              <button className={styles.closeBtn} onClick={() => setConfirmRegen(null)} disabled={regenLoading}>✕</button>
            </div>

            <div className={styles.form}>
              <p className={styles.confirmText}>
                Estás por generar una <strong>nueva contraseña</strong> para <strong>{confirmRegen.platform} · {confirmRegen.username}</strong>.
              </p>
              <p className={styles.confirmText}>
                La contraseña actual dejará de funcionar de inmediato en este sistema. Si el empleado ya la está usando en {confirmRegen.platform}, tendrás que actualizarla ahí también con la nueva o se quedará fuera de su cuenta.
              </p>

              <div className={styles.modalActions}>
                <button type="button" className={styles.btnCancel} onClick={() => setConfirmRegen(null)} disabled={regenLoading}>
                  Cancelar
                </button>
                <button type="button" className={styles.btnDanger} onClick={confirmRegeneratePassword} disabled={regenLoading}>
                  {regenLoading ? 'Regenerando...' : 'Sí, regenerar contraseña'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className={styles.overlay} onClick={() => !deleteLoading && setConfirmDelete(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>⚠️ Eliminar cuenta</h2>
              <button className={styles.closeBtn} onClick={() => setConfirmDelete(null)} disabled={deleteLoading}>✕</button>
            </div>

            <div className={styles.form}>
              <p className={styles.confirmText}>
                Estás por eliminar el registro de <strong>{confirmDelete.platform} · {confirmDelete.username}</strong> ({confirmDelete.employee?.name || 'sin empleado'}).
              </p>
              <p className={styles.confirmText}>
                Esto no elimina la cuenta en {confirmDelete.platform}, solo el registro interno y su contraseña guardada en este sistema. No se puede deshacer.
              </p>

              <div className={styles.modalActions}>
                <button type="button" className={styles.btnCancel} onClick={() => setConfirmDelete(null)} disabled={deleteLoading}>
                  Cancelar
                </button>
                <button type="button" className={styles.btnDanger} onClick={confirmDeleteAccount} disabled={deleteLoading}>
                  {deleteLoading ? 'Eliminando...' : 'Sí, eliminar cuenta'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {respondingAccount && (
        <div className={styles.overlay} onClick={() => !respSaving && setRespondingAccount(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Completar solicitud — {respondingAccount.platform}</h2>
              <button className={styles.closeBtn} onClick={() => setRespondingAccount(null)} disabled={respSaving}>✕</button>
            </div>

            <form onSubmit={handleResponsivaSubmit} className={styles.form}>
              <p className={styles.hint}>
                Estos datos no se llenan solos y no se guardan — son de esta solicitud en particular, así que siempre empiezan en blanco.
              </p>

              <div className={styles.field}>
                <label>Tienda / Cuenta / Seller</label>
                <input
                  value={respForm.store}
                  onChange={(e) => setRespForm({ ...respForm, store: e.target.value })}
                  placeholder="Opcional"
                />
              </div>

              <div className={styles.field}>
                <label>Jefe directo</label>
                <input
                  value={respForm.directManager}
                  onChange={(e) => setRespForm({ ...respForm, directManager: e.target.value })}
                  placeholder="Nombre del jefe directo"
                />
              </div>

              <div className={styles.field}>
                <label>Rol o tipo de acceso</label>
                <input
                  value={respForm.accessRole}
                  onChange={(e) => setRespForm({ ...respForm, accessRole: e.target.value })}
                  placeholder="Admin, colaborador, solo lectura..."
                />
              </div>

              <div className={styles.field}>
                <label>Vigencia del acceso</label>
                <input
                  value={respForm.accessValidity}
                  onChange={(e) => setRespForm({ ...respForm, accessValidity: e.target.value })}
                  placeholder="Indefinida / fecha límite"
                />
              </div>

              <div className={styles.modalActions}>
                <button type="button" className={styles.btnCancel} onClick={() => setRespondingAccount(null)} disabled={respSaving}>
                  Cancelar
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={respSaving}>
                  {respSaving ? 'Generando...' : '📄 Generar PDF'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className={styles.overlay} onClick={() => !importing && setShowImportModal(false)}>
          <div className={`${styles.modal} ${styles.modalWide}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>📥 Importar cuentas ERP desde Excel</h2>
              <button className={styles.closeBtn} onClick={() => setShowImportModal(false)} disabled={importing}>✕</button>
            </div>

            <div className={styles.form}>
              {importResult ? (
                <>
                  <p className={styles.confirmText}>
                    Se importaron <strong>{importResult.created.length}</strong> cuenta{importResult.created.length !== 1 ? 's' : ''}.
                    {importResult.skipped.length > 0 && ` Se omitieron ${importResult.skipped.length}:`}
                  </p>
                  {importResult.skipped.length > 0 && (
                    <ul className={styles.hint} style={{ paddingLeft: '1.1rem', margin: 0 }}>
                      {importResult.skipped.map((s, i) => (
                        <li key={i}>{s.username || '(sin correo)'} — {s.reason}</li>
                      ))}
                    </ul>
                  )}
                  <div className={styles.modalActions}>
                    <button type="button" className={styles.btnPrimary} onClick={() => setShowImportModal(false)}>Cerrar</button>
                  </div>
                </>
              ) : (
                <>
                  <p className={styles.hint}>
                    El Excel debe tener una columna con el nombre del empleado y otra con su correo/usuario. Todas las filas se importan bajo la misma plataforma y <strong>sin contraseña</strong> — se completa después, una por una, desde "Editar" (quedan marcadas como pendientes).
                  </p>

                  <div className={styles.field}>
                    <label>Plataforma de todas las cuentas *</label>
                    <select value={importPlatform} onChange={(e) => setImportPlatform(e.target.value)}>
                      {allPlatformOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                      <option value="Otra">Otra</option>
                    </select>
                  </div>

                  {importPlatform === 'Otra' && (
                    <div className={styles.field}>
                      <label>Nombre de la plataforma *</label>
                      <input
                        value={importPlatformOther}
                        onChange={(e) => setImportPlatformOther(e.target.value)}
                        placeholder="Ej. SAP Business One, Sage..."
                      />
                    </div>
                  )}

                  <div className={styles.field}>
                    <label>Archivo Excel (.xlsx, .xls, .csv) *</label>
                    <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImportFile} />
                  </div>

                  {importFileError && <p className={styles.formError}>{importFileError}</p>}

                  {importRows.length > 0 && (
                    <>
                      <div className={styles.importTableWrap}>
                        <table className={styles.importTable}>
                          <thead>
                            <tr>
                              <th></th>
                              <th>Nombre (Excel)</th>
                              <th>Correo</th>
                              <th>Empleado — corrobora o cambia</th>
                              <th>Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importRows.map((r, i) => (
                              <tr key={i}>
                                <td>
                                  <input
                                    type="checkbox"
                                    checked={r.include}
                                    disabled={!r.employeeId || !r.email}
                                    onChange={(e) => updateImportRow(i, { include: e.target.checked })}
                                  />
                                </td>
                                <td>{r.name || '—'}</td>
                                <td>{r.email || '—'}</td>
                                <td>
                                  <select
                                    value={r.employeeId}
                                    onChange={(e) => updateImportRow(i, { employeeId: e.target.value, include: !!e.target.value && !!r.email && !r.isDuplicate })}
                                  >
                                    <option value="">Sin coincidencia — elegir</option>
                                    {employees.map((emp) => (
                                      <option key={emp._id} value={emp._id}>{emp.name} — #{emp.employeeId}</option>
                                    ))}
                                  </select>
                                </td>
                                <td>
                                  {!r.email ? <span className={styles.pendingTag}>Sin correo</span>
                                    : r.isDuplicate ? <span className={styles.pendingTag}>Ya existe</span>
                                    : r.employeeId ? <span className={styles.readyTag}>✓ Listo</span>
                                    : <span className={styles.pendingTag}>Sin empleado</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className={styles.resultCount}>{importReadyCount} de {importRows.length} filas listas para importar</p>
                    </>
                  )}

                  <div className={styles.modalActions}>
                    <button type="button" className={styles.btnCancel} onClick={() => setShowImportModal(false)} disabled={importing}>
                      Cancelar
                    </button>
                    <button type="button" className={styles.btnPrimary} onClick={submitImport} disabled={importing || importReadyCount === 0}>
                      {importing ? 'Importando...' : `Importar ${importReadyCount} cuenta${importReadyCount !== 1 ? 's' : ''}`}
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
