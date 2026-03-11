/**
 * API модуль для работы с сервером
 */

const API_URL = '';

/**
 * Получить токен авторизации из localStorage
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
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Опции fetch
 * @param {Function} onUnauthorized - Callback при 401 ошибке
 * @returns {Promise<any>}
 */
export async function apiFetch(endpoint, options = {}, onUnauthorized = null) {
    const authToken = getAuthToken();
    const headers = { ...options.headers };
    
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }
    if (!(options.body instanceof FormData) && options.body) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(API_URL + endpoint, { ...options, headers });

    if (response.status === 401) {
        if (onUnauthorized) {
            onUnauthorized();
        }
        throw new Error('Сессия истекла или недействительна. Пожалуйста, войдите снова.');
    }
    if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: `Ошибка сервера: ${response.status}` }));
        throw new Error(err.detail);
    }
    return response.status === 204 ? null : response.json();
}

/**
 * Авторизация пользователя
 * @param {string} username
 * @param {string} password
 * @returns {Promise<Object>} Данные токена
 */
export async function login(username, password) {
    const formData = new URLSearchParams({ username, password });
    
    const response = await fetch(API_URL + '/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
    });
    
    if (!response.ok) {
        throw new Error('Неверный логин или пароль.');
    }
    
    const data = await response.json();
    setAuthToken(data.access_token);
    return data;
}
