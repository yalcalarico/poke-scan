import styles from './scanner.module.css';

/** Dibujo editorial local: no representa una lectura ni una carta del catálogo. */
export function ScannerIllustration() {
  return <>
    <div className={styles.guide} aria-hidden="true" />
    <div className={styles.cardBase} aria-hidden="true">
      <div className={styles.illustration}>
        <span className={styles.cardLabel}>Encuadre</span>
        <svg viewBox="0 0 200 200" fill="none" aria-hidden="true">
          <circle cx="100" cy="100" r="84" stroke="currentColor" />
          <circle cx="100" cy="100" r="68" stroke="currentColor" strokeDasharray="2 8" />
          <path d="m110 24-52 81h40l-12 72 62-97h-44z" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className={styles.cardFoot}><span>Rayo<br />Estudio visual</span><span>✧</span></span>
      </div>
    </div>
    <p className={styles.caption}>Encuadre ilustrado · Cámara apagada</p>
  </>;
}
