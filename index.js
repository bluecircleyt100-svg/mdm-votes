import express from "express";
import fs from "fs";

const app = express();

/* ---------------- CONFIG ---------------- */

const PORT = process.env.PORT || 3000;

const DATA_FILE = "./data.json";
const COOLDOWN_FILE = "./cooldown.json";
const COOLDOWN_TIME = 60 * 1000;

/* ---------------- UTILIDADES ---------------- */

const loadJSON = (file, defaultData) => {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
};

const saveJSON = (file, data) => {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

const capitalize = (str) =>
  str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

const formatVotes = (n) =>
  n >= 1000 ? (n / 1000).toFixed(1).replace(".", ",") + "K" : n;

/* ---------------- TEST ---------------- */

app.get("/", (req, res) => {
  res.send("MDM Votes API ONLINE");
});

/* ---------------- VOTE ---------------- */

app.get("/vote", (req, res) => {
  const user = req.query.user;
  const msg = req.query.msg;

  if (!user || !msg) return res.send("");

  // Tomar solo el primer bloque antes del espacio
  const rawName = msg.trim().split(" ")[0];

  // Clave interna (normalizada)
  const key = rawName.toLowerCase();

  // Display EXACTO como lo escribió el usuario
  const display = rawName;

  const data = loadJSON(DATA_FILE, { votes: {} });
  const cooldown = loadJSON(COOLDOWN_FILE, {});

  const now = Date.now();

  // Inicializar estructuras
  if (!cooldown[user]) cooldown[user] = {};
  if (!cooldown[user][key]) cooldown[user][key] = 0;

  // Cooldown SOLO si es mismo user + mismo nombre
  if (now - cooldown[user][key] < COOLDOWN_TIME) {
    return res.send("You can't vote consecutively.");
  }

  // Inicializar voto si no existe
  if (!data.votes[key]) {
    data.votes[key] = {
      display,
      count: 0
    };
  }

  // Sumar voto
  data.votes[key].count++;

  // Guardar timestamp solo para este user + este nombre
  cooldown[user][key] = now;

  saveJSON(DATA_FILE, data);
  saveJSON(COOLDOWN_FILE, cooldown);

  res.send(
    `Voted for [ ${display} ]. ${data.votes[key].count} total votes @${user}`
  );
});

/* ---------------- RANK ---------------- */

app.get("/rank", (req, res) => {
  const name = req.query.name;
  if (!name) return res.send("");

  const key = name.trim().toLowerCase();
  const data = loadJSON(DATA_FILE, { votes: {} });

  if (!data.votes[key]) {
    return res.send(`[ ${capitalize(name)} ] has 0 votes.`);
  }

  const sorted = Object.values(data.votes).sort((a, b) => b.count - a.count);
  const rank = sorted.findIndex(
    (v) => v.display.toLowerCase() === key
  ) + 1;

  res.send(
    `[ ${data.votes[key].display} ] Voting ranking is #${rank} with a total of ${data.votes[key].count} votes.`
  );
});

/* ---------------- TOP ---------------- */

app.get("/top", (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const start = page - 1;
  const end = start + 10;

  const data = loadJSON(DATA_FILE, { votes: {} });

  const sorted = Object.values(data.votes).sort((a, b) => b.count - a.count);

  let response = "VOTES RANKING:";

  for (let i = start; i < end && i < sorted.length; i++) {
    const rank = i + 1;
    const name = sorted[i].display.toUpperCase();

    if (i === start) {
      response += ` #${rank} ${name} (${formatVotes(sorted[i].count)})`;
    } else {
      response += ` #${rank} ${name}`;
    }
  }

  res.send(response);
});

/* ---------------- START ---------------- */

app.listen(PORT, () => {
  console.log("✅ MDM Votes API running on port", PORT);
});
