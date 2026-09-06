// ---------------------------------------------------------------------------
// Full-page video overlay for easter eggs. Not real OS-level fullscreen —
// just a fixed, full-viewport <video> that covers the dashboard while it
// plays, then removes itself and returns to the page underneath. A visible
// skip/close button is always available, and playback is bounded by a
// failsafe timeout — same defensive pattern used elsewhere in this app —
// so a clip that fails to fire "ended" (or fails to load) can never leave
// the page stuck under a black overlay.
// ---------------------------------------------------------------------------

const VideoOverlay = (() => {
  const DEFAULT_FAILSAFE_MS = 120000; // hard ceiling if duration is unknown or playback stalls

  let overlay, video, closeBtn;
  let onDoneCallback = null;
  let failsafeTimer = null;

  function init() {
    overlay = document.getElementById("videoOverlay");
    video = document.getElementById("videoOverlayPlayer");
    closeBtn = document.getElementById("videoOverlayClose");

    video.addEventListener("ended", finish);
    video.addEventListener("error", finish); // file missing/unsupported — don't get stuck
    video.addEventListener("loadedmetadata", () => {
      if (video.duration && isFinite(video.duration)) {
        armFailsafe((video.duration + 2) * 1000); // real duration + a small buffer
      }
    });
    closeBtn.addEventListener("click", finish);
  }

  function armFailsafe(ms) {
    clearTimeout(failsafeTimer);
    failsafeTimer = setTimeout(finish, ms);
  }

  /**
   * Plays `src` full-page. Calls `onDone` exactly once, whether the video
   * finishes normally, errors out, gets skipped, or times out.
   */
  function play(src, onDone) {
    let done = false;
    onDoneCallback = () => {
      if (done) return;
      done = true;
      if (onDone) onDone();
    };

    overlay.hidden = false;
    video.src = src;
    video.currentTime = 0;

    armFailsafe(DEFAULT_FAILSAFE_MS);

    video.play().catch((err) => {
      console.error("[VideoOverlay] could not play video:", err);
      finish();
    });
  }

  function finish() {
    overlay.hidden = true;
    clearTimeout(failsafeTimer);
    video.pause();
    video.removeAttribute("src");
    video.load();

    const cb = onDoneCallback;
    onDoneCallback = null;
    if (cb) cb();
  }

  return { init, play };
})();
