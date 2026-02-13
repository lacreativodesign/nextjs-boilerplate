const STATIC_CACHE = "bizosto-static-v1";
const API_CACHE = "bizosto-api-v1";
const OFFLINE_QUEUE_DB = "bizosto-offline-queue";
const OFFLINE_QUEUE_STORE = "requests";
const PRECACHE_URLS = ["/offline", "/manifest.json", "/icons/icon-192.svg", "/icons/icon-512.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.filter((key) => ![STATIC_CACHE, API_CACHE].includes(key)).map((key) => caches.delete(key))),
      ),
    ]),
  );
});

function isStaticAsset(request) {
  const destination = request.destination;
  return ["style", "script", "image", "font"].includes(destination) || request.url.includes("/_next/static/");
}

function isApiRequest(request) {
  return request.url.includes("/api/");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method === "GET" && isStaticAsset(request)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (isApiRequest(request)) {
    if (request.method === "GET") {
      event.respondWith(networkFirstApi(request));
      return;
    }

    event.respondWith(networkWithOfflineQueue(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(STATIC_CACHE);
        return cache.match("/offline");
      }),
    );
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  const cache = await caches.open(STATIC_CACHE);
  cache.put(request, response.clone());
  return response;
}

async function networkFirstApi(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: "Offline and no cached data available." }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function networkWithOfflineQueue(request) {
  try {
    return await fetch(request);
  } catch (error) {
    await queueRequest(request);
    const registration = await self.registration;
    if (registration.sync) {
      await registration.sync.register("bizosto-sync");
    }
    return new Response(JSON.stringify({ queued: true, message: "Action queued and will sync when online." }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  }
}

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_QUEUE_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(OFFLINE_QUEUE_STORE, { autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function queueRequest(request) {
  const body = await request.clone().text();
  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const db = await openQueueDb();
  const transaction = db.transaction(OFFLINE_QUEUE_STORE, "readwrite");
  transaction.objectStore(OFFLINE_QUEUE_STORE).add({
    url: request.url,
    method: request.method,
    headers,
    body,
    timestamp: Date.now(),
  });

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function replayQueuedRequests() {
  const db = await openQueueDb();
  const transaction = db.transaction(OFFLINE_QUEUE_STORE, "readwrite");
  const store = transaction.objectStore(OFFLINE_QUEUE_STORE);
  const getAll = store.getAll();

  const records = await new Promise((resolve, reject) => {
    getAll.onsuccess = () => resolve(getAll.result || []);
    getAll.onerror = () => reject(getAll.error);
  });

  for (const record of records) {
    try {
      await fetch(record.url, {
        method: record.method,
        headers: record.headers,
        body: record.body || undefined,
      });
    } catch (error) {
      continue;
    }
  }

  store.clear();

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

self.addEventListener("sync", (event) => {
  if (event.tag === "bizosto-sync") {
    event.waitUntil(replayQueuedRequests());
  }
});

self.addEventListener("push", (event) => {
  const payload = event.data?.json() || {};
  const title = payload.title || "Bizosto";
  const options = {
    body: payload.body || "You have a new update.",
    icon: "/icons/icon-192.svg",
    badge: "/icons/icon-192.svg",
    data: {
      url: payload.url || "/",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const matchingClient = clientList.find((client) => client.url.includes(self.location.origin));
      if (matchingClient) {
        matchingClient.focus();
        matchingClient.navigate(targetUrl);
        return;
      }
      return clients.openWindow(targetUrl);
    }),
  );
});
