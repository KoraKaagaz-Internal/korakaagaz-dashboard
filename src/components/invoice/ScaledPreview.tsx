"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const PAGE_W = 852;

/** Scales the fixed-size invoice page to fit its container width. */
export function ScaledPreview({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = outer.current;
    const content = inner.current;
    if (!el || !content) return;
    const update = () => {
      const s = Math.min(1, el.clientWidth / PAGE_W);
      setScale(s);
      setHeight(content.scrollHeight * s);
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    ro.observe(content);
    update();
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outer} className="w-full" style={{ height }}>
      <div
        ref={inner}
        style={{ width: PAGE_W, transform: `scale(${scale})`, transformOrigin: "top left" }}
        className="[&_.kk-page]:shadow-lg"
      >
        {children}
      </div>
    </div>
  );
}
