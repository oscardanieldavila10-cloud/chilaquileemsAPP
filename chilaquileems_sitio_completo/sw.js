// Service worker de Chilaquileems
//
// REGLA DE ORO: la app siempre debe mostrar lo más reciente cuando hay internet.
// Por eso usamos "red primero, caché solo como respaldo si no hay señal" — nunca
// al revés. Así evitamos el problema clásico de PWAs que se quedan "atoradas"
// mostrando una versión vieja aunque el dueño ya subió cambios a Netlify.

const CACHE_NAME = 'chilaquileems-v1';
const ARCHIVOS_BASICOS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARCHIVOS_BASICOS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(
        nombres
          .filter((nombre) => nombre !== CACHE_NAME)
          .map((nombre) => caches.delete(nombre))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Solo manejamos peticiones GET propias del sitio; todo lo demás (POST a
  // Supabase, llamadas a WhatsApp, etc.) pasa de largo sin tocarlo.
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((respuestaRed) => {
        // Hubo internet: guardamos copia fresca en caché y la devolvemos.
        const copia = respuestaRed.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copia));
        return respuestaRed;
      })
      .catch(() =>
        // No hay internet: usamos lo último que se guardó en caché.
        caches.match(request).then((respuestaCache) => {
          if (respuestaCache) return respuestaCache;
          if (request.mode === 'navigate') return caches.match('/index.html');
          return Response.error();
        })
      )
  );
});

// ============================================================
// NOTIFICACIONES PUSH — llegan aunque la app esté cerrada o el
// celular bloqueado. El navegador despierta este service worker
// cuando Supabase manda el aviso de un pedido nuevo.
// ============================================================
self.addEventListener('push', (event) => {
  let datos = { title: 'Chilaquileems', body: 'Tienes una actualización.', url: '/admin.html' };
  try {
    if (event.data) datos = { ...datos, ...event.data.json() };
  } catch (e) {
    // Si el mensaje no viene en JSON, usamos el texto plano como cuerpo.
    if (event.data) datos.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(datos.title, {
      body: datos.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: datos.url || '/admin.html' },
      vibrate: [200, 100, 200],
    })
  );
});

// Al tocar la notificación, abre (o enfoca) el panel de administración.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/admin.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((listaClientes) => {
      for (const cliente of listaClientes) {
        if (cliente.url.includes('admin.html') && 'focus' in cliente) return cliente.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
