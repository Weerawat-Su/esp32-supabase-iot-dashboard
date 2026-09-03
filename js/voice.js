// ---------------------------------------------------------------------------
// Voice control flow (Jarvis-style, wake-word driven):
//
//   [always-on mic] -> hears "สมปอง" -> says "ครับท่าน" -> hears command
//   -> Gemini -> JSON -> Supabase update -> spoken Thai confirmation
//   -> back to listening for "สมปอง"
//
// The command can also be said in the same breath as the wake word
// ("สมปอง เปิดไฟดวงที่หนึ่ง") — the wake word is stripped and the rest
// is treated as the command immediately.
// ---------------------------------------------------------------------------

const Voice = (() => {
  const LED_THAI_NAME = { led1: "หนึ่ง", led2: "สอง", led3: "สาม" };

  const SpeechRecognitionImpl =
    window.SpeechRecognition || window.webkitSpeechRecognition || null;

  let recognizer = null;

  let assistantOn = false;    // user has toggled the mic on (continuous mode)
  let awaitingCommand = false; // wake word heard, waiting for the actual command
  let muted = false;           // true while the assistant itself is speaking
  let processing = false;      // true while a command is being executed
  let manualStop = false;      // true when the user explicitly stops listening

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

    micBtn.addEventListener("click", toggleAssistant);
  }

  function setStatus(msg, kind) {
    voiceStatusMsg.textContent = msg || "";
    voiceStatusMsg.classList.remove("is-error", "is-ok");
    if (kind === "error") voiceStatusMsg.classList.add("is-error");
    if (kind === "ok") voiceStatusMsg.classList.add("is-ok");
  }

  function toggleAssistant() {
    if (assistantOn) {
      stopAssistant();
    } else {
      startAssistant();
    }
  }

  function startAssistant() {
    assistantOn = true;
    manualStop = false;
    awaitingCommand = false;
    micBtn.classList.add("is-listening");
    micLabel.textContent = "Stop Listening";
    setStatus(`Listening for “${CONFIG.WAKE_WORD}”…`);
    startRecognitionSession();
  }

  function stopAssistant() {
    assistantOn = false;
    manualStop = true;
    awaitingCommand = false;
    micBtn.classList.remove("is-listening");
    micLabel.textContent = "Start Listening";
    setStatus("");
    if (recognizer) {
      try { recognizer.stop(); } catch (err) { /* already stopped */ }
    }
  }

  // Stops the mic when voice control is disabled from Settings.
  function setEnabled(enabled) {
    document.getElementById("voiceEnabled").hidden = !enabled;
    document.getElementById("voiceDisabled").hidden = enabled;
    if (!enabled && assistantOn) stopAssistant();
  }

  function startRecognitionSession() {
    recognizer = new SpeechRecognitionImpl();
    recognizer.lang = CONFIG.VOICE_LANG;
    recognizer.continuous = true;
    recognizer.interimResults = false;
    recognizer.maxAlternatives = 1;

    recognizer.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setStatus("Microphone permission is required.", "error");
        stopAssistant();
        return;
      }
      // no-speech / network hiccups: swallow and let onend restart us.
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setStatus("Could not recognize your speech. Please try again.", "error");
      }
    };

    recognizer.onend = () => {
      // Browsers end continuous sessions after a while even without an
      // error. If the assistant is still meant to be on, restart quietly.
      if (assistantOn && !manualStop) {
        setTimeout(() => { if (assistantOn) startRecognitionSession(); }, 250);
      }
    };

    recognizer.onresult = (event) => {
      const lastResult = event.results[event.results.length - 1];
      const text = lastResult[0].transcript.trim();
      if (!text || muted) return; // ignore anything heard while we're talking

      handleHeardText(text);
    };

    try {
      recognizer.start();
    } catch (err) {
      // start() can throw if a session is already running; safe to ignore.
    }
  }

  function handleHeardText(text) {
    if (awaitingCommand) {
      awaitingCommand = false;
      transcriptText.textContent = text;
      transcriptBlock.hidden = false;
      runCommand(text);
      return;
    }

    const normalized = text.replace(/\s+/g, "");
    if (!normalized.includes(CONFIG.WAKE_WORD)) return; // not the wake word, ignore

    // Strip the wake word out; anything left over said in the same breath
    // is treated as the command right away.
    const remainder = text.split(CONFIG.WAKE_WORD).join("").trim();

    speakMuted(CONFIG.WAKE_ACK, () => {
      if (remainder.length > 0) {
        transcriptText.textContent = remainder;
        transcriptBlock.hidden = false;
        runCommand(remainder);
      } else {
        awaitingCommand = true;
        setStatus("ครับท่าน — say your command…");
      }
    });
  }

  async function runCommand(thaiText) {
    if (processing) return;
    processing = true;

    const apiKey = Settings.getApiKey();
    if (!apiKey) {
      setStatus("Gemini API key is required for voice control.", "error");
      processing = false;
      return;
    }

    setStatus("Processing…");
    aiResponseBlock.hidden = true;

    const before = Dashboard.getState();
    let target;
    try {
      target = await Gemini.interpretCommand(apiKey, thaiText, before);
    } catch (err) {
      setStatus(err.message || "AI processing failed. Please try again.", "error");
      processing = false;
      return;
    }

    const diff = {};
    ["led1", "led2", "led3"].forEach((key) => {
      if (target[key] !== before[key]) diff[key] = target[key];
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
        return;
      }
    }

    const responseText = buildThaiResponse(before, target);
    aiResponseText.textContent = responseText;
    aiResponseBlock.hidden = false;

    speakMuted(responseText, () => {
      setStatus(assistantOn ? `Listening for “${CONFIG.WAKE_WORD}”…` : "", "ok");
      processing = false;
    });
  }

  // Speaks `text` while ignoring anything the mic picks up in the meantime,
  // so the assistant doesn't hear (and react to) its own voice.
  function speakMuted(text, onDone) {
    muted = true;
    Tts.speak(text, {
      onEnd: () => {
        muted = false;
        if (onDone) onDone();
      },
    });
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
