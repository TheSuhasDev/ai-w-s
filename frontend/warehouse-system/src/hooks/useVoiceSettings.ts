import { useState, useEffect, useCallback } from "react";
import { isVoiceEnabled, cancelSpeech } from "../lib/voice";

const STORAGE_KEY = "wms_voice_enabled";
const VOICE_CHANGE_EVENT = "wms-voice-changed";

export function useVoiceSettings() {
  const [voiceEnabled, setVoiceEnabledState] = useState<boolean>(() => {
    return isVoiceEnabled();
  });

  const setVoiceEnabled = useCallback((enabled: boolean) => {
    localStorage.setItem(STORAGE_KEY, String(enabled));
    setVoiceEnabledState(enabled);
    if (!enabled) {
      cancelSpeech();
    }
    window.dispatchEvent(
      new CustomEvent(VOICE_CHANGE_EVENT, { detail: enabled })
    );
  }, []);

  const toggleVoice = useCallback(() => {
    setVoiceEnabled(!voiceEnabled);
  }, [voiceEnabled, setVoiceEnabled]);

  useEffect(() => {
    const handleVoiceChange = (event: Event) => {
      const customEvent = event as CustomEvent<boolean>;
      if (typeof customEvent.detail === "boolean") {
        setVoiceEnabledState(customEvent.detail);
      }
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setVoiceEnabledState(event.newValue !== "false");
      }
    };

    window.addEventListener(VOICE_CHANGE_EVENT, handleVoiceChange);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener(VOICE_CHANGE_EVENT, handleVoiceChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  return {
    voiceEnabled,
    toggleVoice,
    setVoiceEnabled,
  };
}

export default useVoiceSettings;
