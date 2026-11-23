/* Offline helper for the exam log. HTML uses network-first with a fast offline fallback so
   updates appear on the first open, while icons and fonts load straight from cache.
   It never saves or touches your exam data or your Google sheet. */
var VERSION = "examlog-app-v9";
var FONTS = "examlog-fonts-v1";
var SHELL = ["./", "index.html", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== VERSION && k !== FONTS; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function networkFirst(req) {
  return caches.match(req, { ignoreSearch: true }).then(function (hit) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = hit ? setTimeout(function () { if (!done) { done = true; resolve(hit); } }, 2500) : null;
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
        }
        if (!done) {
          done = true;
          if (timer) clearTimeout(timer);
          resolve(res && res.ok ? res : (hit || res));
        }
      }).catch(function () {
        if (!done) {
          done = true;
          if (timer) clearTimeout(timer);
          resolve(hit);
        }
      });
    });
  });
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  if (url.origin === self.location.origin) {
    var isDoc = req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");
    if (isDoc) {
      e.respondWith(networkFirst(req));
      return;
    }
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then(function (hit) {
        var net = fetch(req).then(function (res) {
          if (res && res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
          return res;
        }).catch(function () { return hit; });
        return hit || net;
      })
    );
    return;
  }

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(
      caches.open(FONTS).then(function (c) {
        return c.match(req).then(function (hit) {
          var net = fetch(req).then(function (res) { c.put(req, res.clone()); return res; }).catch(function () { return hit; });
          return hit || net;
        });
      })
    );
  }
  // Anything else (including Google Apps Script) goes straight to the network, never cached.
});
