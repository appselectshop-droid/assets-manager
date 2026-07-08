import { useState } from 'react';
import styles from './PublicLinkBanner.module.css';

// Recordatorio del link público que hay que compartir para llegar a esta
// bandeja — para no tener que buscarlo/memorizarlo cada vez.
export default function PublicLinkBanner({ path }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}${path}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (_) {
      // Portapapeles bloqueado por el navegador — el link ya está visible para copiarlo a mano.
    }
  };

  return (
    <div className={styles.banner}>
      <span className={styles.label}>🔗 Link para compartir:</span>
      <code className={styles.url}>{url}</code>
      <button type="button" className={styles.btnCopy} onClick={copy}>
        {copied ? '✓ Copiado' : 'Copiar'}
      </button>
    </div>
  );
}
