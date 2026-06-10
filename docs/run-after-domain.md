# Запуск после настройки домена

## 1. Проверить DNS

Пример домена панели:

```text
panel.example.com
```

Проверка:

```bash
nslookup panel.example.com
```

В ответе должен быть публичный IP сервера.

## 2. Заполнить `.env.panel`

```bash
cp .env.panel.example .env.panel
```

Минимально нужны:

```env
PANEL_DOMAIN=panel.example.com
WEB_APP_URL=https://panel.example.com
DATABASE_URL=postgresql://user:password@host:5432/dbname
BOT_TOKEN=123456789:replace_me
RCON_PASSWORD=your_current_rcon_password
RCON_PORT=25575
```

Если Postgres установлен прямо на хосте, а не в Docker, то `localhost` из контейнера не подойдет.
Используй IP сервера/хоста или добавь отдельную сетевую настройку для доступа к host gateway.

## 3. Создать таблицы

```bash
psql "$DATABASE_URL" -f backend/migrations/001_init.sql
```

## 4. Назначить первого owner

Замени значения на свои:

```sql
WITH u AS (
    INSERT INTO mc_panel.users (telegram_user_id, telegram_username, first_name, status)
    VALUES (123456789, 'your_username', 'Owner', 'active')
    ON CONFLICT (telegram_user_id) DO UPDATE SET status = 'active'
    RETURNING id
)
INSERT INTO mc_panel.user_roles (user_id, role_id)
SELECT u.id, r.id FROM u, mc_panel.roles r WHERE r.key = 'owner'
ON CONFLICT DO NOTHING;
```

Выполнить можно так:

```bash
psql "$DATABASE_URL"
```

И вставить SQL вручную.

## 5. Поднять панель

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.panel.yml \
  -f docker-compose.https.yml \
  up -d --build panel-api panel-bot panel-web panel-caddy
```

## 6. Проверить логи

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.panel.yml \
  -f docker-compose.https.yml \
  logs -f panel-caddy panel-api panel-bot panel-web
```

У Caddy должны появиться сообщения о выпуске сертификата.

## 7. Проверить в браузере

```text
https://panel.example.com
https://panel.example.com/api/healthz
```

## 8. Проверить Telegram

Открой бота и отправь:

```text
/start
```

Если твой Telegram ID назначен owner, бот покажет кнопку открытия панели.

## Частые ошибки

- `https` не открывается: DNS еще не дошел или закрыты порты 80/443.
- Caddy не выпускает сертификат: домен указывает не на этот сервер.
- API не подключается к БД: в `DATABASE_URL` указан `localhost`, а Postgres находится на хосте вне Docker.
- RCON ошибка: `RCON_PASSWORD` в `.env.panel` не совпадает с текущим Minecraft `.env`.
