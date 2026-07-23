import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import employeeApi from '../services/employeeApi';
import PortalLayout from '../components/PortalLayout';
import { ASSET_TYPE_LABELS, TYPE_ICONS } from '../config/assetFields';
import { OFFBOARDING_REASONS, OTHER_OFFBOARDING_REASON } from '../config/offboardingReasons';
import useEmployeeLookup from '../hooks/useEmployeeLookup';
import useSlowRequestNotice from '../hooks/useSlowRequestNotice';
// Mismos estilos de campo que el resto del portal (Reportar Ticket,
// Solicitar Cuenta/Ingreso/Recurso) + cascarón propio para las 2 secciones
// de esta página (formulario del jefe / cola de revisión de RH).
import shared from './SolicitarCuenta.module.css';
import styles from './BajaPersonal.module.css';

function readEmployeeUser() {
  try { return JSON.parse(localStorage.getItem('employeeUser') || 'null'); } catch { return null; }
}

function assetLabel(a) {
  const label = ASSET_TYPE_LABELS[a.type] || a.type;
  const icon = TYPE_ICONS[a.type] || '📦';
  const detail = [a.brand, a.model].filter(Boolean).join(' ');
  const tag = a.inventoryTag || a.serialNumber;
  return `${icon} ${label}${detail ? ` — ${detail}` : ''}${tag ? ` (${tag})` : ''}`;
}

function formatDate(d) {
  return d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

// Sección visible solo para quien tiene canRequestOffboarding (el jefe) —
// reporta que alguien de su equipo causa baja. Requiere sesión de empleado
// (a diferencia de Solicitar Ingreso, que es pública) — pedido explícito del
// usuario, y porque esto sí termina liberando activos de una persona real.
function SolicitarBajaForm({ onSubmitted }) {
  const [nameQuery, setNameQuery] = useState('');
  const [matchedEmployee, setMatchedEmployee] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  // Ver hooks/useEmployeeLookup — distingue 'error' (falló la búsqueda, ej.
  // por wifi) de 'done' sin resultados.
  const { matches: nameMatches, status: nameSearchStatus, retry: retryNameSearch } = useEmployeeLookup(employeeApi, nameQuery);

  const [reasons, setReasons] = useState([]);
  const [reasonOther, setReasonOther] = useState('');
  const [bajaDate, setBajaDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const slowSubmit = useSlowRequestNotice(submitting);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  const handleNameChange = (val) => {
    setNameQuery(val);
    setMatchedEmployee(null);
    setShowDropdown(true);
  };

  const pickEmployee = (emp) => {
    setMatchedEmployee(emp);
    setNameQuery(emp.name);
    setShowDropdown(false);
  };

  const toggleReason = (r) => {
    setReasons((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  };

  const resetForm = () => {
    setNameQuery(''); setMatchedEmployee(null); setReasons([]); setReasonOther('');
    setBajaDate(''); setNotes(''); setDone(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!matchedEmployee) { setError('Escribe el nombre de la persona y selecciónala de la lista.'); return; }
    if (reasons.length === 0) { setError('Selecciona al menos un motivo de baja.'); return; }
    if (reasons.includes(OTHER_OFFBOARDING_REASON) && !reasonOther.trim()) { setError('Especifica el motivo.'); return; }
    setSubmitting(true);
    try {
      const { data } = await employeeApi.post('/offboarding-requests', {
        employeeRef: matchedEmployee._id,
        reasons,
        reasonOther: reasonOther.trim(),
        bajaDate: bajaDate || undefined,
        notes: notes.trim(),
      });
      setDone(data);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo enviar la solicitud.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className={styles.successBox}>
        <span className={styles.successIcon}>✅</span>
        <h3>Solicitud de baja enviada</h3>
        <p>RH la revisará y, si procede, le avisará a Sistemas para liberar el equipo de {done.employeeName}.</p>
        <button type="button" className={shared.submitBtn} style={{ width: 'auto', padding: '0.7rem 1.25rem' }} onClick={resetForm}>
          Reportar otra baja
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className={shared.error}>{error}</p>}
      <div className={shared.field} style={{ position: 'relative' }}>
        <label>¿Quién causa baja? *</label>
        <input
          value={nameQuery}
          onChange={(e) => handleNameChange(e.target.value)}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          placeholder="Escribe su nombre..."
          autoComplete="off"
        />
        {showDropdown && nameMatches.length > 0 && (
          <div className={shared.nameDropdown}>
            {nameMatches.map((emp) => (
              <button type="button" key={emp._id} className={shared.nameOption} onClick={() => pickEmployee(emp)}>
                {emp.name}{emp.position ? ` — ${emp.position}` : ''}
              </button>
            ))}
          </div>
        )}
        {matchedEmployee && <p className={shared.hint}>✓ {matchedEmployee.position || 'Sin puesto'} · {matchedEmployee.department || matchedEmployee.area || 'Sin área'}</p>}
        {!matchedEmployee && nameSearchStatus === 'done' && nameMatches.length === 0 && nameQuery.trim().length >= 3 && (
          <p className={shared.hintWarn}>No encontramos a nadie con ese nombre — escríbelo tal como aparece registrado.</p>
        )}
        {!matchedEmployee && nameSearchStatus === 'error' && (
          <p className={shared.hintError}>
            No pudimos buscar el nombre — parece un problema de conexión, no que no exista.
            {/* onMouseDown preventDefault: evita que el clic le quite el foco al
                input antes de que el reintento traiga resultados. */}
            <button
              type="button"
              className={shared.retryLink}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { retryNameSearch(); setShowDropdown(true); }}
            >
              Reintentar
            </button>
          </p>
        )}
      </div>

      <div className={shared.field}>
        <label>Motivo de la baja *</label>
        <div className={shared.checkGrid}>
          {OFFBOARDING_REASONS.map((r) => (
            <label key={r} className={`${shared.checkOption} ${reasons.includes(r) ? shared.checkOptionActive : ''}`}>
              <input type="checkbox" checked={reasons.includes(r)} onChange={() => toggleReason(r)} />
              {r}
            </label>
          ))}
        </div>
        {reasons.includes(OTHER_OFFBOARDING_REASON) && (
          <input style={{ marginTop: '0.6rem' }} value={reasonOther} onChange={(e) => setReasonOther(e.target.value)} placeholder="Especifica el motivo..." />
        )}
      </div>

      <div className={shared.field}>
        <label>Fecha de baja</label>
        <input type="date" value={bajaDate} onChange={(e) => setBajaDate(e.target.value)} />
      </div>

      <div className={shared.field}>
        <label>Notas (opcional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Cualquier detalle adicional para RH..." />
      </div>

      <button type="submit" className={shared.submitBtn} disabled={submitting}>
        {submitting ? 'Enviando...' : 'Enviar solicitud de baja'}
      </button>
      {slowSubmit && (
        <p className={shared.hintWarn} style={{ textAlign: 'center', marginTop: '0.6rem' }}>
          La conexión está tardando más de lo normal — seguimos intentando, no cierres esta pantalla.
        </p>
      )}
    </form>
  );
}

// Sección visible solo para quien tiene canManageOffboarding (RH) — revisa
// lo que reportaron los jefes, ve de un jalón qué activos tiene asignados
// esa persona (snapshot tomado al momento de la solicitud, sin tener que
// entrar a Activos) y aprueba (pasa a Sistemas) o rechaza.
function RevisionRHPanel() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await employeeApi.get('/offboarding-requests/pending-rh');
      setRequests(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (r) => {
    setBusyId(r._id);
    setError('');
    try {
      await employeeApi.put(`/offboarding-requests/${r._id}/rh-approve`);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo aprobar la solicitud.');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async () => {
    setBusyId(rejectTarget._id);
    setError('');
    try {
      await employeeApi.put(`/offboarding-requests/${rejectTarget._id}/rh-reject`, { reason: rejectReason });
      setRejectTarget(null);
      setRejectReason('');
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo rechazar la solicitud.');
    } finally {
      setBusyId(null);
    }
  };

  const STATUS_LABELS = {
    pendiente_rh: { label: 'Pendiente de RH', className: styles.pillAmber },
    rechazada_rh: { label: 'Rechazada por RH', className: styles.pillGray },
    pendiente_sistemas: { label: 'Con Sistemas', className: styles.pillOrange },
    rechazada_sistemas: { label: 'Rechazada por Sistemas', className: styles.pillGray },
    completada: { label: 'Baja procesada', className: styles.pillGreen },
  };

  if (loading) return <p className={shared.hint}>Cargando solicitudes...</p>;
  if (requests.length === 0) return <p className={shared.hint}>No hay solicitudes de baja registradas.</p>;

  return (
    <div>
      {error && <p className={shared.error}>{error}</p>}
      {requests.map((r) => {
        const sc = STATUS_LABELS[r.status] || STATUS_LABELS.pendiente_rh;
        return (
          <div key={r._id} className={styles.requestCard}>
            <div className={styles.requestHead}>
              <div>
                <p className={styles.requestName}>{r.employeeName}</p>
                <p className={styles.requestSub}>{r.employeePosition || 'Sin puesto'} · {r.employeeOffice || 'Sin sucursal'}</p>
              </div>
              <span className={`${styles.pill} ${sc.className}`}>{sc.label}</span>
            </div>

            <div className={styles.requestDetails}>
              <p><strong>Motivo:</strong> {[...r.reasons.filter((x) => x !== 'Otro (especifica)'), r.reasonOther].filter(Boolean).join(', ')}</p>
              <p><strong>Fecha de baja:</strong> {formatDate(r.bajaDate)}</p>
              <p><strong>Reportó:</strong> {r.requestedByName || '—'}</p>
              {r.notes && <p><strong>Notas:</strong> {r.notes}</p>}
            </div>

            <div className={styles.assetsBox}>
              <p className={styles.assetsTitle}>Activos asignados al momento de reportarlo ({r.assetsSnapshot.length})</p>
              {r.assetsSnapshot.length === 0 ? (
                <p className={shared.hint}>No tenía ningún activo asignado.</p>
              ) : (
                <ul>
                  {r.assetsSnapshot.map((a) => <li key={a.assetId}>{assetLabel(a)}</li>)}
                </ul>
              )}
            </div>

            {r.status === 'pendiente_rh' && (
              <div className={styles.requestActions}>
                <button type="button" className={shared.submitBtn} style={{ width: 'auto', padding: '0.6rem 1.1rem' }} disabled={busyId === r._id} onClick={() => handleApprove(r)}>
                  {busyId === r._id ? 'Aprobando...' : 'Aprobar y avisar a Sistemas'}
                </button>
                <button type="button" className={styles.btnReject} disabled={busyId === r._id} onClick={() => setRejectTarget(r)}>
                  Rechazar
                </button>
              </div>
            )}
            {r.rhReviewedByName && r.status !== 'pendiente_rh' && (
              <p className={shared.hint}>Revisado por {r.rhReviewedByName} — {formatDate(r.rhReviewedAt)}</p>
            )}
          </div>
        );
      })}

      {rejectTarget && (
        <div className={styles.overlay} onClick={() => setRejectTarget(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3>Rechazar solicitud de baja</h3>
            <p className={shared.hint}>De {rejectTarget.employeeName} — no se avisará a Sistemas.</p>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Motivo del rechazo (opcional)..." />
            <div className={styles.requestActions}>
              <button type="button" className={styles.btnReject} onClick={() => setRejectTarget(null)}>Cancelar</button>
              <button type="button" className={shared.submitBtn} style={{ width: 'auto', padding: '0.6rem 1.1rem' }} onClick={handleReject}>Sí, rechazar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BajaPersonal() {
  const employeeUser = readEmployeeUser();
  const isJefe = !!employeeUser?.canRequestOffboarding;
  const isRH = !!employeeUser?.canManageOffboarding;

  return (
    <PortalLayout activeNav="solicitudes">
      <Link to="/mesa-de-ayuda" className={styles.backLink}>← Volver a Solicitudes</Link>
      <div className={styles.mainHead}>
        <h1>Baja de personal</h1>
        <p>El jefe reporta la baja, RH la revisa y avisa a Sistemas para liberar el equipo asignado.</p>
      </div>

      {isJefe && (
        <div className={styles.panel}>
          <p className={shared.sectionTitle}>Reportar una baja</p>
          <SolicitarBajaForm />
        </div>
      )}

      {isRH && (
        <div className={styles.panel} style={{ marginTop: isJefe ? '1.5rem' : 0 }}>
          <p className={shared.sectionTitle}>Solicitudes por revisar (RH)</p>
          <RevisionRHPanel />
        </div>
      )}
    </PortalLayout>
  );
}
