import { useEffect, useState } from 'react';

// Notificaciones push — pedido explícito del usuario (2026-07-24): primero
// para el empleado (Mesa de Ayuda, "no los ven" cuando Sistemas responde),
// ampliado el mismo día para Sistemas también ("que me llegue cuando el
// usuario me contesta"). Ver public/push-sw.js (listeners de
// push/notificationclick), backend/src/routes/pushSubscriptions.js
// (empleado) y adminPushSubscriptions.js (Sistemas).
//
// Recibe `api` (la instancia de axios con el token correcto — `employeeApi`
// o `api`) y las rutas de suscribir/desuscribir, porque hay DOS
// identidades que usan este mismo hook con backends distintos
// (Employee.pushSubscriptions vs User.pushSubscriptions).
//
// Importante: Mesa de Ayuda y Sistema de Tickets comparten el MISMO
// service worker/origen (ver vite.config.js) — el navegador solo tiene UNA
// suscripción de PushManager por origen, no una por identidad. Si alguien
// ya se suscribió del lado empleado y luego abre el panel admin (o
// viceversa), `getSubscription()` va a encontrar esa MISMA suscripción —
// por eso, en vez de asumir que "ya existe = ya está guardada en el
// backend correcto", se vuelve a mandar (POST) cada vez que se detecta,
// para garantizar que ESTA identidad también la tenga guardada. Por el
// mismo motivo, "desactivar" NUNCA hace `subscription.unsubscribe()` (eso
// mataría la suscripción para la OTRA identidad también) — solo borra el
// registro del backend de quien pidió desactivar.
//
// `status` resume los 4 estados que le importan a la UI:
// - 'unsupported': el navegador no tiene PushManager — el caso más común es
//   iPhone/iPad SIN agregar la app a la pantalla de inicio (Safari en
//   pestaña normal no soporta push en absoluto, restricción de Apple).
// - 'denied': la persona ya dijo que no desde el navegador — no hay forma de
//   volver a preguntar desde la app, insistir con un botón sería inútil.
// - 'default': todavía no ha decidido — aquí sí aplica ofrecer el botón.
// - 'subscribed': ya está activo.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function computeStatus(permission) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  if (permission === 'denied') return 'denied';
  if (permission === 'granted') return 'checking'; // falta confirmar si YA hay suscripción guardada
  return 'default';
}

// `skip` (2026-08-05) — para la sesión de "Entrar como empleado"
// (impersonar): esa pestaña comparte el MISMO PushManager/origen que la
// sesión real de Sistemas (ver nota de arriba), así que si este hook
// corriera ahí terminaría registrando el navegador del ADMIN bajo el
// empleado impersonado — el admin se ponía a recibir los push de esa
// persona. Con `skip`, el hook ni siquiera intenta tocar el service
// worker/PushManager mientras dure la impersonación.
export default function usePushSubscription({ api, subscribePath, unsubscribePath, skip = false }) {
  const [status, setStatus] = useState(() => (
    skip ? 'unsupported' : computeStatus(typeof Notification !== 'undefined' ? Notification.permission : 'denied')
  ));

  useEffect(() => {
    if (skip || status !== 'checking') return;
    let cancelled = false;
    navigator.serviceWorker.ready
      .then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        if (sub) return { reg, sub };
        // Sin suscripción pero con permiso ya concedido (es como se llega
        // aquí, ver computeStatus) — pasa cada vez que "Actualizar"
        // desregistra el service worker viejo (necesario para garantizar
        // que sí se vea el contenido nuevo, ver UpdateToast.jsx): eso
        // destruye la suscripción técnica junto con el service worker,
        // aunque el permiso del navegador siga concedido. Bug real
        // reportado por el usuario: "cada que haces actualizar me botas
        // mis notificaciones, siempre tengo que darle al botón de
        // entérate". Se re-suscribe sola, sin pedirle nada a la persona —
        // el navegador no vuelve a preguntar si el permiso ya estaba
        // concedido, así que esto es invisible para quien ya había dicho
        // que sí.
        const newSub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY),
        });
        return { reg, sub: newSub };
      })
      .then(({ sub }) => {
        if (cancelled) return;
        if (sub) {
          // Re-sincroniza silencioso (ver nota arriba) — cubre "ya estaba
          // guardada", "existe por la otra identidad", y "se re-creó sola
          // tras Actualizar".
          api.post(subscribePath, sub.toJSON()).catch(() => {});
          setStatus('subscribed');
        } else {
          setStatus('default');
        }
      })
      .catch(() => { if (!cancelled) setStatus('default'); });
    return () => { cancelled = true; };
  }, [status, api, subscribePath, skip]);

  const subscribe = async () => {
    if (skip) return;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') { setStatus(computeStatus(permission)); return; }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY),
      });
    }
    await api.post(subscribePath, subscription.toJSON());
    setStatus('subscribed');
  };

  const unsubscribe = async () => {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await api.post(unsubscribePath, { endpoint: subscription.endpoint }).catch(() => {});
    }
    setStatus('default');
  };

  return { status, subscribe, unsubscribe };
}
