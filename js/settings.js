// ---------------------------------------------------------------------------
// AI Settings: lets the user enter, validate, store, and remove their own
// Gemini API key. The key lives only in localStorage — never in Supabase,
// never hard-coded in the source.
//
// This key is now OPTIONAL for voice control: the local command tiers
// (CommandParser, FuzzyMatch) handle the known LED vocabulary without any
// key at all. Gemini is only ever used as a last-resort fallback for
// phrasing the local tiers can't confidently classify.
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
    if (existingKey) input.value = existingKey;
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
      setNote("API key saved. AI fallback is enabled for tricky phrasing.", "ok");
    } catch (err) {
      setNote(err.message || "Invalid Gemini API key. Please check your API key.", "error");
    } finally {
      saveBtn.disabled = false;
    }
  }

  function handleClear() {
    localStorage.removeItem(CONFIG.GEMINI_KEY_STORAGE);
    input.value = "";
    setNote("API key removed. Local command matching still works as usual.", "ok");
    if (typeof Voice !== "undefined") Voice.stopIfListening();
  }

  function getApiKey() {
    return localStorage.getItem(CONFIG.GEMINI_KEY_STORAGE) || "";
  }

  return { init, getApiKey };
})();
