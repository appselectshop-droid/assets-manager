import styles from './AmbientBackground.module.css';

// Fondo animado del lado de empleado — antes vivía solo en MesaDeAyuda.jsx,
// ahora se monta una sola vez de forma global (ver App.jsx, AmbientBackgroundGate)
// para aparecer en TODAS las páginas de empleado, pedido explícito del
// usuario. Combina las 2 versiones que se probaron: las manchas de color
// difuminadas (los "colorcitos") de la primera versión + los íconos del
// tema de soporte cayendo de la segunda — ambos en bucle infinito, puro
// CSS (sin JS), nunca se detienen ni necesitan refrescar la pestaña.
//
// Mezcla de íconos pensada para que no se vea "gris" — varios (laptop,
// impresora, celular, mouse) son de por sí grises/oscuros en la mayoría de
// las fuentes de emoji, así que se balancean con más íconos de color
// (llave, campana, foco, diadema, check, ticket).
const FALLING_ICONS = [
  { icon: '🎫', left: 4,  size: 1.5, duration: 19, delay: -3  },
  { icon: '🔑', left: 12, size: 1.2, duration: 23, delay: -14 },
  { icon: '🎧', left: 20, size: 1.6, duration: 27, delay: -8  },
  { icon: '💡', left: 29, size: 1.3, duration: 17, delay: -1  },
  { icon: '🔔', left: 37, size: 1.4, duration: 24, delay: -19 },
  { icon: '📧', left: 46, size: 1.2, duration: 20, delay: -11 },
  { icon: '💻', left: 54, size: 1.4, duration: 22, delay: -5  },
  { icon: '✅', left: 62, size: 1.2, duration: 18, delay: -16 },
  { icon: '🔑', left: 70, size: 1.3, duration: 25, delay: -9  },
  { icon: '🎫', left: 78, size: 1.4, duration: 21, delay: -2  },
  { icon: '💡', left: 86, size: 1.2, duration: 19, delay: -13 },
  { icon: '🔧', left: 93, size: 1.3, duration: 26, delay: -6  },
  { icon: '🔔', left: 17, size: 1.1, duration: 23, delay: -20 },
  { icon: '🖨️', left: 60, size: 1.1, duration: 20, delay: -17 },
  { icon: '🎧', left: 82, size: 1.5, duration: 18, delay: -10 },
  { icon: '✅', left: 41, size: 1.1, duration: 25, delay: -4  },
];

export default function AmbientBackground() {
  return (
    // `portalDark` propio: se monta en App.jsx fuera de cualquier
    // `.portalDark` de página — sin esta clase aquí mismo, las variables
    // --p-* (portal-theme.css) no resuelven y las manchas de color no se
    // ven (mismo bug ya encontrado y arreglado antes en HelpBot.jsx).
    <div className={`portalDark ${styles.ambientBg}`} aria-hidden="true">
      <span className={`${styles.ambientBlob} ${styles.ambientBlobOrange}`} />
      <span className={`${styles.ambientBlob} ${styles.ambientBlobBlue}`} />
      <span className={`${styles.ambientBlob} ${styles.ambientBlobGreen}`} />
      {FALLING_ICONS.map((it, i) => (
        <span
          key={i}
          className={styles.fallingIcon}
          style={{
            left: `${it.left}%`,
            fontSize: `${it.size}rem`,
            animationDuration: `${it.duration}s`,
            animationDelay: `${it.delay}s`,
          }}
        >
          {it.icon}
        </span>
      ))}
    </div>
  );
}
