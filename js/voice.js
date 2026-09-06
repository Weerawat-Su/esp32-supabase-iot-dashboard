// ---------------------------------------------------------------------------
// Voice control flow:
//
//   [mouse: hold-to-talk] / [touch: tap-to-start, tap-to-stop] -> speech
//   recognition -> transcript shown on screen -> resolved locally
//   (CommandParser -> FuzzyMatch) or, as a last resort, by Gemini -> LED
//   command or easter egg -> spoken Thai confirmation
//
// Interaction mode depends on pointer type:
//   - Fine pointer (mouse): true press-and-hold via Pointer Events.
//   - Coarse pointer (touch/tablet): tap once to start, tap again to stop.
// This split exists because iOS Safari/Chrome (WebKit) is unreliable with
// held touch + continuous Speech Recognition together — sessions can get
// stuck and never fire onend, which used to require a full page reload to
// clear. Tap-to-toggle avoids that combination entirely on touch devices,
// and a failsafe timeout below guards against a stuck session either way.
// ---------------------------------------------------------------------------

const Voice = (() => {
  const LED_THAI_NAME = { led1: "หนึ่ง", led2: "สอง", led3: "สาม" };
  const STOP_FAILSAFE_MS = 4000; // if the browser never fires onend, force a reset after this long

  const SpeechRecognitionImpl =
    window.SpeechRecognition || window.webkitSpeechRecognition || null;

  const isCoarsePointer =
    typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

  let recognizer = null;
  let listening = false;
  let processing = false;
  let heldTranscriptParts = [];
  let sessionToken = 0; // guards against a stale/late-firing recognizer instance corrupting a newer session

  let micBtn, micIcon, micLabel, transcriptBlock, transcriptText;
  let aiResponseBlock, aiResponseText, voiceStatusMsg;

  function init() {
    micBtn = document.getElementById("micBtn");
    micIcon = document.getElementById("micIcon");
    micLabel = document.getElementById("micLabel");
    transcriptBlock = document.getElementById("transcriptBlock");
    transcriptText = document.getElementById("transcriptText");
    aiResponseBlock = document.getElementById("aiResponseBlock");
    aiResponseText = document.getElementById("aiResponseText");
    voiceStatusMsg = document.getElementById("voiceStatusMsg");

    if (!SpeechRecognitionImpl) {
      setStatus("Speech recognition is not supported in this browser.", "error");
      micBtn.disabled = true;
      return;
    }

    if (isCoarsePointer) {
      micLabel.textContent = "Tap to Talk";
      micBtn.addEventListener("click", handleTapToggle);
    } else {
      micBtn.addEventListener("pointerdown", handlePressStart);
      micBtn.addEventListener("pointerup", handlePressEnd);
      micBtn.addEventListener("pointercancel", handlePressEnd);
      micBtn.addEventListener("pointerleave", handlePressEnd);
    }
    // Prevent text selection / callout menus from a long press on mobile.
    micBtn.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  function setStatus(msg, kind) {
    voiceStatusMsg.textContent = msg || "";
    voiceStatusMsg.classList.remove("is-error", "is-ok");
    if (kind === "error") voiceStatusMsg.classList.add("is-error");
    if (kind === "ok") voiceStatusMsg.classList.add("is-ok");
  }

  function defaultMicLabel() {
    return isCoarsePointer ? "Tap to Talk" : "Hold to Talk";
  }

  // Kept for callers that want to force-stop an in-progress session (e.g.
  // the key was cleared mid-recording). Voice control itself is no longer
  // gated on having a Gemini key — the local tiers (CommandParser,
  // FuzzyMatch) work without one; Gemini is only an optional last resort.
  function stopIfListening() {
    requestStop();
  }

  // --- Touch: tap-to-start / tap-to-stop -----------------------------------

  function handleTapToggle() {
    if (processing) return;
    if (listening) {
      requestStop();
    } else {
      startSession();
    }
  }

  // --- Mouse: press-and-hold ------------------------------------------------

  function handlePressStart(event) {
    if (processing || listening) return;
    event.preventDefault();
    try { micBtn.setPointerCapture(event.pointerId); } catch (err) { /* not critical */ }
    startSession();
  }

  function handlePressEnd(event) {
    if (!listening) return;
    event.preventDefault();
    requestStop();
  }

  // --- Shared session lifecycle ---------------------------------------------

  function requestStop() {
    if (!listening) return;
    try { recognizer && recognizer.stop(); } catch (err) { /* no-op */ }

    // Failsafe: some browsers (notably iOS Safari/Chrome) can fail to ever
    // fire onend after stop(). Without this, the mic would stay stuck in
    // "listening" forever and need a full page reload to recover.
    const tokenAtStopRequest = sessionToken;
    setTimeout(() => {
      if (sessionToken === tokenAtStopRequest && listening) {
        console.warn("[Voice] recognition did not end in time — forcing reset");
        forceReset();
        setStatus("");
      }
    }, STOP_FAILSAFE_MS);
  }

  function forceReset() {
    sessionToken++; // invalidate any callbacks still attached to the old recognizer
    listening = false;
    processing = false;
    micBtn.disabled = false;
    micBtn.classList.remove("is-listening");
    micLabel.textContent = defaultMicLabel();
    recognizer = null;
  }

  function startSession() {
    setStatus("");
    aiResponseBlock.hidden = true;
    transcriptBlock.hidden = true;
    heldTranscriptParts = [];

    const myToken = ++sessionToken;
    const stale = () => myToken !== sessionToken;

    let session;
    try {
      session = new SpeechRecognitionImpl();
    } catch (err) {
      setStatus("Could not start the microphone. Please try again.", "error");
      return;
    }
    recognizer = session;

    session.lang = CONFIG.VOICE_LANG;
    session.continuous = true; // keep capturing for the whole hold/tap window, not just one pause-delimited phrase
    session.interimResults = false;
    session.maxAlternatives = 1;

    session.onstart = () => {
      if (stale()) return;
      listening = true;
      micBtn.classList.add("is-listening");
      micLabel.textContent = isCoarsePointer ? "Tap to Send" : "Listening… release to send";
      setStatus("Listening…");
    };

    session.onerror = (event) => {
      if (stale()) return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setStatus("Microphone permission is required.", "error");
      } else if (event.error !== "aborted" && event.error !== "no-speech") {
        setStatus("Could not recognize your speech. Please try again.", "error");
      }
    };

    session.onresult = (event) => {
      if (stale()) return;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript.trim();
        if (chunk) heldTranscriptParts.push(chunk);
      }
    };

    session.onend = () => {
      if (stale()) return;
      listening = false;
      micBtn.classList.remove("is-listening");
      micLabel.textContent = defaultMicLabel();

      const text = heldTranscriptParts.join(" ").trim();
      if (!text) return; // stopped without saying anything usable

      // Show the transcribed text on screen right away, before it's sent
      // to be resolved.
      transcriptText.textContent = text;
      transcriptBlock.hidden = false;

      runCommand(text);
    };

    try {
      session.start();
    } catch (err) {
      // iOS in particular can throw here if a previous session's audio
      // session hasn't fully released yet — reset hard instead of leaving
      // the button stuck.
      forceReset();
      setStatus("Could not start the microphone. Please try again.", "error");
    }
  }

  async function runCommand(thaiText) {
    if (processing) return;
    processing = true;
    micBtn.disabled = true;
    setStatus("Processing…");
    aiResponseBlock.hidden = true;

    const before = Dashboard.getState();

    // Tier 1: exact local parser — instant, zero cost, handles clean speech.
    let result = CommandParser.parse(thaiText, before);

    // Tier 2: local fuzzy matching — still instant, zero cost, no network;
    // catches STT truncation/typos the exact parser missed.
    if (!result) result = FuzzyMatch.parse(thaiText, before);

    // Tier 3: Gemini — the LAST resort, and only ever called if the first
    // two tiers found nothing AND a key is configured.
    if (!result) {
      const apiKey = Settings.getApiKey();
      if (apiKey) {
        try {
          result = await Gemini.interpretCommand(apiKey, thaiText, before);
        } catch (err) {
          setStatus(err.message || "AI processing failed. Please try again.", "error");
          processing = false;
          micBtn.disabled = false;
          return;
        }
      }
    }

    if (!result || result.intent === "unclear") {
      const msg = "ขอโทษครับ ไม่เข้าใจคำสั่งนี้ ลองพูดใหม่อีกครั้งได้ไหมครับ";
      aiResponseText.textContent = msg;
      aiResponseBlock.hidden = false;
      speakMuted(msg, () => {
        setStatus("");
        processing = false;
        micBtn.disabled = false;
      });
      return;
    }

    if (result.intent === "easter_egg") {
      await runEasterEgg(result.easterEggId);
      processing = false;
      micBtn.disabled = false;
      return;
    }

    // intent === "led_control"
    const diff = {};
    ["led1", "led2", "led3"].forEach((key) => {
      if (result[key] !== before[key]) diff[key] = result[key];
    });

    if (Object.keys(diff).length > 0) {
      try {
        await Db.updateState(diff);
        Dashboard.render(diff);
      } catch (err) {
        console.error("Failed to apply voice command to Supabase:", err);
        setStatus("Unable to connect to the database.", "error");
        App.showConnectionError();
        processing = false;
        micBtn.disabled = false;
        return;
      }
    }

    const responseText = buildThaiResponse(before, result);
    aiResponseText.textContent = responseText;
    aiResponseBlock.hidden = false;

    speakMuted(responseText, () => {
      setStatus("Done.", "ok");
      processing = false;
      micBtn.disabled = false;
    });
  }

  async function runEasterEgg(easterEggId) {
    const egg = CONFIG.EASTER_EGGS.find((e) => e.id === easterEggId);

    if (!egg) {
      const msg = "รับทราบครับ";
      aiResponseText.textContent = msg;
      aiResponseBlock.hidden = false;
      await new Promise((resolve) => speakMuted(msg, resolve));
      setStatus("");
      return;
    }

    aiResponseText.textContent = egg.spokenReply;
    aiResponseBlock.hidden = false;

    await new Promise((resolve) => speakMuted(egg.spokenReply, resolve));

    try {
      const audio = new Audio(egg.audioFile);
      await audio.play();
      setStatus("🎵", "ok");
    } catch (err) {
      console.error("Could not play easter egg audio:", err);
      setStatus("Could not play the sound clip. Please try again.", "error");
    }
  }

  // Speaks `text` while ignoring anything the mic picks up in the meantime.
  function speakMuted(text, onDone) {
    Tts.speak(text, { onEnd: () => { if (onDone) onDone(); } });
  }

  function buildThaiResponse(before, after) {
    const turnedOn = [];
    const turnedOff = [];

    ["led1", "led2", "led3"].forEach((key) => {
      if (after[key] === before[key]) return;
      (after[key] ? turnedOn : turnedOff).push(LED_THAI_NAME[key]);
    });

    if (turnedOn.length === 0 && turnedOff.length === 0) {
      return "ครับท่าน สถานะไฟเหมือนเดิมครับ ไม่มีอะไรต้องเปลี่ยนครับ";
    }

    if (turnedOn.length === 3) return "เปิดไฟทั้งสามดวงเรียบร้อยครับ";
    if (turnedOff.length === 3) return "ปิดไฟทั้งสามดวงเรียบร้อยครับ";

    const parts = [];
    if (turnedOn.length > 0) parts.push(`เปิดไฟดวงที่${joinThaiNames(turnedOn)}`);
    if (turnedOff.length > 0) parts.push(`ปิดไฟดวงที่${joinThaiNames(turnedOff)}`);

    return parts.join(" และ ") + "เรียบร้อยครับ";
  }

  function joinThaiNames(names) {
    if (names.length === 1) return names[0];
    return names.slice(0, -1).join(" ") + "และ" + names[names.length - 1];
  }

  return { init, stopIfListening };
})();
