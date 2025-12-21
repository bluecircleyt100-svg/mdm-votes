import express from "express";
import { createClient } from "@supabase/supabase-js";

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

/* ---------------- UTILS ---------------- */

const formatVotes = (n) =>
  n >= 1000 ? (n / 1000).toFixed(1).replace(".", ",") + "K" : n;

const getArgentinaDayString = () => {
  const now = new Date();
  return now.toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires"
  }); // YYYY-MM-DD
};

/* ---------------- VOTE ---------------- */

app.get("/vote", async (req, res) => {
  const { user, msg } = req.query;
  if (!user || !msg) return res.send("");

  const rawName = msg.trim().split(" ")[0]; // respeta mayúsculas exactas
  const key = rawName.toLowerCase();
  const now = Date.now();

  const cooldownId = `${user}:${key}`;

  const { data: lastCooldown } = await supabase
    .from("cooldowns")
    .select("timestamp")
    .eq("id", cooldownId)
    .single();

  if (lastCooldown && now - lastCooldown.timestamp < 60000) {
    return res.send("You can't vote consecutively.");
  }

  /* TOTAL VOTES */
  const { data: existingVote } = await supabase
    .from("votes")
    .select("count")
    .eq("keyword", key)
    .single();

  const newCount = existingVote ? existingVote.count + 1 : 1;

  await supabase.from("votes").upsert({
    keyword: key,
    display: rawName,
    count: newCount,
  });

  /* DAILY VOTES */
  const day = getArgentinaStartOfDay();

  const { data: daily } = await supabase
    .from("daily_votes")
    .select("count")
    .eq("keyword", key)
    .eq("day", day)
    .single();

  const dailyCount = daily ? daily.count + 1 : 1;

  await supabase.from("daily_votes").upsert({
    keyword: key,
    display: rawName,
    day,
    count: dailyCount,
  });

  /* COOLDOWN */
  await supabase.from("cooldowns").upsert({
    id: cooldownId,
    timestamp: now,
  });

  res.send(
    `Voted for [ ${rawName} ]. ${newCount} total votes @${user}`
  );
});

/* ---------------- RANK ---------------- */

app.get("/rank", async (req, res) => {
  const { name } = req.query;
  if (!name) return res.send("");

  const key = name.trim().toLowerCase();

  const { data: all } = await supabase
    .from("votes")
    .select("*")
    .order("count", { ascending: false });

  const index = all.findIndex((v) => v.keyword === key);

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
  const start = (page - 1) * 10;

  const { data: sorted } = await supabase
    .from("votes")
    .select("*")
    .order("count", { ascending: false });

  let response = "VOTES RANKING:";

  for (let i = start; i < start + 10 && i < sorted.length; i++) {
    const rank = i + 1;
    const name = sorted[i].display.toUpperCase();
    const votes = formatVotes(sorted[i].count);

    response +=
      i === start
        ? ` #${rank} ${name} (${votes})`
        : ` #${rank} ${name}`;
  }

  res.send(response);
});

/* ---------------- FASTEST (HOY) ---------------- */

app.get("/fastest", async (req, res) => {
  const day = getArgentinaDayString(); // "YYYY-MM-DD"

  const { data, error } = await supabase
    .from("daily_votes")
    .select("display, count")
    .eq("day", day)
    .order("count", { ascending: false })
    .limit(1);

  if (error) {
    console.error(error);
    return res.send("Database error.");
  }

  if (!data || data.length === 0) {
    return res.send("No votes registered today.");
  }

  const winner = data[0];

  res.send(
    `Current Fastest Keyword: ${winner.display.toUpperCase()} [ ${winner.count} Votes Today ] -> All information comes from 0:00 (Argentine time) until the time the command was placed.`
  );
});

/* ---------------- START ---------------- */

app.listen(PORT, () => {
  console.log("✅ MDM Votes API running on port", PORT);
});
