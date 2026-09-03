// ---------------------------------------------------------------------------
// Dashboard: renders the three LED panels, wires up manual toggle buttons,
// and reflects both local state and connection status.
// ---------------------------------------------------------------------------

const Dashboard = (() => {
  const LEDS = [
    { key: "led1", label: "LED 1" },
    { key: "led2", label: "LED 2" },
    { key: "led3", label: "LED 3" },
  ];

  let state = { led1: false, led2: false, led3: false };
  const panelEls = {};

  function init() {
    const row = document.getElementById("ledRow");
    const template = document.getElementById("ledPanelTemplate");

    LEDS.forEach(({ key, label }) => {
      const node = template.content.cloneNode(true);
      const article = node.querySelector(".led-panel");
      article.dataset.led = key;
      article.querySelector('[data-role="name"]').textContent = label;

      const toggleBtn = article.querySelector('[data-role="toggle"]');
      toggleBtn.addEventListener("click", () => handleToggle(key));
      toggleBtn.disabled = true; // enabled once we know the real state

      row.appendChild(node);
      panelEls[key] = row.querySelector(`.led-panel[data-led="${key}"]`);
    });
  }

  function render(newState) {
    state = { ...state, ...newState };

    LEDS.forEach(({ key }) => {
      const panel = panelEls[key];
      if (!panel) return;

      const isOn = !!state[key];
      panel.classList.toggle("is-on", isOn);
      panel.querySelector('[data-role="state"]').textContent = isOn ? "ON" : "OFF";

      const btn = panel.querySelector('[data-role="toggle"]');
      btn.textContent = isOn ? "Turn OFF" : "Turn ON";
      btn.disabled = false;
    });
  }

  async function handleToggle(key) {
    const panel = panelEls[key];
    const btn = panel.querySelector('[data-role="toggle"]');
    const nextValue = !state[key];

    btn.disabled = true;
    try {
      await Db.updateState({ [key]: nextValue });
      // Optimistically reflect the change; Realtime will confirm/correct it.
      render({ [key]: nextValue });
    } catch (err) {
      console.error("Failed to update LED state:", err);
      App.showConnectionError();
      btn.disabled = false;
    }
  }

  function setLedState(key, value) {
    render({ [key]: value });
  }

  function getState() {
    return { ...state };
  }

  return { init, render, setLedState, getState };
})();
