/* Offline cache contains only this app's own static files. */
var CACHE_NAME = "ml-time-recorder-web-v4";
var APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./logic.js",
  "./app.js",
  "./manifest.webmanifest",
  "./assets/icon-1024.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        if (name !== CACHE_NAME && name.indexOf("ml-time-recorder-web-") === 0) {
          return caches.delete(name);
        }
        return Promise.resolve(false);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  var requestUrl = new URL(request.url);
  if (request.method !== "GET" || requestUrl.origin !== self.location.origin) {
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then(function (response) {
        return response;
      }).catch(function () {
        return caches.match("./index.html");
      })
    );
    return;
  }
  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) {
        return cached;
      }
      return fetch(request).then(function (response) {
        if (!response || response.status !== 200 || response.type === "opaque") {
          return response;
        }
        return caches.open(CACHE_NAME).then(function (cache) {
          cache.put(request, response.clone());
          return response;
        });
      });
    })
  );
});
