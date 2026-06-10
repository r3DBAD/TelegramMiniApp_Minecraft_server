# Быстрый тест Mini App через cloudflared

Этот способ нужен только для тестов. Он дает временный HTTPS URL вида:

```text
https://random-name.trycloudflare.com
```

## 1. Поднять панель без Caddy

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.panel.yml \
  up -d --build panel-api panel-web
```

Бота пока можно не запускать: сначала нужен HTTPS URL.

## 2. Запустить quick tunnel

На сервере:

```bash
cloudflared tunnel --url http://localhost:8080
```

В выводе найди URL:

```text
https://something.trycloudflare.com
```

Оставь эту команду работать в терминале.

## 3. Записать URL в `.env.panel`

```env
WEB_APP_URL=https://something.trycloudflare.com
CORS_ORIGINS=https://something.trycloudflare.com
VITE_API_BASE_URL=/api
```

`PANEL_DOMAIN` для quick tunnel не важен.

## 4. Перезапустить API и запустить бота

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.panel.yml \
  up -d --build panel-api panel-bot panel-web
```

## 5. Проверить

Открой:

```text
https://something.trycloudflare.com/api/healthz
```

В Telegram:

```text
/start
```

Бот должен показать кнопку Mini App с этим временным URL.

## Важно

- Quick tunnel URL меняется при каждом новом запуске `cloudflared`.
- После смены URL обнови `.env.panel` и перезапусти `panel-bot`.
- Для теста `docker-compose.https.yml` не нужен.
- Для теста не нужно открывать порты 80/443.
- Для продакшена лучше использовать свой домен, например `panel.example.com`, и Caddy.
