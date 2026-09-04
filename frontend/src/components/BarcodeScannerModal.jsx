import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import styles from '../pages/Assets.module.css';

// Escanear código de barras/QR con la cámara de la tablet — pedido explícito
// del usuario (2026-09-04): "con el escáner vamos a inventariar los códigos
// de barra", para cuando no hay un lector físico USB/Bluetooth a la mano.
// Se queda abierto y sigue decodificando mientras el usuario apunta la
// cámara a distintas piezas, avisando cada código nuevo — mismo criterio que
// un lector físico (dispara onDetect por cada código, uno tras otro).
export default function BarcodeScannerModal({ onDetect, onClose }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const lastCodeRef = useRef({ text: '', at: 0 });
  const [error, setError] = useState('');
  const [count, setCount] = useState(0);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let cancelled = false;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (!result || cancelled) return;
        const text = result.getText();
        const now = Date.now();
        // Evita contar el mismo código varias veces seguidas mientras la
        // cámara lo sigue viendo (decodifica varias veces por segundo).
        if (text === lastCodeRef.current.text && now - lastCodeRef.current.at < 2000) return;
        lastCodeRef.current = { text, at: now };
        setCount((c) => c + 1);
        onDetect(text);
      })
      .then((controls) => { controlsRef.current = controls; })
      .catch((err) => {
        setError(
          err?.name === 'NotAllowedError'
            ? 'No se pudo acceder a la cámara — revisa los permisos del navegador para este sitio.'
            : 'No se pudo abrir la cámara en este dispositivo.'
        );
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>📷</span>
          <h2 className={styles.modalTitle}>Escanear código de barras</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.form}>
          {error ? (
            <p className={styles.formError}>{error}</p>
          ) : (
            <>
              <div className={styles.scannerVideoWrap}>
                <video ref={videoRef} className={styles.scannerVideo} muted playsInline />
                <div className={styles.scannerFrame} />
              </div>
              <p className={styles.serialProgress}>
                Apunta la cámara al código de barras — {count} código{count !== 1 ? 's' : ''} capturado{count !== 1 ? 's' : ''} hasta ahora.
              </p>
            </>
          )}
          <div className={styles.modalActions}>
            <button type="button" className={styles.btnPrimary} onClick={onClose}>Listo</button>
          </div>
        </div>
      </div>
    </div>
  );
}
