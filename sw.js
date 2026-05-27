const CACHE_NAME = "duka-online-cache-v7";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./styles.css",
  "./app.js",
  "./mpesa-parser.js",
  "./mock-data.js",
  "./icon-192.png",
  "./icon-512.png",
  "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap"
];

// Install Event - Pre-cache Core Assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[Service Worker] Pre-caching offline assets");
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up Old Caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("[Service Worker] Removing old cache:", key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Hybrid Caching Strategy (Stale-While-Revalidate for static, Network-First for dynamic/cloud)
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  // Avoid intercepting Firebase Firestore websocket / cloud API calls
  if (event.request.url.includes("firestore.googleapis.com") || event.request.url.includes("firebase")) {
    return;
  }

  const isStaticAsset = ASSETS.some((asset) => {
    const cleanAsset = asset.replace("./", "");
    return cleanAsset && event.request.url.endsWith(cleanAsset);
  });

  if (isStaticAsset) {
    // Serves from cache immediately, updates in background
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          const fetchedResponse = fetch(event.request).then((networkResponse) => {
            if (networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => {});

          return cachedResponse || fetchedResponse;
        });
      })
    );
  } else {
    // Network-First strategy
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse.status === 200 && !event.request.url.includes("chrome-extension")) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            if (event.request.headers.get("accept") && event.request.headers.get("accept").includes("text/html")) {
              return caches.match("./index.html");
            }
          });
        })
    );
  }
});
