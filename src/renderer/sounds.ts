import chimeUrl from './assets/sounds/chime.wav';
import cashUrl from './assets/sounds/cash.wav';
import pingUrl from './assets/sounds/ping.wav';
import dropletUrl from './assets/sounds/droplet.wav';
import marimbaUrl from './assets/sounds/marimba.wav';

export const NOTIFICATION_SOUNDS = ['off', 'chime', 'cash', 'ping', 'droplet', 'marimba'] as const;
export type NotificationSound = (typeof NOTIFICATION_SOUNDS)[number];

export const SOUND_LABELS: Record<NotificationSound, string> = {
  off: 'Off',
  chime: 'Chime',
  cash: 'Cash Register',
  ping: 'Ping',
  droplet: 'Droplet',
  marimba: 'Marimba',
};

const urls: Record<Exclude<NotificationSound, 'off'>, string> = {
  chime: chimeUrl,
  cash: cashUrl,
  ping: pingUrl,
  droplet: dropletUrl,
  marimba: marimbaUrl,
};

const cache = new Map<string, HTMLAudioElement>();

export function playNotificationSound(sound: NotificationSound): void {
  if (sound === 'off') return;
  let audio = cache.get(sound);
  if (!audio) {
    audio = new Audio(urls[sound]);
    cache.set(sound, audio);
  }
  audio.currentTime = 0;
  audio.play().catch(() => {}); // silently handle autoplay restrictions
}
