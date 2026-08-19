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
    date: '2026-08-18',
    text: 'Si reportas un ticket con una imagen adjunta y tu conexión está lenta, ahora te avisamos y lo volvemos a intentar solo, en vez de que se quede pensando o falle sin explicación.',
  },
  {
    date: '2026-08-18',
    text: 'Si tu Solicitud de Cuenta en realidad era un problema técnico, Sistemas puede moverla a Tickets para atenderla mejor ahí — verás un aviso amarillo en "Mis Tickets" si esto pasó con la tuya.',
  },
  {
    date: '2026-08-17',
    text: 'Las responsivas y tus solicitudes en PDF ya no se descargan solas — ahora se abren en una ventana donde las puedes ver o imprimir directo, igual que en el navegador.',
  },
  {
    date: '2026-08-14',
    text: 'Cuando confirmes la entrega de un envío desde "Mis Solicitudes", ya puedes descargar ahí mismo el PDF de recepción.',
  },
  {
    date: '2026-08-13',
    text: 'Si te aprueban una Solicitud de Software o Licencia, "Mis Solicitudes" ahora te abre directo el chat del ticket de instalación, con el folio siempre visible.',
  },
  {
    date: '2026-08-12',
    text: 'Los chats de Tickets y de Mesa de Ayuda ya tienen selector de emojis 😊.',
  },
  {
    date: '2026-08-11',
    text: 'Si tu ticket se queda esperando tu respuesta mucho tiempo sin que contestes, Sistemas te avisa antes de cerrarlo por abandono.',
  },
  {
    date: '2026-08-07',
    text: 'Ya puedes pegar una imagen directo con Ctrl+V en el chat de tus tickets, sin tener que guardarla primero.',
  },
  {
    date: '2026-08-07',
    text: 'Antes de mandar una imagen en el chat, ahora ves una miniatura para confirmar que es la correcta.',
  },
  {
    date: '2026-08-04',
    text: 'Si Sistemas deja una actualización sobre tu ticket que no es parte del chat, ahora te llega una notificación de todos modos.',
  },
  {
    date: '2026-08-03',
    text: 'Cuando te aprueban una solicitud de cuenta (Gmail, Plataformas o ERP), a veces Sistemas necesita coordinar algo contigo antes de dejarla lista (por ejemplo, tu AnyDesk) — ahora puedes platicar con ellos directo desde "Mis Solicitudes".',
  },
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
