# Инсайды разработчиков — пример выпуска

Период: 19 сентября – 16 октября 2026. Собрано `scripts/devnews.mjs` (DevForum + Reddit), отобрано и пересказано вручную.
Выжимки — пересказ своими словами; цифры из комментариев помечены как «по словам участника» — это не проверенные данные.

Главная тема месяца: **платная реклама в Roblox Ads Manager против органического трафика с главной (Home Recommendations)**. Roblox публикует цифры в пользу рекламы, а разработчики в комментариях отвечают своими.

---

## 1. Ads Manager RDC Recap: Earnings, ROAS Reporting & Incrementality
<https://devforum.roblox.com/t/ads-manager-rdc-recap-earnings-roas-reporting-incrementality/4909790> · Roblox staff · 2 Oct · 172 ❤ · 4.5K просмотров · `platform` `ads` `metrics`

**EN.** Roblox ran 21 randomized incrementality studies: every campaign brought extra plays, with a median 14% lift in play sessions and 10% lift in D7-retained users. The "Earnings" (ROAS-optimised) objective goes from beta to ~30,000 eligible games; Roblox says about two in three games that reinvested up to 4% of earnings got ROAS above 100%. Highly retentive games now get cheaper ad distribution, and Sponsored Tiles open to under-13s. In the replies, several developers say the opposite: stopping ads roughly doubled their playtime and only then did Home recommendations pick the game up, one of them after about $4K of ad spend.

**RU.** Roblox провёл 21 рандомизированное исследование инкрементальности: все кампании дали дополнительные заходы, медианный прирост сессий 14%, удержание на 7-й день (D7) +10%. Цель «Earnings» (оптимизация под ROAS) выходит из беты и станет доступна ~30 000 игр; по данным Roblox, примерно у двух из трёх игр, вложивших в рекламу до 4% заработка, ROAS превысил 100%. Игры с высоким удержанием теперь получают более дешёвый показ, а Sponsored Tiles стали показывать детям до 13 лет. В комментариях несколько разработчиков пишут обратное: после отключения рекламы их playtime вырос примерно вдвое и только тогда игру подхватила главная; один из них до этого потратил около $4K.

**Почему полезно:** официальные бенчмарки ROAS и инкрементальности плюс живая реакция рынка в одной ветке. Хорошая тема для комментария аналитика.

---

## 2. My first Roblox game flopped on ads. Here's the funnel data and what I changed
<https://www.reddit.com/r/robloxgamedev/comments/1x4hpkf/my_first_roblox_game_flopped_on_ads_heres_the/> · u/therok1 · 12 Oct · `story` `metrics` `ads`

**EN.** A solo dev spent about $10/day on ads for a mining/factory tycoon and retention was poor, so they broke down the onboarding funnel: of 236 players, half never mined a single block and only 4% finished the tutorial. They cut the tutorial from 9 steps to 5, gave every step a reason ("cash buys a faster pickaxe"), reduced the starting UI from 8 buttons to 3 and turned the travel menu into a single button. Their main lesson: explain *why* to do something, not how the systems work. Commenters add that the thumbnail and title should show the factory part up front so the audience's expectations match the game.

**RU.** Соло-разработчик тратил около $10 в день на рекламу тайкуна про шахту и фабрику; удержание было слабым, и он разобрал воронку онбординга. Из 236 игроков половина не добыла ни одного блока, а туториал прошли только 4%. Он сократил туториал с 9 до 5 шагов, объяснил смысл каждого шага («деньги — на кирку получше»), урезал стартовый интерфейс с 8 кнопок до 3, а меню перемещения сделал одной кнопкой. Главный вывод: объяснять игроку, *зачем* что-то делать, а не как устроены системы. Комментаторы советуют показать фабрику уже на иконке и в названии, чтобы ожидания аудитории совпадали с игрой.

**Почему полезно:** редкий случай, когда выложены реальные цифры воронки до и после исправлений при маленьком рекламном бюджете.

---

## 3. My Game Died — What Went Wrong?
<https://devforum.roblox.com/t/my-game-died-what-went-wrong/4917693> · derpylol10 · 6 Oct · `story` `metrics` `monetization`

**EN.** A first game (an "outfit tower" obby) peaked at 230 CCU and held 100+ for a few days, then died. Even with DAU above the "top 10,000" benchmark, it earned only ~1.7K Robux over its lifetime: net negative after costs. Most players came from the Philippines rather than the US. The reply describes the usual pattern: Home recommendations test a game on organic traffic, see weak retention and session time, and shut the traffic off. In a game where all the fun is free within minutes, nobody has a reason to pay.

**RU.** Первая игра автора (обби-«башня с нарядами») на пике собрала 230 CCU и несколько дней держалась выше 100, а потом умерла. Хотя DAU был выше бенчмарка «топ-10 000», за всё время игра заработала всего ~1,7K Robux, то есть с учётом затрат ушла в минус. Основная аудитория пришла из Филиппин, а не из США. В ответе описана типичная схема: главная тестирует игру на органике, видит слабое удержание и короткие сессии и перекрывает трафик. А если всё веселье бесплатно доступно за пару минут, платить игрокам незачем.

**Почему полезно:** наглядно видно, что пик CCU ничего не значит без удержания и монетизации, а «плохая» гео-аудитория обесценивает трафик.

---

## 4. Fix the extremely lackluster sponsored ads performance
<https://devforum.roblox.com/t/fix-the-extremely-lackluster-sponsored-ads-performance/4908059> · VegetationBush · 1 Oct · `ads` `metrics`

**EN.** Across three 1–2-week test campaigns, a developer found that 20–25% of ~1,500 ad-acquired players never passed the first funnel step, which was a single screen tap. About 60–65% were gone before a 15-second tutorial goal. Joining live servers, they mostly saw avatars standing still, walking into walls or auto-clicking, and concluded that a large share of the sponsored traffic looks like bots. They say others report the same pattern on other platforms.

**RU.** За три тестовые кампании по 1–2 недели разработчик выяснил, что 20–25% из ~1500 игроков, пришедших с рекламы, не прошли даже первый шаг воронки: один тап по экрану. До цели 15-секундного туториала не дошли 60–65%. Зайдя на живые серверы, он видел в основном аватары, которые стоят на месте, бегут в стену или автокликают, и сделал вывод, что значительная часть спонсорского трафика похожа на ботов. По его словам, о том же пишут и на других площадках.

**Почему полезно:** сигнал о качестве платного трафика. Его стоит учитывать при оценке рекламных кампаний и при сравнении ROAS из поста №1.

---

## 5. Feedback on first impressions & why ads aren't growing Highly Engaged Players
<https://devforum.roblox.com/t/my-game-feedback-on-first-impressions-why-ads-arent-growing-highly-engaged-players/4920507> · MedigiTV · 7 Oct · `ads` `discovery` `metrics`

**EN.** A solo dev from Korea needs 250 "Highly Engaged Players" (HEU) to unlock Kids/Select audiences. A 2-day "Plays" campaign ($9.48, 56K impressions, 0.7% CTR, 420 clicks) moved the counter to just 1/250. Another dev replied that $100 on ads at ~5% CTR brought only 135 HEU. According to that commenter, the threshold drops to 100 HEU in November, and the expedited-review alternative costs 50K Robux (refundable after qualifying). The original poster decided to stop spending and work on a non-AI thumbnail instead.

**RU.** Соло-разработчику из Кореи нужно 250 «Highly Engaged Players» (HEU), чтобы открыть аудитории Kids/Select. Двухдневная кампания с целью «Plays» ($9,48, 56K показов, CTR 0,7%, 420 кликов) сдвинула счётчик всего до 1/250. Другой разработчик ответил, что $100 рекламы при CTR ~5% дали ему только 135 HEU. По словам этого участника, в ноябре порог снизят до 100 HEU, а альтернатива — ускоренная проверка за 50K Robux (возвращаются после квалификации). Автор решил остановить траты и сделать иконку без ИИ.

**Почему полезно:** реальная стоимость прохода порога HEU для новых игр и возможное изменение правил в ноябре (проверить по официальным источникам).

---

## 6. When's the algo finally gonna pick up my game?
<https://devforum.roblox.com/t/whens-the-algo-finally-gonna-pick-up-my-game/4903858> · Sproons · 29 Sep · `ads` `discovery` `revenue`

**EN.** After a 5-day, 5K-Robux ad campaign, a horror game went from 100 to 1.7K visits at 0–20 CCU with a 3.9% CTR. It earned ~3K Robux back, though analytics attribute only ~700 to the ad, which suggests friends-of-players spend more. Despite decent daily benchmarks, it got exactly zero Home recommendations. The only reply suggests frequent updates ("the pet sim method") and replayable themes.

**RU.** После пятидневной кампании на 5K Robux хоррор-игра выросла со 100 до 1,7K визитов при 0–20 CCU и CTR 3,9%. Вернулось ~3K Robux, хотя аналитика приписывает рекламе только ~700: похоже, больше тратят друзья пришедших игроков. При неплохих дневных бенчмарках рекомендаций на главной было ровно ноль. Единственный ответ советует частые апдейты («метод Pet Sim») и темы, в которые хочется переигрывать.

**Почему полезно:** конкретные цифры окупаемости маленькой кампании и наглядный пример того, что реклама не гарантирует попадание в Home Recommendations.

---

## 7. Improved Discovery Measurement in Creator Analytics
<https://devforum.roblox.com/t/improved-discovery-measurement-in-creator-analytics/4930122> · Roblox staff · 12 Oct · `platform` `discovery` `metrics`

**EN.** From 12 Oct 2026, Roblox records Home/Search/Charts impressions, clicks and plays through a more reliable pipeline. Counts go up and play-through rate (PTR) dips slightly for every game; Roblox says the RFY ranking itself is unchanged. Before/after comparisons across that date are therefore not like-for-like. In the replies, developers ask for retention and spend metrics in thumbnail A/B tests. One notes that games with high PTR but weak retention no longer get recommended, so PTR seems to matter less than before.

**RU.** С 12 октября 2026 года Roblox записывает показы, клики и заходы с главной, из поиска и чартов через более надёжный конвейер. Счётчики вырастут, а play-through rate (PTR) немного снизится у всех игр; по словам Roblox, само ранжирование RFY не меняется. Поэтому сравнивать периоды до и после этой даты напрямую нельзя. В комментариях разработчики просят добавить в A/B-тесты иконок метрики удержания и трат. Один пишет, что игры с высоким PTR, но слабым удержанием больше не попадают в рекомендации, так что PTR, похоже, стал весить меньше.

**Почему полезно:** важно для самого Roblox Pulse: с 12 октября у всех игр меняется база метрик discovery, и это нужно отмечать на графиках.

---

## 8. Bad Monetization?
<https://devforum.roblox.com/t/bad-monetization/4896423> · Lihttdev · 26 Sep · `monetization` `metrics`

**EN.** A game averaging ~500 CCU, peaking at 1K, earns far less than similar titles. Commenters first assume it has no paid products at all, but the dev had hidden every product until the player's first rebirth to "reduce clutter". Others argue most players never notice the store, and that an emoji-heavy description and an AI-looking presentation hurt trust. The suggested fixes: visible gamepasses and dev products from the start, time-limited items and subscriptions.

**RU.** Игра со средним онлайном ~500 CCU и пиком 1K зарабатывает намного меньше похожих. Комментаторы сначала решили, что платных товаров там нет вовсе, но оказалось, что разработчик спрятал их до первого ребёрта, чтобы «не перегружать экран». Другие считают, что большинство игроков магазин просто не замечают, а описание с кучей эмодзи и «ИИ-шное» оформление подрывают доверие. Что советуют: показывать геймпассы и товары разработчика с самого начала, добавить лимитированные предметы и подписки.

**Почему полезно:** живой пример того, как UX магазина убивает ARPU при нормальном онлайне.

---

## 9. RobloxGameStats: live player counts, history and revenue estimates for 20,000+ experiences
<https://devforum.roblox.com/t/robloxgamestats-free-live-player-counts-history-and-revenue-estimates-for-20000-experiences/4897538> · iiSmallTV (King Studios, 270M+ plays) · 27 Sep · `revenue` `metrics` `tool`

**EN.** A studio founder launched a free tracker covering 20K+ experiences: CCU every 5 minutes, visit and session-length history back to launch, and genre charts. Revenue estimates are free for the top 10 and paid for the rest. The estimate model is described openly: 30-day CCU × average session length × genre-specific spend rates, calibrated against numbers developers have shared publicly. The author warns it is weakest for new games and for unusual monetization.

**RU.** Основатель студии запустил бесплатный трекер по 20K+ играм: CCU каждые 5 минут, история визитов и длины сессий с момента запуска, жанровые чарты. Оценки дохода бесплатны для топ-10, для остальных игр — платно. Модель описана открыто: CCU за 30 дней × средняя длина сессии × жанровые коэффициенты трат, с калибровкой по цифрам, которые разработчики публиковали сами. Автор предупреждает, что хуже всего она работает для новых игр и для необычной монетизации.

**Почему полезно:** возможный дополнительный источник данных для Roblox Pulse (оценка дохода по жанрам) и готовая методика оценки выручки.

---

### Отсеяно в этом выпуске (примеры мусора)
Changelog'и игр из Bulletin Board, `[FOR HIRE]/[HIRING]`, продажа игр «40 CCU game for sale», жалобы на модерацию и удалённые игры, Studio-беты («UIShadow», «EditableMesh»), шоукейсы моделей на Reddit, общеотраслевые статьи Naavik/GameDiscoverCo, где Roblox упоминается мимоходом.
