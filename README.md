# Telegram Mini App Minecraft Panel

Универсальная панель управления приватным Minecraft-сервером через Telegram Mini App. Проект можно развернуть рядом с уже существующим Minecraft-сервером в Docker: мир и runtime-файлы сервера не трогаются, управление идет через RCON, а пользователи, роли, права и аудит хранятся в Postgres.

## Что внутри

- Telegram Mini App с авторизацией по Telegram `initData`.
- Telegram-бот для входа в панель, статуса сервера и заявок.
- FastAPI backend с проверкой прав на каждое действие.
- React + TypeScript frontend, адаптированный под Telegram WebView.
- Postgres-схема `mc_panel` для пользователей, ролей, точечных прав, заявок и аудита.
- Allowlist RCON-команд вместо свободного доступа к консоли.
- HTTPS через Caddy и Let's Encrypt.

## Возможности

- Доступ к панели и боту по `telegram_user_id`.
- Роли: `owner`, `admin`, `moderator`, `player`, `viewer`.
- Точечные права поверх ролей, например только телепорт или только whitelist.
- Защита от случайного удаления последнего активного `owner`.
- Привязка Telegram-пользователя к Minecraft-нику.
- Online/offline статус игроков через RCON `list`.
- Одобрение и отклонение заявок игроков.
- Whitelist manager.
- Команды: broadcast, kick, ban, pardon, whitelist, op/deop, tp, gamemode, time, weather, difficulty, save.
- Dropdown онлайн-игроков для команд, где нужен ник.
- Audit log действий.
- Отдельный интерфейс для разных ролей и прав.

## Архитектура

```text
Telegram Bot
    |
    | opens Mini App
    v
https://panel.example.com
    |
    v
Caddy HTTPS reverse proxy
    |
    v
panel-web: Nginx + React
    |
    | /api/*
    v
panel-api: FastAPI
    |             |
    |             v
    |         Postgres schema mc_panel
    |
    v
Minecraft RCON
```

## Стек

- Backend: Python, FastAPI, asyncpg, aiogram.
- Frontend: React, TypeScript, Vite, lucide-react.
- Database: Postgres.
- HTTPS: Caddy.
- Runtime: Docker Compose.

## Структура проекта

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
  cloudflared-test.md           quick tunnel test
  local-uvicorn-cloudflared.md  local dev test
  https-domain.md               domain and HTTPS guide
  run-after-domain.md           production run guide
docker-compose.yml        example Minecraft service
docker-compose.panel.yml  API, bot, web
docker-compose.https.yml  Caddy HTTPS
```

## Что не должно попадать в Git

- Minecraft world data: `data/`, `world/`, `logs/`, `server.properties`, `playerdata`.
- Secrets: `.env`, `.env.panel`.
- Build artifacts: `frontend/dist/`, `node_modules/`, Python/TypeScript caches.

Проверь [.gitignore](.gitignore) перед публикацией репозитория.

## Требования

- Сервер с Docker и Docker Compose.
- Уже работающий Minecraft-сервер с включенным RCON.
- Postgres, доступный backend-контейнеру.
- Telegram bot token от [@BotFather](https://t.me/BotFather).
- Домен или поддомен для Mini App, например `panel.example.com`.

Для локального теста без домена можно использовать Cloudflare Quick Tunnel: [docs/cloudflared-test.md](docs/cloudflared-test.md).

## Быстрый production-запуск

Команды ниже выполняются на сервере из папки проекта.

### 1. Настрой DNS

Создай A-запись для панели:

```text
Type: A
Name: panel
Value: YOUR_SERVER_PUBLIC_IP
```

Пример проверки:

```bash
nslookup panel.example.com 1.1.1.1
```

В ответе должен быть публичный IP твоего сервера.

### 2. Подготовь `.env.panel`

```bash
cp .env.panel.example .env.panel
nano .env.panel
```

Минимальный набор:

```env
PANEL_DOMAIN=panel.example.com
WEB_APP_URL=https://panel.example.com
DATABASE_URL=postgresql://postgres_user:postgres_password@postgres_host:5432/postgres_db
BOT_TOKEN=123456789:replace_me
RCON_HOST=minecraft
RCON_PORT=25575
RCON_PASSWORD=your_rcon_password
CORS_ORIGINS=https://panel.example.com
```

Важно:

- `WEB_APP_URL` должен быть HTTPS URL панели, а не команда запуска tunnel.
- `RCON_PASSWORD` должен совпадать с паролем в Minecraft `server.properties`.
- Если Postgres работает на хосте, `localhost` внутри Docker-контейнера обычно не подойдет. Используй hostname/IP, доступный контейнеру.
- Если Minecraft RCON опубликован на хосте, укажи доступный `RCON_HOST`.

### 3. Открой порты

Для Caddy и Let's Encrypt нужны 80/443:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

### 4. Создай таблицы Postgres

```bash
export $(grep -v '^#' .env.panel | xargs)
psql "$DATABASE_URL" -f backend/migrations/001_init.sql
```

Миграция создает схему `mc_panel`, роли, права и allowlist RCON-команд.

### 5. Назначь первого owner

Узнай свой Telegram ID через команду `/id` в боте или через любого Telegram ID бота.

Затем выполни SQL, заменив `YOUR_TELEGRAM_ID`:

```sql
WITH u AS (
    INSERT INTO mc_panel.users (telegram_user_id, telegram_username, first_name, status)
    VALUES (YOUR_TELEGRAM_ID, 'owner_username', 'Owner', 'active')
    ON CONFLICT (telegram_user_id) DO UPDATE SET status = 'active'
    RETURNING id
)
INSERT INTO mc_panel.user_roles (user_id, role_id)
SELECT u.id, r.id
FROM u
JOIN mc_panel.roles r ON r.key = 'owner'
ON CONFLICT DO NOTHING;
```

### 6. Запусти панель

Если основной `docker-compose.yml` содержит Minecraft-сервис и `docker-compose.panel.yml` ссылается на него, запускай так:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.panel.yml \
  -f docker-compose.https.yml \
  up -d --build panel-api panel-bot panel-web panel-caddy
```

Minecraft-сервис не будет пересоздан, если ты не укажешь его имя в конце команды.

Если панель полностью независима от Minecraft compose, можно использовать только panel/https compose:

```bash
docker compose \
  -f docker-compose.panel.yml \
  -f docker-compose.https.yml \
  up -d --build
```

### 7. Проверь логи

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.panel.yml \
  -f docker-compose.https.yml \
  logs -f panel-caddy panel-api panel-bot panel-web
```

### 8. Проверь доступность

```text
https://panel.example.com
https://panel.example.com/api/healthz
```

### 9. Открой Telegram-бота

Отправь боту:

```text
/start
```

Если `owner` назначен правильно, бот покажет кнопку Mini App.

## Команды бота

```text
/start                 открыть Mini App
/panel                 получить кнопку панели
/status                статус Minecraft
/players               игроки онлайн
/requests              новые заявки
/approve <telegram_id> одобрить заявку
/reject <telegram_id>  отклонить заявку
/id                    показать Telegram ID
/help                  список команд
```

## Модель прав

Права хранятся в `mc_panel.permissions`, роли связываются с правами через `mc_panel.role_permissions`.

Примеры прав:

```text
minecraft.status.read
minecraft.whitelist.read
minecraft.whitelist.write
minecraft.ops.write
minecraft.command.say
minecraft.command.kick
minecraft.command.ban
minecraft.command.tp.self_to_player
minecraft.command.tp.player_to_self
minecraft.command.tp.player_to_player
minecraft.command.gamemode
minecraft.command.time
minecraft.command.weather
minecraft.command.difficulty
minecraft.command.save
minecraft.command.raw
users.manage
roles.manage
audit.read
```

Точечные overrides хранятся в `mc_panel.user_permission_overrides`. Через Mini App можно увидеть effective-права пользователя, выдать право, запретить право или сбросить override.

## Безопасность

- Mini App запросы подписываются Telegram `initData`.
- Backend проверяет подпись через `BOT_TOKEN`.
- UI скрывает недоступные действия, но финальная проверка всегда на backend.
- RCON-команды выполняются только по allowlist из `mc_panel.minecraft_commands`.
- Опасные команды требуют подтверждения.
- Действия пишутся в `mc_panel.command_executions` и `mc_panel.audit_log`.
- Сырой RCON должен оставаться только у доверенных owner/admin.
- Последнего активного `owner` нельзя случайно заблокировать или лишить роли через API.

## Полезные команды

Пересобрать и перезапустить только панель:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.panel.yml \
  -f docker-compose.https.yml \
  up -d --build panel-api panel-bot panel-web panel-caddy
```

Перезапустить панель без пересборки:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.panel.yml \
  -f docker-compose.https.yml \
  restart panel-api panel-bot panel-web panel-caddy
```

Остановить панель, не трогая Minecraft:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.panel.yml \
  -f docker-compose.https.yml \
  stop panel-api panel-bot panel-web panel-caddy
```

Проверить API на сервере:

```bash
curl http://localhost:8000/healthz
```

Проверить HTTPS:

```bash
curl https://panel.example.com/api/healthz
```

## Troubleshooting

Панель не открывается:

- проверь DNS: `nslookup panel.example.com 1.1.1.1`;
- проверь, что порты 80/443 открыты;
- проверь, что Caddy запущен и порт 80/443 не занят другим nginx/apache;
- проверь `PANEL_DOMAIN` и `WEB_APP_URL` в `.env.panel`.

Сертификат не выпускается:

- домен должен указывать на этот сервер;
- Let's Encrypt должен видеть порт 80;
- `PANEL_DOMAIN` должен совпадать с реальным доменом панели.

API не подключается к Postgres:

- проверь `DATABASE_URL`;
- не используй `localhost`, если Postgres не в том же контейнере;
- проверь доступ пользователя Postgres к базе и схеме.

RCON не работает:

- проверь `RCON_HOST`, `RCON_PORT`, `RCON_PASSWORD`;
- проверь, что Minecraft публикует RCON порт;
- проверь `enable-rcon=true` в Minecraft `server.properties`.

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
