import styles from './RobotMascot.module.css';

// Robot de cuerpo completo, dibujado en SVG (no una imagen ni un GIF) —
// pedido explícito del usuario: "puedes poner un robot de cuerpo completo
// animado? que salude con la mano". Vive DE FONDO dentro del panel del
// Robot de Ayuda (ver HelpBot.jsx/.module.css: `position:absolute` +
// `z-index:-1` dentro de `.panel`), no como una franja aparte — el
// usuario mandó una captura marcando que lo quería detrás de los mensajes,
// en el espacio vacío. Mismo criterio que el resto del bot: 100% CSS
// (@keyframes infinite), sin JS ni librería de animación — nunca se
// detiene ni necesita refrescar la pestaña.
//
// El cuerpo (x 38–102) es más angosto que la cabeza (x 28–112) a propósito
// — así los hombros (x 32 y x 108) quedan FUERA de la silueta del cuerpo y
// los brazos se ven de verdad "saliendo" de los costados, en vez de
// quedar tapados debajo del torso (bug real del primer intento: los
// hombros caían dentro del rectángulo del cuerpo, que se dibujaba encima).
export default function RobotMascot() {
  return (
    <div className={styles.wrap} aria-hidden="true">
      <svg viewBox="0 0 140 170" className={styles.svg}>
        <g className={styles.bob}>
          {/* Sombra en el piso — ancla visualmente al robot, ayuda a
              vender el efecto de que "flota"/respira con el bob. */}
          <ellipse className={styles.shadow} cx="70" cy="158" rx="34" ry="7" />

          {/* Pies */}
          <rect x="52" y="130" width="14" height="20" rx="6" className={styles.limb} />
          <rect x="74" y="130" width="14" height="20" rx="6" className={styles.limb} />

          {/* Cuerpo */}
          <rect x="38" y="80" width="64" height="54" rx="16" className={styles.body} />
          <circle cx="70" cy="105" r="9" className={styles.chestLight} />
          <circle cx="70" cy="105" r="3.5" className={styles.chestLightCore} />

          {/* Cuello */}
          <rect x="58" y="66" width="24" height="16" rx="4" className={styles.neck} />

          {/* Cabeza */}
          <rect x="28" y="16" width="84" height="56" rx="22" className={styles.head} />

          {/* Antena */}
          <line x1="70" y1="16" x2="70" y2="2" className={styles.antennaStem} />
          <circle cx="70" cy="2" r="5" className={styles.antennaTip} />

          {/* Ojos (parpadean) */}
          <g className={styles.eyes}>
            <circle cx="53" cy="44" r="8" className={styles.eye} />
            <circle cx="87" cy="44" r="8" className={styles.eye} />
          </g>

          {/* Boca — rejilla tipo bocina, amigable */}
          <rect x="61" y="60" width="4" height="7" rx="2" className={styles.mouthDot} />
          <rect x="68" y="60" width="4" height="7" rx="2" className={styles.mouthDot} />
          <rect x="75" y="60" width="4" height="7" rx="2" className={styles.mouthDot} />

          {/* Brazo izquierdo (en reposo, quieto) — hombro FUERA del
              cuerpo (x=32, cuerpo empieza en x=38) */}
          <g transform="translate(32,92) rotate(-20)">
            <rect x="-6" y="0" width="12" height="36" rx="6" className={styles.limb} />
            <circle cx="0" cy="38" r="7" className={styles.hand} />
          </g>

          {/* Brazo derecho — el que saluda. Hombro FUERA del cuerpo
              (x=108, cuerpo termina en x=102). Dibujado al final para
              quedar siempre por encima de cualquier otra forma. */}
          <g transform="translate(108,90)">
            <g className={styles.armWave}>
              <rect x="-6" y="0" width="12" height="36" rx="6" className={styles.limb} />
              <circle cx="0" cy="38" r="8" className={styles.hand} />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
