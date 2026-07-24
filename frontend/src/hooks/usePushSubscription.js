import { useEffect, useState } from 'react';
import employeeApi from '../services/employeeApi';

// Notificaciones push del portal — pedido explícito del usuario
// (2026-07-24): que le llegue un aviso tipo WhatsApp cuando Sistemas
// responde su ticket, sin tener que tener la pestaña abierta. Ver
// public/push-sw.js (listeners de push/notificationclick) y
// backend/src/routes/pushSubscriptions.js.
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

export default function usePushSubscription() {
  const [status, setStatus] = useState(() => computeStatus(typeof Notification !== 'undefined' ? Notification.permission : 'denied'));

  useEffect(() => {
    if (status !== 'checking') return;
    let cancelled = false;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => { if (!cancelled) setStatus(sub ? 'subscribed' : 'default'); })
      .catch(() => { if (!cancelled) setStatus('default'); });
    return () => { cancelled = true; };
  }, [status]);

  const subscribe = async () => {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') { setStatus(computeStatus(permission)); return; }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY),
    });
    await employeeApi.post('/push-subscriptions', subscription.toJSON());
    setStatus('subscribed');
  };

  const unsubscribe = async () => {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await employeeApi.post('/push-subscriptions/unsubscribe', { endpoint: subscription.endpoint }).catch(() => {});
      await subscription.unsubscribe();
    }
    setStatus('default');
  };

  return { status, subscribe, unsubscribe };
}
