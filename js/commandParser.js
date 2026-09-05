// ---------------------------------------------------------------------------
// Local Thai command parser — plain regex/pattern matching, no API calls.
//
// Handles the fixed vocabulary this dashboard actually needs: turning
// led1/led2/led3 on or off (individually, combined, or "all"), and the
// "jarvis mode" easter egg. Runs entirely in the browser, so it costs
// nothing and never hits a Gemini rate limit.
//
// Returns the same shape Gemini.interpretCommand() returns, so voice.js
// can use either interchangeably:
//   { intent: "led_control"|"easter_egg", led1, led2, led3, easterEggId }
// Returns null when the text doesn't confidently match anything here —
// the caller can then fall back to Gemini for more flexible phrasing.
// ---------------------------------------------------------------------------

const CommandParser = (() => {
  const EASTER_TOKEN = /จาวิส|jarvis/i;

  // Each LED's recognized references. Order matters for led2/led3 vs a
  // bare "2"/"3" so they don't accidentally match inside other numbers.
  const LED_PATTERNS = {
    led1: /ดวงที่\s*1|ดวงที่\s*หนึ่ง|ดวงแรก|หนึ่ง|\b1\b/g,
    led2: /ดวงที่\s*2|ดวงที่\s*สอง|สอง|\b2\b/g,
    led3: /ดวงที่\s*3|ดวงที่\s*สาม|สาม|\b3\b/g,
  };
  const ALL_PATTERN = /ทั้งหมด|ทั้งสามดวง|ทุกดวง/g;
  const VERB_ON = /เปิด/g;
  // Negative lookbehind: "ปิด" (off) must NOT be preceded by "เ", otherwise
  // it's just matching the tail end of "เปิด" (on) — เปิด = เ + ปิด.
  const VERB_OFF = /(?<!เ)ปิด/g;

  function findAll(text, regex) {
    const re = new RegExp(regex.source, "g");
    const out = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      out.push(m.index);
      if (re.lastIndex === m.index) re.lastIndex++; // guard against zero-length matches
    }
    return out;
  }

  function parse(text, currentState) {
    if (!text) return null;

    if (EASTER_TOKEN.test(text)) {
      return {
        intent: "easter_egg",
        led1: currentState.led1,
        led2: currentState.led2,
        led3: currentState.led3,
        easterEggId: "jarvis_mode",
      };
    }

    // Build one timeline of every relevant token, in the order it appears
    // in the sentence, so we can track "which verb applies to which LED".
    const events = [];
    findAll(text, VERB_ON).forEach((i) => events.push({ index: i, kind: "verb", value: true }));
    findAll(text, VERB_OFF).forEach((i) => events.push({ index: i, kind: "verb", value: false }));
    Object.keys(LED_PATTERNS).forEach((key) => {
      findAll(text, LED_PATTERNS[key]).forEach((i) => events.push({ index: i, kind: "led", key }));
    });
    findAll(text, ALL_PATTERN).forEach((i) => events.push({ index: i, kind: "all" }));

    if (events.length === 0) return null;

    events.sort((a, b) => a.index - b.index);

    const result = { ...currentState };
    let currentVerb = null;
    let touched = false;

    events.forEach((e) => {
      if (e.kind === "verb") {
        currentVerb = e.value;
      } else if (currentVerb === null) {
        return; // a LED/all token before any เปิด/ปิด verb — ignore, ambiguous
      } else if (e.kind === "led") {
        result[e.key] = currentVerb;
        touched = true;
      } else if (e.kind === "all") {
        result.led1 = currentVerb;
        result.led2 = currentVerb;
        result.led3 = currentVerb;
        touched = true;
      }
    });

    if (!touched) return null;

    return {
      intent: "led_control",
      led1: result.led1,
      led2: result.led2,
      led3: result.led3,
      easterEggId: "",
    };
  }

  return { parse };
})();
