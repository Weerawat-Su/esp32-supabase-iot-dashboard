// ---------------------------------------------------------------------------
// Supabase client wrapper
//
// Wraps all reads/writes to the `device_state` table and the Realtime
// subscription that keeps the dashboard in sync with the physical ESP32.
// ---------------------------------------------------------------------------

const Db = (() => {
  const client = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

  let channel = null;
  let onStateChange = null; // callback(state)
  let onConnectionChange = null; // callback(boolean)

  /**
   * Fetch the current LED state row.
   * Returns { led1, led2, led3 } or throws on failure.
   */
  async function fetchState() {
    const { data, error } = await client
      .from(CONFIG.DEVICE_STATE_TABLE)
      .select("led1, led2, led3")
      .eq("id", CONFIG.DEVICE_STATE_ID)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Patch the LED state row with only the fields provided.
   * e.g. updateState({ led1: true })
   */
  async function updateState(partialState) {
    const { error } = await client
      .from(CONFIG.DEVICE_STATE_TABLE)
      .update(partialState)
      .eq("id", CONFIG.DEVICE_STATE_ID);

    if (error) throw error;
  }

  /**
   * Subscribe to realtime changes on the device_state row and to the
   * channel's own connection status.
   */
  function subscribe({ onState, onConnection }) {
    onStateChange = onState;
    onConnectionChange = onConnection;

    channel = client
      .channel("device_state_changes")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: CONFIG.DEVICE_STATE_TABLE,
          filter: `id=eq.${CONFIG.DEVICE_STATE_ID}`,
        },
        (payload) => {
          if (onStateChange) onStateChange(payload.new);
        }
      )
      .subscribe((status) => {
        if (!onConnectionChange) return;
        if (status === "SUBSCRIBED") {
          onConnectionChange(true);
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          onConnectionChange(false);
        }
      });

    return channel;
  }

  return { fetchState, updateState, subscribe };
})();
