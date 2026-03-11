/**
 * API модуль для админ-панели
 */

const API_URL = '';

/**
 * Получить токен авторизации
 * @returns {string|null}
 */
export function getAuthToken() {
    return localStorage.getItem('authToken');
}

/**
 * Установить токен авторизации
 * @param {string} token
 */
export function setAuthToken(token) {
    localStorage.setItem('authToken', token);
}

/**
 * Удалить токен авторизации
 */
export function removeAuthToken() {
    localStorage.removeItem('authToken');
}

/**
 * Универсальная функция для API запросов
 * @param {string} url - API endpoint
 * @param {Object} options - Опции fetch
 * @param {Function} [onUnauthorized] - Callback при 401 ошибке
 * @returns {Promise<any>}
 */
export async function apiFetch(url, options = {}, onUnauthorized = null) {
    const authToken = getAuthToken();
    const headers = { ...options.headers };
    
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    const response = await fetch(API_URL + url, { ...options, headers });
    
    if (response.status === 401) {
        if (onUnauthorized) {
            onUnauthorized();
        }
        throw new Error('Unauthorized');
    }
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail);
    }
    return response.status === 204 ? null : response.json();
}

/**
 * Авторизация администратора
 * @param {string} username
 * @param {string} password
 * @returns {Promise<Object>}
 */
export async function login(username, password) {
    const formData = new URLSearchParams({ username, password });
    
    const response = await fetch(`${API_URL}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
    });
    
    if (!response.ok) {
        throw new Error('Неверный логин или пароль');
    }
    
    const data = await response.json();
    setAuthToken(data.access_token);
    return data;
}
