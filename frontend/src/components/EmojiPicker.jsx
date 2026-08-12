import { useEffect, useRef, useState } from 'react';

// Selector de emojis (2026-08-12, pedido explícito del usuario: "en los
// chats... ¿podamos poner stickers? Emojis, gifs y esas cosas" — se
// empieza solo por emojis, ver conversación) — sin librería externa, un
// set fijo de emojis comunes en una sola categoría, suficiente para un
// chat de soporte interno. Inserta el emoji al final del texto actual.
const EMOJIS = [
  '😀', '😂', '😅', '🙂', '😉', '😍', '🤔', '😐', '😢', '😭',
  '😡', '😱', '👍', '👎', '🙏', '👏', '🙌', '💪', '✅', '❌',
  '⚠️', '🔥', '🎉', '❤️', '💯', '👀', '😴', '🤝', '📌', '⏳',
];

const DEFAULT_POPOVER_STYLE = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  color: '#111',
};

export default function EmojiPicker({ onSelect, popoverStyle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Emoji"
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: '0 0.3rem' }}
      >
        😊
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', bottom: '100%', left: 0, marginBottom: '0.3rem',
            borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.2)', padding: '0.5rem', zIndex: 20,
            display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.15rem', width: '200px',
            ...DEFAULT_POPOVER_STYLE, ...popoverStyle,
          }}
        >
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => { onSelect(e); setOpen(false); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '0.15rem' }}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
