# 🌿 FloraFill — Часть 3: Telegram Bot, Frontend, CI/CD, Тесты, Deploy

> Продолжение архитектуры. Описание на уровне спецификации без дублирования кода.

---

## 10. Telegram Bot

### 10.1 Архитектура

- Один бот `@FloraFillBot` — python-telegram-bot v21+
- Бот запускается в `lifespan` FastAPI (polling mode)
- Отдельно: notifications отправляются через `Bot(token)` напрямую из background tasks

### 10.2 Привязка Telegram к аккаунту

Флоу:
1. Пользователь в ЛК нажимает «Привязать Telegram» → `GET /api/auth/telegram-link-code` → получает 8-символьный код (живёт 10 минут)
2. Пользователь отправляет код боту: `/start ABC12345`
3. Бот ищет в БД `User` с `telegram_link_code == code` и `telegram_link_code_expires > now()`
4. Если найден — записывает `telegram_chat_id`, очищает code
5. Если не найден — отвечает «Неверный или устаревший код»

### 10.3 Команды бота

| Команда | Описание | Кто использует |
|---------|----------|---------------|
| `/start <code>` | Привязка аккаунта по коду из ЛК | Все |
| `/stop` | Отвязать Telegram (обнулить `telegram_chat_id`) | Все |
| `/orders` | Последние 5 заказов (для флориста — свои, для фермы — входящие) | Все |
| `/status <order_id>` | Статус конкретного заказа | Все |
| `/help` | Список команд | Все |

### 10.4 Уведомления (отправляются из `notification_service.py`)

| Событие | Получатель | Содержание |
|---------|-----------|-----------|
| Новый заказ | Ферма | ID заказа, имя/телефон/адрес флориста, состав, сумма |
| Статус заказа изменён | Флорист | ID заказа, старый → новый статус, комментарий фермы |
| Новая заявка на доступ | Ферма | Имя магазина, контакт, телефон, сообщение |
| Заявка одобрена/отклонена | Флорист | Название фермы, результат, причина отклонения |
| Новые цветы (по кнопке фермы) | Все подписанные флористы | Название фермы, список новых партий с ценами |
| Новая ферма ожидает одобрения | Админ платформы | Название, контакт, телефон, email |
| Ферма одобрена | Ферма | Подтверждение одобрения |

### 10.5 Важные моменты реализации

- Все notification-функции создают **свою сессию БД** (`SessionLocal()`) — они вызываются в background tasks после закрытия HTTP-сессии
- Все отправки обёрнуты в try/except — ошибка Telegram не должна ломать бизнес-логику
- Rate limiting: `asyncio.sleep(0.05)` между сообщениями при массовой рассылке (Telegram лимит: 30 msg/sec)

---

## 11. Frontend: Next.js

### 11.1 Стек

| Технология | Назначение |
|-----------|-----------|
| Next.js 15 (App Router) | Фреймворк, SSR для публичных страниц |
| TypeScript | Типизация |
| Tailwind CSS 4 | Стилизация |
| shadcn/ui | UI-компоненты (Button, Input, Table, Dialog, Select, Badge, Card) |
| Zustand или React Context | State management (auth, cart) |
| next-pwa | PWA (будущее) |

### 11.2 Маршрутизация (App Router layout groups)

```
src/app/
├── layout.tsx              # Корень: провайдеры, cookie banner, font
├── page.tsx                # Лендинг (публичный, SSR)
├── privacy-policy/page.tsx # 152-ФЗ
├── terms/page.tsx          # Пользовательское соглашение
│
├── (auth)/                 # Группа без layout — страницы на всю ширину
│   ├── login/page.tsx
│   └── register/page.tsx   # Выбор роли: флорист / ферма
│
├── (florist)/              # Группа с sidebar layout для флориста
│   ├── layout.tsx          # Sidebar: Каталог, Корзина, Заказы, Фермы, Профиль
│   ├── catalog/page.tsx
│   ├── cart/page.tsx
│   ├── orders/page.tsx
│   ├── orders/[id]/page.tsx
│   ├── farms/page.tsx
│   └── profile/page.tsx
│
├── (farm)/                 # Группа с sidebar layout для фермы
│   ├── layout.tsx          # Sidebar: Дашборд, Цветы, Заказы, Клиенты, Профиль
│   ├── dashboard/page.tsx
│   ├── flowers/page.tsx
│   ├── orders/page.tsx
│   ├── orders/[id]/page.tsx
│   ├── clients/page.tsx
│   └── profile/page.tsx
│
└── (admin)/                # Группа для админа
    ├── layout.tsx
    ├── dashboard/page.tsx
    ├── farms/page.tsx
    └── users/page.tsx
```

### 11.3 Auth Flow на фронте

1. **Login** → `POST /api/auth/login` → получить `access_token` + `refresh_token` + `role`
2. Хранить `access_token` в памяти (не в localStorage — XSS protection)
3. `refresh_token` в HttpOnly cookie (устанавливается backend-ом)
4. API-клиент (`lib/api.ts`): interceptor, который при 401 делает `POST /api/auth/refresh` и повторяет запрос
5. Redirect по роли: `florist` → `/catalog`, `farm` → `/dashboard`, `platform_admin` → `/admin/dashboard`
6. Middleware в Next.js: проверка наличия refresh cookie → redirect на `/login` если нет

### 11.4 Корзина

- Хранится в `localStorage` (как в текущем проекте — проверенный подход)
- Группировка по фермам: при оформлении — один заказ к одной ферме
- Если в корзине товары от разных ферм → показывать несколько кнопок «Оформить заказ (Ферма X)»
- Перед отправкой: повторная проверка наличия через API

### 11.5 Каталог

Основная страница флориста:
- **Фильтры** (sidebar или top bar): регион (dropdown), ферма (dropdown), цена (range slider), дата срезки (date range), поиск по названию
- **Карточки**: фото, название, цена за шт., количество, дата срезки, название фермы, кнопка «В корзину»
- **Пагинация**: числовая (1, 2, 3... N)
- **Сортировка**: по дате срезки (новые сверху), по цене, по названию

### 11.6 Ключевые компоненты

| Компонент | Описание |
|-----------|----------|
| `CookieBanner` | Баннер согласия на cookies (152-ФЗ). Показывается один раз, состояние в cookie `cookie_consent` |
| `OrderStatusBadge` | Цветной badge со статусом заказа. new=серый, confirmed=синий, ready=жёлтый, delivering=оранжевый, delivered=зелёный, completed=зелёный-яркий, rejected=красный, cancelled=серый |
| `FlowerCard` | Карточка партии: изображение, название, цена, кол-во, дата срезки, ферма |
| `CatalogFilters` | Панель фильтров каталога |
| `OrderTimeline` | Визуальный таймлайн статусов заказа |

### 11.7 Взаимодействие Backend ↔ Frontend

Frontend (Next.js, порт 3000) и Backend (FastAPI, порт 8000) — **раздельные процессы**.

**В dev**: Next.js proxy в `next.config.ts`:
```ts
async rewrites() {
  return [{ source: '/api/:path*', destination: 'http://localhost:8000/api/:path*' }]
}
```

**В production**: Nginx проксирует:
- `/api/*` → `localhost:8000` (FastAPI)
- `/uploads/*` → `localhost:8000` (статика FastAPI) или напрямую с диска
- Всё остальное → `localhost:3000` (Next.js)

---

## 12. CI/CD Pipeline

### 12.1 CI (`ci.yml`) — на каждый PR и push в main

```yaml
jobs:
  lint:
    # ruff check backend/
    # ruff format --check backend/

  test-backend:
    # pip install -r requirements.txt -r requirements-dev.txt
    # cd backend && pytest --tb=short -q
    # env: SECRET_KEY=test, DATABASE_URL=sqlite:///./test.db

  build-frontend:
    # cd frontend && npm ci && npm run lint && npm run build
```

Все три job должны пройти для merge в main.

### 12.2 Deploy (`deploy.yml`) — на push в main (после CI)

```
1. SSH на сервер
2. Сохранить текущий commit для rollback: PREV=$(git rev-parse HEAD)
3. git fetch + reset --hard origin/main
4. Backend: pip install, alembic upgrade head
5. Frontend: npm ci, npm run build
6. Restart: systemctl restart florafill-api florafill-bot
7. Health check: curl http://localhost:8000/api/health
8. Если health check fail:
   - git reset --hard $PREV
   - alembic downgrade -1
   - restart services
   - exit 1
```

### 12.3 Branch Protection

На GitHub:
- Защитить ветку `main` — merge только через PR
- Require CI to pass перед merge
- Require 1 approval (когда команда > 1)

---

## 13. Deployment

### 13.1 Серверные сервисы (systemd)

| Сервис | Команда запуска | Описание |
|--------|----------------|----------|
| `florafill-api` | `gunicorn -w 4 -k uvicorn.workers.UvicornWorker backend.app.main:app` | API backend |
| `florafill-bot` | `python -m backend.app.telegram.bot` (или встроен в lifespan) | Telegram bot |
| `florafill-web` | `cd frontend && npm start` (или `next start`) | Next.js frontend |

**Примечание**: Telegram-бот можно запускать внутри lifespan FastAPI (как сейчас), тогда отдельный сервис не нужен. Но для независимого перезапуска лучше отдельно.

### 13.2 Nginx конфигурация

```nginx
server {
    listen 80;
    server_name florafill.ru www.florafill.ru;
    client_max_body_size 10M;

    # API + uploads → FastAPI
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        alias /home/USER/florafill/uploads/;
    }

    # Everything else → Next.js
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}
```

Далее: `certbot --nginx -d florafill.ru -d www.florafill.ru` для HTTPS.

### 13.3 Seed Data

После первого деплоя:
```bash
cd backend
python scripts/seed_regions.py   # 85 регионов РФ
python scripts/create_admin.py admin@florafill.ru password123
```

`create_admin.py` — создаёт `User` с `role="platform_admin"` + `privacy_accepted=True`.

---

## 14. 152-ФЗ Compliance (Персональные данные)

### 14.1 Обязательные элементы

| Элемент | Где | Описание |
|---------|-----|----------|
| **Согласие на обработку ПД** | Форма регистрации | Чекбокс + ссылка на политику. `privacy_accepted=true` обязателен |
| **Политика конфиденциальности** | `/privacy-policy` | Какие данные собираем, зачем, как долго храним, кому передаём |
| **Пользовательское соглашение** | `/terms` | Условия использования платформы |
| **Cookie-баннер** | Все страницы | Информирование о tech cookies (refresh_token). Баннер внизу |
| **Право на удаление** | `DELETE /api/auth/account` | Soft delete: обезличивание email, удаление профиля, сохранение обезличенных заказов |
| **Право на выгрузку** | `GET /api/auth/my-data` | JSON со всеми ПД пользователя |
| **Хранение в РФ** | Yandex Cloud | Сервер физически в России ✅ |
| **Уведомление РКН** | pd.rkn.gov.ru | Подать уведомление как оператор ПД |

### 14.2 Собираемые ПД

- Email (логин)
- ФИО контактного лица
- Телефон
- Адрес доставки / адрес фермы
- Telegram Chat ID
- Название организации

### 14.3 Cookie

Используется **только один cookie**: `refresh_token` (HttpOnly, essential, для авторизации). Аналитических cookies нет. Баннер информационный, без кнопки «отклонить» (cookie essential — GDPR позволяет без согласия, но 152-ФЗ требует информировать).

---

## 15. Тестирование

### 15.1 Стратегия

| Тип | Что тестируем | Инструмент |
|-----|--------------|-----------|
| **API Integration** | Каждый endpoint: happy path + edge cases + auth | pytest + httpx AsyncClient |
| **Unit** | Services (order_service, access_service) | pytest |
| **Auth** | Регистрация, логин, refresh, ролевой доступ | pytest |
| **Business Rules** | min_order, access check, status transitions, stock deduction | pytest |

### 15.2 Fixtures (`backend/tests/conftest.py`)

```python
# Ключевые фикстуры:
# - test_db: in-memory SQLite, create_all + seed regions + free plan
# - client: httpx.AsyncClient(app=app) с test_db override
# - florist_token: зарегистрированный флорист + access token
# - farm_token: зарегистрированная + одобренная ферма + access token
# - admin_token: platform_admin + access token
# - approved_access: florist -> farm access request approved
# - flower_batch: created by farm
```

### 15.3 Минимальные тест-кейсы для пилота

**Auth (8 тестов):**
- Register florist (201)
- Register farm (201, is_approved=false)
- Register duplicate email (409)
- Register without privacy (400)
- Login success (200, role in response)
- Login wrong password (401)
- Refresh token (200, new tokens)
- Access by wrong role (403)

**Access Requests (6 тестов):**
- Florist creates request (201)
- Duplicate request (400)
- Farm approves (200, status=approved)
- Farm rejects (200, status=rejected)
- Re-apply after rejection (201)
- Catalog visibility: only approved farms

**Flowers (5 тестов):**
- Farm creates batch (201)
- Farm updates batch (200)
- Farm deletes batch (200)
- Other farm cannot edit (404 — filtered by farm_id)
- Florist cannot create (403)

**Orders (8 тестов):**
- Create order — success (201, stock deducted)
- Create order — no access (403)
- Create order — insufficient stock (400)
- Create order — below min_order (400)
- Farm confirms order (200)
- Farm rejects order → stock returned (200)
- Florist cancels order (200)
- Invalid status transition (400)

**Admin (3 теста):**
- Approve farm (200)
- Dashboard stats (200)
- Non-admin cannot access (403)

---

## 16. Порядок реализации (Фазы)

### Phase 1: Скелет проекта
- [ ] Создать структуру `backend/` и `frontend/`
- [ ] `config.py`, `database.py`, `.env.example`
- [ ] Инициализировать Alembic
- [ ] Инициализировать Next.js + Tailwind + shadcn/ui
- [ ] `pyproject.toml` (ruff), `requirements.txt`, `requirements-dev.txt`
- [ ] `.gitignore` обновить

### Phase 2: Backend Core
- [ ] Все SQLAlchemy модели (`models/`)
- [ ] Первая Alembic миграция
- [ ] `seed_regions.py` + `create_admin.py`
- [ ] Auth service: register, login, refresh, logout
- [ ] Dependencies: `get_current_user`, `require_florist`, `require_farm`, `require_admin`
- [ ] Auth router: `/api/auth/*`
- [ ] Storage service
- [ ] Florist router: profile, catalog (с фильтрами), farms, access requests, orders
- [ ] Farm router: profile, flowers CRUD, access requests, orders + status
- [ ] Admin router: dashboard, farms approve/reject, users
- [ ] Regions router
- [ ] Health router
- [ ] Order service (полная валидация, stock deduction, return)
- [ ] Access service
- [ ] Exceptions (`exceptions.py`)
- [ ] Payment service stub
- [ ] Subscription model stub + free plan seed

### Phase 3: Frontend Core
- [ ] Layout + Auth context/provider
- [ ] Login / Register pages (с выбором роли)
- [ ] API client (`lib/api.ts`) с refresh interceptor
- [ ] Florist: каталог с фильтрами, корзина, заказы, фермы, профиль
- [ ] Farm: дашборд, цветы CRUD, заказы + статусы, клиенты, профиль
- [ ] Admin: дашборд, одобрение ферм, пользователи
- [ ] Cookie-баннер
- [ ] Responsive design (мобильная версия)

### Phase 4: Telegram Bot
- [ ] Рефакторинг бота: привязка через код
- [ ] Команды: /start, /stop, /orders, /status, /help
- [ ] Notification service: все 7 типов уведомлений
- [ ] Запуск бота в lifespan или отдельным сервисом

### Phase 5: CI/CD + Тесты
- [ ] `ci.yml` — lint + tests + frontend build
- [ ] `deploy.yml` — deploy с health check + rollback
- [ ] `conftest.py` — test fixtures
- [ ] 30+ тестов (auth, access, flowers, orders, admin)
- [ ] Branch protection на main

### Phase 6: Compliance + Polish
- [ ] Страница политики конфиденциальности
- [ ] Страница пользовательского соглашения
- [ ] `DELETE /api/auth/account` + `GET /api/auth/my-data`
- [ ] Лендинг (публичная главная)
- [ ] SEO: meta-теги, Open Graph
- [ ] Подготовка уведомления для РКН

---

## Резюме архитектуры

```
3 роли (florist, farm, platform_admin)
9 таблиц в БД + 2 заглушки (plan, subscription)
~35 API endpoints
6 типов Telegram-уведомлений + 5 команд бота
Next.js frontend с ролевыми layout groups
CI: lint + 30+ тестов + build
CD: deploy с health check + auto-rollback
152-ФЗ: согласие, политика, cookie-баннер, право на удаление/выгрузку
```

Все три файла архитектуры:
1. `florafill-architecture.md` — модель данных, схемы, конфигурация, auth
2. `florafill-part2-implementation.md` — полные роутеры и сервисы
3. `florafill-part3-remaining.md` — Telegram, фронтенд, CI/CD, тесты, deploy, 152-ФЗ
