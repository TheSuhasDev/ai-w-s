/**
 * Voice synthesis utility for warehouse staff auditory feedback.
 * Uses the browser's built-in speechSynthesis API.
 */

const STORAGE_KEY = "wms_voice_enabled";
const DEDUPE_INTERVAL_MS = 2000;

// Track last spoken timestamp by deduplication key (product + action)
const lastSpokenMap = new Map<string, number>();

let cachedVoices: SpeechSynthesisVoice[] = [];

function loadVoices(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    cachedVoices = window.speechSynthesis.getVoices();
  }
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => {
      loadVoices();
    };
  }
}

/**
 * Select preferred voice: en-IN first, then en-US, then default/any English voice.
 */
export function getPreferredVoice(): SpeechSynthesisVoice | null {
  if (!cachedVoices.length && typeof window !== "undefined" && "speechSynthesis" in window) {
    cachedVoices = window.speechSynthesis.getVoices();
  }
  if (!cachedVoices.length) return null;

  // 1. Check for en-IN (Indian English)
  const inVoice = cachedVoices.find((v) => {
    const lang = v.lang.toLowerCase();
    return lang === "en-in" || lang.startsWith("en-in") || lang.includes("en_in");
  });
  if (inVoice) return inVoice;

  // 2. Check for en-US
  const usVoice = cachedVoices.find((v) => {
    const lang = v.lang.toLowerCase();
    return lang === "en-us" || lang.startsWith("en-us") || lang.includes("en_us");
  });
  if (usVoice) return usVoice;

  // 3. Any English voice
  const enVoice = cachedVoices.find((v) => v.lang.toLowerCase().startsWith("en"));
  if (enVoice) return enVoice;

  // 4. Default voice or first voice
  const defaultVoice = cachedVoices.find((v) => v.default);
  return defaultVoice || cachedVoices[0] || null;
}

/**
 * Returns whether voice feedback is currently enabled.
 * Default is true (enabled).
 */
export function isVoiceEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) !== "false";
}

/**
 * Immediately cancels any speech in progress.
 */
export function cancelSpeech(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore errors if synthesis is unavailable
    }
  }
}

/**
 * Triggers a silent utterance (volume 0) during a user gesture (such as starting camera)
 * to unlock browser audio autoplay policies.
 */
export function warmUpVoice(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }
  try {
    const utterance = new SpeechSynthesisUtterance(" ");
    utterance.volume = 0;
    const voice = getPreferredVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    window.speechSynthesis.speak(utterance);
  } catch {
    // Return quietly if unsupported
  }
}

/**
 * Speaks the given text with voice synthesis.
 * - Cancels any utterance in progress before speaking.
 * - Picks an en-IN voice, otherwise en-US, otherwise default.
 * - Suppresses announcements if voice is muted.
 * - Enforces a 2-second de-duplication guard for the same product + action.
 * - Returns quietly when speechSynthesis is unsupported.
 *
 * @param text The announcement text to speak.
 * @param dedupeKey Optional deduplication key (e.g. "receive:Hammer" or "dispatch:Hammer").
 */
export function speak(text: string, dedupeKey?: string): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return false;
  }

  if (!isVoiceEnabled()) {
    return false;
  }

  const key = dedupeKey || text;
  const now = Date.now();
  const lastSpoken = lastSpokenMap.get(key) || 0;

  if (now - lastSpoken < DEDUPE_INTERVAL_MS) {
    return false;
  }
  lastSpokenMap.set(key, now);

  try {
    // Cancel any utterance currently in progress
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = getPreferredVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

export default speak;
