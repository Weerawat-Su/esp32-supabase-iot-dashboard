// ---------------------------------------------------------------------------
// App bootstrap
// ---------------------------------------------------------------------------

const App = (() => {
  let connEl, connDot, connLabel;

  function setConnection(isConnected) {
    connEl.classList.toggle("is-connected", isConnected);
    connEl.classList.toggle("is-disconnected", !isConnected);
    connLabel.textContent = isConnected ? "Connected" : "Disconnected";
  }

  function showConnectionError() {
    setConnection(false);
  }

  async function init() {
    connEl = document.getElementById("connStatus");
    connDot = document.getElementById("connDot");
    connLabel = document.getElementById("connLabel");

    Dashboard.init();
    Voice.init();
    Settings.init();

    // Initial load of current LED state.
    try {
      const state = await Db.fetchState();
      Dashboard.render(state);
    } catch (err) {
      console.error("Failed to load initial LED state:", err);
      setConnection(false);
    }

    // Keep the dashboard in sync with the physical ESP32 in realtime.
    Db.subscribe({
      onState: (newState) => Dashboard.render(newState),
      onConnection: (isConnected) => setConnection(isConnected),
    });
  }

  return { init, showConnectionError };
})();

document.addEventListener("DOMContentLoaded", () => {
  App.init();
});
