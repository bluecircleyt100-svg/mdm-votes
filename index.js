import express from "express";
import { MongoClient } from "mongodb";

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error("❌ MONGODB_URI is not defined");
  process.exit(1);
}

/* ---------------- MONGO ---------------- */

const client = new MongoClient(MONGO_URI);
await client.connect();

const db = client.db("mdm_votes");
const votesCol = db.collection("votes");
const cooldownCol = db.collection("cooldowns");
const dailyVotesCol = db.collection("daily_votes");

/* ---------------- UTILS ---------------- */

const formatVotes = (n) =>
  n >= 1000 ? (n / 1000).toFixed(1).replace(".", ",") + "K" : n;

const getArgentinaStartOfDay = () => {
  const now = new Date();
  const arg = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" })
  );
  arg.setHours(0, 0, 0, 0);
  return arg;
};

/* ---------------- VOTE ---------------- */

app.get("/vote", async (req, res) => {
  const user = req.query.user;
  const msg = req.query.msg;
  if (!user || !msg) return res.send("");

  const rawName = msg.trim().split(" ")[0]; // respeta mayúsculas
  const key = rawName.toLowerCase();
  const now = Date.now();

  const cooldownKey = `${user}:${key}`;
  const lastVote = await cooldownCol.findOne({ _id: cooldownKey });

  if (lastVote && now - lastVote.timestamp < 60_000) {
    return res.send("You can't vote consecutively.");
  }

  await votesCol.updateOne(
    { _id: key },
    { $setOnInsert: { display: rawName }, $inc: { count: 1 } },
    { upsert: true }
  );

  const dayStart = getArgentinaStartOfDay();

  await dailyVotesCol.updateOne(
    { keyword: key, day: dayStart },
    { $setOnInsert: { display: rawName }, $inc: { count: 1 } },
    { upsert: true }
  );

  await cooldownCol.updateOne(
    { _id: cooldownKey },
    { $set: { timestamp: now } },
    { upsert: true }
  );

  const vote = await votesCol.findOne({ _id: key });

  res.send(
    `Voted for [ ${vote.display} ]. ${vote.count} total votes @${user}`
  );
});

/* ---------------- RANK ---------------- */

app.get("/rank", async (req, res) => {
  const name = req.query.name;
  if (!name) return res.send("");

  const key = name.trim().toLowerCase();

  const all = await votesCol.find().sort({ count: -1 }).toArray();
  const index = all.findIndex(v => v._id === key);

  if (index === -1) {
    return res.send(`[ ${name} ] has 0 votes.`);
  }

  res.send(
    `[ ${all[index].display} ] Voting ranking is #${index + 1} with a total of ${all[index].count} votes.`
  );
});

/* ---------------- TOP ---------------- */

app.get("/top", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const start = page - 1;
  const end = start + 10;

  const sorted = await votesCol.find().sort({ count: -1 }).toArray();

  let response = "VOTES RANKING:";

  for (let i = start; i < end && i < sorted.length; i++) {
    const rank = i + 1;
    const name = sorted[i].display.toUpperCase();
    const votes = formatVotes(sorted[i].count);

    response += i === start
      ? ` #${rank} ${name} (${votes})`
      : ` #${rank} ${name}`;
  }

  res.send(response);
});

/* ---------------- FASTEST (HOY) ---------------- */

app.get("/fastest", async (req, res) => {
  const dayStart = getArgentinaStartOfDay();

  const top = await dailyVotesCol
    .find({ day: dayStart })
    .sort({ count: -1 })
    .limit(1)
    .toArray();

  if (top.length === 0) {
    return res.send("No votes registered today.");
  }

  const winner = top[0];

  res.send(
    `Current Fastest Keyword: ${winner.display.toUpperCase()} [ ${winner.count} Votes Today ] -> All information comes from 0:00 (Argentine time) until the time the command was placed.`
  );
});

/* ---------------- START ---------------- */

app.listen(PORT, () => {
  console.log("✅ MDM Votes API running on port", PORT);
});
