// Hourly collector: our own copy of the data, independent of Rolimons history.
//   data/hourly/YYYY-MM-DD.json  players per hour (UTC) for games with >= MIN_PLAYERS
//   data/sorts/YYYY-MM-DD.json   which games Roblox shows in Trending / Up-and-Coming etc.
//   data/meta.json               placeId -> universe, genre, creator, dates
import {
  getGameList, getExploreSorts, placeToUniverse, getUniverseDetails,
  readJSON, writeJSON, ymd, pool, metaFromDetails, sleep,
} from './lib.mjs';

const MIN_PLAYERS = 1000;
const MAX_NEW_MAPPINGS = 150; // placeId->universe lookups per run, to stay polite
const TRACKED_SORTS = ['top-trending', 'up-and-coming', 'top-playing-now', 'top-revisited', 'fun-with-friends'];

const now = new Date();
const day = ymd(now);
const hour = now.getUTCHours();

const games = await getGameList();
console.log(`gamelist: ${games.length} games, ${games.filter(g => g.players >= MIN_PLAYERS).length} >= ${MIN_PLAYERS}`);

// --- hourly players
const hourlyPath = `data/hourly/${day}.json`;
const hourly = readJSON(hourlyPath, { date: day, total: Array(24).fill(null), tracked: Array(24).fill(null), games: {} });
hourly.total[hour] = games.reduce((s, g) => s + g.players, 0);
hourly.tracked[hour] = games.length;
for (const g of games) {
  if (g.players < MIN_PLAYERS) break;
  (hourly.games[g.pid] ||= Array(24).fill(null))[hour] = g.players;
}
writeJSON(hourlyPath, hourly);

// --- Roblox discovery sorts
const meta = readJSON('data/meta.json', {});
const sortsPath = `data/sorts/${day}.json`;
const sortsDay = readJSON(sortsPath, { date: day, sorts: {} });
try {
  const sorts = await getExploreSorts();
  for (const s of sorts) {
    if (!TRACKED_SORTS.includes(s.sortId)) continue;
    const bucket = (sortsDay.sorts[s.sortId] ||= { name: s.sortDisplayName, games: {} });
    s.games.forEach((g, rank) => {
      const pid = String(g.rootPlaceId);
      const e = (bucket.games[pid] ||= { name: g.name, first: hour, best: rank + 1, hours: 0, maxPlayers: 0 });
      e.last = hour;
      e.hours++;
      e.best = Math.min(e.best, rank + 1);
      e.maxPlayers = Math.max(e.maxPlayers, g.playerCount || 0);
      if (!meta[pid]) meta[pid] = { u: g.universeId, name: g.name, g1: g.genreL1 || null };
      else meta[pid].u ||= g.universeId;
    });
  }
  writeJSON(sortsPath, sortsDay);
} catch (e) {
  console.warn('explore sorts failed:', e.message);
}

// --- metadata: map new places to universes, refresh details for new ones + daily for all top games
const top = games.filter(g => g.players >= MIN_PLAYERS);
const unmapped = top.filter(g => !meta[g.pid]?.u).slice(0, MAX_NEW_MAPPINGS);
let mapped = 0;
await pool(unmapped, 3, async g => {
  try {
    const u = await placeToUniverse(g.pid);
    if (u) { meta[g.pid] = { ...(meta[g.pid] || {}), u, name: g.name }; mapped++; }
  } catch (e) { console.warn('map', g.pid, e.message); }
  await sleep(250);
});

const needDetails = Object.entries(meta)
  .filter(([pid, m]) => m.u && (!m.seen || (hour === 0 && top.some(g => g.pid === pid))))
  .map(([pid, m]) => [pid, m.u]);
if (needDetails.length) {
  try {
    const details = await getUniverseDetails(needDetails.map(([, u]) => u));
    for (const [pid, u] of needDetails) if (details[u]) meta[pid] = metaFromDetails(details[u], meta[pid]);
  } catch (e) { console.warn('details failed:', e.message); }
}
writeJSON('data/meta.json', meta);

console.log(`hour ${day} ${hour}:00 UTC — total online ${hourly.total[hour]}, mapped ${mapped} new, details ${needDetails.length}`);
