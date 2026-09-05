// ---------------------------------------------------------------------------
// Gemini integration
//
// Converts natural Thai commands into a structured { led1, led2, led3 }
// target state, using the Gemini API directly from the browser with the
// user's own API key. The LLM never talks to the ESP32 or to Supabase —
// it only returns JSON, which the rest of the app applies.
//
// The API key is sent via the `x-goog-api-key` header (Google's documented,
// preferred method) rather than the `?key=` query parameter — this keeps
// the key out of URL/access logs and is the currently recommended approach
// for both Standard and Auth-type Gemini API keys.
// ---------------------------------------------------------------------------

const Gemini = (() => {
  function endpointFor() {
    return `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent`;
  }

  function headersFor(apiKey) {
    return {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    };
  }

  // Reads the response body (for logging) without throwing if it isn't
  // valid JSON, and logs status + body to the console so the *real* reason
  // for a failure is visible in DevTools instead of being hidden behind a
  // generic user-facing message.
  async function logFailure(label, res) {
    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch (err) {
      bodyText = "(could not read response body)";
    }
    console.error(`[Gemini] ${label} — HTTP ${res.status}`, bodyText);
  }

  /**
   * Makes a minimal, cheap call to confirm the API key actually works.
   * Throws an Error with a user-facing message on failure.
   */
  async function validateApiKey(apiKey) {
    if (!apiKey || !apiKey.trim()) {
      throw new Error("Gemini API key is required for voice control.");
    }

    let res;
    try {
      res = await fetch(endpointFor(), {
        method: "POST",
        headers: headersFor(apiKey),
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "ping" }] }],
          generationConfig: { maxOutputTokens: 1 },
        }),
      });
    } catch (err) {
      console.error("[Gemini] validateApiKey — network error", err);
      throw new Error("Unable to reach the Gemini API. Check your connection and try again.");
    }

    if (!res.ok) {
      await logFailure("validateApiKey", res);
    }

    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new Error("Invalid Gemini API key. Please check your API key.");
    }
    if (res.status === 429) {
      throw new Error("Gemini is rate-limiting this key right now. Wait a moment and try again.");
    }
    if (!res.ok) {
      throw new Error("Invalid Gemini API key. Please check your API key.");
    }
  }

  /**
   * Sends the recognized Thai text plus the current LED state to Gemini and
   * asks it to classify + interpret the command. Handles two kinds of
   * commands:
   *   - LED control: returns the RESULTING state of all three LEDs
   *   - Easter egg: a playful phrase (configured in CONFIG.EASTER_EGGS)
   *     that should trigger a local sound clip instead of touching the LEDs
   *
   * Returns { intent: "led_control"|"easter_egg"|"unclear",
   *           led1, led2, led3, easterEggId }.
   */
  async function interpretCommand(apiKey, thaiText, currentState) {
    const easterEggList = CONFIG.EASTER_EGGS.map((e) => `- id "${e.id}": ${e.phraseHint}`).join(
      "\n"
    );

    const systemPrompt = [
      "You control three LEDs named led1, led2, and led3 on an ESP32 device,",
      "and you also recognize a few playful \"easter egg\" voice phrases.",
      "You will be given the CURRENT state of the LEDs and a COMMAND spoken in Thai.",
      "",
      "First decide the intent:",
      '- "led_control": the command is about turning LEDs on/off.',
      '- "easter_egg": the command matches one of the easter egg phrases below.',
      '- "unclear": neither of the above — you cannot confidently classify it.',
      "",
      "Known easter egg phrases (match by meaning, not exact wording):",
      easterEggList || "(none configured)",
      "",
      "For led_control: return the RESULTING state of all three LEDs after the",
      "command is applied. Any LED not mentioned in the command must keep its",
      'current value. Thai words like "ดวงที่หนึ่ง/ดวงแรก" refer to led1,',
      '"ดวงที่สอง" to led2, "ดวงที่สาม" to led3, and "ทั้งหมด/ทั้งสามดวง" refers',
      'to all three. "เปิด" means turn on (true). "ปิด" means turn off (false).',
      "",
      "For easter_egg: set easterEggId to the matching id from the list above.",
      "",
      "For anything else (led1/led2/led3 when intent is easter_egg or unclear,",
      "and easterEggId when intent is led_control or unclear): keep led1/led2/led3",
      "equal to their CURRENT values, and set easterEggId to an empty string.",
      "",
      "Respond ONLY with JSON matching the schema. No prose, no markdown.",
    ].join(" ");

    const userPrompt = `CURRENT: ${JSON.stringify(currentState)}\nCOMMAND: ${thaiText}`;

    const body = {
      // No "role" on systemInstruction — Gemini's systemInstruction is a
      // plain Content object; some model/API versions reject an explicit
      // role here with a 400.
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            intent: { type: "STRING", enum: ["led_control", "easter_egg", "unclear"] },
            led1: { type: "BOOLEAN" },
            led2: { type: "BOOLEAN" },
            led3: { type: "BOOLEAN" },
            easterEggId: { type: "STRING" },
          },
          required: ["intent", "led1", "led2", "led3", "easterEggId"],
        },
      },
    };

    let res;
    try {
      res = await fetch(endpointFor(), {
        method: "POST",
        headers: headersFor(apiKey),
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.error("[Gemini] interpretCommand — network error", err);
      throw new Error("AI processing failed. Please try again.");
    }

    if (!res.ok) {
      await logFailure("interpretCommand", res);
    }

    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new Error("Invalid Gemini API key. Please check your API key.");
    }
    if (res.status === 429) {
      throw new Error("Gemini is rate-limiting this key right now. Wait a moment and try again.");
    }
    if (!res.ok) {
      throw new Error("AI processing failed. Please try again.");
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error("[Gemini] interpretCommand — no text in response", data);
      throw new Error("AI processing failed. Please try again.");
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      console.error("[Gemini] interpretCommand — could not parse JSON", text);
      throw new Error("AI processing failed. Please try again.");
    }

    if (
      typeof parsed.intent !== "string" ||
      typeof parsed.led1 !== "boolean" ||
      typeof parsed.led2 !== "boolean" ||
      typeof parsed.led3 !== "boolean"
    ) {
      console.error("[Gemini] interpretCommand — unexpected shape", parsed);
      throw new Error("AI processing failed. Please try again.");
    }

    return parsed;
  }

  return { validateApiKey, interpretCommand };
})();
