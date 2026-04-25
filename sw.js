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

// 1. Установка: фоновая загрузка ядра сайта
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      ASSETS.forEach(url => {
        cache.match(url).then(response => {
          // Догружаем только то, чего еще нет в кэше
          if (!response) cache.add(url).catch(() => {});
        });
      });
    })
  );
});

// 2. Активация: очистка старых версий кэша
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => key !== CACHE_NAME ? caches.delete(key) : null)
    )).then(() => self.clients.claim())
  );
});

// 3. Обработка запросов (Fetch)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isExcel = EXCEL_FILES.some(path => url.pathname.endsWith(path));

  // --- ЛОГИКА ДЛЯ EXCEL (Минимальное вмешательство) ---
  if (isExcel) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(event.request);
        const now = Date.now();
        const lastChecked = cachedResponse ? parseInt(cachedResponse.headers.get('date-cached') || 0) : 0;

        // Если файл в кэше есть и 24 часа НЕ ПРОШЛИ — просто пропускаем запрос в сеть (как обычный браузер)
        if (cachedResponse && (now - lastChecked < ONE_DAY)) {
          try {
            return await fetch(event.request); 
          } catch (err) {
            return cachedResponse; // Если сеть внезапно пропала — отдаем кэш
          }
        }

        // Если прошло > 24 часов или файла нет — идем в сеть и обновляем кэш
        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse.ok) {
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
          return cachedResponse || networkResponse;
        } catch (err) {
          return cachedResponse; // Оффлайн
        }
      })()
    );
    return;
  }

  // --- ОБЩАЯ ЛОГИКА (Сначала Кэш, Фоновое обновление) ---
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(event.request);

      // Фоновое обновление для актуальности (браузер сам решит, качать ли тело файла через 304 статус)
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse.ok) {
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      }).catch(() => {});

      // Мгновенная отдача из кэша. Если файла нет (не успел докачаться) — ждем сеть.
      return cachedResponse || fetchPromise;
    })
  );
});

// 4. Принудительное обновление из основного JS
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
