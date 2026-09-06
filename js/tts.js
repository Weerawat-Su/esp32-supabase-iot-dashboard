// ---------------------------------------------------------------------------
// Text-to-speech: speaks Thai responses using the browser's built-in
// SpeechSynthesis API, preferring a Thai voice when one is installed.
// ---------------------------------------------------------------------------

const Tts = (() => {
  const supported = "speechSynthesis" in window;
  let thaiVoice = null;
  let voicesReady = false;
  // Safari/WebKit has a well-known bug where a SpeechSynthesisUtterance
  // with no other live reference can get garbage-collected before (or
  // while) it plays, silently killing the speech with no sound and no
  // events firing at all. Keeping a module-level reference to the current
  // utterance prevents that.
  let currentUtterance = null;

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
   * onEnd always fires exactly once (including on error, and even if the
   * browser never emits onend/onerror at all — a known iOS Safari/Chrome
   * bug where speech finishes audibly but the event never arrives, which
   * would otherwise leave the caller waiting forever).
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
    currentUtterance = utterance; // keep alive — see note above
    utterance.lang = CONFIG.VOICE_LANG;
    if (thaiVoice) utterance.voice = thaiVoice;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      if (currentUtterance === utterance) currentUtterance = null;
      if (onEnd) onEnd();
    }

    utterance.onstart = () => { if (onStart) onStart(); };
    utterance.onend = finish;
    utterance.onerror = finish;

    // Failsafe: estimate a generous max speaking duration and force
    // completion after that if the browser's own event never fires.
    const estimatedMs = Math.min(15000, Math.max(3000, text.length * 150));
    setTimeout(finish, estimatedMs);

    window.speechSynthesis.speak(utterance);
  }

  return { speak, isSupported: () => supported, hasThaiVoice: () => !!thaiVoice };
})();
