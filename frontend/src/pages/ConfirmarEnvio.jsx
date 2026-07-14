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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [transitDone, setTransitDone] = useState(false);

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

  const handleConfirm = async (e) => {
    e.preventDefault();
    setError('');
    if (!receiveAuto.name.trim()) { setError('Escribe tu nombre para confirmar.'); return; }
    setSubmitting(true);
    try {
      await api.post(`/shipments/public/${token}/confirm`, { receivedByName: receiveAuto.name, receivedNotes });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo confirmar la recepción. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  if (notFound) {
    return (
      <div className={`portalDark ${styles.page}`}>
        <div className={styles.card}>
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
        <div className={styles.card}>
          <p className={styles.detailSub} style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</p>
        </div>
      </div>
    );
  }

  if (done || shipment.status === 'recibido') {
    return (
      <div className={`portalDark ${styles.page}`}>
        <div className={styles.card}>
          <div className={styles.successBox}>
            <span className={styles.successIcon}>✅</span>
            <h1 className={styles.successTitle}>Recepción confirmada</h1>
            <p className={styles.successText}>
              {done
                ? 'Gracias — quedó registrado que recibiste el envío.'
                : `Este envío ya fue confirmado como recibido por ${shipment.receivedByName}.`}
            </p>
          </div>
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
        <div className={styles.card}>
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
      <div className={styles.card}>
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
          </div>
          <button type="submit" className={styles.submitBtn} disabled={submitting}>
            {submitting ? 'Confirmando...' : 'Confirmar recepción'}
          </button>
        </form>
      </div>
    </div>
  );
}
