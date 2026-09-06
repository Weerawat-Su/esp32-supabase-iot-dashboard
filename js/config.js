// ---------------------------------------------------------------------------
// Project configuration
//
// The Supabase URL and anon key below are safe to expose in client-side code
// as long as Row Level Security (RLS) policies are configured on the
// `device_state` table in Supabase. They are NOT secret credentials.
//
// The Gemini API key is handled separately (js/settings.js) and is entered
// by the user at runtime — it is never hard-coded here.
// ---------------------------------------------------------------------------

const CONFIG = {
  SUPABASE_URL: "https://wxelkbrnfvfkmqrojckh.supabase.co",
  SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4ZWxrYnJuZnZma21xcm9qY2toIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNDAzNDQsImV4cCI6MjEwMzkxNjM0NH0.AFFfuWKxG2MxNuUkqGjRx_Q01NvRmbwJomPFbCtA4fw",

  // Row in device_state that the ESP32 firmware reads/writes.
  DEVICE_STATE_TABLE: "device_state",
  DEVICE_STATE_ID: 1,

  // Gemini model used for Thai command interpretation.
  // Using the "-latest" alias so Google can roll the underlying model
  // forward without this breaking when an old pinned version is retired.
  GEMINI_MODEL: "gemini-flash-latest",

  // localStorage key used to persist the user's own Gemini API key.
  GEMINI_KEY_STORAGE: "esp32_dashboard_gemini_api_key",

  // Speech recognition / synthesis language.
  VOICE_LANG: "th-TH",

  // Easter eggs: playful voice commands that play a local clip instead of
  // controlling the LEDs. Gemini is told about these phrases so it can
  // recognize them alongside real LED commands. Each entry supports:
  //   - videoFile: plays full-page (see /video/README.md) — used below
  //   - audioFile: plays as background audio only (see /audio/README.md)
  // If both are set, videoFile takes priority.
  EASTER_EGGS: [
    {
      id: "jarvis_mode",
      phraseHint: 'เปิดโหมดจาวิส / เปิดโหมด Jarvis / โหมดจาวิส ("activate Jarvis mode")',
      videoFile: "video/jarvis-mode.mp4",
      spokenReply: "เปิดโหมดจาวิสครับ!",
    },
  ],
};
