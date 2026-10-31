'use client';
import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * Hero: [data-reveal] elements rise in once, in document order.
 * Below the fold: [data-animate] elements rise in as they scroll into view, staggered when several arrive together.
 */
export function LandingMotion() {
  useEffect(() => {
    const hero = gsap.utils.toArray<HTMLElement>('[data-reveal]');
    const below = gsap.utils.toArray<HTMLElement>('[data-animate]');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.set([...hero, ...below], { opacity: 1, y: 0, clearProps: 'transform' });
      return;
    }
    const ctx = gsap.context(() => {
      gsap.fromTo(hero, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.08, delay: 0.05 });
      ScrollTrigger.batch(below, {
        start: 'top 88%',
        once: true,
        // clearProps hands transform back to CSS so hover lifts keep working.
        onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 0.75, ease: 'power3.out', stagger: 0.09, overwrite: true, clearProps: 'transform' }),
      });
    });
    return () => ctx.revert();
  }, []);
  return null;
}
