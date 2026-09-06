"use client";

import { useEffect } from "react";

export default function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // ponytail: silent failure is fine, PWA install just degrades to a normal web app
      });
    }
  }, []);

  return null;
}
