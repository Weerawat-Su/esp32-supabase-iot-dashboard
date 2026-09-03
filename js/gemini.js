// ---------------------------------------------------------------------------
// Gemini integration
//
// Converts natural Thai commands into a structured { led1, led2, led3 }
// target state, using the Gemini API directly from the browser with the
// user's own API key. The LLM never talks to the ESP32 or to Supabase —
// it only returns JSON, which the rest of the app applies.
// ---------------------------------------------------------------------------

const Gemini = (() => {
  function endpointFor(apiKey) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${encodeURIComponent(
      apiKey
    )}`;
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
      res = await fetch(endpointFor(apiKey), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "ping" }] }],
          generationConfig: { maxOutputTokens: 1 },
        }),
      });
    } catch (err) {
      throw new Error("Unable to reach the Gemini API. Check your connection and try again.");
    }

    if (res.status === 400 || res.status === 403) {
      throw new Error("Invalid Gemini API key. Please check your API key.");
    }
    if (!res.ok) {
      throw new Error("Invalid Gemini API key. Please check your API key.");
    }
  }

  /**
   * Sends the recognized Thai text plus the current LED state to Gemini and
   * asks for the resulting target state as strict JSON.
   *
   * Returns { led1: boolean, led2: boolean, led3: boolean }.
   */
  async function interpretCommand(apiKey, thaiText, currentState) {
    const systemPrompt = [
      "You control three LEDs named led1, led2, and led3 on an ESP32 device.",
      "You will be given the CURRENT state of the LEDs and a COMMAND spoken in Thai.",
      "Interpret the Thai command (natural, varied sentence structures are allowed) and",
      "return the RESULTING state of all three LEDs after the command is applied.",
      "Any LED not mentioned in the command must keep its current value.",
      'Thai words like "ดวงที่หนึ่ง/ดวงแรก" refer to led1, "ดวงที่สอง" to led2,',
      '"ดวงที่สาม" to led3, and "ทั้งหมด/ทั้งสามดวง" refers to all three.',
      '"เปิด" means turn on (true). "ปิด" means turn off (false).',
      "Respond ONLY with JSON matching the schema. No prose, no markdown.",
    ].join(" ");

    const userPrompt = `CURRENT: ${JSON.stringify(currentState)}\nCOMMAND: ${thaiText}`;

    const body = {
      systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            led1: { type: "BOOLEAN" },
            led2: { type: "BOOLEAN" },
            led3: { type: "BOOLEAN" },
          },
          required: ["led1", "led2", "led3"],
        },
      },
    };

    let res;
    try {
      res = await fetch(endpointFor(apiKey), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error("AI processing failed. Please try again.");
    }

    if (res.status === 400 || res.status === 403) {
      throw new Error("Invalid Gemini API key. Please check your API key.");
    }
    if (!res.ok) {
      throw new Error("AI processing failed. Please try again.");
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("AI processing failed. Please try again.");
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error("AI processing failed. Please try again.");
    }

    if (
      typeof parsed.led1 !== "boolean" ||
      typeof parsed.led2 !== "boolean" ||
      typeof parsed.led3 !== "boolean"
    ) {
      throw new Error("AI processing failed. Please try again.");
    }

    return parsed;
  }

  return { validateApiKey, interpretCommand };
})();
