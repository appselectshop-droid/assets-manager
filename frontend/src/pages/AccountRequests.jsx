import { useEffect, useState } from 'react';
import api from '../services/api';
import styles from './AccountRequests.module.css';

const TYPE_CONFIG = {
  gmail:        { label: 'Gmail',          icon: '🔐' },
  platform:     { label: 'Plataforma',     icon: '🌐' },
  platform_erp: { label: 'Plataforma ERP', icon: '🏭' },
};

const STATUS_CONFIG = {
  pendiente: { label: 'Pendiente', color: '#d97706', bg: '#fffbeb' },
  aprobada:  { label: 'Aprobada',  color: '#16a34a', bg: '#f0fdf4' },
  rechazada: { label: 'Rechazada', color: '#dc2626', bg: '#fef2f2' },
};

function ApproveModal({ request, onClose, onDone }) {
  const [employees, setEmployees] = useState([]);
  const [empSearch, setEmpSearch] = useState(request.employeeName || '');
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [platform, setPlatform] = useState(request.platform || '');
  const [username, setUsername] = useState(request.username || '');
  const [notes, setNotes] = useState(request.reason || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [resultPassword, setResultPassword] = useState(null);

  useEffect(() => {
    api.get('/employees').then(({ data }) => setEmployees(data.filter((e) => e.active)));
  }, []);

  const filteredEmps = empSearch.trim() === '' ? [] : employees.filter((e) => {
    const q = empSearch.toLowerCase();
    return e.employeeId.toLowerCase().includes(q)
      || e.name.toLowerCase().includes(q)
      || e.phone?.toLowerCase().includes(q);
  }).slice(0, 8);

  const isGmail = request.requestType === 'gmail';

  const handleApprove = async () => {
    if (!selectedEmp) { setError('Selecciona el empleado real al que corresponde esta solicitud.'); return; }
    if (!isGmail && !platform.trim()) { setError('Indica la plataforma.'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = isGmail
        ? { employeeId: selectedEmp._id, email: username, notes }
        : { employeeId: selectedEmp._id, platform, username, notes };
      const { data } = await api.put(`/account-requests/${request._id}/approve`, payload);
      setResultPassword(data.password);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al aprobar la solicitud');
    } finally {
      setSaving(false);
    }
  };

  if (resultPassword) {
    return (
      <div className={styles.overlay} onClick={onDone}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div className={styles.modalHeader}>
            <h2 className={styles.modalTitle}>✅ Cuenta creada</h2>
            <button className={styles.closeBtn} onClick={onDone}>✕</button>
          </div>
          <div className={styles.modalBody}>
            <p className={styles.modalHint}>Contraseña generada — cópiala y compártela ahora, no se puede volver a ver aquí después.</p>
            <div className={styles.passwordBox}>{resultPassword}</div>
            <div className={styles.modalActions}>
              <button className={styles.btnPrimary} onClick={onDone}>Listo</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>{TYPE_CONFIG[request.requestType].icon}</span>
          <h2 className={styles.modalTitle}>Aprobar solicitud</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          {error && <p className={styles.formError}>{error}</p>}

          <div className={styles.field}>
            <label>Empleado real (busca y confirma quién es)</label>
            {selectedEmp ? (
              <div className={styles.empSelected}>
                <div>
                  <p className={styles.empSelName}>{selectedEmp.name}</p>
                  <p className={styles.empSelSub}>{selectedEmp.employeeId}{selectedEmp.department && ` · ${selectedEmp.department}`}</p>
                </div>
                <button type="button" className={styles.btnChange} onClick={() => { setSelectedEmp(null); setEmpSearch(''); }}>Cambiar</button>
              </div>
            ) : (
              <>
                <input
                  className={styles.input}
                  value={empSearch}
                  onChange={(e) => setEmpSearch(e.target.value)}
                  placeholder="Nombre, número de empleado o teléfono..."
                  autoFocus
                />
                {empSearch && (
                  <div className={styles.empDropdown}>
                    {filteredEmps.length === 0 ? (
                      <p className={styles.empEmpty}>Sin resultados</p>
                    ) : filteredEmps.map((emp) => (
                      <button key={emp._id} type="button" className={styles.empOption} onClick={() => { setSelectedEmp(emp); setEmpSearch(''); }}>
                        <p className={styles.empName}>{emp.name}</p>
                        <p className={styles.empSub}><strong>{emp.employeeId}</strong>{emp.office && ` · ${emp.office}`}</p>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {!isGmail && (
            <div className={styles.field}>
              <label>Plataforma</label>
              <input className={styles.input} value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="Amazon, SAP, Microsoft 365..." />
            </div>
          )}

          <div className={styles.field}>
            <label>{isGmail ? 'Correo (déjalo en blanco para autogenerar)' : 'Correo o usuario de la cuenta'}</label>
            <input className={styles.input} value={username} onChange={(e) => setUsername(e.target.value)} placeholder={isGmail ? 'nombre.apellido@gmail.com' : 'correo o usuario'} />
          </div>

          <div className={styles.field}>
            <label>Notas (opcional)</label>
            <input className={styles.input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Motivo de la solicitud..." />
          </div>

          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
            <button type="button" className={styles.btnPrimary} onClick={handleApprove} disabled={saving}>
              {saving ? 'Creando...' : 'Aprobar y crear cuenta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RejectModal({ request, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleReject = async () => {
    setSaving(true);
    try {
      await api.put(`/account-requests/${request._id}/reject`, { reason });
      onDone();
    } catch (err) {
      alert(err.response?.data?.message || 'Error al rechazar la solicitud');
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Rechazar solicitud</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          <p className={styles.modalHint}>Solicitud de <strong>{request.employeeName}</strong> — esta acción no crea ninguna cuenta.</p>
          <div className={styles.field}>
            <label>Motivo (opcional)</label>
            <input className={styles.input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. datos incompletos, duplicada..." />
          </div>
          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
            <button type="button" className={styles.btnDanger} onClick={handleReject} disabled={saving}>
              {saving ? 'Rechazando...' : 'Sí, rechazar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AccountRequests() {
  // Leído dentro del componente (no a nivel de módulo) para que sea el
  // permiso vigente en cada visita — si se lee una sola vez al cargar el
  // bundle, se queda pegado a como estaba localStorage antes de iniciar
  // sesión (todo en {}), y ningún botón de Aprobar/Rechazar/PDF aparece
  // hasta refrescar la página a fuerzas.
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('pendiente');
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const downloadPdf = async (r) => {
    setDownloadingId(r._id);
    try {
      const resp = await api.get(`/account-requests/${r._id}/pdf`, { responseType: 'blob' });
      const blob = new Blob([resp.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = r.fileName || 'solicitud.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.message || 'No se pudo descargar el PDF de la solicitud');
    } finally {
      setDownloadingId(null);
    }
  };

  const load = async () => {
    setLoading(true);
    const params = filterStatus ? { status: filterStatus } : {};
    const { data } = await api.get('/account-requests', { params });
    setRequests(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterStatus]);

  const canManage = (requestType) => {
    if (requestType === 'gmail') return !!currentUser.canManageGmailAccounts;
    if (requestType === 'platform') return !!currentUser.canManagePlatformAccounts;
    return !!currentUser.canManagePlatformAccountsErp;
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Solicitudes de Cuentas</h1>
          <p className={styles.subtitle}>Altas pedidas desde el formulario de la empresa — revisa y aprueba antes de crear cada cuenta.</p>
        </div>
      </div>

      <div className={styles.tabs}>
        {['pendiente', 'aprobada', 'rechazada', ''].map((st) => (
          <button
            key={st || 'todas'}
            className={`${styles.tab} ${filterStatus === st ? styles.tabActive : ''}`}
            onClick={() => setFilterStatus(st)}
          >
            {st ? STATUS_CONFIG[st].label : 'Todas'}
          </button>
        ))}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Solicitado para</th>
              <th>Plataforma / cuenta</th>
              <th>Motivo</th>
              <th>Solicitado por</th>
              <th>Fecha</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className={styles.empty}>Cargando...</td></tr>}
            {!loading && requests.length === 0 && (
              <tr><td colSpan={8} className={styles.empty}>Sin solicitudes</td></tr>
            )}
            {requests.map((r) => {
              const tc = TYPE_CONFIG[r.requestType];
              const sc = STATUS_CONFIG[r.status];
              return (
                <tr key={r._id}>
                  <td><span className={styles.typeCell}>{tc.icon} {tc.label}</span></td>
                  <td className={styles.nameCell}>
                    {r.employeeName}
                    {r.employeeIdNum && <span className={styles.muted}> ({r.employeeIdNum})</span>}
                    {r.matchedEmployee && <div className={styles.matchedTag}>→ {r.matchedEmployee.name}</div>}
                  </td>
                  <td>{r.platform || '—'}{r.username && ` · ${r.username}`}</td>
                  <td className={styles.reasonCell}>{r.reason || '—'}</td>
                  <td>{r.requestedByEmail || '—'}</td>
                  <td className={styles.date}>{new Date(r.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td>
                    <span className={styles.statusBadge} style={{ color: sc.color, background: sc.bg }}>{sc.label}</span>
                  </td>
                  <td>
                    <div className={styles.actions}>
                      {r.fileName && canManage(r.requestType) && (
                        <button className={styles.btnView} onClick={() => downloadPdf(r)} disabled={downloadingId === r._id}>
                          {downloadingId === r._id ? '...' : '⬇ PDF'}
                        </button>
                      )}
                      {r.status === 'pendiente' && canManage(r.requestType) ? (
                        <>
                          <button className={styles.btnApprove} onClick={() => setApproveTarget(r)}>Aprobar</button>
                          <button className={styles.btnReject} onClick={() => setRejectTarget(r)}>Rechazar</button>
                        </>
                      ) : (
                        <span className={styles.muted}>{r.reviewedByName || '—'}</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {approveTarget && (
        <ApproveModal
          request={approveTarget}
          onClose={() => setApproveTarget(null)}
          onDone={() => { setApproveTarget(null); load(); }}
        />
      )}
      {rejectTarget && (
        <RejectModal
          request={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onDone={() => { setRejectTarget(null); load(); }}
        />
      )}
    </div>
  );
}
