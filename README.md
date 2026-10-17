# Roblox Pulse

Маркетинговый отчёт по играм Roblox каждый день, плюс итоги недели и месяца: лидеры, рост и падение онлайна, жанры, распределение.

Сайт: https://usakuzmin.github.io/roblox-pulse/

## Как устроено

| Что | Где | Когда |
|---|---|---|
| Почасовой срез онлайна (игры от 1K), разделы главной Roblox, жанры | `scripts/collect.mjs` → `data/` | каждый час, `.github/workflows/collect.yml` |
| Отчёт: 30-дневная история топ-игр с Rolimons, метрики | `scripts/report.mjs` → `docs/reports/<период>/<дата>/data.json` | ежедневно, итоги недели по понедельникам, месяца — 1-го числа (`PERIOD=daily|weekly|monthly`), `.github/workflows/report.yml` |
| Сайт | `docs/index.html` (GitHub Pages из `/docs`) | статический |
| Комментарий аналитика | `docs/reports/<период>/<дата>/summary.md` (необязательно) | пишет Claude после выхода отчёта |

Без `summary.md` вверху выпуска показываются автоматические выводы из `data.json` → `facts`.

## Источники

- Rolimons: `api.rolimons.com/games/v1/gamelist` (онлайн ~8K игр) и страницы игр (история онлайна, 10-мин. точки).
- Roblox: `games.roblox.com/v1/games` (жанры genre_l1/l2, даты), `apis.roblox.com/explore-api/v1/get-sorts` (Top Trending, Up-and-Coming).

## Локально

```bash
node scripts/collect.mjs
node scripts/report.mjs
npx serve docs
```
