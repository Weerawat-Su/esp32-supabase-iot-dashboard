// ---------------------------------------------------------------------------
// AI Settings: lets the user enter, validate, store, and remove their own
// Gemini API key. The key lives only in localStorage — never in Supabase,
// never hard-coded in the source.
// ---------------------------------------------------------------------------

const Settings = (() => {
  let toggleBtn, chevron, body, input, showBtn, saveBtn, clearBtn, note;

  function init() {
    toggleBtn = document.getElementById("settingsToggle");
    chevron = document.getElementById("settingsChevron");
    body = document.getElementById("settingsBody");
    input = document.getElementById("geminiKeyInput");
    showBtn = document.getElementById("toggleKeyVisibility");
    saveBtn = document.getElementById("saveKeyBtn");
    clearBtn = document.getElementById("clearKeyBtn");
    note = document.getElementById("settingsNote");

    toggleBtn.addEventListener("click", () => {
      const expanded = toggleBtn.getAttribute("aria-expanded") === "true";
      toggleBtn.setAttribute("aria-expanded", String(!expanded));
      body.hidden = expanded;
    });

    document.getElementById("openSettingsFromVoice").addEventListener("click", () => {
      toggleBtn.setAttribute("aria-expanded", "true");
      body.hidden = false;
      toggleBtn.scrollIntoView({ behavior: "smooth", block: "start" });
      input.focus();
    });

    showBtn.addEventListener("click", () => {
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      showBtn.textContent = isPassword ? "Hide" : "Show";
    });

    saveBtn.addEventListener("click", handleSave);
    clearBtn.addEventListener("click", handleClear);

    const existingKey = getApiKey();
    if (existingKey) {
      input.value = existingKey;
      Voice.setEnabled(true);
    } else {
      Voice.setEnabled(false);
    }
  }

  function setNote(msg, kind) {
    note.textContent = msg || "";
    note.classList.remove("is-error", "is-ok");
    if (kind === "error") note.classList.add("is-error");
    if (kind === "ok") note.classList.add("is-ok");
  }

  async function handleSave() {
    const key = input.value.trim();

    if (!key) {
      setNote("Gemini API key is required for voice control.", "error");
      return;
    }

    saveBtn.disabled = true;
    setNote("Checking key…");

    try {
      await Gemini.validateApiKey(key);
      localStorage.setItem(CONFIG.GEMINI_KEY_STORAGE, key);
      setNote("API key saved. Voice control is enabled.", "ok");
      Voice.setEnabled(true);
    } catch (err) {
      setNote(err.message || "Invalid Gemini API key. Please check your API key.", "error");
      Voice.setEnabled(false);
    } finally {
      saveBtn.disabled = false;
    }
  }

  function handleClear() {
    localStorage.removeItem(CONFIG.GEMINI_KEY_STORAGE);
    input.value = "";
    setNote("API key removed.", "ok");
    Voice.setEnabled(false);
  }

  function getApiKey() {
    return localStorage.getItem(CONFIG.GEMINI_KEY_STORAGE) || "";
  }

  return { init, getApiKey };
})();
