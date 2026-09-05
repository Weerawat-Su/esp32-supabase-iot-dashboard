// ---------------------------------------------------------------------------
// Tier 2: local fuzzy string matching — no AI model, no download, no
// network call. Catches speech-to-text truncation/typos that the exact
// parser (CommandParser) can't, e.g. "ดวงที่สอ" instead of "ดวงที่สอง"
// (STT cutting off mid-word), by measuring character-level (Levenshtein)
// similarity against a small set of known command words instead of
// requiring an exact substring match.
//
// This is plain approximate string matching, not machine learning — it
// runs instantly and works completely offline.
// ---------------------------------------------------------------------------

const FuzzyMatch = (() => {
  // Confidence gate: the winning category must score at least this well...
  const CONFIDENCE_THRESHOLD = 0.6;
  // ...and beat the second-best category by at least this much, or we
  // refuse to guess rather than risk acting on the wrong LED.
  const MARGIN = 0.15;

  const CANON = {
    led1: ["หนึ่ง"],
    led2: ["สอง"],
    led3: ["สาม"],
    all: ["ทั้งหมด", "ทั้งสามดวง"],
    jarvis: ["จาวิส"],
  };

  function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;

    const dp = new Array(n + 1);
    for (let j = 0; j <= n; j++) dp[j] = j;

    for (let i = 1; i <= m; i++) {
      let prevDiag = dp[0];
      dp[0] = i;
      for (let j = 1; j <= n; j++) {
        const temp = dp[j];
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prevDiag + cost);
        prevDiag = temp;
      }
    }
    return dp[n];
  }

  function similarity(a, b) {
    if (a.length === 0 && b.length === 0) return 1;
    const dist = levenshtein(a, b);
    return 1 - dist / Math.max(a.length, b.length);
  }

  // Slides a window (roughly the length of `needle`, ±1 to tolerate a
  // truncated or extra character) across `haystack` and returns the best
  // similarity score found anywhere in it — this is what lets us find
  // "สอง" hiding (possibly truncated) inside a longer, unspaced Thai
  // sentence like "เปิดไฟดวงที่สอ".
  function bestSubstringSimilarity(haystack, needle) {
    let best = 0;

    if (haystack.length <= needle.length) {
      return similarity(haystack, needle);
    }

    const lengths = [needle.length - 1, needle.length, needle.length + 1].filter((l) => l > 0);
    lengths.forEach((len) => {
      for (let start = 0; start <= haystack.length - len; start++) {
        const window = haystack.substr(start, len);
        const score = similarity(window, needle);
        if (score > best) best = score;
      }
    });

    return best;
  }

  function bestScoreFor(text, words) {
    return Math.max(...words.map((w) => bestSubstringSimilarity(text, w)));
  }

  // Verbs (เปิด/ปิด) are matched exactly, not fuzzily — they're short,
  // clearly pronounced, and rarely the part of an utterance that gets cut
  // off (truncation from releasing the mic button happens at the END of
  // what's said, which is usually the LED reference, not the leading verb).
  // Fuzzily matching them is also risky: "ปิด" is literally the tail of
  // "เปิด", so a loose match could flip on/off by mistake.
  function findVerb(text) {
    const hasOn = /เปิด/.test(text);
    const hasOff = /(?<!เ)ปิด/.test(text);
    if (hasOn && !hasOff) return true;
    if (hasOff && !hasOn) return false;
    if (hasOn && hasOff) {
      // Both appear — trust whichever comes later, since that's closest
      // to the (possibly truncated) LED reference at the end.
      return text.lastIndexOf("เปิด") > text.lastIndexOf("ปิด");
    }
    return null; // no verb found at all — can't safely act
  }

  function parse(text, currentState) {
    if (!text) return null;

    const scores = Object.keys(CANON)
      .map((key) => ({ key, score: bestScoreFor(text, CANON[key]) }))
      .sort((a, b) => b.score - a.score);

    const top = scores[0];
    const second = scores[1];

    if (top.score < CONFIDENCE_THRESHOLD) return null; // not confident enough to guess
    if (top.score - second.score < MARGIN) return null; // too close to call — don't risk it

    if (top.key === "jarvis") {
      return {
        intent: "easter_egg",
        led1: currentState.led1,
        led2: currentState.led2,
        led3: currentState.led3,
        easterEggId: "jarvis_mode",
      };
    }

    const verb = findVerb(text);
    if (verb === null) return null; // found a LED/all reference but no clear เปิด/ปิด

    const result = { ...currentState };
    if (top.key === "all") {
      result.led1 = verb;
      result.led2 = verb;
      result.led3 = verb;
    } else {
      result[top.key] = verb;
    }

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
