// ---------------------------------------------------------------------------
// Voice control flow (hold-to-talk):
//
//   press & hold mic -> speech recognition runs while held -> release ->
//   recognized Thai text shown on screen -> sent to Gemini -> classified as
//   LED command or easter egg -> Supabase update (or play a local sound)
//   -> spoken Thai confirmation
//
// Hold-to-talk (recognition starts on pointerdown, stops on pointerup) is
// used instead of always-on listening because continuous background
// recognition is unreliable on iOS Safari / iPadOS in particular — tying
// the session directly to a press-and-hold gesture is the reliable pattern
// across browsers and gives the user explicit control over exactly what
// gets captured.
// ---------------------------------------------------------------------------

const Voice = (() => {
  const LED_THAI_NAME = { led1: "หนึ่ง", led2: "สอง", led3: "สาม" };

  const SpeechRecognitionImpl =
    window.SpeechRecognition || window.webkitSpeechRecognition || null;

  let recognizer = null;
  let listening = false;
  let processing = false;
  let heldTranscriptParts = [];

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

    // Pointer Events unify mouse, touch, and pen — one set of handlers
    // covers press-and-hold on desktop and mobile alike.
    micBtn.addEventListener("pointerdown", handlePressStart);
    micBtn.addEventListener("pointerup", handlePressEnd);
    micBtn.addEventListener("pointercancel", handlePressEnd);
    micBtn.addEventListener("pointerleave", handlePressEnd);
    // Prevent text selection / callout menus from a long press on mobile.
    micBtn.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  function setStatus(msg, kind) {
    voiceStatusMsg.textContent = msg || "";
    voiceStatusMsg.classList.remove("is-error", "is-ok");
    if (kind === "error") voiceStatusMsg.classList.add("is-error");
    if (kind === "ok") voiceStatusMsg.classList.add("is-ok");
  }

  function setEnabled(enabled) {
    document.getElementById("voiceEnabled").hidden = !enabled;
    document.getElementById("voiceDisabled").hidden = enabled;
    if (!enabled && listening && recognizer) {
      try { recognizer.stop(); } catch (err) { /* already stopped */ }
    }
  }

  function handlePressStart(event) {
    if (processing || listening) return;
    event.preventDefault();
    try { micBtn.setPointerCapture(event.pointerId); } catch (err) { /* not critical */ }
    startHolding();
  }

  function handlePressEnd(event) {
    if (!listening) return;
    event.preventDefault();
    try { recognizer && recognizer.stop(); } catch (err) { /* no-op */ }
  }

  function startHolding() {
    setStatus("");
    aiResponseBlock.hidden = true;
    transcriptBlock.hidden = true;
    heldTranscriptParts = [];

    recognizer = new SpeechRecognitionImpl();
    recognizer.lang = CONFIG.VOICE_LANG;
    recognizer.continuous = true; // keep capturing for the whole hold, not just one pause-delimited phrase
    recognizer.interimResults = false;
    recognizer.maxAlternatives = 1;

    recognizer.onstart = () => {
      listening = true;
      micBtn.classList.add("is-listening");
      micLabel.textContent = "Listening… release to send";
      setStatus("Listening…");
    };

    recognizer.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setStatus("Microphone permission is required.", "error");
      } else if (event.error !== "aborted" && event.error !== "no-speech") {
        setStatus("Could not recognize your speech. Please try again.", "error");
      }
    };

    recognizer.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript.trim();
        if (chunk) heldTranscriptParts.push(chunk);
      }
    };

    recognizer.onend = () => {
      listening = false;
      micBtn.classList.remove("is-listening");
      micLabel.textContent = "Hold to Talk";

      const text = heldTranscriptParts.join(" ").trim();
      if (!text) return; // released without saying anything usable

      // Show the transcribed text on screen right away, before it's sent
      // to the API.
      transcriptText.textContent = text;
      transcriptBlock.hidden = false;

      runCommand(text);
    };

    try {
      recognizer.start();
    } catch (err) {
      setStatus("Could not recognize your speech. Please try again.", "error");
    }
  }

  async function runCommand(thaiText) {
    if (processing) return;
    processing = true;
    micBtn.disabled = true;

    const apiKey = Settings.getApiKey();
    if (!apiKey) {
      setStatus("Gemini API key is required for voice control.", "error");
      processing = false;
      micBtn.disabled = false;
      return;
    }

    setStatus("Processing…");

    const before = Dashboard.getState();
    let result;
    try {
      result = await Gemini.interpretCommand(apiKey, thaiText, before);
    } catch (err) {
      setStatus(err.message || "AI processing failed. Please try again.", "error");
      processing = false;
      micBtn.disabled = false;
      return;
    }

    if (result.intent === "easter_egg") {
      await runEasterEgg(result.easterEggId);
      processing = false;
      micBtn.disabled = false;
      return;
    }

    if (result.intent === "unclear") {
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

  return { init, setEnabled };
})();
