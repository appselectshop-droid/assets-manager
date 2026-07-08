import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import api from '../services/api';
import styles from './GmailAccounts.module.css';

const EMPTY = { employeeId: '', email: '', notes: '', origin: 'new', password: '' };

const EMPTY_IMPORT = { employeeId: '', email: '', password: '', notes: '' };

// Una cuenta Gmail puede dar acceso a varias plataformas a la vez (a diferencia
// de Cuentas de Plataformas, donde cada cuenta es de una sola) — por eso la
// Responsiva de Gmail marca varias casillas en vez de una.
const MARKETPLACE_OPTIONS = ['Mercado Libre', 'Amazon', 'Walmart', 'TikTok Shop', 'Coppel', 'Liverpool'];
const EMPTY_RESP_FORM = { platforms: [], platformOther: '', store: '', directManager: '', accessRole: '', accessValidity: '' };

export default function GmailAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [pending, setPending] = useState([]); // cuentas ya en Employee.gmailAccounts sin contraseña guardada
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEmpresa, setFilterEmpresa] = useState('');
  const [filterOficina, setFilterOficina] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [visible, setVisible] = useState(new Set());

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [newPasswordVisible, setNewPasswordVisible] = useState(false);

  const [editing, setEditing] = useState(null); // cuenta que se está editando (notas/estado)
  const [editForm, setEditForm] = useState({ status: 'activa', notes: '', manualPassword: '' });
  const [showManualPasswordField, setShowManualPasswordField] = useState(false);
  const [manualPasswordVisible, setManualPasswordVisible] = useState(false);

  const [justCreated, setJustCreated] = useState(null); // { email, password }
  const [confirmRegen, setConfirmRegen] = useState(null); // cuenta pendiente de confirmar regeneración
  const [regenLoading, setRegenLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // cuenta pendiente de confirmar eliminación
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importForm, setImportForm] = useState(EMPTY_IMPORT);
  const [importError, setImportError] = useState('');
  const [importSaving, setImportSaving] = useState(false);
  const [importPasswordVisible, setImportPasswordVisible] = useState(false);

  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [respondingAccount, setRespondingAccount] = useState(null); // cuenta para la que se están completando datos de la Responsiva
  const [respForm, setRespForm] = useState(EMPTY_RESP_FORM);
  const [respSaving, setRespSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [accRes, empRes, pendingRes] = await Promise.all([
      api.get('/gmail-accounts'),
      api.get('/employees'),
      api.get('/gmail-accounts/unregistered'),
    ]);
    setAccounts(accRes.data);
    setEmployees(empRes.data.filter((e) => e.active));
    setPending(pendingRes.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const empresas = useMemo(() => {
    const s = new Set(accounts.map((a) => a.employee?.businessName).filter(Boolean));
    return [...s].sort();
  }, [accounts]);

  const oficinas = useMemo(() => {
    const base = filterEmpresa
      ? accounts.filter((a) => a.employee?.businessName === filterEmpresa)
      : accounts;
    const s = new Set(base.map((a) => a.employee?.office).filter(Boolean));
    return [...s].sort();
  }, [accounts, filterEmpresa]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return accounts.filter((a) => {
      const matchSearch = !q || [
        a.email, a.employee?.name, a.employee?.employeeId,
        a.employee?.businessName, a.employee?.office,
      ].some((v) => v?.toLowerCase().includes(q));
      const matchEmpresa = !filterEmpresa || a.employee?.businessName === filterEmpresa;
      const matchOficina = !filterOficina || a.employee?.office === filterOficina;
      const matchStatus  = !filterStatus  || a.status === filterStatus;
      return matchSearch && matchEmpresa && matchOficina && matchStatus;
    });
  }, [accounts, search, filterEmpresa, filterOficina, filterStatus]);

  const hasFilters = filterEmpresa || filterOficina || filterStatus || search;

  const clearFilters = () => {
    setFilterEmpresa(''); setFilterOficina(''); setFilterStatus(''); setSearch('');
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

  // Los datos de la solicitud (plataformas, tienda, jefe directo, rol, vigencia)
  // nunca se guardan en la cuenta — cada responsiva es para una combinación de
  // plataformas/persona distinta, así que solo viajan como parámetros de esta
  // descarga puntual.
  const downloadResponsiva = async (account, extra = {}) => {
    setGeneratingPdf(account._id);
    try {
      const params = { ...extra, platforms: (extra.platforms || []).join(',') };
      const resp = await api.get(`/gmail-accounts/${account._id}/responsiva`, {
        params,
        responseType: 'blob',
      });
      const blob = new Blob([resp.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = (account.employee?.name || 'empleado').replace(/\s+/g, '_');
      a.download = `Responsiva_Cuenta_Gmail_${account.employee?.employeeId || ''}_${safeName}.pdf`;
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
    setRespondingAccount(account);
    setRespForm(EMPTY_RESP_FORM);
    // Si esta cuenta viene de una Solicitud aprobada, precarga lo que esa
    // persona ya puso (jefe directo, vigencia) — sigue siendo editable.
    try {
      const { data } = await api.get(`/gmail-accounts/${account._id}/request-defaults`);
      if (data && Object.keys(data).length > 0) {
        setRespForm((f) => ({ ...f, ...data }));
      }
    } catch (_) { /* sin datos previos, se queda en blanco */ }
  };

  const togglePlatform = (platform) => {
    setRespForm((f) => ({
      ...f,
      platforms: f.platforms.includes(platform)
        ? f.platforms.filter((p) => p !== platform)
        : [...f.platforms, platform],
    }));
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

  const handleEmployeeChange = async (employeeId) => {
    setForm((f) => ({ ...f, employeeId, email: '' }));
    if (!employeeId) return;
    try {
      const { data } = await api.get('/gmail-accounts/suggest-email', { params: { employeeId } });
      setForm((f) => ({ ...f, employeeId, email: data.email }));
    } catch {
      // si falla la sugerencia, el usuario puede escribir el correo manualmente
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = { employeeId: form.employeeId, email: form.email, notes: form.notes };
      const url = form.origin === 'existing' ? '/gmail-accounts/import' : '/gmail-accounts';
      if (form.origin === 'existing') payload.password = form.password;
      const { data } = await api.post(url, payload);
      setShowModal(false);
      setJustCreated({ email: data.email, password: data.password });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Error al crear la cuenta');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (account) => {
    setEditing(account);
    setEditForm({ email: account.email, status: account.status, notes: account.notes || '', manualPassword: '' });
    setShowManualPasswordField(false);
    setManualPasswordVisible(false);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { email: editForm.email, notes: editForm.notes, status: editForm.status };
      if (showManualPasswordField && editForm.manualPassword) {
        payload.manualPassword = editForm.manualPassword;
      }
      const { data } = await api.put(`/gmail-accounts/${editing._id}`, payload);
      setEditing(null);
      if (data.password) setJustCreated({ email: data.email, password: data.password });
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Error al guardar');
    }
  };

  const confirmRegeneratePassword = async () => {
    if (!confirmRegen) return;
    setRegenLoading(true);
    try {
      const { data } = await api.put(`/gmail-accounts/${confirmRegen._id}`, { regeneratePassword: true });
      setJustCreated({ email: data.email, password: data.password });
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
      await api.delete(`/gmail-accounts/${confirmDelete._id}`);
      setConfirmDelete(null);
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Error al eliminar');
    } finally {
      setDeleteLoading(false);
    }
  };

  const openImport = (item) => {
    setImportForm({ employeeId: item.employee._id, email: item.email, password: '', notes: '' });
    setImportError('');
    setImportPasswordVisible(false);
    setShowImportModal(true);
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    setImportError('');
    setImportSaving(true);
    try {
      await api.post('/gmail-accounts/import', importForm);
      setShowImportModal(false);
      load();
    } catch (err) {
      setImportError(err.response?.data?.message || 'Error al guardar la contraseña');
    } finally {
      setImportSaving(false);
    }
  };

  const exportExcel = () => {
    if (filtered.length === 0) {
      alert('No hay cuentas para exportar con el filtro actual.');
      return;
    }
    const rows = filtered.map((a) => ({
      'No. Empleado':   a.employee?.employeeId || '',
      'Empleado':       a.employee?.name || '',
      'Oficina':        a.employee?.office || '',
      'Departamento':   a.employee?.department || '',
      'Correo Gmail':   a.email,
      'Contraseña':     a.password,
      'Estado':         a.status,
      'Notas':          a.notes || '',
      'Creado por':     a.createdByName || '',
      'Fecha creación': new Date(a.createdAt).toLocaleDateString('es-MX', { dateStyle: 'medium' }),
    }));
    const headers = Object.keys(rows[0]);
    const dataRows = rows.map((r) => headers.map((h) => r[h]));

    const meta = [
      ['CUENTAS DE GMAIL Y CONTRASEÑAS'],
      ['Fecha de exportación:', new Date().toLocaleDateString('es-MX', { dateStyle: 'long' })],
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
    XLSX.utils.book_append_sheet(wb, ws, 'Cuentas Gmail');

    const slug = [filterEmpresa, filterOficina, filterStatus].filter(Boolean).join('_') || 'completo';
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `cuentas_gmail_${slug}_${date}.xlsx`);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Cuentas Gmail</h1>
          <p className={styles.subtitle}>Alta y gestión de contraseñas de cuentas Gmail asignadas a empleados</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.btnPrimary} onClick={openNew}>+ Nueva cuenta</button>
        </div>
      </div>

      {justCreated && (
        <div className={styles.banner}>
          <div>
            <strong>Cuenta lista:</strong> {justCreated.email}
            <span className={styles.bannerPassword}>{justCreated.password}</span>
          </div>
          <div className={styles.bannerActions}>
            <button className={styles.btnSecondary} onClick={() => copy(justCreated.password)}>📋 Copiar contraseña</button>
            <button className={styles.closeBtn} onClick={() => setJustCreated(null)}>✕</button>
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className={styles.pendingBlock}>
          <h2 className={styles.pendingTitle}>
            📥 Cuentas ya usadas sin contraseña guardada ({pending.length})
          </h2>
          <p className={styles.pendingSubtitle}>
            Estos correos ya están en uso — registrados al dar de alta al empleado o como Gmail de un celular/tablet asignado — pero este sistema aún no guarda su contraseña. Agrégala para tenerlas todas en un solo lugar.
          </p>
          <div className={styles.pendingList}>
            {pending.map((item) => (
              <div key={`${item.employee._id}-${item.email}`} className={styles.pendingItem}>
                <div>
                  <span className={styles.email}>{item.email}</span>
                  <span className={styles.empId}> · {item.employee.name} #{item.employee.employeeId}</span>
                </div>
                <button className={styles.btnSecondary} onClick={() => openImport(item)}>+ Agregar contraseña</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.filtersGrid}>
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
          placeholder="Buscar por correo, empleado o número de empleado..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

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
              <th>Correo Gmail</th>
              <th>Contraseña</th>
              <th>Estado</th>
              <th>Creado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className={styles.empty}>
                {hasFilters ? 'Ninguna cuenta coincide con los filtros actuales.' : 'Sin cuentas Gmail registradas'}
              </td></tr>
            )}
            {filtered.map((a) => (
              <tr key={a._id}>
                <td>
                  <span className={styles.empName}>{a.employee?.name || '—'}</span>
                  {a.employee?.employeeId && <span className={styles.empId}> #{a.employee.employeeId}</span>}
                </td>
                <td className={styles.email}>{a.email}</td>
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
              <h2 className={styles.modalTitle}>Nueva cuenta Gmail</h2>
              <button className={styles.closeBtn} onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSubmit} className={styles.form}>
              {error && <p className={styles.formError}>{error}</p>}

              <div className={styles.field}>
                <label>Empleado *</label>
                <select
                  value={form.employeeId}
                  onChange={(e) => handleEmployeeChange(e.target.value)}
                  required
                >
                  <option value="">Selecciona un empleado</option>
                  {employees.map((e) => (
                    <option key={e._id} value={e._id}>{e.name} — #{e.employeeId}</option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label>Correo Gmail *</label>
                <input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="nombre.apellido@gmail.com"
                  required
                />
                <span className={styles.hint}>Sugerido automáticamente al elegir empleado. Puedes editarlo.</span>
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
                      placeholder="La contraseña que ya usa esta cuenta en Gmail"
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
                <label>Correo</label>
                <input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                <span className={styles.hint}>Corrígelo aquí si se capturó mal — debe seguir terminando en @gmail.com.</span>
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
                Estás por generar una <strong>nueva contraseña</strong> para <strong>{confirmRegen.email}</strong>.
              </p>
              <p className={styles.confirmText}>
                La contraseña actual dejará de funcionar de inmediato en este sistema. Si el empleado ya la está usando en Gmail, tendrás que actualizarla ahí también con la nueva o se quedará fuera de su cuenta.
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
                Estás por eliminar el registro de <strong>{confirmDelete.email}</strong> ({confirmDelete.employee?.name || 'sin empleado'}).
              </p>
              <p className={styles.confirmText}>
                Esto no elimina la cuenta en Gmail, solo el registro interno y su contraseña guardada en este sistema. No se puede deshacer.
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

      {showImportModal && (
        <div className={styles.overlay} onClick={() => setShowImportModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Agregar contraseña existente</h2>
              <button className={styles.closeBtn} onClick={() => setShowImportModal(false)}>✕</button>
            </div>

            <form onSubmit={handleImportSubmit} className={styles.form}>
              {importError && <p className={styles.formError}>{importError}</p>}

              <div className={styles.field}>
                <label>Correo Gmail</label>
                <input value={importForm.email} disabled />
                <span className={styles.hint}>Ya está registrado en el empleado; aquí solo guardamos su contraseña.</span>
              </div>

              <div className={styles.field}>
                <label>Contraseña actual de la cuenta *</label>
                <div className={styles.passwordInputRow}>
                  <input
                    type={importPasswordVisible ? 'text' : 'password'}
                    value={importForm.password}
                    onChange={(e) => setImportForm({ ...importForm, password: e.target.value })}
                    placeholder="La contraseña que ya usa esta cuenta en Gmail"
                    required
                  />
                  <button
                    type="button"
                    className={styles.iconBtn}
                    title={importPasswordVisible ? 'Ocultar' : 'Mostrar'}
                    onClick={() => setImportPasswordVisible((v) => !v)}
                  >
                    {importPasswordVisible ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <div className={styles.field}>
                <label>Notas</label>
                <textarea
                  className={styles.textarea}
                  value={importForm.notes}
                  onChange={(e) => setImportForm({ ...importForm, notes: e.target.value })}
                  placeholder="Opcional"
                  rows={2}
                />
              </div>

              <div className={styles.modalActions}>
                <button type="button" className={styles.btnCancel} onClick={() => setShowImportModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={importSaving}>
                  {importSaving ? 'Guardando...' : 'Guardar contraseña'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {respondingAccount && (
        <div className={styles.overlay} onClick={() => !respSaving && setRespondingAccount(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Completar solicitud — {respondingAccount.email}</h2>
              <button className={styles.closeBtn} onClick={() => setRespondingAccount(null)} disabled={respSaving}>✕</button>
            </div>

            <form onSubmit={handleResponsivaSubmit} className={styles.form}>
              <p className={styles.hint}>
                Estos datos no se llenan solos y no se guardan — son de esta solicitud en particular, así que siempre empiezan en blanco.
              </p>

              <div className={styles.field}>
                <label>Plataformas a las que da acceso esta cuenta</label>
                <div className={styles.checkboxGrid}>
                  {MARKETPLACE_OPTIONS.map((p) => (
                    <label key={p} className={styles.choiceOption}>
                      <input
                        type="checkbox"
                        checked={respForm.platforms.includes(p)}
                        onChange={() => togglePlatform(p)}
                      />
                      {p}
                    </label>
                  ))}
                </div>
                <input
                  value={respForm.platformOther}
                  onChange={(e) => setRespForm({ ...respForm, platformOther: e.target.value })}
                  placeholder="Otra plataforma (opcional)"
                  style={{ marginTop: '0.5rem' }}
                />
              </div>

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
