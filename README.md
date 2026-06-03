# Telegram Mini App Minecraft Panel

Панель управления приватным Minecraft-сервером в Docker: Telegram Mini App, Telegram-бот, FastAPI backend, Postgres RBAC и HTTPS через Caddy.

Проект сделан так, чтобы не трогать мир Minecraft напрямую. Панель управляет сервером через RCON, хранит пользователей и права в Postgres, а `data/` с миром, логами и runtime-файлами не попадает в GitHub.

## Что умеет

- Авторизация Mini App по Telegram `initData`.
- Доступ к боту и панели по `telegram_user_id`.
- Роли: `owner`, `admin`, `moderator`, `player`, `viewer`.
- Точечные права поверх ролей, например только `minecraft.command.tp.player_to_player`.
- Привязка Telegram-пользователя к Minecraft-нику.
- Online/offline статус игроков по RCON `list`.
- Одобрение и отклонение заявок игроков из вкладки `Настройки`.
- Dropdown игроков для teleport-команд, если игроки онлайн.
- Whitelist, kick, ban, pardon, tp, gamemode, time, weather, save.
- Аудит действий в Postgres.
- HTTPS для `panel.r3dbad.ru` через Caddy и Let's Encrypt.

## Архитектура

```text
Telegram Bot
    |
    | opens Mini App
    v
panel.r3dbad.ru
    |
    v
Caddy HTTPS reverse proxy
    |
    v
panel-web Nginx + React
    |
    | /api/*
    v
panel-api FastAPI
    |             |
    |             v
    |         Postgres mc_panel schema
    |
    v
Minecraft RCON
```

## Стек

- Backend: Python, FastAPI, asyncpg, aiogram, built-in RCON client.
- Frontend: React, TypeScript, Vite, lucide-react.
- Database: Postgres, отдельная схема `mc_panel`.
- HTTPS: Caddy.
- Runtime: Docker Compose.

## Структура

```text
backend/
  app/                 FastAPI API
  bot/                 Telegram bot
  migrations/          SQL schema and seed permissions
frontend/
  src/                 React Mini App
  nginx.conf           static web + API proxy
caddy/
  Caddyfile            HTTPS reverse proxy
docs/
  https-domain.md      домен и HTTPS
  run-after-domain.md  запуск после настройки домена
docker-compose.yml        существующий Minecraft server
docker-compose.panel.yml  API, bot, web
docker-compose.https.yml  Caddy HTTPS
```

## Важно про GitHub

В GitHub не должны попадать:

- `data/` с миром Minecraft, playerdata, логами и `server.properties`;
- `.env` и `.env.panel`;
- `node_modules/`;
- `frontend/dist/`;
- Python и TypeScript кэши.

Это уже закрыто в [.gitignore](.gitignore).

## Быстрый запуск на сервере

Команды выполняются из папки проекта на сервере, где уже находится текущий `docker-compose.yml` Minecraft-сервера.

Для временного теста без домена и Caddy можно использовать Cloudflare Quick Tunnel: [docs/cloudflared-test.md](docs/cloudflared-test.md).

Для локальной разработки без Docker панели: [docs/local-uvicorn-cloudflared.md](docs/local-uvicorn-cloudflared.md).

### 1. Настроить DNS

DNS-запись:

```text
Type: A
Name: panel
Value: 202.49.176.99
```

Проверка:

```bash
nslookup panel.r3dbad.ru 1.1.1.1
```

В ответе должен быть IP сервера.

### 2. Создать `.env.panel`

```bash
cp .env.panel.example .env.panel
nano .env.panel
```

Минимально:

```env
PANEL_DOMAIN=panel.r3dbad.ru
WEB_APP_URL=https://panel.r3dbad.ru
DATABASE_URL=postgresql://user:password@host:5432/dbname
BOT_TOKEN=123456789:replace_me
RCON_PASSWORD=your_current_rcon_password
RCON_PORT=25575
CORS_ORIGINS=https://panel.r3dbad.ru
```

`RCON_PASSWORD` должен совпадать с паролем текущего Minecraft-сервера.

Если Postgres находится на хосте, а не в Docker, `localhost` внутри контейнера не подойдет. Используй IP/hostname, доступный контейнеру.

### 3. Открыть порты

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

### 4. Создать таблицы

```bash
export $(grep -v '^#' .env.panel | xargs)
psql "$DATABASE_URL" -f backend/migrations/001_init.sql
```

### 5. Назначить первого owner

Узнай свой Telegram ID через бота или стороннего Telegram ID бота, затем:

```bash
psql "$DATABASE_URL"
```

Вставь SQL, заменив `123456789` на свой Telegram ID:

```sql
WITH u AS (
    INSERT INTO mc_panel.users (telegram_user_id, telegram_username, first_name, status)
    VALUES (123456789, 'r3dbad', 'Owner', 'active')
    ON CONFLICT (telegram_user_id) DO UPDATE SET status = 'active'
    RETURNING id
)
INSERT INTO mc_panel.user_roles (user_id, role_id)
SELECT u.id, r.id FROM u, mc_panel.roles r WHERE r.key = 'owner'
ON CONFLICT DO NOTHING;
```

Выйти:

```sql
\q
```

### 6. Запустить панель

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.panel.yml \
  -f docker-compose.https.yml \
  up -d --build panel-api panel-bot panel-web panel-caddy
```

### 7. Проверить логи

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.panel.yml \
  -f docker-compose.https.yml \
  logs -f panel-caddy panel-api panel-bot panel-web
```

### 8. Проверить в браузере

```text
https://panel.r3dbad.ru
https://panel.r3dbad.ru/api/healthz
```

### 9. Открыть Telegram-бота

Отправь:

```text
/start
```

Если owner назначен правильно, бот покажет кнопку Mini App.

Команды бота:

```text
/start   открыть Mini App
/panel   получить кнопку панели
/status  статус Minecraft
/players игроки онлайн
/id      показать Telegram ID
/help    список команд
```

## Права

Права хранятся в таблице `mc_panel.permissions`.

Примеры:

```text
minecraft.status.view
minecraft.players.view
minecraft.whitelist.write
minecraft.command.kick
minecraft.command.tp.self_to_player
minecraft.command.tp.player_to_self
minecraft.command.tp.player_to_player
minecraft.command.raw
users.manage
roles.manage
```

Роли дают набор прав, но конкретному пользователю можно выдать или запретить отдельное право через `mc_panel.user_permission_overrides`.

## Безопасность

- Mini App запросы подписываются Telegram `initData`.
- Backend проверяет Telegram подпись через `BOT_TOKEN`.
- UI скрывает недоступные действия, но финальная проверка всегда на backend.
- RCON-команды выполняются по allowlist из таблицы `mc_panel.minecraft_commands`.
- Опасные команды требуют подтверждения.
- Все действия пишутся в `mc_panel.command_executions` и `mc_panel.audit_log`.
- Сырой RCON доступен только через критическое право `minecraft.command.raw`.

## Полезные команды

Перезапуск панели:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.panel.yml \
  -f docker-compose.https.yml \
  restart panel-api panel-bot panel-web panel-caddy
```

Остановить только панель, не трогая Minecraft:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.panel.yml \
  -f docker-compose.https.yml \
  stop panel-api panel-bot panel-web panel-caddy
```

Проверить API локально на сервере:

```bash
curl http://localhost:8000/healthz
```

Проверить HTTPS:

```bash
curl https://panel.r3dbad.ru/api/healthz
```

## Troubleshooting

`panel.r3dbad.ru` не открывается:

- проверь DNS: `nslookup panel.r3dbad.ru 1.1.1.1`;
- проверь, что порты 80/443 открыты;
- проверь, что Caddy запущен и порт 80/443 не занят другим nginx/apache.

Сертификат не выпускается:

- домен должен указывать на сервер;
- Let's Encrypt должен видеть порт 80;
- в `.env.panel` `PANEL_DOMAIN` должен быть `panel.r3dbad.ru`.

API не подключается к Postgres:

- проверь `DATABASE_URL`;
- не используй `localhost`, если Postgres не в том же контейнере;
- проверь доступ пользователя Postgres к схеме/БД.

RCON не работает:

- проверь `RCON_PASSWORD`;
- проверь, что Minecraft compose публикует RCON порт `25575`;
- проверь `ENABLE_RCON=true` в Minecraft-конфиге.

## Локальная проверка разработки

Backend syntax:

```bash
python3 -m compileall backend/app backend/bot
```

Frontend build:

```bash
cd frontend
npm install
npm run build
```
