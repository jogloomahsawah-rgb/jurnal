// Research → write → save to Firestore. Runs on GitHub Actions at 06:00 and 15:00 WIB.
// Needs env: GEMINI_API_KEY, FIREBASE_SERVICE_ACCOUNT (JSON). Optional: GEMINI_MODEL, ARTICLE_LANG.
import admin from "firebase-admin";

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash"; // free tier + free search grounding quota
const LANG = process.env.ARTICLE_LANG || "Indonesian";   // e.g. "Indonesian" or English 
if (!KEY || !process.env.FIREBASE_SERVICE_ACCOUNT) { console.error("Missing GEMINI_API_KEY or FIREBASE_SERVICE_ACCOUNT"); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const { FieldValue, Timestamp } = admin.firestore;

const tz = { timeZone: "Asia/Jakarta" };
const now = new Date();
const today = now.toLocaleDateString("en-GB", { ...tz, day: "numeric", month: "long", year: "numeric" });
const batchId = `${now.toLocaleDateString("en-CA", tz)}-${now.toLocaleTimeString("en-GB", { ...tz, hour: "2-digit", hour12: false }).slice(0, 2)}`;

// The ten slots of one batch. `policy` is the key of the auto-publish switch in the admin panel.
const SLOTS = [
  { policy: "football", category: "football", topic: "Football transfer news: confirmed deals and credible reports from the last 24 hours" },
  { policy: "football", category: "football", topic: "Indonesian domestic league (Super League / Liga 1) latest results and storylines" },
  { policy: "football", category: "football", topic: "European football: the biggest storyline across the top leagues right now" },
  { policy: "football", category: "football", topic: "Premier League: latest results, injuries and title/relegation picture" },
  { policy: "football", category: "football", topic: "Champions League and other European competitions: latest matchday news" },
  { policy: "football", category: "football", topic: "Indonesia national team (Timnas) and PSSI news" },
  { policy: "football", category: "football", topic: "International football: national teams, qualifiers, AFC and world tournaments" },
  { policy: "culture", category: "culture", topic: "Football culture: fan culture, kits, terrace style and football-meets-streetwear stories" },
  { policy: "indonesia", category: "indonesia", topic: "Indonesia current affairs that are NOT party politics: economy, society, events, infrastructure" },
  { policy: "politics", category: "indonesia", topic: "Indonesian politics: government, parliament and policy developments of the last 24 hours" },
];

const SYSTEM = `You are the research desk of FvcktheRules Journal, an independent football and street-culture publication from Indonesia.
Task: use web search to find the most recent, well-reported development for the topic, then write ONE short news brief in ${LANG}.
Rules:
- Only use facts you found in search results. Never invent names, scores, quotes or dates. If the newest reliable item is older than 3 days, or you cannot verify it, return {"skip": true}.
- State the date of the events in the text. Today is ${today} (Asia/Jakarta).
- Neutral, factual tone. Attribute claims ("according to Reuters"). For politics: no opinion, no endorsements, no speculation, no loaded wording.
- Paraphrase in your own words. Never copy sentences from sources. No quotes longer than a few words.
- content is Markdown of 220 to 380 words using exactly these sections: "## What happened", "## Why it matters", "## What to watch next" (skip the last one if there is nothing concrete).
- summary: one sentence, max 260 characters.
- sources: the URLs you actually used (2 to 4), taken from the search results.
Reply with ONLY a JSON object, no code fences: {"skip":false,"title":"","summary":"","content":"","sources":["https://..."]}`;

async function gemini(userText, retries = 3) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 3000 },
  });
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body });
    if (res.status === 429 || res.status >= 500) { await sleep(20000 * (i + 1)); continue; }
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
    return res.json();
  }
  throw new Error("Gemini API kept failing");
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function write(slot, recent) {
  const avoid = recent.length ? `\nAlready published in the last 36 hours (do not repeat unless there is a material new development):\n- ${recent.join("\n- ")}` : "";
  const userText = `Topic: ${slot.topic}${avoid}`;
  const data = await gemini(userText);
  const cand = data.candidates && data.candidates[0];
  if (!cand) throw new Error("No candidate in Gemini reply (likely blocked by safety filters)");

  // sources actually used by Google Search grounding for this response
  const seen = new Set();
  const chunks = cand.groundingMetadata?.groundingChunks || [];
  chunks.forEach((c) => c.web?.uri && seen.add(c.web.uri));

  const text = (cand.content?.parts || []).filter((p) => p.text).map((p) => p.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("No JSON in reply");
  const j = JSON.parse(m[0]);
  if (j.skip) return null;
  if (!j.title || !j.content || !j.summary) throw new Error("Incomplete article");
  // keep only sources that really appeared in search results
  let sources = (j.sources || []).filter((u) => seen.has(u));
  if (!sources.length) sources = [...seen].slice(0, 3);
  return { ...j, sources: sources.filter((u) => /^https?:\/\//.test(u)).slice(0, 4) };
}

async function main() {
  const cfg = (await db.doc("settings/news").get()).data() || {};
  if (cfg.agentEnabled === false) { console.log("Agent paused in admin settings."); return; }
  const auto = { football: true, culture: true, world: false, indonesia: false, politics: false, ...(cfg.autoPublish || {}) };

  const since = Timestamp.fromDate(new Date(Date.now() - 36 * 3600 * 1000));
  const rs = await db.collection("articles").where("createdAt", ">=", since).get();
  const recentByCat = {};
  rs.forEach((d) => { const a = d.data(); (recentByCat[a.category] ||= []).push(a.title); });

  let made = 0;
  for (const slot of SLOTS) {
    try {
      const recent = recentByCat[slot.category] || [];
      const art = await write(slot, recent.slice(0, 25));
      if (!art) { console.log("skip:", slot.topic); continue; }
      const publish = auto[slot.policy] === true;
      await db.collection("articles").add({
        title: art.title.slice(0, 160), category: slot.category, summary: art.summary.slice(0, 300), content: art.content,
        image: "", sources: art.sources, status: publish ? "published" : "draft", source: "ai", generatedBy: "AI", model: MODEL,
        author: "FvcktheRules AI", reviewed: false, topic: slot.policy, batchId,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), publishedAt: publish ? FieldValue.serverTimestamp() : null,
      });
      (recentByCat[slot.category] ||= []).push(art.title);
      made++; console.log(publish ? "published:" : "draft:", art.title);
    } catch (e) { console.error("failed:", slot.topic, e.message); }
    await sleep(3000);
  }
  console.log(`Batch ${batchId}: ${made} articles saved.`);
}
main().then(() => process.exit(0));
