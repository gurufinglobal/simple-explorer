'use client';
import { useNow } from 'next-intl';

/** Request clock is shared by SSR and hydration, then advances on the client. */
export function useNowTick(intervalMs = 1000): number {
  return useNow({ updateInterval: intervalMs }).getTime();
}
