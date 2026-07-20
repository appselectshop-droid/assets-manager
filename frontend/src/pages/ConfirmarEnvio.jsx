import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';
// Reutiliza los mismos estilos que las demás páginas públicas (Solicitar
// Cuenta/Ingreso/Recurso) — mismo lenguaje visual, contenido distinto.
import styles from './SolicitarCuenta.module.css';

const STATUS_LABEL = { enviado: 'Enviado', en_transito: 'En tránsito', recibido: 'Recibido' };

// Autocompletar por nombre contra Empleados (misma búsqueda pública que usa
// Solicitar Cuenta/Ingreso/Recurso) — se usa dos veces en esta página (quien
// marca el envío en tránsito y quien confirma la recepción), cada una con su
// propio estado independiente.
function useNameAutocomplete() {
  const [name, setName] = useState('');
  const [matches, setMatches] = useState([]);
  const [matched, setMatched] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchStatus, setSearchStatus] = useState('idle'); // idle | searching | done
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (name.trim().length < 3) { setMatches([]); setSearchStatus('idle'); return; }
    setSearchStatus('searching');
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/employees/public-lookup', { params: { q: name } });
        setMatches(data);
      } catch (_) { setMatches([]); }
      setSearchStatus('done');
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [name]);

  const handleChange = (val) => { setName(val); setMatched(null); setShowDropdown(true); };
  const pick = (emp) => { setName(emp.name); setMatched(emp); setShowDropdown(false); };

  return { name, matches, matched, showDropdown, setShowDropdown, handleChange, pick };
}

function NameField({ auto, label }) {
  return (
    <div className={styles.field} style={{ position: 'relative' }}>
      <label>{label}</label>
      <input
        value={auto.name}
        onChange={(e) => auto.handleChange(e.target.value)}
        onFocus={() => auto.setShowDropdown(true)}
        onBlur={() => setTimeout(() => auto.setShowDropdown(false), 150)}
        placeholder="Escribe tu nombre..."
        autoComplete="off"
      />
      {auto.showDropdown && auto.matches.length > 0 && (
        <div className={styles.nameDropdown}>
          {auto.matches.map((emp) => (
            <button type="button" key={emp._id} className={styles.nameOption} onClick={() => auto.pick(emp)}>
              {emp.name}
            </button>
          ))}
        </div>
      )}
      {auto.matched && <p className={styles.hint}>✓ Te encontramos en el sistema.</p>}
    </div>
  );
}

// Página pública (sin login, sin sidebar) — un solo link para seguir un envío
// entre sucursales de punta a punta: el mensajero lo abre para marcarlo en
// tránsito sin meterse a la app, y el destinatario (normalmente sin cuenta en
// el sistema) lo abre después para confirmar la recepción — el mismo link se
// adapta según el estatus en el que esté el envío en cada momento.
export default function ConfirmarEnvio() {
  const { token } = useParams();
  const [shipment, setShipment] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [receivedNotes, setReceivedNotes] = useState('');
  const [signatureFile, setSignatureFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [transitDone, setTransitDone] = useState(false);

  // Subir la firma en un envío que YA se confirmó antes (pedido explícito:
  // habilitarlo retroactivo, sin esperar a un envío nuevo) — independiente
  // del flujo normal de arriba, usa su propio endpoint (`/signature`) porque
  // `/confirm` ya no acepta nada una vez que el envío quedó "recibido".
  const [retroSignatureFile, setRetroSignatureFile] = useState(null);
  const [retroSubmitting, setRetroSubmitting] = useState(false);
  const [retroError, setRetroError] = useState('');
  const [retroDone, setRetroDone] = useState(false);

  const receiveAuto = useNameAutocomplete();
  const transitAuto = useNameAutocomplete();

  const load = async () => {
    try {
      const { data } = await api.get(`/shipments/public/${token}`);
      setShipment(data);
    } catch (_) {
      setNotFound(true);
    }
  };

  useEffect(() => { load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTransit = async (e) => {
    e.preventDefault();
    setError('');
    if (!transitAuto.name.trim()) { setError('Escribe tu nombre para marcar el envío en tránsito.'); return; }
    setSubmitting(true);
    try {
      const { data } = await api.post(`/shipments/public/${token}/transit`, { transitByName: transitAuto.name });
      setShipment(data);
      setTransitDone(true);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo marcar el envío en tránsito. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  // Solo se ofrece cuando el backend dice que hace falta (hoy únicamente
  // para Felipe, y solo si todavía no tiene una firma guardada) — ver
  // `needsSignatureUpload` en GET /shipments/public/:token.
  const handleSignatureFileChange = (e) => {
    const f = e.target.files[0];
    if (f && f.size > 8 * 1024 * 1024) {
      setError('La foto no puede pesar más de 8MB.');
      e.target.value = '';
      return;
    }
    setSignatureFile(f || null);
  };

  const handleConfirm = async (e) => {
    e.preventDefault();
    setError('');
    if (!receiveAuto.name.trim()) { setError('Escribe tu nombre para confirmar.'); return; }
    setSubmitting(true);
    try {
      const data = new FormData();
      data.append('receivedByName', receiveAuto.name);
      data.append('receivedNotes', receivedNotes);
      if (signatureFile) data.append('signatureImage', signatureFile);
      await api.post(`/shipments/public/${token}/confirm`, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo confirmar la recepción. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetroSignatureFileChange = (e) => {
    const f = e.target.files[0];
    if (f && f.size > 8 * 1024 * 1024) {
      setRetroError('La foto no puede pesar más de 8MB.');
      e.target.value = '';
      return;
    }
    setRetroSignatureFile(f || null);
  };

  const handleRetroSignatureSubmit = async (e) => {
    e.preventDefault();
    setRetroError('');
    if (!retroSignatureFile) { setRetroError('Selecciona la foto de tu hoja firmada.'); return; }
    setRetroSubmitting(true);
    try {
      const data = new FormData();
      data.append('signatureImage', retroSignatureFile);
      await api.post(`/shipments/public/${token}/signature`, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setRetroDone(true);
    } catch (err) {
      setRetroError(err.response?.data?.message || 'No se pudo guardar la firma. Intenta de nuevo.');
    } finally {
      setRetroSubmitting(false);
    }
  };

  if (notFound) {
    return (
      <div className={`portalDark ${styles.page}`}>
        <div className={`${styles.card} ${styles.loginCardNarrow}`}>
          <div className={styles.header}>
            <span className={styles.icon}>📦</span>
            <h1 className={styles.title}>Envío no encontrado</h1>
            <p className={styles.subtitle}>Este link no corresponde a ningún envío — verifica que esté completo.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className={`portalDark ${styles.page}`}>
        <div className={`${styles.card} ${styles.loginCardNarrow}`}>
          <p className={styles.detailSub} style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</p>
        </div>
      </div>
    );
  }

  if (done || shipment.status === 'recibido') {
    return (
      <div className={`portalDark ${styles.page}`}>
        <div className={`${styles.card} ${styles.loginCardNarrow}`}>
          <div className={styles.successBox}>
            <span className={styles.successIcon}>✅</span>
            <h1 className={styles.successTitle}>Recepción confirmada</h1>
            <p className={styles.successText}>
              {done
                ? 'Gracias — quedó registrado que recibiste el envío.'
                : `Este envío ya fue confirmado como recibido por ${shipment.receivedByName}.`}
            </p>
          </div>

          {/* Habilitado a propósito aunque el envío ya esté "recibido" — pedido
              explícito: capturar la firma de Felipe en un envío ya hecho, sin
              esperar a uno nuevo. `needsSignatureUpload` sigue siendo verdadero
              aquí porque no depende del estatus, solo de si ya tiene firma. */}
          {shipment.needsSignatureUpload && !retroDone && (
            <div className={styles.section} style={{ marginTop: '1.25rem' }}>
              <p className={styles.sectionTitle}>Sube tu firma (para tus próximos envíos)</p>
              <p className={styles.detailSub}>
                Todavía no tenemos tu firma guardada. Súbela aquí una sola vez y, de
                ahí en adelante, tus próximos envíos ya saldrán firmados — sin volver
                a pedírtela.
              </p>
              {retroError && <p className={styles.error}>{retroError}</p>}
              <form onSubmit={handleRetroSignatureSubmit}>
                <div className={styles.field}>
                  <label>Foto de tu hoja de recepción firmada</label>
                  <input type="file" accept="image/jpeg,image/png" onChange={handleRetroSignatureFileChange} />
                </div>
                <button type="submit" className={styles.submitBtn} disabled={retroSubmitting}>
                  {retroSubmitting ? 'Guardando...' : 'Guardar firma'}
                </button>
              </form>
            </div>
          )}
          {retroDone && (
            <p className={styles.hint} style={{ marginTop: '1.25rem', textAlign: 'center' }}>
              ✓ Firma guardada — tus próximos envíos ya saldrán firmados.
            </p>
          )}
        </div>
      </div>
    );
  }

  const detailBlock = (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Qué se está enviando</p>
      <p className={styles.detailText}>
        <strong>{shipment.originOffice}</strong> → <strong>{shipment.destinationOffice}</strong>
      </p>
      <p className={styles.detailText}>Para: <strong>{shipment.recipientName}</strong></p>
      <p className={styles.detailSub}>Estatus actual: {STATUS_LABEL[shipment.status]}</p>
      <div style={{ marginTop: '0.6rem' }}>
        {shipment.items.map((it, i) => (
          <p key={i} className={styles.detailItem}>
            • {it.type} {it.description} {it.serialOrImei && `— ${it.serialOrImei}`}
          </p>
        ))}
      </div>
      {shipment.notes && <p className={styles.detailNote}>Observaciones: {shipment.notes}</p>}
    </div>
  );

  // Enviado y aún no marcado en tránsito en esta misma sesión: el mensajero
  // ve el paso de "marcar en tránsito" en vez del de confirmar recepción.
  if (shipment.status === 'enviado' && !transitDone) {
    return (
      <div className={`portalDark ${styles.page}`}>
        <div className={`${styles.card} ${styles.loginCardNarrow}`}>
          <div className={styles.header}>
            <span className={styles.icon}>🚚</span>
            <h1 className={styles.title}>Marcar envío en tránsito</h1>
            <p className={styles.subtitle}>Folio {shipment.folio} — Sistemas IT & BI</p>
          </div>

          {detailBlock}

          {error && <p className={styles.error}>{error}</p>}

          <form onSubmit={handleTransit}>
            <div className={styles.section}>
              <p className={styles.sectionTitle}>Confirma que ya recogiste / vas en camino</p>
              <NameField auto={transitAuto} label="Tu nombre *" />
            </div>
            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? 'Marcando...' : 'Marcar en tránsito'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`portalDark ${styles.page}`}>
      <div className={`${styles.card} ${styles.loginCardNarrow}`}>
        <div className={styles.header}>
          <span className={styles.icon}>📦</span>
          <h1 className={styles.title}>Confirmar recepción de equipo</h1>
          <p className={styles.subtitle}>Folio {shipment.folio} — Sistemas IT & BI</p>
        </div>

        {detailBlock}

        {error && <p className={styles.error}>{error}</p>}

        <form onSubmit={handleConfirm}>
          <div className={styles.section}>
            <p className={styles.sectionTitle}>Confirma que ya te llegó</p>
            <NameField auto={receiveAuto} label="Tu nombre *" />
            <div className={styles.field}>
              <label>Notas (opcional)</label>
              <textarea value={receivedNotes} onChange={(e) => setReceivedNotes(e.target.value)} placeholder="Ej. llegó completo, faltó un cargador..." />
            </div>
            {shipment.needsSignatureUpload && (
              <div className={styles.field}>
                <label>Sube tu firma (foto de tu hoja de recepción firmada)</label>
                <p className={styles.hint} style={{ marginBottom: '0.4rem' }}>
                  Solo hace falta una vez — a partir de ahí, tus próximos envíos ya la incluyen solos en el PDF, sin volver a pedírtela.
                </p>
                <input type="file" accept="image/jpeg,image/png" onChange={handleSignatureFileChange} />
              </div>
            )}
          </div>
          <button type="submit" className={styles.submitBtn} disabled={submitting}>
            {submitting ? 'Confirmando...' : 'Confirmar recepción'}
          </button>
        </form>
      </div>
    </div>
  );
}
