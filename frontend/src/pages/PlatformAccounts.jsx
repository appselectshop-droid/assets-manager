import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import api from '../services/api';
import styles from './PlatformAccounts.module.css';

const PLATFORM_OPTIONS = [
  'Microsoft 365', 'Mercado Libre', 'Amazon', 'Netflix', 'Adobe Creative Cloud', 'Canva', 'Zoom', 'Dropbox', 'Otra',
];

const EMPTY = { employeeId: '', platform: PLATFORM_OPTIONS[0], platformOther: '', username: '', notes: '', origin: 'new', password: '', store: '', aliasOf: '' };

export default function PlatformAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [pendingCorporate, setPendingCorporate] = useState([]); // correos ya en Employee.corporateEmails sin contraseña guardada
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

  const load = async () => {
    setLoading(true);
    const [accRes, empRes, pendingRes] = await Promise.all([
      api.get('/platform-accounts'),
      api.get('/employees'),
      api.get('/platform-accounts/unregistered-corporate'),
    ]);
    setAccounts(accRes.data);
    setEmployees(empRes.data.filter((e) => e.active));
    setPendingCorporate(pendingRes.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Dos personas del equipo suelen editar estas cuentas casi al mismo tiempo
  // (una la crea, otra la corrige) — al regresar a esta pestaña se refresca
  // sola para no quedarse viendo datos de hace rato.
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const assignedAccounts = useMemo(() => accounts.filter((a) => a.employee), [accounts]);
  const availableAccounts = useMemo(() => accounts.filter((a) => !a.employee), [accounts]);

  /* ── Opciones de filtro derivadas de los datos cargados ─────────── */
  const platforms = useMemo(() => {
    const s = new Set(assignedAccounts.map((a) => a.platform).filter(Boolean));
    return [...s].sort();
  }, [assignedAccounts]);

  // Opciones para el select de "Plataforma" al crear una cuenta: la lista base
  // más cualquier plataforma que ya se haya escrito una vez con "Otra" — así
  // no hay que volver a teclearla, queda disponible para elegir de ahí en adelante.
  const allPlatformOptions = useMemo(() => {
    const base = PLATFORM_OPTIONS.filter((p) => p !== 'Otra');
    const used = accounts.map((a) => a.platform).filter(Boolean);
    const merged = new Set([...base, ...used]);
    return [...merged].sort((a, b) => a.localeCompare(b, 'es'));
  }, [accounts]);

  // Tiendas ya capturadas en cuentas de Mercado Libre — el datalist del campo
  // "Tienda" se va llenando solo con esto conforme se van registrando cuentas
  // nuevas, sin necesitar un catálogo aparte.
  const storeSuggestions = useMemo(() => {
    const s = new Set(accounts.filter((a) => a.platform === 'Mercado Libre' && a.store).map((a) => a.store));
    return [...s].sort((a, b) => a.localeCompare(b, 'es'));
  }, [accounts]);

  // Cuentas de Microsoft 365 existentes — para el selector "¿es alias de...?"
  // en cualquier otra plataforma.
  const microsoft365Accounts = useMemo(
    () => accounts.filter((a) => a.platform === 'Microsoft 365'),
    [accounts],
  );

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
      const resp = await api.get(`/platform-accounts/${account._id}/responsiva`, {
        params: extra,
        responseType: 'blob',
      });
      const blob = new Blob([resp.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = (account.employee?.name || 'empleado').replace(/\s+/g, '_');
      a.download = `Responsiva_Cuentas_Plataformas_${account.employee?.employeeId || ''}_${safeName}.pdf`;
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

  const openResponsivaModal = async (account) => {
    // Trae los datos frescos de la cuenta antes de mostrar el modal — si
    // alguien más la corrigió (usuario, empleado) después de que se cargó
    // esta lista, aquí ya no se ve lo viejo.
    try {
      const { data: fresh } = await api.get(`/platform-accounts/${account._id}`);
      account = fresh;
    } catch (_) { /* si falla, se sigue con los datos que ya se tenían */ }
    setRespondingAccount(account);
    setRespForm({ store: '', directManager: '', accessRole: '', accessValidity: '' });
    // Si esta cuenta viene de una Solicitud aprobada, precarga lo que esa
    // persona ya puso (tienda, jefe directo, permisos, vigencia) — sigue
    // siendo editable.
    try {
      const { data } = await api.get(`/platform-accounts/${account._id}/request-defaults`);
      if (data && Object.keys(data).length > 0) {
        setRespForm((f) => ({ ...f, ...data }));
      }
    } catch (_) { /* sin datos previos, se queda en blanco */ }
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
    setShowModal(true);
  };

  const openImportCorporate = (item) => {
    setForm({
      employeeId: item.employee._id,
      platform: 'Microsoft 365',
      platformOther: '',
      username: item.username,
      notes: '',
      origin: 'existing',
      password: '',
      store: '',
      aliasOf: '',
    });
    setError('');
    setNewPasswordVisible(false);
    setShowModal(true);
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
        store: form.store || '',
        aliasOf: form.aliasOf || '',
      };
      const url = form.origin === 'existing' ? '/platform-accounts/import' : '/platform-accounts';
      if (form.origin === 'existing') payload.password = form.password;
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

  const openEdit = (account) => {
    setEditing(account);
    setEditForm({
      username: account.username, status: account.status, notes: account.notes || '', manualPassword: '',
      store: account.store || '', aliasOf: account.aliasOf?._id || '',
    });
    setShowManualPasswordField(false);
    setManualPasswordVisible(false);
  };

  // Misma sección en "Nueva cuenta" y "Editar cuenta": la Tienda solo aplica
  // a Mercado Libre; el "¿es alias de...?" aplica a cualquier plataforma
  // (un alias de Microsoft 365 se puede usar de login en cualquier lado).
  const renderPlatformExtras = (currentForm, setter, currentPlatform) => (
    <>
      {currentPlatform === 'Mercado Libre' && (
        <div className={styles.field}>
          <label>Tienda *</label>
          <input
            list="ml-store-suggestions"
            value={currentForm.store}
            onChange={(e) => setter({ ...currentForm, store: e.target.value })}
            placeholder="Nombre de la tienda/seller"
            required
          />
          <datalist id="ml-store-suggestions">
            {storeSuggestions.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
      )}
      {microsoft365Accounts.length > 0 && (
        <div className={styles.field}>
          <label>¿Es alias de una cuenta de Microsoft 365?</label>
          <select value={currentForm.aliasOf} onChange={(e) => setter({ ...currentForm, aliasOf: e.target.value })}>
            <option value="">Ninguno</option>
            {microsoft365Accounts.map((a) => <option key={a._id} value={a._id}>{a.username}</option>)}
          </select>
          <span className={styles.hint}>Si este usuario/correo es en realidad un alias sobre un buzón de Microsoft 365 ya registrado.</span>
        </div>
      )}
    </>
  );

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        username: editForm.username, notes: editForm.notes, status: editForm.status,
        store: editForm.store || '', aliasOf: editForm.aliasOf || '',
      };
      if (showManualPasswordField && editForm.manualPassword) {
        payload.manualPassword = editForm.manualPassword;
      }
      const { data } = await api.put(`/platform-accounts/${editing._id}`, payload);
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
      const { data } = await api.put(`/platform-accounts/${confirmRegen._id}`, { regeneratePassword: true });
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
      await api.delete(`/platform-accounts/${confirmDelete._id}`);
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
      'Contraseña':     a.password,
      'Estado':         a.status,
      'Notas':          a.notes || '',
      'Creado por':     a.createdByName || '',
      'Fecha creación': new Date(a.createdAt).toLocaleDateString('es-MX', { dateStyle: 'medium' }),
    }));
    const headers = Object.keys(rows[0]);
    const dataRows = rows.map((r) => headers.map((h) => r[h]));

    const meta = [
      ['CUENTAS DE OTRAS PLATAFORMAS Y CONTRASEÑAS'],
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
    XLSX.utils.book_append_sheet(wb, ws, 'Cuentas Plataformas');

    const slug = [filterPlatform, filterEmpresa, filterOficina, filterStatus].filter(Boolean).join('_') || 'completo';
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `cuentas_plataformas_${slug}_${date}.xlsx`);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Cuentas de Plataformas</h1>
          <p className={styles.subtitle}>Alta y gestión de contraseñas de cuentas de Microsoft, Amazon y otras plataformas asignadas a empleados</p>
        </div>
        <div className={styles.headerActions}>
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

      {pendingCorporate.length > 0 && (
        <div className={styles.pendingBlock}>
          <h2 className={styles.pendingTitle}>
            📥 Correos corporativos (Microsoft) sin contraseña guardada ({pendingCorporate.length})
          </h2>
          <p className={styles.pendingSubtitle}>
            Estos correos ya están registrados en "Correos Corporativos" del empleado — son cuentas de Microsoft aunque usen dominios distintos. Agrégales su contraseña para tenerlas también aquí, sin quitarlas de la ficha del empleado.
          </p>
          <div className={styles.recycleList}>
            {pendingCorporate.map((item) => (
              <div key={`${item.employee._id}-${item.username}`} className={styles.recycleItem}>
                <div>
                  <span className={styles.email}>{item.username}</span>
                  <span className={styles.empId}> · {item.employee.name} #{item.employee.employeeId}</span>
                </div>
                <button className={styles.btnSecondary} onClick={() => openImportCorporate(item)}>+ Agregar contraseña</button>
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
            Cuentas ya creadas que se desasignaron de un empleado que ya no está. Para dárselas a alguien más, entra a la ficha de ese empleado ("Ver activos") y usa "Asignar cuenta de plataforma" ahí.
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
              <th>Tienda</th>
              <th>Contraseña</th>
              <th>Estado</th>
              <th>Creado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={8} className={styles.empty}>
                {hasFilters ? 'Ninguna cuenta coincide con los filtros actuales.' : 'Sin cuentas de plataformas registradas'}
              </td></tr>
            )}
            {filtered.map((a) => (
              <tr key={a._id}>
                <td>
                  <span className={styles.empName}>{a.employee?.name || '—'}</span>
                  {a.employee?.employeeId && <span className={styles.empId}> #{a.employee.employeeId}</span>}
                </td>
                <td><span className={styles.platformBadge}>{a.platform}</span></td>
                <td className={styles.email}>
                  {a.username}
                  {a.aliasOf && (
                    <span className={styles.hint} style={{ display: 'block', marginTop: '0.2rem' }} title={`Alias de la cuenta de Microsoft 365: ${a.aliasOf.username}`}>
                      🔗 alias de {a.aliasOf.username}
                    </span>
                  )}
                </td>
                <td>{a.store || '—'}</td>
                <td>
                  <div className={styles.passwordCell}>
                    <span className={styles.passwordText}>
                      {visible.has(a._id) ? a.password : '•'.repeat(10)}
                    </span>
                    <button className={styles.iconBtn} title={visible.has(a._id) ? 'Ocultar' : 'Mostrar'} onClick={() => toggleVisible(a._id)}>
                      {visible.has(a._id) ? '🙈' : '👁️'}
                    </button>
                    <button className={styles.iconBtn} title="Copiar contraseña" onClick={() => copy(a.password)}>📋</button>
                  </div>
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
              <h2 className={styles.modalTitle}>Nueva cuenta de plataforma</h2>
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
                    placeholder="Ej. Shopify, Mailchimp..."
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

              {renderPlatformExtras(form, setForm, form.platform)}

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
                      onChange={() => setForm({ ...form, origin: 'existing' })}
                    />
                    Ya existe — ya tiene contraseña
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

              {form.origin === 'new' ? (
                <div className={styles.passwordNotice}>
                  🔒 La contraseña se genera automáticamente y de forma única al guardar — no se reutiliza entre cuentas.
                </div>
              ) : (
                <div className={styles.hint}>Se guardará cifrada la contraseña que capturaste arriba.</div>
              )}

              <div className={styles.modalActions}>
                <button type="button" className={styles.btnCancel} onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={saving}>
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
                <input value={editForm.username} onChange={(e) => setEditForm({ ...editForm, username: e.target.value })} />
                <span className={styles.hint}>Corrígelo aquí si se capturó mal.</span>
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

              {renderPlatformExtras(editForm, setEditForm, editing.platform)}

              {!editing.passwordManuallySet && !showManualPasswordField && (
                <button type="button" className={styles.btnSecondary} onClick={() => setShowManualPasswordField(true)}>
                  ✏️ Corregir contraseña manualmente
                </button>
              )}

              {showManualPasswordField && (
                <div className={styles.field}>
                  <label>Nueva contraseña manual</label>
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
    </div>
  );
}
