# Roblox Pulse

Маркетинговый отчёт по играм Roblox раз в 3 дня: лидеры, рост и падение онлайна, жанры, распределение.

Сайт: https://usakuzmin.github.io/roblox-pulse/

## Как устроено

| Что | Где | Когда |
|---|---|---|
| Почасовой срез онлайна (игры от 1K), разделы главной Roblox, жанры | `scripts/collect.mjs` → `data/` | каждый час, `.github/workflows/collect.yml` |
| Отчёт: 30-дневная история топ-игр с Rolimons, метрики | `scripts/report.mjs` → `docs/reports/<дата>/data.json` | 1, 4, 7… число месяца, `.github/workflows/report.yml` |
| Сайт | `docs/index.html` (GitHub Pages из `/docs`) | статический |
| Комментарий аналитика | `docs/reports/<дата>/summary.md` (необязательно) | пишет Claude после выхода отчёта |

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
