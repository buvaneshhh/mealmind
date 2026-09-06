"use client";

import { useRef } from "react";

/**
 * Glass card with a cursor-tracking spotlight glow (see globals.css
 * .spotlight-glow / .glass-card). The glow is purely decorative —
 * pointer-events are disabled on it so it never affects real interaction,
 * and content is fully visible/reachable regardless of pointer position.
 */
export default function SpotlightCard({
  children,
  className = "",
  glowColor,
}: {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--spotlight-x", `${((e.clientX - rect.left) / rect.width) * 100}%`);
    el.style.setProperty("--spotlight-y", `${((e.clientY - rect.top) / rect.height) * 100}%`);
  }

  return (
    <div
      ref={ref}
      onPointerMove={handlePointerMove}
      className={`spotlight-container glass-card relative overflow-hidden ${className}`}
      style={glowColor ? ({ "--spotlight-color": glowColor } as React.CSSProperties) : undefined}
    >
      <div className="spotlight-glow" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
