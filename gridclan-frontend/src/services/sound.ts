import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Lightweight game audio.
 *
 * On **web** this synthesizes short sound effects with the Web Audio API (no
 * asset files needed) and loops optional background music from
 * `/audio/background.mp3` (silently no-ops if that file isn't present).
 * Browser autoplay rules require a user gesture, so music starts on the first
 * `playSfx` (i.e. the first tap/move).
 *
 * On **native** it is currently a no-op — adding mobile sound needs `expo-av`
 * plus packaged audio files (a follow-up).
 *
 * A single mute flag is persisted via AsyncStorage and respected everywhere.
 */
const MUTE_KEY = 'gc_sound_muted';
const isWeb = Platform.OS === 'web';

let muted = false;
let ctx: any = null;            // AudioContext (web)
let bgm: any = null;            // HTMLAudioElement (web)
let bgmStarted = false;

export async function loadSoundPref(): Promise<void> {
  try { muted = (await AsyncStorage.getItem(MUTE_KEY)) === '1'; } catch { /* default on */ }
}

export function isMuted(): boolean { return muted; }

export async function setMuted(next: boolean): Promise<void> {
  muted = next;
  try { await AsyncStorage.setItem(MUTE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
  if (next) stopMusic(); else startMusic();
}

function audioCtx(): any {
  if (!isWeb || typeof window === 'undefined') return null;
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

export type Sfx = 'tap' | 'move' | 'hit' | 'win' | 'lose';

// Each effect is a tiny sequence of tones — cheap, no assets, "game-y".
const TONES: Record<Sfx, { freq: number; dur: number; type: string }[]> = {
  tap:  [{ freq: 440, dur: 0.05, type: 'square' }],
  move: [{ freq: 560, dur: 0.07, type: 'triangle' }],
  hit:  [{ freq: 200, dur: 0.13, type: 'sawtooth' }],
  win:  [{ freq: 523, dur: 0.11, type: 'triangle' }, { freq: 659, dur: 0.11, type: 'triangle' }, { freq: 784, dur: 0.18, type: 'triangle' }],
  lose: [{ freq: 300, dur: 0.16, type: 'sawtooth' }, { freq: 170, dur: 0.24, type: 'sawtooth' }],
};

export function playSfx(name: Sfx): void {
  if (muted) return;
  const c = audioCtx();
  if (!c) return;                  // native / unsupported → silent
  if (!bgmStarted) startMusic();   // first gesture also kicks off ambient music
  let t = c.currentTime;
  for (const note of TONES[name]) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = note.type;
    osc.frequency.value = note.freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + note.dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t);
    osc.stop(t + note.dur);
    t += note.dur;
  }
}

export function startMusic(): void {
  if (muted || !isWeb || typeof window === 'undefined') return;
  try {
    if (!bgm) {
      bgm = new (window as any).Audio('/audio/background.mp3');
      bgm.loop = true;
      bgm.volume = 0.22;
    }
    const p = bgm.play();
    if (p && p.catch) p.catch(() => { /* autoplay blocked until a gesture */ });
    bgmStarted = true;
  } catch { /* no music file or unsupported */ }
}

export function stopMusic(): void {
  try { bgm?.pause(); } catch { /* ignore */ }
}
