// "¿Qué novedad hay?" — lista curada de mejoras para contarle al empleado
// vía Click (components/HelpBot.jsx), NO es el CHANGELOG.md técnico del
// repo. Pedido explícito del usuario (2026-07-29): cuando alguien vea el
// aviso de "Actualiza la página" (ver ManualMesaDeAyuda) y le pregunte a
// Click qué cambió, que conteste con cosas que de verdad le importan a
// quien reporta (una app nueva, una función nueva) — NO con detalle de
// desarrollo (cambios de color, tamaño, ajustes visuales sueltos), esos se
// resumen genérico como "ajustes de diseño" en vez de listarlos uno por
// uno.
//
// Mantenimiento: cada vez que se lance un cambio visible para el empleado,
// agregar una entrada aquí (la más reciente primero) — mismo criterio que
// CHANGELOG.md, pero en lenguaje de usuario, no técnico. Si el cambio es
// puramente estético/interno (colores, tamaños, reordenar algo), NO se
// agrega su propia entrada — se junta en la próxima entrada genérica de
// "ajustes de diseño" en vez de generar ruido.
export const WHATS_NEW = [
  {
    date: '2026-07-28',
    text: 'Se agregó "Worky" (RH y Nómina) a las aplicaciones que puedes reportar.',
  },
  {
    date: '2026-07-28',
    text: 'Click ahora también te ayuda a instalar la app — pregúntale "¿cómo instalo la aplicación?" y te manda el video según tu dispositivo.',
  },
  {
    date: '2026-07-28',
    text: 'Cuando cierras un ticket resuelto, ahora es necesario calificarlo para que quede por completo cerrado — te avisa un punto en "Mis tickets" si te falta.',
  },
  {
    date: '2026-07-28',
    text: 'Ajustes de diseño y estética en varias pantallas, para que se vea más claro.',
  },
];
