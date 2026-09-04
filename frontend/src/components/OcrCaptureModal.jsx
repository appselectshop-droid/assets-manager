import { useEffect, useRef, useState } from 'react';
import styles from '../pages/Assets.module.css';

// Leer número de serie/modelo con la cámara (OCR) — pedido explícito del
// usuario (2026-09-04): "como con el traductor que lee palabras y las
// traduce, así pero que se jale número de serie y números de modelo". Toma
// una foto de la etiqueta, la procesa con Tesseract.js (100% en el
// navegador, no se sube a ningún servidor) y muestra cada línea reconocida
// como un botón — al tocarlo, se llena el campo que abrió este modal.
export default function OcrCaptureModal({ onSelect, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [photo, setPhoto] = useState(null); // dataURL de la foto tomada
  const [status, setStatus] = useState('camera'); // camera | recognizing | done | error
  const [lines, setLines] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (photo) return; // ya se tomó la foto, no seguir usando la cámara
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setError('No se pudo acceder a la cámara — revisa los permisos del navegador para este sitio.'));
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
  }, [photo]);

  const capture = () => {
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setPhoto(canvas.toDataURL('image/jpeg', 0.92));
    runOcr(canvas.toDataURL('image/jpeg', 0.92));
  };

  const runOcr = async (dataUrl) => {
    setStatus('recognizing');
    setError('');
    try {
      // Import perezoso — Tesseract.js pesa varios MB (motor + datos de
      // idioma), no tiene caso cargarlo hasta que de verdad se use esta
      // función.
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      const { data } = await worker.recognize(dataUrl);
      await worker.terminate();
      const found = (data.text || '')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length >= 3);
      setLines(found);
      setStatus('done');
    } catch (err) {
      setError('No se pudo leer el texto de la foto. Intenta de nuevo con más luz o más de cerca.');
      setStatus('error');
    }
  };

  const retake = () => {
    setPhoto(null);
    setLines([]);
    setStatus('camera');
    setError('');
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>🔤</span>
          <h2 className={styles.modalTitle}>Leer con cámara</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.form}>
          {error && <p className={styles.formError}>{error}</p>}

          {!photo && !error && (
            <>
              <div className={styles.scannerVideoWrap}>
                <video ref={videoRef} autoPlay muted playsInline className={styles.scannerVideo} />
              </div>
              <p className={styles.serialProgress}>Encuadra la etiqueta con el número de serie/modelo bien iluminada.</p>
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
                <button type="button" className={styles.btnPrimary} onClick={capture}>📷 Tomar foto</button>
              </div>
            </>
          )}

          {photo && (
            <>
              <img src={photo} alt="" className={styles.ocrPreview} />
              {status === 'recognizing' && <p className={styles.serialProgress}>Leyendo texto de la foto...</p>}
              {status === 'done' && (
                <>
                  <p className={styles.serialProgress}>
                    {lines.length > 0 ? 'Toca el texto correcto para usarlo:' : 'No se reconoció texto legible en la foto.'}
                  </p>
                  <div className={styles.ocrLines}>
                    {lines.map((line, i) => (
                      <button
                        key={i}
                        type="button"
                        className={styles.ocrLineBtn}
                        onClick={() => { onSelect(line); onClose(); }}
                      >
                        {line}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnCancel} onClick={retake}>🔄 Tomar otra foto</button>
                <button type="button" className={styles.btnPrimary} onClick={onClose}>Cerrar</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
