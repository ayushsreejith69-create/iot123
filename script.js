const TOPICS = {
  moisture: "iot/plant/moisture",
  pumpSet: "iot/plant/pump/set",
  pumpState: "iot/plant/pump/state",
  mode: "iot/plant/mode"
};

const $ = (id) => document.getElementById(id);
const ui = {
  statusDot: $("statusDot"),
  connectionText: $("connectionText"),
  moistureValue: $("moistureValue"),
  moistureUnit: $("moistureUnit"),
  moistureBar: $("moistureBar"),
  moistureHint: $("moistureHint"),
  pumpState: $("pumpState"),
  pumpIndicator: $("pumpIndicator"),
  pumpOn: $("pumpOn"),
  pumpOff: $("pumpOff"),
  autoMode: $("autoMode"),
  manualMode: $("manualMode"),
  modeNote: $("modeNote"),
  settingsDialog: $("settingsDialog"),
  settingsForm: $("settingsForm"),
  brokerUrl: $("brokerUrl"),
  username: $("username"),
  password: $("password"),
  settingsMessage: $("settingsMessage"),
  toast: $("toast")
};

let client = null;
let currentMode = "";
let toastTimeout = null;

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => ui.toast.classList.remove("show"), 2600);
}

function setConnection(connected, text) {
  ui.statusDot.classList.toggle("connected", connected);
  ui.connectionText.textContent = text;
  [ui.pumpOn, ui.pumpOff, ui.autoMode, ui.manualMode].forEach(button => {
    button.disabled = !connected;
  });
}

function publish(topic, value) {
  if (!client || !client.connected) {
    showToast("Connect to your MQTT broker first.");
    return;
  }
  client.publish(topic, value, { qos: 0, retain: false }, error => {
    if (error) showToast("Command could not be sent.");
    else showToast(`Sent ${value} command.`);
  });
}

function updateMoisture(payload) {
  const raw = String(payload).trim();
  const parsed = Number(raw.replace("%", ""));
  if (raw === "" || !Number.isFinite(parsed)) {
    ui.moistureValue.textContent = "--";
    ui.moistureHint.textContent = `Sensor value: ${raw || "empty"}`;
    ui.moistureBar.style.width = "0%";
    return;
  }

  // The bridge publishes the Arduino's value unchanged. If the Arduino sends
  // raw ADC values (e.g. 0–1023), change this mapping to match your calibration.
  const percent = Math.max(0, Math.min(100, parsed));
  ui.moistureValue.textContent = Math.round(percent);
  ui.moistureUnit.textContent = "%";
  ui.moistureBar.style.width = `${percent}%`;

  if (percent < 30) ui.moistureHint.textContent = "Looking a little dry — check if watering is needed.";
  else if (percent < 70) ui.moistureHint.textContent = "Moisture looks comfortable.";
  else ui.moistureHint.textContent = "Quite moist — keep an eye on watering.";
}

function updatePump(payload) {
  const state = String(payload).trim().toUpperCase();
  const isOn = ["ON", "1", "TRUE", "RUNNING"].includes(state);
  const isOff = ["OFF", "0", "FALSE", "STOPPED"].includes(state);
  ui.pumpState.textContent = isOn ? "Running" : isOff ? "Off" : state || "Unknown";
  ui.pumpIndicator.classList.toggle("on", isOn);
}

function updateMode(payload) {
  const mode = String(payload).trim().toUpperCase();
  currentMode = mode;
  ui.autoMode.classList.toggle("active", mode === "AUTO");
  ui.manualMode.classList.toggle("active", mode === "MANUAL");
  ui.modeNote.textContent = mode === "AUTO"
    ? "Automatic mode is active. Your device controls watering."
    : mode === "MANUAL"
      ? "Manual mode is active. You can send pump commands below."
      : `Device mode: ${mode || "waiting for data"}`;
}

function connectBroker(url, username, password) {
  if (typeof mqtt === "undefined") {
    ui.settingsMessage.textContent = "MQTT.js did not load. Check your internet connection and reload.";
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
    ui.settingsMessage.textContent = "Invalid broker URL. Use ws:// or wss://.";
    return;
  }

  client.on("connect", () => {
    setConnection(true, "Connected");
    ui.settingsMessage.textContent = "Connected. Listening for plant updates.";
    client.subscribe([TOPICS.moisture, TOPICS.pumpState, TOPICS.mode], { qos: 0 }, error => {
      if (error) showToast("Connected, but subscribing to topics failed.");
    });
    showToast("Connected to your plant broker.");
  });

  client.on("reconnect", () => setConnection(false, "Reconnecting…"));
  client.on("offline", () => setConnection(false, "Offline"));
  client.on("close", () => setConnection(false, "Disconnected"));
  client.on("error", error => {
    console.error("MQTT connection error:", error);
    setConnection(false, "Connection error");
    ui.settingsMessage.textContent = "Couldn't connect. Check the URL, WebSocket listener, and broker settings.";
  });

  client.on("message", (topic, message) => {
    const payload = message.toString();
    if (topic === TOPICS.moisture) updateMoisture(payload);
    if (topic === TOPICS.pumpState) updatePump(payload);
    if (topic === TOPICS.mode) updateMode(payload);
  });
}

ui.pumpOn.addEventListener("click", () => publish(TOPICS.pumpSet, "ON"));
ui.pumpOff.addEventListener("click", () => publish(TOPICS.pumpSet, "OFF"));
ui.autoMode.addEventListener("click", () => publish(TOPICS.mode, "AUTO"));
ui.manualMode.addEventListener("click", () => publish(TOPICS.mode, "MANUAL"));

$("openSettings").addEventListener("click", () => ui.settingsDialog.showModal());
$("closeSettings").addEventListener("click", () => ui.settingsDialog.close());

ui.settingsForm.addEventListener("submit", event => {
  event.preventDefault();
  const url = ui.brokerUrl.value.trim();
  if (!/^wss?:\/\//i.test(url)) {
    ui.settingsMessage.textContent = "URL must start with ws:// or wss://.";
    return;
  }
  connectBroker(url, ui.username.value.trim(), ui.password.value);
});

$("disconnectButton").addEventListener("click", () => {
  if (client) client.end(true);
  client = null;
  setConnection(false, "Disconnected");
  ui.settingsMessage.textContent = "Disconnected from broker.";
  showToast("Disconnected.");
});

connectBroker(ui.brokerUrl.value, "", "");
