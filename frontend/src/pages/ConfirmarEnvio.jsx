import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';
// Reutiliza los mismos estilos que las demás páginas públicas (Solicitar
// Cuenta/Ingreso/Recurso) — mismo lenguaje visual, contenido distinto.
import styles from './SolicitarCuenta.module.css';

const STATUS_LABEL = { enviado: 'Enviado', en_transito: 'En tránsito', recibido: 'Recibido' };

// Página pública (sin login, sin sidebar) — el destinatario de un envío
// entre sucursales (que normalmente no tiene cuenta en el sistema) entra
// con el link único que Sistemas le comparte y confirma la recepción él
// mismo, como el tracking de una paquetería.
export default function ConfirmarEnvio() {
  const { token } = useParams();
  const [shipment, setShipment] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [receivedByName, setReceivedByName] = useState('');
  const [receivedNotes, setReceivedNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // Autocompletar por nombre contra Empleados (misma búsqueda pública que
  // usa Solicitar Cuenta/Ingreso/Recurso) — ayuda a que quien confirma la
  // recepción escriba su nombre tal como está registrado, sin adivinar.
  const [nameMatches, setNameMatches] = useState([]);
  const [matchedEmployee, setMatchedEmployee] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchStatus, setSearchStatus] = useState('idle'); // idle | searching | done
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (receivedByName.trim().length < 3) { setNameMatches([]); setSearchStatus('idle'); return; }
    setSearchStatus('searching');
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/employees/public-lookup', { params: { q: receivedByName } });
        setNameMatches(data);
      } catch (_) { setNameMatches([]); }
      setSearchStatus('done');
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [receivedByName]);

  const handleNameChange = (val) => {
    setReceivedByName(val);
    setMatchedEmployee(null);
    setShowDropdown(true);
  };

  const pickEmployee = (emp) => {
    setReceivedByName(emp.name);
    setMatchedEmployee(emp);
    setShowDropdown(false);
  };

  const load = async () => {
    try {
      const { data } = await api.get(`/shipments/public/${token}`);
      setShipment(data);
    } catch (_) {
      setNotFound(true);
    }
  };

  useEffect(() => { load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConfirm = async (e) => {
    e.preventDefault();
    setError('');
    if (!receivedByName.trim()) { setError('Escribe tu nombre para confirmar.'); return; }
    setSubmitting(true);
    try {
      await api.post(`/shipments/public/${token}/confirm`, { receivedByName, receivedNotes });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo confirmar la recepción. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  if (notFound) {
    return (
      <div className={styles.page}>
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
      <div className={styles.page}>
        <div className={styles.card}>
          <p style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>Cargando...</p>
        </div>
      </div>
    );
  }

  if (done || shipment.status === 'recibido') {
    return (
      <div className={styles.page}>
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

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.icon}>📦</span>
          <h1 className={styles.title}>Confirmar recepción de equipo</h1>
          <p className={styles.subtitle}>Folio {shipment.folio} — Sistemas IT & BI</p>
        </div>

        <div className={styles.section}>
          <p className={styles.sectionTitle}>Qué te están mandando</p>
          <p style={{ fontSize: '0.85rem', color: '#333', margin: '0.3rem 0' }}>
            <strong>{shipment.originOffice}</strong> → <strong>{shipment.destinationOffice}</strong>
          </p>
          <p style={{ fontSize: '0.85rem', color: '#333', margin: '0.3rem 0' }}>Para: <strong>{shipment.recipientName}</strong></p>
          <p style={{ fontSize: '0.8rem', color: '#888', margin: '0.3rem 0' }}>Estatus actual: {STATUS_LABEL[shipment.status]}</p>
          <div style={{ marginTop: '0.6rem' }}>
            {shipment.items.map((it, i) => (
              <p key={i} style={{ fontSize: '0.83rem', color: '#333', margin: '0.2rem 0' }}>
                • {it.type} {it.description} {it.serialOrImei && `— ${it.serialOrImei}`}
              </p>
            ))}
          </div>
          {shipment.notes && <p style={{ fontSize: '0.82rem', color: '#666', marginTop: '0.5rem' }}>Observaciones: {shipment.notes}</p>}
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <form onSubmit={handleConfirm}>
          <div className={styles.section}>
            <p className={styles.sectionTitle}>Confirma que ya te llegó</p>
            <div className={styles.field} style={{ position: 'relative' }}>
              <label>Tu nombre *</label>
              <input
                value={receivedByName}
                onChange={(e) => handleNameChange(e.target.value)}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                placeholder="Escribe tu nombre..."
                autoComplete="off"
              />
              {showDropdown && nameMatches.length > 0 && (
                <div className={styles.nameDropdown}>
                  {nameMatches.map((emp) => (
                    <button type="button" key={emp._id} className={styles.nameOption} onClick={() => pickEmployee(emp)}>
                      {emp.name}
                    </button>
                  ))}
                </div>
              )}
              {matchedEmployee && <p className={styles.hint}>✓ Te encontramos en el sistema.</p>}
            </div>
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
