const TOPICS = {
  moisture: "iot/plant/moisture",
  pumpSet: "iot/plant/pump/set",
  pumpState: "iot/plant/pump/state",
  mode: "iot/plant/mode",
  lightState: "iot/plant/light",
  lightSet: "iot/plant/light/set"
};

const $ = id => document.getElementById(id);

const ui = Object.fromEntries([
  "statusDot",
  "connectionText",
  "moistureValue",
  "moistureUnit",
  "moistureBar",
  "moistureHint",
  "pumpState",
  "pumpIndicator",
  "pumpOn",
  "pumpOff",
  "autoMode",
  "manualMode",
  "modeNote",
  "lightOn",
  "lightOff",
  "lightNote",
  "settingsDialog",
  "settingsForm",
  "brokerUrl",
  "username",
  "password",
  "settingsMessage",
  "toast"
].map(id => [id, $(id)]));

let client = null;
let toastTimeout = null;

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add("show");

  clearTimeout(toastTimeout);

  toastTimeout = setTimeout(() => {
    ui.toast.classList.remove("show");
  }, 2600);
}

function setConnection(connected, label) {
  ui.statusDot.classList.toggle("connected", connected);
  ui.connectionText.textContent = label;

  [
    ui.pumpOn,
    ui.pumpOff,
    ui.autoMode,
    ui.manualMode,
    ui.lightOn,
    ui.lightOff
  ].forEach(button => {
    button.disabled = !connected;
  });
}

function publish(topic, value) {
  if (!client || !client.connected) {
    showToast("Connect to your MQTT broker first.");
    return;
  }

  client.publish(topic, value, { qos: 0, retain: false }, error => {
    if (error) {
      showToast("Command could not be sent.");
    } else {
      showToast(`Sent ${value} command.`);
    }
  });
}

function updateMoisture(payload) {
  const raw = String(payload).trim();
  const value = Number(raw.replace("%", ""));

  if (!raw || !Number.isFinite(value)) {
    ui.moistureValue.textContent = "--";
    ui.moistureHint.textContent = "Waiting for valid sensor data.";
    ui.moistureBar.style.width = "0%";
    return;
  }

  // Assumes Arduino sends calibrated moisture from 0 to 100%.
  const percent = Math.max(0, Math.min(100, value));

  ui.moistureValue.textContent = Math.round(percent);
  ui.moistureUnit.textContent = "%";
  ui.moistureBar.style.width = `${percent}%`;

  if (percent < 30) {
    ui.moistureHint.textContent =
      "Looking a little dry — check if watering is needed.";
  } else if (percent < 70) {
    ui.moistureHint.textContent = "Moisture looks comfortable.";
  } else {
    ui.moistureHint.textContent =
      "Quite moist — keep an eye on watering.";
  }
}

function updatePump(payload) {
  const state = String(payload).trim().toUpperCase();

  const isOn = ["ON", "1", "TRUE", "RUNNING"].includes(state);
  const isOff = ["OFF", "0", "FALSE", "STOPPED"].includes(state);

  ui.pumpState.textContent = isOn
    ? "Running"
    : isOff
      ? "Off"
      : state || "Unknown";

  ui.pumpIndicator.classList.toggle("on", isOn);
}

function updateMode(payload) {
  const mode = String(payload).trim().toUpperCase();

  ui.autoMode.classList.toggle("active", mode === "AUTO");
  ui.manualMode.classList.toggle("active", mode === "MANUAL");

  if (mode === "AUTO") {
    ui.modeNote.textContent =
      "Automatic mode is active. Your device controls watering.";
  } else if (mode === "MANUAL") {
    ui.modeNote.textContent =
      "Manual mode is active. You can send pump commands below.";
  } else {
    ui.modeNote.textContent =
      `Device mode: ${mode || "waiting for data"}`;
  }
}

function updateLight(payload) {
  const state = String(payload).trim().toUpperCase();

  const isOn = ["ON", "1", "TRUE"].includes(state);
  const isOff = ["OFF", "0", "FALSE"].includes(state);

  ui.lightOn.classList.toggle("active", isOn);
  ui.lightOff.classList.toggle("active", isOff);

  if (isOn) {
    ui.lightNote.textContent = "Grow light is reported as ON.";
  } else if (isOff) {
    ui.lightNote.textContent = "Grow light is reported as OFF.";
  } else {
    ui.lightNote.textContent =
      `Light state: ${state || "waiting for data"}`;
  }
}

function connectBroker(url, username, password) {
  if (typeof mqtt === "undefined") {
    ui.settingsMessage.textContent =
      "MQTT.js failed to load. Check your internet connection.";
    return;
  }

  if (client) {
    client.end(true);
    client = null;
  }

  setConnection(false, "Connecting…");
  ui.settingsMessage.textContent = "Connecting to broker…";

  const options = {
    clientId: `sprout_web_${Math.random().toString(16).slice(2, 10)}`,
    clean: true,
    connectTimeout: 10000,
    reconnectPeriod: 3000
  };

  if (username) options.username = username;
  if (password) options.password = password;

  try {
    client = mqtt.connect(url, options);
  } catch (error) {
    setConnection(false, "Connection error");
    ui.settingsMessage.textContent =
      "Invalid broker URL. Use ws:// or wss://.";
    return;
  }

  client.on("connect", () => {
    setConnection(true, "Connected");

    ui.settingsMessage.textContent =
      "Connected. Listening for plant updates.";

    client.subscribe([
      TOPICS.moisture,
      TOPICS.pumpState,
      TOPICS.mode,
      TOPICS.lightState
    ], error => {
      if (error) {
        showToast("Could not subscribe to all topics.");
      }
    });

    showToast("Connected to your plant broker.");
  });

  client.on("reconnect", () => {
    setConnection(false, "Reconnecting…");
  });

  client.on("offline", () => {
    setConnection(false, "Offline");
  });

  client.on("close", () => {
    setConnection(false, "Disconnected");
  });

  client.on("error", error => {
    console.error("MQTT connection error:", error);

    setConnection(false, "Connection error");

    ui.settingsMessage.textContent =
      "Connection failed. Check the WebSocket URL and broker settings.";
  });

  client.on("message", (topic, message) => {
    const payload = message.toString();

    if (topic === TOPICS.moisture) {
      updateMoisture(payload);
    } else if (topic === TOPICS.pumpState) {
      updatePump(payload);
    } else if (topic === TOPICS.mode) {
      updateMode(payload);
    } else if (topic === TOPICS.lightState) {
      updateLight(payload);
    }
  });
}

// Pump controls
ui.pumpOn.addEventListener("click", () => {
  publish(TOPICS.pumpSet, "ON");
});

ui.pumpOff.addEventListener("click", () => {
  publish(TOPICS.pumpSet, "OFF");
});

// Automatic and manual watering
ui.autoMode.addEventListener("click", () => {
  publish(TOPICS.mode, "AUTO");
});

ui.manualMode.addEventListener("click", () => {
  publish(TOPICS.mode, "MANUAL");
});

// Grow-light controls
ui.lightOn.addEventListener("click", () => {
  publish(TOPICS.lightSet, "ON");
});

ui.lightOff.addEventListener("click", () => {
  publish(TOPICS.lightSet, "OFF");
});

// Settings dialog
$("openSettings").addEventListener("click", () => {
  ui.settingsDialog.showModal();
});

$("closeSettings").addEventListener("click", () => {
  ui.settingsDialog.close();
});

ui.settingsForm.addEventListener("submit", event => {
  event.preventDefault();

  const url = ui.brokerUrl.value.trim();

  if (!/^wss?:\/\//i.test(url)) {
    ui.settingsMessage.textContent =
      "URL must start with ws:// or wss://.";
    return;
  }

  connectBroker(
    url,
    ui.username.value.trim(),
    ui.password.value
  );
});

$("disconnectButton").addEventListener("click", () => {
  if (client) {
    client.end(true);
  }

  client = null;

  setConnection(false, "Disconnected");

  ui.settingsMessage.textContent =
    "Disconnected from broker.";

  showToast("Disconnected.");
});

// Initial connection
connectBroker(ui.brokerUrl.value, "", "");
