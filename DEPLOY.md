# Инструкция по развертыванию "Romantic Flower Farm"

Это руководство описывает процесс развертывания веб-приложения на удаленном сервере Ubuntu/Debian.

## 1. Подключение к серверу

Сначала подключитесь к вашему серверу по SSH.

```bash
ssh ВАШ_ПОЛЬЗОВАТЕЛЬ@ВАШ_IP_АДРЕС
```

## 2. Установка системных зависимостей

Нам понадобятся `git` (для клонирования репозитория), `python3-venv` (для создания виртуальных окружений) и `nginx` (в качестве веб-сервера и обратного прокси).

```bash
sudo apt update
sudo apt install git python3-pip python3-venv nginx -y
```

## 3. Клонирование и настройка проекта

1.  **Клонируйте проект** в свою домашнюю директорию, **заменив URL на адрес вашего репозитория**:
    ```bash
    git clone https://github.com/12344321abc/romantic-flowers-app.git romantic
    cd romantic
    ```

2.  **Создайте виртуальное окружение** и установите зависимости:
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    pip install gunicorn  # Устанавливаем Gunicorn для продакшена
    ```

3.  **Настройте переменные окружения:**
    - Создайте файл `.env`.
    - Сгенерируйте `SECRET_KEY`:
      ```bash
      openssl rand -hex 32
      ```
    - Добавьте `SECRET_KEY` и данные для Telegram в `.env`:
      ```
      SECRET_KEY=ВАШ_СГЕНЕРИРОВАННЫЙ_КЛЮЧ
      TOKEN=ВАШ_ТЕЛЕГРАМ_ТОКЕН
      CHAT_ID=ВАШ_ТЕЛЕГРАМ_ЧАТ_ID
      ```

4.  **Создайте администратора** на сервере:
    ```bash
    python create_admin.py ваш_логин ваш_пароль
    ```

## 4. Настройка прав доступа

Это ключевой шаг. Чтобы Nginx мог раздавать статические файлы, а Gunicorn корректно работать, нужно настроить права доступа к директориям.

1.  **Назначьте владельцем проекта** вашего пользователя (например, `vitus`) и группу Nginx (`www-data`):
    ```bash
    sudo chown -R ВАШ_ПОЛЬЗОВАТЕЛЬ:www-data /home/ВАШ_ПОЛЬЗОВАТЕЛЬ/romantic
    ```

2.  **Выдайте права на директорию проекта**, чтобы группа `www-data` могла читать и исполнять файлы:
    ```bash
    sudo chmod -R 775 /home/ВАШ_ПОЛЬЗОВАТЕЛЬ/romantic
    ```

3.  **Разрешите Nginx доступ к вашей домашней директории** (это безопасно, он сможет только входить в нее, но не видеть содержимое других папок):
    ```bash
    sudo chmod 755 /home/ВАШ_ПОЛЬЗОВАТЕЛЬ
    ```
    
## 5. Настройка Gunicorn

Gunicorn будет запускать наше FastAPI приложение.

1.  **Создайте сервис для Gunicorn**, чтобы он запускался автоматически. Создайте файл:
    ```bash
    sudo nano /etc/systemd/system/romantic.service
    ```

2.  **Вставьте в него следующую конфигурацию**, **заменив `ВАШ_ПОЛЬЗОВАТЕЛЬ` на ваше имя пользователя**. Этот формат является стандартным и готов к копированию:
    ```ini
[Unit]
Description=Gunicorn instance to serve romantic
After=network.target

[Service]
User=ВАШ_ПОЛЬЗОВАТЕЛЬ
Group=www-data
WorkingDirectory=/home/ВАШ_ПОЛЬЗОВАТЕЛЬ/romantic
Environment="PATH=/home/ВАШ_ПОЛЬЗОВАТЕЛЬ/romantic/venv/bin"
ExecStart=/home/ВАШ_ПОЛЬЗОВАТЕЛЬ/romantic/venv/bin/gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app

[Install]
WantedBy=multi-user.target
    ```

3.  **Запустите и включите сервис Gunicorn:**
    ```bash
    sudo systemctl start romantic
    sudo systemctl enable romantic
    ```

## 6. Настройка Nginx

Nginx будет служить обратным прокси (reverse proxy), принимая запросы из интернета и перенаправляя их на Gunicorn.

1.  **Создайте конфигурационный файл для вашего сайта:**
    ```bash
    sudo nano /etc/nginx/sites-available/romantic
    ```

2.  **Вставьте в него следующую конфигурацию:**
    ```nginx
    server {
        listen 80;
        server_name ВАШ_ДОМЕН.RU www.ВАШ_ДОМЕН.RU;
        client_max_body_size 10M; # <-- ВАЖНО: Разрешить загрузку файлов до 10МБ

        location / {
            proxy_pass http://127.0.0.1:8000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }

        location /static {
            alias /home/ВАШ_ПОЛЬЗОВАТЕЛЬ/romantic/app/static;
        }
    }
    ```

3.  **Включите сайт**, создав символическую ссылку, и проверьте конфигурацию Nginx:
    ```bash
    sudo ln -s /etc/nginx/sites-available/romantic /etc/nginx/sites-enabled
    sudo nginx -t
    ```

4.  Если проверка прошла успешно, **перезапустите Nginx**:
    ```bash
    sudo systemctl restart nginx
    ```

## 7. Завершение

После выполнения этих шагов ваш сайт должен быть доступен в браузере по адресу вашего сервера.

---

## 8. (Рекомендуется) Настройка HTTPS с помощью Let's Encrypt

После того как ваш сайт стал доступен по доменному имени, настоятельно рекомендуется защитить его с помощью SSL-сертификата (чтобы он работал по `https://`).

> **Важно:** Этот шаг можно выполнять только после того, как ваш домен начал указывать на IP-адрес сервера (после обновления DNS-записей, о котором говорилось выше).

1.  **Установите Certbot** — инструмент для автоматического получения и настройки SSL-сертификатов от Let's Encrypt.
    ```bash
    sudo apt install certbot python3-certbot-nginx -y
    ```

2.  **Получите сертификат и настройте Nginx автоматически.** Запустите Certbot и следуйте его инструкциям. Он найдет домены в вашей конфигурации Nginx и предложит получить для них сертификат.
    ```bash
    sudo certbot --nginx -d romantic-flowers-shop.ru -d www.romantic-flowers-shop.ru
    ```
    В процессе установки Certbot задаст вам несколько вопросов:
    *   Попросит указать email для уведомлений.
    *   Попросит согласиться с условиями использования.
    *   Спросит, хотите ли вы автоматически перенаправлять все HTTP-запросы на HTTPS. **Рекомендуется выбрать "Redirect"**, чтобы ваш сайт всегда использовал защищенное соединение.

3.  **Проверьте автоматическое обновление.** Certbot сам настроит системный таймер для автоматического обновления сертификата. Вы можете проверить, что все работает, с помощью команды:
    ```bash
    sudo certbot renew --dry-run
    ```

После выполнения этих шагов ваш сайт будет работать по защищенному протоколу `https://`, а в адресной строке браузера появится замок.

---
### **Запуск Telegram-бота как отдельного сервиса**

Чтобы бот работал независимо от веб-сервера, мы создадим для него отдельный сервис `systemd`.

1.  **Создайте новый файл сервиса:**
    ```bash
    sudo nano /etc/systemd/system/romantic-bot.service
    ```

2.  **Вставьте в него следующую конфигурацию**, **заменив `vitus` на ваше имя пользователя**:
    ```ini
    [Unit]
    Description=Telegram Bot for Romantic Flower Farm
    After=network.target

    [Service]
    User=vitus
    Group=www-data
    WorkingDirectory=/home/vitus/romantic
    Environment="PATH=/home/vitus/romantic/venv/bin"
    ExecStart=/home/vitus/romantic/venv/bin/python run_bot.py

    [Install]
    WantedBy=multi-user.target
    ```

3.  **Запустите и включите сервис бота:**
    ```bash
    sudo systemctl start romantic-bot
    sudo systemctl enable romantic-bot
    ```

Теперь у вас будут работать два независимых сервиса: `romantic` для сайта и `romantic-bot` для Telegram.