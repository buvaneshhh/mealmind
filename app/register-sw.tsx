"use client";

import { useEffect } from "react";

export default function RegisterSW() {
  useEffect(() => {
    // Next dev's JS chunk URLs aren't content-hashed the way production
    // build output is, so a cache-first service worker can serve a
    // stale pre-edit chunk after a code change — causing exactly the
    // kind of hydration mismatch this cost real time to track down.
    // Offline support is a production concern; dev gains nothing from it.
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // ponytail: silent failure is fine, PWA install just degrades to a normal web app
      });
    }
  }, []);

  return null;
}
