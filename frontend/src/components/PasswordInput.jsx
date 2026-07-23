import { useState } from 'react';
import styles from './PasswordInput.module.css';

// Botón de "mostrar contraseña" — pedido explícito del usuario, sobre todo
// para cuando alguien crea su contraseña la primera vez (EmployeeLoginWidget,
// paso "activate"): sin poder ver lo que escribió, un error de dedo ahí
// mismo (que además pide escribirla 2 veces) es fácil y frustrante de
// diagnosticar. Envuelve el <input> en un wrapper propio con position:
// relative — el CSS de cada página que ya apunta a ".field input" (selector
// descendiente, no depende de que el input sea hijo DIRECTO) lo sigue
// pintando igual, este componente no necesita conocer esas clases.
export default function PasswordInput({ value, onChange, ...rest }) {
  const [show, setShow] = useState(false);
  return (
    <div className={styles.wrapper}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        style={{ paddingRight: '2.4rem' }}
        {...rest}
      />
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        // No debe robarle el foco al input mientras se escribe.
        tabIndex={-1}
      >
        {show ? '🙈' : '👁️'}
      </button>
    </div>
  );
}
