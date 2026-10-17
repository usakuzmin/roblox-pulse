// Shared helpers for the collector and the report builder.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const UA = 'roblox-pulse-report (+https://github.com/usakuzmin/roblox-pulse)';

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function fetchText(url, { retries = 3, delay = 2000 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US' }, signal: AbortSignal.timeout(30000) });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.fatal = true; throw e; }
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (e.fatal) break;
      await sleep(delay * (i + 1) * (String(e.message).includes('429') ? 4 : 1));
    }
  }
  throw new Error(`${url}: ${lastErr?.message}`);
}

export const fetchJSON = async (url, opts) => JSON.parse(await fetchText(url, opts));

export function readJSON(rel, fallback) {
  const p = path.join(ROOT, rel);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

export function writeJSON(rel, data, pretty = false) {
  const p = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, pretty ? 1 : 0));
}

export const ymd = d => d.toISOString().slice(0, 10);

// Rolimons game list: { placeId: [name, players, iconUrl] } for ~8K tracked games.
export async function getGameList() {
  const j = await fetchJSON('https://api.rolimons.com/games/v1/gamelist');
  if (!j.success) throw new Error('Rolimons gamelist: success=false');
  return Object.entries(j.games)
    .map(([pid, [name, players, icon]]) => ({ pid, name, players, icon }))
    .sort((a, b) => b.players - a.players);
}

// Rolimons game page embeds the full player history (10-min points recently, coarser earlier).
// Pages are rate limited (X-RateLimit-* headers, ~300 per window, plus a burst limit),
// so on 429 we back off for a minute or two instead of hammering.
export const rolimonsLimit = { remaining: null, reset: null };
export async function getRolimonsHistory(placeId, { attempts = 3 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const res = await fetch(`https://www.rolimons.com/game/${placeId}`, {
      headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000),
    });
    rolimonsLimit.remaining = Number(res.headers.get('x-ratelimit-remaining') ?? NaN);
    rolimonsLimit.reset = Number(res.headers.get('x-ratelimit-reset') ?? NaN);
    if (res.status === 429) {
      if (attempt === attempts - 1) break;
      const wait = 60e3 * (attempt + 1);
      console.warn(`rolimons 429 on ${placeId}, waiting ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const m = (await res.text()).match(/id="game_history_json"[^>]*>([\s\S]*?)<\/script>/);
    return m ? JSON.parse(m[1]) : null;
  }
  const e = new Error('rate limited'); e.rateLimited = true; throw e;
}

// placeId -> universeId (Roblox), one request per place.
export async function placeToUniverse(placeId) {
  const j = await fetchJSON(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`, { retries: 2 });
  return j.universeId || null;
}

// Universe details in batches of 50: genre, creator, dates, visits, favorites.
export async function getUniverseDetails(universeIds) {
  const out = {};
  for (let i = 0; i < universeIds.length; i += 50) {
    const batch = universeIds.slice(i, i + 50);
    const j = await fetchJSON(`https://games.roblox.com/v1/games?universeIds=${batch.join(',')}`);
    for (const g of j.data || []) out[g.id] = g;
    await sleep(300);
  }
  return out;
}

export async function getExploreSorts() {
  const j = await fetchJSON('https://apis.roblox.com/explore-api/v1/get-sorts?sessionId=roblox-pulse&device=computer&country=all');
  return j.sorts.filter(s => s.contentType === 'Games');
}

// Run async fn over items with limited concurrency.
export async function pool(items, n, fn) {
  const res = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; res[k] = await fn(items[k], k); }
  }));
  return res;
}

export function metaFromDetails(g, prev = {}) {
  return {
    ...prev,
    u: g.id,
    name: g.name,
    g1: g.genre_l1 || null,
    g2: g.genre_l2 || null,
    creator: g.creator?.name,
    created: g.created?.slice(0, 10),
    updated: g.updated?.slice(0, 10),
    visits: g.visits,
    fav: g.favoritedCount,
    seen: new Date().toISOString().slice(0, 10),
  };
}

// ---------- history cache: data/history/<placeId>.json
// { pid, fetched, start (unix, hour-aligned), hourly: [players per hour], playtime, likeRatio, fav }
// The hourly collector refreshes a few games per run so the report never needs a burst of page loads.
export const H = 3600;
export const CACHE_DAYS = 35;

export function hourlyFromHistory(hist, start, hours) {
  const sum = Array(hours).fill(0), cnt = Array(hours).fill(0);
  hist.timestamps.forEach((t, i) => {
    const k = Math.floor((t - start) / H);
    if (k < 0 || k >= hours) return;
    sum[k] += hist.players[i]; cnt[k]++;
  });
  return sum.map((s, k) => cnt[k] ? Math.round(s / cnt[k]) : null);
}

export async function refreshHistoryCache(pid, opts) {
  const hist = await getRolimonsHistory(pid, opts);
  if (!hist) return null;
  const end = Math.floor(Date.now() / 1000 / H) * H;
  const start = end - CACHE_DAYS * 24 * H;
  const up = hist.upvotes?.at(-1), down = hist.downvotes?.at(-1);
  const entry = {
    pid, fetched: new Date().toISOString(), start,
    hourly: hourlyFromHistory(hist, start, CACHE_DAYS * 24),
    playtime: hist.avg_playtime?.at(-1) ?? null,
    likeRatio: up ? up / (up + (down || 0)) : null,
    fav: hist.favorites?.at(-1) ?? null,
  };
  writeJSON(`data/history/${pid}.json`, entry);
  return entry;
}

// Our own hourly snapshots (data/hourly/*.json) for one game, keyed by unix hour.
export function ownHourly(days) {
  const out = {}; // pid -> { unixHour: players }
  const today = Date.now();
  for (let d = 0; d <= days; d++) {
    const day = ymd(new Date(today - d * 86400e3));
    const f = readJSON(`data/hourly/${day}.json`, null);
    if (!f) continue;
    const base = Date.parse(day + 'T00:00:00Z') / 1000;
    for (const [pid, arr] of Object.entries(f.games)) {
      const o = (out[pid] ||= {});
      arr.forEach((v, h) => { if (v !== null) o[base + h * H] = v; });
    }
  }
  return out;
}
