# Video files for easter eggs

Drop your own MP4 file here. Filename must match what's configured in
`js/config.js` under `CONFIG.EASTER_EGGS`.

Default expected file:

- `jarvis-mode.mp4` — plays full-screen (overlaid on top of the dashboard)
  when the voice command matches "เปิดโหมดจาวิส". Not included in this
  repo — add your own clip here with this exact filename.

**Format requirements:**
- Must be **MP4 with H.264 video codec** (and AAC audio) for reliable
  playback across browsers, especially iOS Safari — other codecs
  (e.g. VP9/WebM) may fail silently on iOS.
- Keep the file reasonably small — GitHub has a soft 100MB-per-file limit,
  and large files make the page slower to load the first time. Compressing
  with HandBrake or `ffmpeg` (e.g. `ffmpeg -i input.mp4 -vcodec libx264
  -crf 28 jarvis-mode.mp4`) is usually enough.

The video plays over the whole page (not real OS-level fullscreen — no
extra permission prompt, just a full-viewport overlay) and automatically
returns to the dashboard when it finishes. A skip/close button is always
available in case a clip is too long or fails to play.
