// ---------------------------------------------------------------------------
// Text-to-speech: speaks Thai responses using the browser's built-in
// SpeechSynthesis API, preferring a Thai voice when one is installed.
// ---------------------------------------------------------------------------

const Tts = (() => {
  const supported = "speechSynthesis" in window;
  let thaiVoice = null;
  let voicesReady = false;

  function loadVoices() {
    if (!supported) return;
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) return;

    thaiVoice =
      voices.find((v) => v.lang && v.lang.toLowerCase() === CONFIG.VOICE_LANG.toLowerCase()) ||
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("th")) ||
      null;

    voicesReady = true;
  }

  if (supported) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  /**
   * Speaks `text` in Thai. Optional callbacks let the caller mute the
   * microphone while the assistant is talking, so it doesn't hear itself:
   *   Tts.speak(text, { onStart, onEnd })
   * onEnd always fires (including on error) so callers can safely resume.
   */
  function speak(text, callbacks = {}) {
    const { onStart, onEnd } = callbacks;

    if (!supported || !text) {
      if (onEnd) onEnd();
      return;
    }

    // Cancel anything currently queued so responses don't stack up.
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = CONFIG.VOICE_LANG;
    if (thaiVoice) utterance.voice = thaiVoice;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => { if (onStart) onStart(); };
    utterance.onend = () => { if (onEnd) onEnd(); };
    utterance.onerror = () => { if (onEnd) onEnd(); };

    window.speechSynthesis.speak(utterance);
  }

  return { speak, isSupported: () => supported, hasThaiVoice: () => !!thaiVoice };
})();
