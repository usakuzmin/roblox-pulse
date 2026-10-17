#!/usr/bin/env node
// Roblox Pulse — "Developer insights" collector.
// Node 22+, no npm dependencies.
//
//   node scripts/devnews.mjs                 collect fresh posts -> data/devnews/YYYY-MM-DD.json
//   node scripts/devnews.mjs --days 28       look-back window (default 21)
//   node scripts/devnews.mjs --only devforum,rss   run a subset of sources
//   node scripts/devnews.mjs --all           ignore seen.json (re-emit everything in the window)
//   node scripts/devnews.mjs pick --days 3 --top 15   best candidates from recent daily files
//                                                     -> data/devnews/candidates.json (input for Claude)
//
// Env: DEVNEWS_DIR (output dir), DEVNEWS_UA (User-Agent), REDDIT_DELAY_MS.

import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = process.env.DEVNEWS_DIR || path.join(ROOT, "data", "devnews");
const UA = process.env.DEVNEWS_UA || "RobloxPulse-devnews/0.1 (+https://github.com/usakuzmin/roblox-pulse)";
const DAY = 864e5;

// ---------------------------------------------------------------- config

const DEVFORUM = "https://devforum.roblox.com";
// One term per query: Discourse search has no real OR.
const DEVFORUM_QUERIES = [
  "revenue", "devex", "robux earned", "ccu", "concurrent players", "retention", "monetization",
  "ads manager", "sponsored", "roas", "marketing", "budget", "postmortem", "lessons learned",
  "home recommendations", "discovery", "conversion", "arppu", "playtime", "how we",
];
const DEVFORUM_CATEGORIES = [
  { path: "help-and-feedback/game-design-support/103", tag: null },
  { path: "resources/community-tutorials/46", tag: null },
  { path: "updates/announcements/36", tag: "platform" }, // Roblox staff: analytics/ads/discovery changes
];
// Categories that are noise for this digest (bugs, recruitment, changelogs, portfolios).
const DEVFORUM_SKIP_CATEGORIES = new Set([
  10, 28, 29, 30, 31, 52, 72, 184, 209, 228, 341, 342, 343, 344, 345, // bug reports
  82, 83, // recruitment, portfolios
  63, // bulletin board (game changelogs)
  146, 147, 12, // forum meta
]);
const DEVFORUM_DETAIL_LIMIT = 45; // /t/<id>.json fetches for best pre-scored topics

const REDDIT_FEEDS = [
  "https://www.reddit.com/r/robloxgamedev/top/.rss?t=week&limit=50",
  "https://www.reddit.com/r/robloxgamedev/search.rss?q=revenue%20OR%20robux%20OR%20devex%20OR%20ccu%20OR%20marketing%20OR%20ads%20OR%20retention&restrict_sr=1&sort=new&limit=50",
];

// Industry analysts / newsletters: kept only if the item mentions Roblox.
const RSS_FEEDS = [
  { name: "naavik", url: "https://naavik.co/feed/" },
  { name: "deconstructoroffun", url: "https://www.deconstructoroffun.com/blog?format=rss" },
  { name: "gamediscoverco", url: "https://newsletter.gamediscover.co/feed" },
  { name: "mobilegamer", url: "https://mobilegamer.biz/feed/" },
  { name: "pocketgamer.biz", url: "https://www.pocketgamer.biz/rss/" },
  { name: "medium", url: "https://medium.com/feed/tag/roblox-development" },
];

// YouTube channel RSS (no key). Add channel ids of dev podcasts/interview channels here.
// NB: in Oct 2026 youtube.com/feeds/videos.xml returned 404 for every channel we tried.
const YOUTUBE_CHANNELS = [
  { name: "Roblox Creators", id: "UCOUy1evQVbKRyouFAyeYc1w" },
];

// ---------------------------------------------------------------- scoring

const POSITIVE = [
  { tag: "revenue", w: 4, re: /\b(?:revenue|earnings?|earned|devex|dev ex|income|profit|payouts?|cash ?out|robux (?:made|earned|per))\b|made \$|\$\d/i },
  { tag: "metrics", w: 4, re: /\b(ccu|concurrent|retention|d1|d7|d30|arpdau|arppu|arpu|ltv|conversion rate|payer|playtime|session (?:length|time)|qptr|engagement rate|dau|mau|funnel)\b/i },
  { tag: "ads", w: 3, re: /\b(ads manager|sponsor(?:ed|ship)?|roas|cpm|cpc|cpi|ad (?:spend|budget|campaign)|advertis\w*|incrementality)\b/i },
  { tag: "marketing", w: 3, re: /\b(marketing|influencer|youtubers?|tiktok|shorts|short-form|thumbnail|icon a\/b|a\/b test|launch strategy|promotion|go viral|virality)\b/i },
  { tag: "discovery", w: 3, re: /\b(home (?:page|recommendations?|feed|sort)|discover(?:y)? (?:page|sort|algorithm)|recommendation algorithm|algo(?:rithm)?|impressions?|front ?page|up-and-coming|top trending)\b/i },
  { tag: "monetization", w: 3, re: /\b(monetiz\w*|gamepass(?:es)?|game pass(?:es)?|developer products?|premium payouts?|subscriptions?|pricing|price point|whales?|battle ?pass|gacha|loot ?box)\b/i },
  { tag: "story", w: 3, re: /\b(how (?:we|i) (?:made|grew|got|reached|hit|built|scaled|launched)|post-?mortem|lessons (?:learned|from)|case study|breakdown|what (?:worked|didn'?t)|from 0 to|from zero|flopp?\w*|here'?s (?:the|my|our) (?:data|numbers|stats|results)|(?:my|our) game (?:hit|reached|made|failed|died)|why (?:my|our) game|(?:dying|dead) game|reviv\w+|failed|failure|mistakes)\b/i },
  { tag: "studio", w: 2, re: /\b((?:our|my|indie|game|dev) studio|studios|our team|hiring|payroll|salar(?:y|ies)|rev(?:enue)? ?share|percentage split|investors?|funding|acquir\w+|acquisition|publisher)\b/i },
];
// Concrete numbers next to a metric are the strongest "insider" signal.
const NUMBERS = /(\$\s?\d[\d,.]*\s?(?:k|m|million|bn)?\b|\b\d[\d,.]*\s?(?:k|m|million)?\s?(?:ccu|concurrents?|visits|players|dau|mau|robux|r\$)\b|\b\d{1,3}(?:\.\d+)?\s?%\s?(?:retention|conversion|d1|d7))/i;

const NEGATIVE = [
  /\b(change ?log|update log|patch notes?|release notes|weekly recap|qol update|hotfix)\b/i,
  /\bcodes?\b.*\b(new|working|redeem)\b|\bredeem\b/i,
  /\[(?:for hire|hiring|open|closed)\]|\bfor hire\b|\bhiring\b|\binvestor needed\b|\bselling\b.*\b(?:game|ccu)\b|\blooking for (?:an? )?(?:investor|scripter|builder|modeler|dev)/i,
  /\b(giveaway|bounty|out now|teaser|trailer|showcase)\b/i,
  /\b(bug|error|crash|not working|broken|terminated|appeal|moderation|deleted|removed|locked|age.restricted|unavailable|stolen|missing|verified badge)\b|\[(?:studio )?beta\]/i,
  /\b(how do i|how to (?:make|script|fix)|help with|need help)\b/i,
];

function scoreItem(item, engagement = {}) {
  const title = item.title || "";
  const body = (item._text || "").slice(0, 2500); // long articles would match every rule otherwise
  const tags = new Set(item.tags || []);
  let s = 0;
  for (const r of POSITIVE) {
    const inTitle = r.re.test(title), inBody = r.re.test(body);
    if (inTitle || inBody) { tags.add(r.tag); s += r.w * (inTitle ? 2 : 1); }
  }
  if (NUMBERS.test(title)) { s += 5; tags.add("numbers"); }
  else if (NUMBERS.test(body)) { s += 3; tags.add("numbers"); }
  for (const re of NEGATIVE) if (re.test(title)) s -= 6;
  const { likes = 0, replies = 0, views = 0, points = 0 } = engagement;
  s += 2 * Math.log10(1 + likes) + 1.5 * Math.log10(1 + replies) + 0.5 * Math.log10(1 + views) + 2 * Math.log10(1 + points);
  s += item._boost || 0;
  return { score: Math.round(s * 10) / 10, tags: [...tags] };
}

// ---------------------------------------------------------------- helpers

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.error("[devnews]", ...a);

async function get(url, { type = "text", retries = 1, retryDelay = 20000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: type === "json" ? "application/json" : "*/*" }, signal: AbortSignal.timeout(30000) });
    if ((res.status === 429 || res.status >= 500) && attempt < retries) { await sleep(retryDelay); continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return type === "json" ? res.json() : res.text();
  }
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
function decode(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
      if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITIES[e] ?? m;
    });
}
function htmlToText(html = "") {
  return decode(decode(html)
    .replace(/<(script|style|aside|blockquote)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}
function excerpt(text, max = 280) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40)).replace(/[\s,.;:–-]+$/, "") + "…";
}
function tag(xml, name) {
  const m = xml.match(new RegExp(String.raw`<${name}(?:\s[^>]*)?>([\s\S]*?)</${name}>`, "i"));
  return m ? m[1].trim() : "";
}
function attr(xml, name, a) {
  const m = xml.match(new RegExp(String.raw`<${name}\s[^>]*${a}="([^"]*)"`, "i"));
  return m ? decode(m[1]) : "";
}
function parseFeed(xml) {
  const parts = xml.split(/<item[\s>]|<entry[\s>]/i).slice(1);
  return parts.map(p => {
    const link = decode(tag(p, "link")) || attr(p, "link", "href");
    return {
      title: htmlToText(tag(p, "title")),
      link,
      guid: decode(tag(p, "guid") || tag(p, "id")) || link,
      date: new Date(tag(p, "pubDate") || tag(p, "published") || tag(p, "updated") || tag(p, "dc:date")),
      author: htmlToText(tag(p, "dc:creator") || tag(p, "name") || tag(p, "author")),
      html: tag(p, "content:encoded") || tag(p, "content") || tag(p, "description") || tag(p, "media:description") || tag(p, "summary"),
    };
  });
}

// ---------------------------------------------------------------- sources

async function devforum(since) {
  const day = new Date(since).toISOString().slice(0, 10);
  const topics = new Map(); // id -> partial item
  const add = (t, extra = {}) => {
    if (DEVFORUM_SKIP_CATEGORIES.has(t.category_id)) return;
    if (new Date(t.created_at) < since) return;
    const prev = topics.get(t.id) || {};
    topics.set(t.id, { ...prev, topic: t, ...extra, hits: (prev.hits || 0) + (extra.hit ? 1 : 0) });
  };

  for (const q of DEVFORUM_QUERIES) {
    try {
      const j = await get(`${DEVFORUM}/search.json?q=${encodeURIComponent(`${q} after:${day} order:latest`)}`, { type: "json" });
      const blurbs = new Map((j.posts || []).map(p => [p.topic_id, p]));
      for (const t of j.topics || []) {
        const p = blurbs.get(t.id);
        add(t, { hit: true, blurb: p?.blurb, author: p?.username });
      }
    } catch (e) { log("devforum search", q, e.message); }
    await sleep(2500); // anonymous search is rate limited
  }
  for (const c of DEVFORUM_CATEGORIES) {
    for (let page = 0; page < 3; page++) {
      try {
        const j = await get(`${DEVFORUM}/c/${c.path}.json?order=created&page=${page}`, { type: "json" });
        const list = j.topic_list?.topics || [];
        for (const t of list) add(t, { catTag: c.tag });
        if (!list.length || new Date(list.at(-1).created_at) < since) break;
      } catch (e) { log("devforum category", c.path, e.message); break; }
      await sleep(800);
    }
  }

  // Pre-score from title + search blurb, then fetch details for the best ones.
  const pre = [...topics.values()].map(x => {
    const item = { title: x.topic.title, _text: htmlToText(x.blurb || "") };
    return { x, pre: scoreItem(item, { likes: x.topic.like_count, replies: x.topic.posts_count - 1, views: x.topic.views }).score + (x.hits || 0) };
  }).sort((a, b) => b.pre - a.pre);

  const out = [];
  for (const { x } of pre.slice(0, DEVFORUM_DETAIL_LIMIT)) {
    const t = x.topic;
    let text = htmlToText(x.blurb || ""), author = x.author || "", likes = t.like_count || 0, views = t.views || 0, replies = (t.posts_count || 1) - 1;
    try {
      const d = await get(`${DEVFORUM}/t/${t.id}.json`, { type: "json" });
      const first = d.post_stream?.posts?.[0];
      if (first) { text = htmlToText(first.cooked); author = first.username; likes = Math.max(likes, first.like_count || 0, d.like_count || 0); }
      views = d.views ?? views; replies = (d.posts_count ?? replies + 1) - 1;
    } catch (e) { log("devforum topic", t.id, e.message); }
    await sleep(700);
    out.push({
      id: `devforum:${t.id}`, source: "devforum", url: `${DEVFORUM}/t/${t.slug}/${t.id}`, author,
      date: new Date(t.created_at).toISOString(), title: t.title, _text: text,
      tags: x.catTag ? [x.catTag] : [], _boost: Math.min(x.hits || 0, 4) * 0.5 - (x.catTag === "platform" ? 4 : 0),
      engagement: { likes, replies, views },
    });
  }
  return out;
}

async function reddit(since) {
  const out = [];
  const delay = Number(process.env.REDDIT_DELAY_MS || 15000);
  for (const url of REDDIT_FEEDS) {
    try {
      const entries = parseFeed(await get(url, { retries: 1, retryDelay: 60000 }));
      for (const e of entries) {
        if (!(e.date >= since)) continue;
        const id = (e.guid.match(/t3_\w+/) || [e.link])[0];
        out.push({
          id: `reddit:${id}`, source: "reddit", url: e.link, author: e.author.replace(/^\/u\//, ""),
          date: e.date.toISOString(), title: e.title, _text: htmlToText(e.html).replace(/submitted by .*$/, ""),
          tags: [], _boost: 2 + (url.includes("/top/") ? 1 : 0), engagement: {}, // RSS carries no votes
        });
      }
    } catch (e) { log("reddit", e.message); }
    await sleep(delay);
  }
  return out;
}

async function rss(since) {
  const out = [];
  for (const f of RSS_FEEDS) {
    try {
      for (const e of parseFeed(await get(f.url))) {
        if (!(e.date >= since)) continue;
        const text = htmlToText(e.html);
        if (!/roblox/i.test(e.title + " " + text)) continue;
        out.push({
          id: `${f.name}:${e.guid}`, source: f.name, url: e.link, author: e.author,
          date: e.date.toISOString(), title: e.title, _text: text,
          // Newsletters mention Roblox in passing a lot; only Roblox-focused pieces should rank.
          tags: ["analyst"], _boost: /roblox/i.test(e.title) ? 4 : (text.match(/roblox/gi).length >= 4 ? 0 : -10), engagement: {},
        });
      }
    } catch (e) { log("rss", f.name, e.message); }
  }
  return out;
}

async function youtube(since) {
  const out = [];
  for (const c of YOUTUBE_CHANNELS) {
    try {
      for (const e of parseFeed(await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${c.id}`, { retries: 0 }))) {
        if (!(e.date >= since)) continue;
        out.push({
          id: `youtube:${e.guid.replace(/^yt:video:/, "")}`, source: "youtube", url: e.link, author: c.name,
          date: e.date.toISOString(), title: e.title, _text: htmlToText(e.html), tags: ["video"], engagement: {},
        });
      }
    } catch (e) { log("youtube", c.name, e.message); }
  }
  return out;
}

async function hackernews(since) {
  const j = await get(`https://hn.algolia.com/api/v1/search_by_date?query=roblox&tags=story&hitsPerPage=100&numericFilters=created_at_i>${Math.floor(since / 1000)}`, { type: "json" });
  return (j.hits || []).map(h => ({
    id: `hn:${h.objectID}`, source: "hackernews", url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, author: h.author,
    date: h.created_at, title: h.title, _text: htmlToText(h.story_text || ""), tags: [], _boost: -2,
    engagement: { points: h.points || 0, replies: h.num_comments || 0 },
  }));
}

const SOURCES = { devforum, reddit, rss, youtube, hackernews };

// ---------------------------------------------------------------- main

function args(argv) {
  const a = { cmd: "collect", days: 21, top: 15, only: null, all: false, minScore: 3 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "pick" || k === "collect") a.cmd = k;
    else if (k === "--days") a.days = Number(argv[++i]);
    else if (k === "--top") a.top = Number(argv[++i]);
    else if (k === "--min-score") a.minScore = Number(argv[++i]);
    else if (k === "--only") a.only = argv[++i].split(",");
    else if (k === "--all") a.all = true;
    else throw new Error(`unknown argument ${k}`);
  }
  return a;
}

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, "utf8")); } catch { return fallback; }
}

async function collect(a) {
  const since = Date.now() - a.days * DAY;
  const seenFile = path.join(OUT_DIR, "seen.json");
  const seen = a.all ? {} : await readJson(seenFile, {});
  const names = a.only || Object.keys(SOURCES);
  const status = {};
  const raw = [];
  for (const n of names) {
    const t0 = Date.now();
    try {
      const items = await SOURCES[n](since);
      status[n] = { ok: true, fetched: items.length, ms: Date.now() - t0 };
      raw.push(...items);
    } catch (e) {
      status[n] = { ok: false, error: e.message };
      log(n, "failed:", e.message);
    }
    log(n, JSON.stringify(status[n]));
  }

  const now = new Date().toISOString();
  const byId = new Map();
  for (const it of raw) {
    const { score, tags } = scoreItem(it, it.engagement);
    const item = {
      id: it.id, source: it.source, url: it.url, author: it.author || null, date: it.date,
      title: it.title, excerpt_en: excerpt(it._text || ""), score, tags,
      engagement: it.engagement, first_seen: seen[it.id] || now,
    };
    if (!byId.has(item.id) || byId.get(item.id).score < item.score) byId.set(item.id, item);
  }
  const fresh = [...byId.values()].filter(i => !seen[i.id] && i.score >= a.minScore).sort((x, y) => y.score - x.score);

  await mkdir(OUT_DIR, { recursive: true });
  const day = now.slice(0, 10);
  const file = path.join(OUT_DIR, `${day}.json`);
  const existing = await readJson(file, { items: [] });
  const merged = new Map(existing.items.map(i => [i.id, i]));
  for (const i of fresh) merged.set(i.id, i);
  const items = [...merged.values()].sort((x, y) => y.score - x.score);
  await writeFile(file, JSON.stringify({ generated_at: now, window_days: a.days, sources: { ...existing.sources, ...status }, items }, null, 2) + "\n");

  for (const i of byId.values()) seen[i.id] ??= now; // low scorers too, so they are not re-checked forever
  for (const [k, v] of Object.entries(seen)) if (Date.now() - Date.parse(v) > 120 * DAY) delete seen[k];
  await writeFile(seenFile, JSON.stringify(seen) + "\n");

  log(`fetched ${raw.length}, unique ${byId.size}, new & score>=${a.minScore}: ${fresh.length} -> ${path.relative(ROOT, file)}`);
  for (const i of fresh.slice(0, 10)) log(`  ${String(i.score).padStart(5)}  [${i.source}] ${i.title}`);
}

async function pick(a) {
  if (!existsSync(OUT_DIR)) throw new Error(`no ${OUT_DIR}; run collect first`);
  const since = Date.now() - a.days * DAY;
  const files = (await readdir(OUT_DIR)).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && Date.parse(f.slice(0, 10)) >= since - DAY);
  const all = new Map();
  for (const f of files) for (const i of (await readJson(path.join(OUT_DIR, f), { items: [] })).items) all.set(i.id, i);
  const top = [...all.values()].sort((x, y) => y.score - x.score).slice(0, a.top);
  const out = path.join(OUT_DIR, "candidates.json");
  await writeFile(out, JSON.stringify({ generated_at: new Date().toISOString(), from_files: files.sort(), items: top }, null, 2) + "\n");
  log(`${top.length} candidates from ${files.length} files -> ${path.relative(ROOT, out)}`);
}

const a = args(process.argv.slice(2));
await (a.cmd === "pick" ? pick(a) : collect(a));
