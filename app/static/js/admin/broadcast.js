/**
 * Модуль рассылки уведомлений в админ-панели
 */

import { apiFetch } from './api.js';

/**
 * Отправить рассылку о новых цветах
 * @param {Function} [onUnauthorized] - Callback при ошибке авторизации
 */
export async function sendBroadcast(onUnauthorized) {
    const btn = document.getElementById('broadcast-btn');
    const statusEl = document.getElementById('broadcast-status');
    
    if (!btn || !statusEl) return;
    
    btn.disabled = true;
    statusEl.textContent = 'Отправка...';
    
    try {
        const response = await apiFetch('/api/notify_new_flowers', { method: 'POST' }, onUnauthorized);
        statusEl.textContent = response.message;
    } catch (error) {
        statusEl.textContent = `Ошибка: ${error.message}`;
    } finally {
        btn.disabled = false;
    }
}
