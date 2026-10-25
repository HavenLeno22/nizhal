import { useEffect, useRef, useState, type RefObject } from 'react';

/** Measures an element's width so charts draw at real pixel size (readable text on phones). */
export function useWidth<T extends HTMLElement>(fallback = 720): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(Math.max(280, Math.round(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
