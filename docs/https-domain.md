# Домен и HTTPS для Telegram Mini App

## 1. DNS

Создай DNS-запись у регистратора или в DNS-панели:

```text
Type: A
Name: panel
Value: <PUBLIC_SERVER_IP>
TTL: Auto или 300
```

Если нужен корневой домен, вместо `panel` укажи `@`.

Итоговый адрес будет, например:

```text
https://panel.example.com
```

## 2. Порты

На сервере должны быть открыты входящие TCP-порты:

```text
80
443
```

Если используешь firewall:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

Для HTTP/3 можно открыть UDP 443, но это необязательно:

```bash
sudo ufw allow 443/udp
```

## 3. Переменные панели

Скопируй пример:

```bash
cp .env.panel.example .env.panel
```

Заполни:

```env
PANEL_DOMAIN=panel.example.com
WEB_APP_URL=https://panel.example.com
DATABASE_URL=postgresql://user:password@host:5432/dbname
BOT_TOKEN=123456789:replace_me
RCON_PASSWORD=your_current_rcon_password
```

`PANEL_DOMAIN` нужен Caddy для выпуска сертификата. `WEB_APP_URL` нужен боту, чтобы открыть Mini App.

## 4. Запуск

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.panel.yml \
  -f docker-compose.https.yml \
  up -d --build panel-api panel-bot panel-web panel-caddy
```

Проверить логи:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.panel.yml \
  -f docker-compose.https.yml \
  logs -f panel-caddy panel-api panel-bot panel-web
```

## 5. Проверка

Открой:

```text
https://panel.example.com
```

API healthcheck:

```text
https://panel.example.com/api/healthz
```

Если сертификат не выпустился, обычно причина одна из этих:

- DNS еще не указывает на сервер.
- Порты 80/443 закрыты firewall или провайдером.
- На сервере уже занят порт 80 или 443 другим nginx/apache/proxy.
- В `.env.panel` отличается `PANEL_DOMAIN` и реальный домен.
