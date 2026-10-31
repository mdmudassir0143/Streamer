'use client';
import { useEffect, useRef } from 'react';
import { animate } from 'motion/react';

/** Tweens to `value` whenever it changes; jumps straight there under reduced motion. */
export function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = format(value);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, {
      duration: 0.6,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => { el.textContent = format(v); },
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, format]);
  return <span ref={ref}>{format(value)}</span>;
}
