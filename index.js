import express from "express";
import { MongoClient } from "mongodb";

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGODB_URI;

/* ---------------- MONGO ---------------- */

const client = new MongoClient(MONGO_URI);
await client.connect();

const db = client.db("mdm_votes");
const votesCol = db.collection("votes");
const cooldownCol = db.collection("cooldowns");
const dailyCol = db.collection("daily_votes");

/* ---------------- UTILS ---------------- */

const formatVotes = (n) =>
  n >= 1000 ? (n / 1000).toFixed(1).replace(".", ",") + "K" : n;

const getArgDate = () => {
  const now = new Date();
  const argTime = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" })
  );
  return argTime.toISOString().split("T")[0];
};

/* ---------------- VOTE ---------------- */

app.get("/vote", async (req, res) => {
  const user = req.query.user;
  const msg = req.query.msg;

  if (!user || !msg) return res.send("");

  const rawName = msg.trim().split(" ")[0];
  const key = rawName.toLowerCase();

  const now = Date.now();
  const today = getArgDate();

  const cooldownKey = `${user}:${key}`;
  const lastVote = await cooldownCol.findOne({ _id: cooldownKey });

  if (lastVote && now - lastVote.timestamp < 60_000) {
    return res.send("You can't vote consecutively.");
  }

  // TOTAL votes (histórico)
  await votesCol.updateOne(
    { _id: key },
    {
      $setOnInsert: { display: rawName },
      $inc: { count: 1 }
    },
    { upsert: true }
  );

  // DAILY vote
  await dailyCol.insertOne({
    keyword: key,
    display: rawName,
    date: today,
    timestamp: now
  });

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

/* ---------------- FASTEST ---------------- */

app.get("/fastest", async (req, res) => {
  const today = getArgDate();

  const results = await dailyCol.aggregate([
    { $match: { date: today } },
    {
      $group: {
        _id: "$keyword",
        display: { $first: "$display" },
        votes: { $sum: 1 }
      }
    },
    { $sort: { votes: -1 } },
    { $limit: 1 }
  ]).toArray();

  if (!results.length) {
    return res.send("No votes registered today.");
  }

  const fastest = results[0];

  res.send(
    `Current Fastest Keyword: ${fastest.display.toUpperCase()} [ ${fastest.votes} Votes Today ] -> All information comes from 0:00 (Argentine time) until the time the command was placed.`
  );
});

/* ---------------- RANK ---------------- */

app.get("/rank", async (req, res) => {
  const name = req.query.name;
  if (!name) return res.send("");

  const key = name.trim().toLowerCase();

  const all = await votesCol.find({}).sort({ count: -1 }).toArray();
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

  const sorted = await votesCol.find({}).sort({ count: -1 }).toArray();

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

/* ---------------- START ---------------- */

app.listen(PORT, () => {
  console.log("✅ MDM Votes API running on port", PORT);
});
