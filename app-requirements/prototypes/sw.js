const C="mieru-v1";const A=["./","./kyoiku-app.html"];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(A).catch(()=>{})))});
self.addEventListener("activate",e=>{self.clients.claim()});
self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{const cp=res.clone();caches.open(C).then(c=>c.put(e.request,cp).catch(()=>{}));return res}).catch(()=>caches.match("./kyoiku-app.html"))))});