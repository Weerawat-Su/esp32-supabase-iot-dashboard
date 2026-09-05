# Audio files for easter eggs

Drop your own MP3 files here. Filenames must match what's configured in
`js/config.js` under `CONFIG.EASTER_EGGS`.

Default expected file:

- `jarvis-mode.mp3` — played when the voice command matches "เปิดโหมดจาวิส"
  (or similar phrasing). Not included in this repo — add your own audio
  clip here with this exact filename.

To add more easter eggs, add another entry to `CONFIG.EASTER_EGGS` in
`js/config.js` with a new `id`, `phraseHint`, `audioFile` (path relative to
the site root, e.g. `audio/my-clip.mp3`), and `spokenReply`.
