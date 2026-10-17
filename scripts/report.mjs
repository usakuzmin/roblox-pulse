// Report builder: PERIOD=daily|weekly|monthly. Uses the Rolimons history cache (data/history,
// refreshed hourly by the collector) plus our own hourly snapshots, computes growth / decline /
// genre mix and writes docs/reports/<period>/<date>/data.json.
import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT, getGameList, rolimonsLimit, placeToUniverse, getUniverseDetails,
  readJSON, writeJSON, ymd, sleep, metaFromDetails, refreshHistoryCache, ownHourly, H,
} from './lib.mjs';

const TOP_N = 150;            // leading games by current online
const EXTRA_FROM_SORTS = 40;  // plus games Roblox is pushing in Trending / Up-and-Coming
// window = hours in the issue; compare = hours back to the comparison window.
// Daily compares with the same weekday a week ago: weekend online is ~2x weekdays.
const PERIODS = {
  daily:   { window: 24,  compare: 168, chartDays: 30, label: "за сутки", vs: "к тому же дню неделю назад", sortDays: 1, title: "Выпуск дня" },
  weekly:  { window: 168, compare: 168, chartDays: 30, label: "за неделю", vs: "к предыдущей неделе", sortDays: 7, title: "Итоги недели" },
  monthly: { window: 720, compare: 720, chartDays: 60, label: "за месяц", vs: "к предыдущим 30 дням", sortDays: 30, title: "Итоги месяца" },
};
const PERIOD = process.env.PERIOD || "daily";
const P = PERIODS[PERIOD];
if (!P) throw new Error("PERIOD must be daily, weekly or monthly");
const DAYS = P.chartDays;
const DELAY_MS = Number(process.env.ROLIMONS_DELAY_MS || 4000);

const now = new Date();
const date = process.env.REPORT_DATE || ymd(now);
const reportsIndex = readJSON('docs/reports/index.json', []);
const dirOf = r => r.period ? `docs/reports/${r.period}/${r.date}` : `docs/reports/${r.date}`;
const prevReport = reportsIndex.filter(r => r.period === PERIOD && r.date < date).at(-1);
const prevData = prevReport ? readJSON(`${dirOf(prevReport)}/data.json`, null) : null;
const outDir = `docs/reports/${PERIOD}/${date}`;

// ---------- 1. snapshot + selection
const list = await getGameList();
const byPid = Object.fromEntries(list.map(g => [g.pid, g]));
const totalNow = list.reduce((s, g) => s + g.players, 0);
const meta = readJSON('data/meta.json', {});

const recentSorts = {};
for (let d = 0; d < P.sortDays; d++) {
  const day = ymd(new Date(now - d * 86400e3));
  const s = readJSON(`data/sorts/${day}.json`, null);
  if (!s) continue;
  for (const [sortId, b] of Object.entries(s.sorts)) {
    const acc = (recentSorts[sortId] ||= {});
    for (const [pid, e] of Object.entries(b.games)) {
      const a = (acc[pid] ||= { name: e.name, hours: 0, best: e.best });
      a.hours += e.hours; a.best = Math.min(a.best, e.best);
    }
  }
}

const selected = new Set(list.slice(0, TOP_N).map(g => g.pid));
// keep last report's set too, so games that are dying don't silently drop out of the trend lines
for (const g of prevData?.games || []) if (byPid[g.pid]) selected.add(g.pid);
const sortCandidates = ['up-and-coming', 'top-trending']
  .flatMap(id => Object.entries(recentSorts[id] || {}).sort((a, b) => b[1].hours - a[1].hours).map(([pid]) => pid))
  .filter(pid => !selected.has(pid) && (byPid[pid]?.players || 0) >= 500);
for (const pid of [...new Set(sortCandidates)].slice(0, EXTRA_FROM_SORTS)) selected.add(pid);
console.log(`selected ${selected.size} games`);

// ---------- 2. metadata for selected
const missing = [...selected].filter(pid => !meta[pid]?.u);
for (const pid of missing) {
  try { meta[pid] = { ...(meta[pid] || {}), u: await placeToUniverse(pid) }; } catch (e) { console.warn('map', pid, e.message); }
  await sleep(400);
}
const needDetails = [...selected].filter(pid => meta[pid]?.u && !meta[pid].seen);
if (needDetails.length) {
  const det = await getUniverseDetails(needDetails.map(pid => meta[pid].u));
  for (const pid of needDetails) if (det[meta[pid].u]) meta[pid] = metaFromDetails(det[meta[pid].u], meta[pid]);
}
writeJSON('data/meta.json', meta);

// ---------- 3. history: cache (refreshed hourly by the collector) + our own hourly snapshots
const end = Math.floor(now / 1000 / H) * H;   // align to the hour
const HOURS = Math.max(DAYS * 24, P.window + P.compare);
const start = end - HOURS * H;
const own = ownHourly(DAYS + 1);
const games = [];
let failed = 0, fetched = 0, limitHits = 0, stopLive = false;
let budget = Number(process.env.LIVE_FETCH_BUDGET ?? 30); // the collector keeps the cache fresh
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
for (const pid of selected) {
  let c = readJSON(`data/history/${pid}.json`, null);
  const ageH = c ? (now - Date.parse(c.fetched)) / 3.6e6 : Infinity;
  if (ageH > 36 && budget > 0 && !stopLive) {
    try { c = (await refreshHistoryCache(pid)) || c; budget--; fetched++; } catch (e) {
      console.warn("history", pid, e.message);
      if (e.rateLimited && ++limitHits >= 2) { console.warn("rate limited, using cache only"); stopLive = true; }
    }
    if (rolimonsLimit.remaining !== null && rolimonsLimit.remaining < 5) stopLive = true;
    if (fetched % 20 === 0 && fetched) console.log(`live history fetched: ${fetched}`);
    await sleep(DELAY_MS);
  }
  if (!c) { failed++; continue; }
  // Rolimons 10-min averages where cached; our hourly snapshot for hours after the cache was taken
  const hourly = Array.from({ length: HOURS }, (_, k) => {
    const t = start + k * H, ci = (t - c.start) / H;
    return c.hourly[ci] ?? own[pid]?.[t] ?? null;
  });
  for (let k = 1; k < HOURS; k++) if (hourly[k] === null && hourly[k - 1] !== null) hourly[k] = hourly[k - 1];
  for (let k = 0; k < HOURS; k++) hourly[k] ??= 0;
  const daily = Array.from({ length: DAYS }, (_, d) => Math.round(mean(hourly.slice(HOURS - (DAYS - d) * 24, HOURS - (DAYS - d - 1) * 24))));
  const avg3 = mean(hourly.slice(-P.window)), prev3 = mean(hourly.slice(-P.window - P.compare, -P.compare));
  const peak = Math.max(...hourly.slice(-DAYS * 24));
  const m = meta[pid] || {};
  games.push({
    pid, u: m.u, name: byPid[pid]?.name || m.name, icon: byPid[pid]?.icon,
    genre: m.g1 || "Не указан", sub: m.g2 || null, creator: m.creator, created: m.created, updated: m.updated,
    now: byPid[pid]?.players ?? hourly.at(-1),
    avg3: Math.round(avg3), prev3: Math.round(prev3),
    change3: prev3 > 0 ? avg3 / prev3 - 1 : null,
    avg30: Math.round(mean(hourly.slice(-720))), peak30: peak,
    fromPeak: peak > 0 ? avg3 / peak - 1 : null,
    playtime: c.playtime, likeRatio: c.likeRatio, fav: c.fav ?? m.fav,
    daily,
    hourly7: hourly.slice(-168),
  });
}
console.log(`history: ${games.length} games (${fetched} fetched live), ${failed} without data`);
if (games.length < 20) throw new Error('Too few histories fetched — is Rolimons blocking us?');

games.sort((a, b) => b.avg3 - a.avg3);
const dayLabels = Array.from({ length: DAYS }, (_, d) => ymd(new Date((end - (DAYS - d - 1) * 24 * H - 1) * 1000)));

// ---------- 4. sections
const pct = x => x === null ? null : Math.round(x * 1000) / 10;
const ageDays = g => g.created ? (now - new Date(g.created)) / 86400e3 : Infinity;
const pick = (g, extra = {}) => ({
  pid: g.pid, name: g.name, icon: g.icon, genre: g.genre, sub: g.sub, creator: g.creator,
  now: g.now, avg3: g.avg3, prev3: g.prev3, change3: pct(g.change3), fromPeak: pct(g.fromPeak),
  peak30: g.peak30, created: g.created, updated: g.updated, playtime: g.playtime,
  likeRatio: g.likeRatio && Math.round(g.likeRatio * 1000) / 10, daily: g.daily, ...extra,
});

const leaders = games.slice(0, 12).map((g, i) => {
  const prevRank = prevData?.leaders?.findIndex(x => x.pid === g.pid);
  return pick(g, { rank: i + 1, prevRank: prevRank >= 0 ? prevRank + 1 : null, hourly7: g.hourly7 });
});

const risers = games.filter(g => g.avg3 >= 3000 && g.prev3 >= 300 && g.change3 > 0.05)
  .sort((a, b) => b.change3 - a.change3).slice(0, 10).map(g => pick(g));
const fallers = games.filter(g => g.prev3 >= 5000 && g.change3 < -0.05)
  .sort((a, b) => a.change3 - b.change3).slice(0, 10).map(g => pick(g));
const newHits = games.filter(g => ageDays(g) <= 60).sort((a, b) => b.avg3 - a.avg3).slice(0, 10)
  .map(g => pick(g, { ageDays: Math.round(ageDays(g)) }));

const pushed = ['up-and-coming', 'top-trending'].map(id => ({
  id,
  name: id === 'up-and-coming' ? 'Up-and-Coming' : 'Top Trending',
  games: Object.entries(recentSorts[id] || {}).sort((a, b) => b[1].hours - a[1].hours || a[1].best - b[1].best)
    .slice(0, 15).map(([pid, e]) => ({
      pid, name: byPid[pid]?.name || e.name, icon: byPid[pid]?.icon, now: byPid[pid]?.players ?? null,
      genre: meta[pid]?.g1 || null, best: e.best, hours: e.hours,
      change3: pct(games.find(g => g.pid === pid)?.change3 ?? null),
    })),
}));

// genres: totals over the selected games, current mix and 30-day share lines
const genreTotals = {};
for (const g of games) {
  const t = (genreTotals[g.genre] ||= { genre: g.genre, avg3: 0, prev3: 0, games: 0, daily: Array(DAYS).fill(0), top: g.name });
  t.avg3 += g.avg3; t.prev3 += g.prev3; t.games++;
  g.daily.forEach((v, d) => t.daily[d] += v);
}
const sumAvg3 = games.reduce((s, g) => s + g.avg3, 0);
const sumPrev3 = games.reduce((s, g) => s + g.prev3, 0);
const dailyTotal = Array.from({ length: DAYS }, (_, d) => games.reduce((s, g) => s + g.daily[d], 0));
const genres = Object.values(genreTotals).sort((a, b) => b.avg3 - a.avg3).map(t => ({
  genre: t.genre, games: t.games, top: t.top, avg3: t.avg3,
  share: Math.round(t.avg3 / sumAvg3 * 1000) / 10,
  change3: pct(t.prev3 ? t.avg3 / t.prev3 - 1 : null),
  shareDaily: t.daily.map((v, d) => Math.round(v / (dailyTotal[d] || 1) * 1000) / 10),
}));

// distribution across ALL tracked games right now
const edges = [100, 300, 1e3, 3e3, 1e4, 3e4, 1e5, 3e5, Infinity];
const distribution = edges.slice(0, -1).map((lo, i) => {
  const inB = list.filter(g => g.players >= lo && g.players < edges[i + 1]);
  return { lo, hi: edges[i + 1] === Infinity ? null : edges[i + 1], games: inB.length, players: inB.reduce((s, g) => s + g.players, 0) };
});
const share = n => Math.round(list.slice(0, n).reduce((s, g) => s + g.players, 0) / totalNow * 1000) / 10;

// ---------- 5. headline facts (used when there is no hand-written commentary)
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + ' млн' : n >= 1e3 ? Math.round(n / 1e3) + ' тыс.' : String(n);
const facts = [];
facts.push(`Суммарный онлайн ${games.length} крупнейших игр ${P.label} — в среднем ${fmt(Math.round(sumAvg3))}, ${sumAvg3 >= sumPrev3 ? "+" : ""}${pct(sumAvg3 / sumPrev3 - 1)}% ${P.vs}.`);
facts.push(`Лидер — «${leaders[0].name}»: ${fmt(leaders[0].avg3)} игроков в среднем, ${leaders[0].change3 >= 0 ? '+' : ''}${leaders[0].change3}% ${P.vs}.`);
if (risers[0]) facts.push(`Самый быстрый рост — «${risers[0].name}» (${risers[0].genre}): +${risers[0].change3}% ${P.vs}, сейчас ${fmt(risers[0].now)}.`);
if (fallers[0]) facts.push(`Сильнее всех просела «${fallers[0].name}»: ${fallers[0].change3}% ${P.vs}, ${fallers[0].fromPeak}% от пика за ${DAYS} дней.`);
const gUp = genres.filter(g => g.avg3 > sumAvg3 * 0.02 && g.change3 !== null).sort((a, b) => b.change3 - a.change3);
if (gUp.length) facts.push(`Лучшая динамика среди жанров — ${gUp[0].genre} (${gUp[0].change3 >= 0 ? "+" : ""}${gUp[0].change3}% ${P.vs}), худшая — ${gUp.at(-1).genre} (${gUp.at(-1).change3}%).`);
facts.push(`Топ-10 игр собирают ${share(10)}% всего онлайна из ${list.length} отслеживаемых игр.`);

for (let i = 0; i < facts.length; i++) facts[i] = facts[i].replace(/..$/, ".");

const data = {
  date, period: PERIOD, title: P.title, label: P.label, vs: P.vs, windowHours: P.window,
  generatedAt: now.toISOString(), prevDate: prevReport?.date || null,
  source: { games: list.length, historyGames: games.length, failed },
  totals: {
    online: totalNow, avg3: Math.round(sumAvg3), prev3: Math.round(sumPrev3),
    change3: pct(sumAvg3 / sumPrev3 - 1), top10Share: share(10), top100Share: share(100),
    over10k: list.filter(g => g.players >= 1e4).length, over1k: list.filter(g => g.players >= 1e3).length,
    dailyTotal, dayLabels,
  },
  facts, leaders, risers, fallers, newHits, pushed, genres, distribution,
  games: games.map(g => ({ pid: g.pid, name: g.name, genre: g.genre, avg3: g.avg3, prev3: g.prev3, change3: pct(g.change3), daily: g.daily })),
};
writeJSON(`${outDir}/data.json`, data);

const entry = { date, period: PERIOD, online: totalNow, avg3: data.totals.avg3, change3: data.totals.change3, leader: leaders[0].name, headline: facts[2] || facts[1] };
const idx = reportsIndex.filter(r => !(r.date === date && r.period === PERIOD));
idx.push(entry);
idx.sort((a, b) => a.date.localeCompare(b.date));
writeJSON('docs/reports/index.json', idx, true);
console.log(`${PERIOD} report ${date} written: ${games.length} games, ${fs.statSync(path.join(ROOT, `${outDir}/data.json`)).size} bytes`);
