import { Fragment, useEffect, useState } from 'react';
import api from '../services/api';
import styles from '../pages/Tickets.module.css';
import cal from '../pages/Calendario.module.css';

// Reporte semanal del becario (2026-08-19, pedido explícito del usuario)
// — vive dentro de una actividad del Calendario con
// reportType:'becario_semanal'. Tres modos de uso, según quién entra:
// 1) el becario asignado (Atsiel) llena su parte mientras no esté
//    validado; 2) Miguel (único validador) llena la evaluación cuando ya
//    se envió; 3) cualquier otro (Lilly incluida) solo lo consulta.
// Las secciones de tickets/indicadores NO se llenan a mano: se calculan
// solas en el backend (ver computeReportMetrics en calendarActivities.js)
// a partir de los tickets reales del becario esa semana.
const SEMAFORO_OPTS = [
  { key: 'verde', label: '🟢 Verde' },
  { key: 'amarillo', label: '🟡 Amarillo' },
  { key: 'rojo', label: '🔴 Rojo' },
];

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function ReporteSemanalModal({ activityId, onClose, onUpdated }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedWeek, setExpandedWeek] = useState(null);

  // Formulario del becario
  const [resumenSemana, setResumenSemana] = useState('');
  const [otrasActividades, setOtrasActividades] = useState([]);
  const [cursos, setCursos] = useState([]);
  const [autoevaluacion, setAutoevaluacion] = useState({ logros: '', dificultades: '', plan: '' });

  // Formulario de Miguel
  const [calificaciones, setCalificaciones] = useState({});
  const [observacionesCriterio, setObservacionesCriterio] = useState({});
  const [semaforo, setSemaforo] = useState('');
  const [comentarioGeneral, setComentarioGeneral] = useState('');

  const load = () => {
    setLoading(true);
    api.get(`/calendar-activities/${activityId}/report`)
      .then((res) => {
        setData(res.data);
        const { activity, criterios } = res.data;
        setResumenSemana(activity.report.resumenSemana || '');
        setOtrasActividades(activity.report.otrasActividades || []);
        setCursos(activity.report.cursos || []);
        setAutoevaluacion(activity.report.autoevaluacion || { logros: '', dificultades: '', plan: '' });
        const existing = activity.report.evaluacionSupervisor?.criterios || [];
        const calMap = {}; const obsMap = {};
        criterios.forEach((c) => {
          const found = existing.find((e) => e.criterio === c);
          calMap[c] = found?.calificacion || '';
          obsMap[c] = found?.observaciones || '';
        });
        setCalificaciones(calMap);
        setObservacionesCriterio(obsMap);
        setSemaforo(activity.report.evaluacionSupervisor?.semaforo || '');
        setComentarioGeneral(activity.report.evaluacionSupervisor?.comentarioGeneral || '');
      })
      .catch((err) => setError(err.response?.data?.message || 'No se pudo cargar el reporte'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [activityId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className={styles.overlay} onClick={onClose}>
        <div className={`${styles.modal} ${cal.wideModal}`} onClick={(e) => e.stopPropagation()}>
          <div className={styles.modalBody}><p className={styles.empty}>Cargando...</p></div>
        </div>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className={styles.overlay} onClick={onClose}>
        <div className={`${styles.modal} ${cal.wideModal}`} onClick={(e) => e.stopPropagation()}>
          <div className={styles.modalBody}><p className={styles.formError}>{error}</p></div>
        </div>
      </div>
    );
  }

  const { activity, metrics, criterios, canFillBecario, canValidate } = data;
  const report = activity.report;
  const becarioEditable = canFillBecario && report.estado !== 'validado';
  const validadorEditable = canValidate && report.estado === 'llenado';

  const addOtraActividad = () => setOtrasActividades((a) => [...a, { actividad: '', fecha: '', ubicacion: '', tipo: '', evidencia: false, observaciones: '' }]);
  const updateOtraActividad = (i, field, value) => setOtrasActividades((a) => a.map((x, idx) => (idx === i ? { ...x, [field]: value } : x)));
  const removeOtraActividad = (i) => setOtrasActividades((a) => a.filter((_, idx) => idx !== i));

  const addCurso = () => setCursos((c) => [...c, { curso: '', avance: '', horas: '', comentarios: '' }]);
  const updateCurso = (i, field, value) => setCursos((c) => c.map((x, idx) => (idx === i ? { ...x, [field]: value } : x)));
  const removeCurso = (i) => setCursos((c) => c.filter((_, idx) => idx !== i));

  const saveBecario = async (submit) => {
    setSaving(true);
    setError('');
    try {
      const { data: updated } = await api.put(`/calendar-activities/${activityId}/report`, {
        resumenSemana, otrasActividades, cursos, autoevaluacion, submit,
      });
      onUpdated?.(updated);
      if (submit) onClose(); else load();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const validate = async () => {
    if (!semaforo) { setError('Elige un semáforo antes de validar'); return; }
    setSaving(true);
    setError('');
    try {
      const criteriosPayload = criterios.map((c) => ({
        criterio: c, calificacion: Number(calificaciones[c]) || null, observaciones: observacionesCriterio[c] || '',
      }));
      const { data: updated } = await api.put(`/calendar-activities/${activityId}/report/validate`, {
        criterios: criteriosPayload, semaforo, comentarioGeneral,
      });
      onUpdated?.(updated);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo validar');
    } finally {
      setSaving(false);
    }
  };

  const estadoLabel = { pendiente: '📝 En borrador', llenado: '📤 Enviado, esperando validación', validado: '✅ Validado' }[report.estado];

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} ${cal.wideModal}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>📋</span>
          <span className={styles.modalTitle}>Reporte semanal — {activity.title}</span>
          <button type="button" className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          <p className={styles.modalHint}>
            Semana del {fmtDate(metrics?.ventana?.start)} al {fmtDate(metrics?.ventana?.end)} — {estadoLabel}
            {report.enviadoAt && <> · Enviado {fmtDateTime(report.enviadoAt)} por {report.enviadoPorName}</>}
            {report.validadoAt && <> · Validado {fmtDateTime(report.validadoAt)} por {report.validadoPorName}</>}
          </p>

          {error && <p className={styles.formError}>{error}</p>}

          {/* 1. Resumen */}
          <div className={cal.reportSection}>
            <p className={cal.reportSectionTitle}>1. Resumen de la semana</p>
            {becarioEditable ? (
              <textarea className={styles.input} rows={8} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} value={resumenSemana} onChange={(e) => setResumenSemana(e.target.value)} placeholder="¿Qué tanto trabajo hubo, hubo algún imprevisto, cómo va todo?" />
            ) : (
              <p style={{ margin: 0 }}>{resumenSemana || '—'}</p>
            )}
          </div>

          {/* 2 y 3. Tickets + indicadores — calculados solos */}
          <div className={cal.reportSection}>
            <p className={cal.reportSectionTitle}>2. Tickets atendidos e indicadores (calculado automáticamente)</p>
            {!metrics ? <p className={styles.empty}>Sin becario asignado todavía</p> : (
              <>
                <div className={cal.kpiMini}>
                  <div className={cal.kpiMiniBox}><div className={cal.kpiMiniValue}>{metrics.ticketsAtendidos}</div><div className={cal.kpiMiniLabel}>Atendidos</div></div>
                  <div className={cal.kpiMiniBox}><div className={cal.kpiMiniValue}>{metrics.slaPct ?? '—'}{metrics.slaPct !== null ? '%' : ''}</div><div className={cal.kpiMiniLabel}>Dentro de SLA</div></div>
                  <div className={cal.kpiMiniBox}><div className={cal.kpiMiniValue}>{metrics.calificacionPromedio ?? '—'}</div><div className={cal.kpiMiniLabel}>Calificación prom.</div></div>
                  <div className={cal.kpiMiniBox}><div className={cal.kpiMiniValue}>{metrics.ticketsBajaCalificacion}</div><div className={cal.kpiMiniLabel}>Calif. ≤ 3</div></div>
                  <div className={cal.kpiMiniBox}><div className={cal.kpiMiniValue}>{metrics.ticketsEscalados}</div><div className={cal.kpiMiniLabel}>Escalados</div></div>
                  <div className={cal.kpiMiniBox}><div className={cal.kpiMiniValue}>{metrics.ticketsSinCalificar}</div><div className={cal.kpiMiniLabel}>Sin calificar</div></div>
                </div>
                {metrics.tickets.length === 0 ? <p className={styles.empty}>Sin tickets esta semana</p> : (
                  <table className={cal.miniTable}>
                    <thead><tr><th>Folio</th><th>Solicitante</th><th>SLA</th><th>Calificación</th><th>Estatus</th></tr></thead>
                    <tbody>
                      {metrics.tickets.map((t) => (
                        <tr key={t.folio}>
                          <td>{t.folio}</td>
                          <td>{t.employeeName}</td>
                          <td>{t.dentroDeSla === null ? '—' : (t.dentroDeSla ? '✅' : '❌')}</td>
                          <td>{t.satisfactionRating || '—'}</td>
                          <td>{t.status}{t.escalated ? ' · escalado' : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>

          {/* 4. Otras actividades */}
          <div className={cal.reportSection}>
            <p className={cal.reportSectionTitle}>3. Otras actividades del área</p>
            {becarioEditable ? (
              <>
                {otrasActividades.map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                    <input className={styles.input} style={{ flex: 2 }} placeholder="Actividad" value={a.actividad} onChange={(e) => updateOtraActividad(i, 'actividad', e.target.value)} />
                    <input type="date" className={styles.input} style={{ flex: 1 }} value={a.fecha ? a.fecha.slice(0, 10) : ''} onChange={(e) => updateOtraActividad(i, 'fecha', e.target.value)} />
                    <input className={styles.input} style={{ flex: 1 }} placeholder="Ubicación" value={a.ubicacion} onChange={(e) => updateOtraActividad(i, 'ubicacion', e.target.value)} />
                    <input className={styles.input} style={{ flex: 1 }} placeholder="Tipo" value={a.tipo} onChange={(e) => updateOtraActividad(i, 'tipo', e.target.value)} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.8rem' }}>
                      <input type="checkbox" checked={a.evidencia} onChange={(e) => updateOtraActividad(i, 'evidencia', e.target.checked)} /> Evidencia
                    </label>
                    <button type="button" className={styles.btnLink} onClick={() => removeOtraActividad(i)}>✕</button>
                  </div>
                ))}
                <button type="button" className={styles.btnCancel} onClick={addOtraActividad}>+ Agregar actividad</button>
              </>
            ) : (
              otrasActividades.length === 0 ? <p className={styles.empty}>Sin otras actividades</p> : (
                <table className={cal.miniTable}>
                  <thead><tr><th>Actividad</th><th>Fecha</th><th>Ubicación</th><th>Tipo</th><th>Evidencia</th></tr></thead>
                  <tbody>
                    {otrasActividades.map((a, i) => (
                      <tr key={i}><td>{a.actividad}</td><td>{fmtDate(a.fecha)}</td><td>{a.ubicacion}</td><td>{a.tipo}</td><td>{a.evidencia ? 'Sí' : 'No'}</td></tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>

          {/* 5. Cursos */}
          <div className={cal.reportSection}>
            <p className={cal.reportSectionTitle}>4. Cursos y capacitación</p>
            {becarioEditable ? (
              <>
                {cursos.map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                    <input className={styles.input} style={{ flex: 2 }} placeholder="Curso" value={c.curso} onChange={(e) => updateCurso(i, 'curso', e.target.value)} />
                    <input type="number" className={styles.input} style={{ flex: 1 }} placeholder="Avance %" value={c.avance} onChange={(e) => updateCurso(i, 'avance', e.target.value)} />
                    <input type="number" className={styles.input} style={{ flex: 1 }} placeholder="Horas" value={c.horas} onChange={(e) => updateCurso(i, 'horas', e.target.value)} />
                    <input className={styles.input} style={{ flex: 2 }} placeholder="Comentarios" value={c.comentarios} onChange={(e) => updateCurso(i, 'comentarios', e.target.value)} />
                    <button type="button" className={styles.btnLink} onClick={() => removeCurso(i)}>✕</button>
                  </div>
                ))}
                <button type="button" className={styles.btnCancel} onClick={addCurso}>+ Agregar curso</button>
              </>
            ) : (
              cursos.length === 0 ? <p className={styles.empty}>Sin cursos esta semana</p> : (
                <table className={cal.miniTable}>
                  <thead><tr><th>Curso</th><th>Avance</th><th>Horas</th><th>Comentarios</th></tr></thead>
                  <tbody>
                    {cursos.map((c, i) => <tr key={i}><td>{c.curso}</td><td>{c.avance}%</td><td>{c.horas}</td><td>{c.comentarios}</td></tr>)}
                  </tbody>
                </table>
              )
            )}
          </div>

          {/* 6. Autoevaluación */}
          <div className={cal.reportSection}>
            <p className={cal.reportSectionTitle}>5. Autoevaluación del becario</p>
            {becarioEditable ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div className={styles.field}><label>Logros de la semana</label><textarea className={styles.input} rows={2} value={autoevaluacion.logros} onChange={(e) => setAutoevaluacion({ ...autoevaluacion, logros: e.target.value })} /></div>
                <div className={styles.field}><label>Dificultades encontradas</label><textarea className={styles.input} rows={2} value={autoevaluacion.dificultades} onChange={(e) => setAutoevaluacion({ ...autoevaluacion, dificultades: e.target.value })} /></div>
                <div className={styles.field}><label>Plan para la próxima semana</label><textarea className={styles.input} rows={2} value={autoevaluacion.plan} onChange={(e) => setAutoevaluacion({ ...autoevaluacion, plan: e.target.value })} /></div>
              </div>
            ) : (
              <>
                <p style={{ margin: 0 }}><strong>Logros:</strong> {autoevaluacion.logros || '—'}</p>
                <p style={{ margin: '0.3rem 0 0' }}><strong>Dificultades:</strong> {autoevaluacion.dificultades || '—'}</p>
                <p style={{ margin: '0.3rem 0 0' }}><strong>Plan:</strong> {autoevaluacion.plan || '—'}</p>
              </>
            )}
          </div>

          {becarioEditable && (
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnCancel} onClick={() => saveBecario(false)} disabled={saving}>Guardar borrador</button>
              <button type="button" className={styles.btnPrimary} onClick={() => saveBecario(true)} disabled={saving}>
                {saving ? 'Enviando...' : 'Enviar a validación'}
              </button>
            </div>
          )}

          {/* 7. Evaluación del supervisor — pedido explícito del usuario:
              Miguel debe VER esta sección siempre que pueda validar, no
              solo cuando ya haya algo que evaluar (antes desaparecía por
              completo mientras el becario no enviara su reporte, y Miguel
              creía que no tenía acceso a ella). */}
          {(canValidate || report.estado === 'llenado' || report.estado === 'validado') && (
            <div className={cal.reportSection}>
              <p className={cal.reportSectionTitle}>6. Evaluación del supervisor</p>
              {report.estado === 'pendiente' ? (
                <p className={styles.empty}>El becario todavía no envía este reporte a validación.</p>
              ) : validadorEditable ? (
                <>
                  {criterios.map((c) => (
                    <div key={c} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                      <span style={{ flex: 2, fontSize: '0.85rem' }}>{c}</span>
                      <select className={styles.input} style={{ flex: 0.5 }} value={calificaciones[c] || ''} onChange={(e) => setCalificaciones({ ...calificaciones, [c]: e.target.value })}>
                        <option value="">—</option>
                        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <input className={styles.input} style={{ flex: 2 }} placeholder="Observaciones" value={observacionesCriterio[c] || ''} onChange={(e) => setObservacionesCriterio({ ...observacionesCriterio, [c]: e.target.value })} />
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: '0.5rem', margin: '0.6rem 0' }}>
                    {SEMAFORO_OPTS.map((s) => (
                      <button
                        key={s.key} type="button"
                        className={`${cal.semaforoBtn} ${semaforo === s.key ? `${cal.semaforoBtnActive} ${cal[`semaforo${s.key.charAt(0).toUpperCase()}${s.key.slice(1)}`]}` : ''}`}
                        onClick={() => setSemaforo(s.key)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <textarea className={styles.input} rows={4} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} placeholder="Comentario general (opcional)" value={comentarioGeneral} onChange={(e) => setComentarioGeneral(e.target.value)} />
                  <div className={styles.modalActions}>
                    <button type="button" className={styles.btnPrimary} onClick={validate} disabled={saving}>{saving ? 'Validando...' : '✅ Validar reporte'}</button>
                  </div>
                </>
              ) : (
                <>
                  <table className={cal.miniTable}>
                    <thead><tr><th>Criterio</th><th>Calificación</th><th>Observaciones</th></tr></thead>
                    <tbody>
                      {(report.evaluacionSupervisor?.criterios || []).map((c, i) => (
                        <tr key={i}><td>{c.criterio}</td><td>{c.calificacion || '—'}</td><td>{c.observaciones || '—'}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  {report.evaluacionSupervisor?.semaforo && (
                    <p style={{ fontWeight: 700 }}>
                      Semáforo: {SEMAFORO_OPTS.find((s) => s.key === report.evaluacionSupervisor.semaforo)?.label}
                    </p>
                  )}
                  {report.evaluacionSupervisor?.comentarioGeneral && <p>{report.evaluacionSupervisor.comentarioGeneral}</p>}
                </>
              )}
            </div>
          )}

          {/* Historial de semanas validadas */}
          {activity.reportHistory?.length > 0 && (
            <div className={cal.reportSection}>
              <p className={cal.reportSectionTitle}>Historial de semanas validadas</p>
              <table className={cal.miniTable}>
                <thead><tr><th>Semana de</th><th>Atendidos</th><th>% SLA</th><th>Calif. prom.</th><th>Semáforo</th><th></th></tr></thead>
                <tbody>
                  {activity.reportHistory.slice().reverse().map((h, i) => (
                    <Fragment key={i}>
                      <tr className={cal.historyRow} onClick={() => setExpandedWeek(expandedWeek === i ? null : i)}>
                        <td>{fmtDate(h.weekOf)}</td>
                        <td>{h.metrics?.ticketsAtendidos ?? '—'}</td>
                        <td>{h.metrics?.slaPct ?? '—'}{h.metrics?.slaPct != null ? '%' : ''}</td>
                        <td>{h.metrics?.calificacionPromedio ?? '—'}</td>
                        <td>{SEMAFORO_OPTS.find((s) => s.key === h.evaluacionSupervisor?.semaforo)?.label || '—'}</td>
                        <td>{expandedWeek === i ? '▲' : '▼'}</td>
                      </tr>
                      {expandedWeek === i && (
                        <tr>
                          <td colSpan={6}>
                            <p style={{ margin: '0.3rem 0' }}><strong>Resumen:</strong> {h.resumenSemana || '—'}</p>
                            <p style={{ margin: '0.3rem 0' }}><strong>Comentario del supervisor:</strong> {h.evaluacionSupervisor?.comentarioGeneral || '—'}</p>
                            <p style={{ margin: '0.3rem 0' }}><strong>Validado por:</strong> {h.validadoPorName} — {fmtDateTime(h.validadoAt)}</p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
