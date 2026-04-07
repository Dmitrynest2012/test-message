const CACHE_NAME = 'my-site-v1';

// 1. Список "ядра" сайта для предварительного кэширования
const ASSETS = [
  './',                          // Текущая папка (вместо '/')
  'index.html',                  // Убрали '/' в начале
  'styles.css',
  'script.js',
  'time.js',
  'data.js',
  'config.js',
  'settings.js',
  'xlsx.full.min.js',
  'message_love.ico',
  'data-message.xlsx',
  'img/message-base-1.png',      // Относительный путь к картинке
  'img/message-random-1.jpg',
  'music/in_message_music.mp3',
  'quatrains_about_the_message.xlsx'
];


// Список Excel-файлов с особой логикой (всегда сеть, если она есть)
const EXCEL_FILES = ['data-message.xlsx', 'quatrains_about_the_message.xlsx'];
const ONE_DAY = 24 * 60 * 60 * 1000; // 24 часа в миллисекундах

// Установка: Кэшируем всё из списка ASSETS
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Кэширование базовых ресурсов при установке');
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Активация: Удаление старых версий кэша
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => key !== CACHE_NAME ? caches.delete(key) : null)
    ))
  );
});

// Обработка запросов (Fetch)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isExcel = EXCEL_FILES.some(path => url.pathname.endsWith(path));

  // --- ЛОГИКА ДЛЯ EXCEL ФАЙЛОВ ---
  if (isExcel) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(event.request);

        try {
          // Если есть сеть — ВСЕГДА идем на сервер за свежим файлом
          const networkResponse = await fetch(event.request);

          if (networkResponse.ok) {
            const now = Date.now();
            const lastChecked = cachedResponse ? parseInt(cachedResponse.headers.get('date-cached') || 0) : 0;

            // Обновляем копию в кэше только если прошло более 24 часов
            if (!cachedResponse || (now - lastChecked > ONE_DAY)) {
              console.log(`[SW] Обновляем кэш для ${url.pathname} (прошло более суток)`);
              const blob = await networkResponse.blob();
              const newResponse = new Response(blob, {
                status: networkResponse.status,
                statusText: networkResponse.statusText,
                headers: new Headers(networkResponse.headers)
              });
              newResponse.headers.append('date-cached', now.toString());
              await cache.put(event.request, newResponse.clone());
              return newResponse;
            }
            
            // Если сеть есть, но 24 часа не прошли — просто отдаем файл из сети (не трогая кэш)
            return networkResponse;
          }
          return cachedResponse; // Ошибка сервера (500 и т.д.) — берем из кэша
        } catch (err) {
          // СЕТИ НЕТ (Офлайн) — берем из кэша
          console.log(`[SW] Офлайн режим для ${url.pathname}`);
          return cachedResponse;
        }
      })()
    );
    return;
  }

  // --- ОБЩАЯ ЛОГИКА ДЛЯ ОСТАЛЬНЫХ ФАЙЛОВ (Сначала Кэш + Фоновое обновление) ---
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {});

      return cachedResponse || fetchPromise;
    })
  );
});

// Слушатель для принудительного сброса кэша из основного JS-кода
self.addEventListener('message', (event) => {
  if (event.data === 'FORCE_UPDATE_EXCEL') {
    console.log('[SW] Принудительная очистка Excel-файлов из кэша');
    caches.open(CACHE_NAME).then((cache) => {
      EXCEL_FILES.forEach(file => cache.delete(file));
    });
  }
});

