// Service Worker básico para suporte PWA KK TUR
const CACHE_NAME = 'kktur-app-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through para requisições da rede
});
