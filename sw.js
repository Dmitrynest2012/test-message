const CACHE_NAME = 'my-site-v1';

const ASSETS = [
  './', 
  'index.html',
  'styles.css',
  'script.js',
  'time.js',
  'sw.js',
  'data.js',
  'config.js',
  'settings.js',
  'xlsx.full.min.js',
  'message_love.ico',
  'data-message.xlsx',
  'img/message-base-1.png',
  'img/message-random-1.jpg',
  'music/in_message_music.mp3',
  'sound_of_a_bell_2.wav',
  'sound_of_a_bell.mp3',
  'sound_of_interval_end.mp3',
  'warning.mp3',
  'sound_of_notification.mp3',
  'quatrains_about_the_message.xlsx'
];

const EXCEL_FILES = ['data-message.xlsx', 'quatrains_about_the_message.xlsx'];
const ONE_DAY = 24 * 60 * 60 * 1000;

// Установка: быстрая активация
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Запускаем фоновую загрузку всего списка
      ASSETS.forEach(url => {
        cache.match(url).then(response => {
          if (!response) cache.add(url).catch(() => {});
        });
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => key !== CACHE_NAME ? caches.delete(key) : null)
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isExcel = EXCEL_FILES.some(path => url.pathname.endsWith(path));

  // --- ЛОГИКА ДЛЯ EXCEL ---
  if (isExcel) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(event.request);
        
        try {
          const now = Date.now();
          const lastChecked = cachedResponse ? parseInt(cachedResponse.headers.get('date-cached') || 0) : 0;

          // Если прошло > 24 часов ИЛИ файла нет в кэше — идем в сеть
          if (!cachedResponse || (now - lastChecked > ONE_DAY)) {
            const networkResponse = await fetch(event.request);
            
            if (networkResponse.ok) {
              // Создаем новый Response, чтобы добавить метку времени
              const newHeaders = new Headers(networkResponse.headers);
              newHeaders.append('date-cached', now.toString());
              
              const responseToSave = new Response(await networkResponse.blob(), {
                status: networkResponse.status,
                statusText: networkResponse.statusText,
                headers: newHeaders
              });

              await cache.put(event.request, responseToSave.clone());
              return responseToSave;
            }
          }
          // Если 24 часа не прошло ИЛИ сеть упала — отдаем кэш
          return cachedResponse || fetch(event.request);
        } catch (err) {
          return cachedResponse;
        }
      })()
    );
    return;
  }

  // --- ОБЩАЯ ЛОГИКА (Остальные файлы) ---
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(event.request);

      // Фоновое обновление: запрос идет всегда, но браузер скачает данные 
      // целиком только если файл на сервере РЕАЛЬНО изменился (304 Not Modified)
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse.ok) {
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      }).catch(() => {});

      // Возвращаем кэш мгновенно, если он есть, иначе ждем сеть
      return cachedResponse || fetchPromise;
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'FORCE_UPDATE_EXCEL') {
    caches.open(CACHE_NAME).then((cache) => {
      EXCEL_FILES.forEach(file => {
        cache.keys().then(keys => {
          keys.forEach(request => {
            if (request.url.includes(file)) cache.delete(request);
          });
        });
      });
    });
  }
});
