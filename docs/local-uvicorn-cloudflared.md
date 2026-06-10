# Локальный тест через uvicorn + Vite + cloudflared

Схема:

```text
cloudflared HTTPS URL
    -> localhost:5173 Vite frontend
        -> /api proxy
            -> localhost:8000 FastAPI uvicorn
```

Docker для панели в этом режиме не нужен. Minecraft и Postgres могут быть где угодно, главное чтобы backend мог до них достучаться.

## 1. Backend env

В корне проекта:

```bash
cp .env.panel.example .env.panel
```

Заполни:

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
BOT_TOKEN=123456789:replace_me
WEB_APP_URL=https://temporary.trycloudflare.com
RCON_HOST=127.0.0.1
RCON_PORT=25575
RCON_PASSWORD=your_current_rcon_password
CORS_ORIGINS=https://temporary.trycloudflare.com
```

Если Minecraft RCON находится на другом сервере, вместо `127.0.0.1` укажи IP/hostname сервера:

```env
RCON_HOST=YOUR_MINECRAFT_HOST
RCON_PORT=25575
```

Но RCON-порт должен быть доступен с локального Mac. Если firewall закрывает `25575`, backend увидит RCON offline.

## 2. Python venv

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 3. Миграция БД

Из корня проекта:

```bash
export $(grep -v '^#' .env.panel | xargs)
psql "$DATABASE_URL" -f backend/migrations/001_init.sql
```

## 4. Запустить FastAPI

Из корня проекта:

```bash
source backend/.venv/bin/activate
uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
```

Проверка:

```bash
curl http://127.0.0.1:8000/healthz
```

## 5. Запустить frontend

В новом терминале:

```bash
cd frontend
npm install
npm run dev
```

Vite будет доступен на:

```text
http://127.0.0.1:5173
```

## 6. Запустить cloudflared

В новом терминале:

```bash
cloudflared tunnel --url http://127.0.0.1:5173
```

Команду оставь работать. В ее выводе найди и скопируй именно HTTPS URL вида:

```text
https://something.trycloudflare.com
```

Не вставляй в `.env.panel` саму команду `cloudflared tunnel --url ...`.

Если Vite показывает ошибку `Blocked request. This host ... is not allowed`,
перезапусти `npm run dev`: в проекте уже разрешены host-ы `*.trycloudflare.com`.

## 7. Обновить `.env.panel`

Поставь реальный quick tunnel URL:

```env
WEB_APP_URL=https://something.trycloudflare.com
CORS_ORIGINS=https://something.trycloudflare.com
```

Именно `WEB_APP_URL` использует Telegram-бот для кнопки Mini App.

После этого перезапусти `uvicorn` и бота, чтобы они перечитали `.env.panel`.

## 8. Запустить бота локально

В новом терминале:

```bash
source backend/.venv/bin/activate
PYTHONPATH=backend python -m bot.main
```

В Telegram:

```text
/start
```

## Важно

- Telegram Mini App должен открываться по HTTPS, поэтому нужен cloudflared URL.
- Quick tunnel URL меняется при каждом перезапуске `cloudflared`.
- После смены URL перезапусти `uvicorn` и `python -m bot.main`.
- Если frontend открыт просто в браузере, Telegram `initData` отсутствует, поэтому API-запросы будут отклонены.
- `RCON connection closed` обычно означает неверный `RCON_HOST`, неверный порт или закрытый RCON-доступ.

## Быстрая диагностика RCON

Проверить RCON тем же клиентом, который использует backend:

```bash
source backend/.venv/bin/activate
export $(grep -v '^#' .env.panel | xargs)
PYTHONPATH=backend python -m app.rcon_check
```

Проверить, открыт ли порт с Mac:

```bash
nc -vz YOUR_MINECRAFT_HOST 25575
```

Если порт закрыт, для локального теста можно временно открыть его на сервере:

```bash
sudo ufw allow from <YOUR_MAC_PUBLIC_IP> to any port 25575 proto tcp
```

Не открывай RCON на весь интернет без ограничения по IP.
