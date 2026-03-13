/**
 * API модуль для работы с сервером с поддержкой refresh токенов
 */

const API_URL = '';

// Storage keys
const AUTH_TOKEN_KEY = 'authToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const TOKEN_EXPIRES_KEY = 'tokenExpiresAt';

// Flag to prevent multiple simultaneous refresh attempts
let isRefreshing = false;
let refreshPromise = null;

/**
 * Получить токен авторизации из localStorage
 * @returns {string|null}
 */
export function getAuthToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY);
}

/**
 * Установить токен авторизации
 * @param {string} token
 * @param {number} expiresIn - Время жизни токена в секундах
 */
export function setAuthToken(token, expiresIn = null) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    if (expiresIn) {
        const expiresAt = Date.now() + (expiresIn * 1000);
        localStorage.setItem(TOKEN_EXPIRES_KEY, expiresAt.toString());
    }
}

/**
 * Удалить токен авторизации
 */
export function removeAuthToken() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRES_KEY);
}

/**
 * Получить refresh токен
 * @returns {string|null}
 */
export function getRefreshToken() {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/**
 * Установить refresh токен
 * @param {string} token
 */
export function setRefreshToken(token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

/**
 * Удалить refresh токен
 */
export function removeRefreshToken() {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/**
 * Удалить все токены (полный logout)
 */
export function clearAllTokens() {
    removeAuthToken();
    removeRefreshToken();
}

/**
 * Проверить, истёк ли access токен (или скоро истечёт)
 * @param {number} bufferSeconds - Буфер в секундах до истечения
 * @returns {boolean}
 */
export function isTokenExpired(bufferSeconds = 60) {
    const expiresAt = localStorage.getItem(TOKEN_EXPIRES_KEY);
    if (!expiresAt) return true;
    
    const expiresAtMs = parseInt(expiresAt, 10);
    const bufferMs = bufferSeconds * 1000;
    
    return Date.now() >= (expiresAtMs - bufferMs);
}

/**
 * Обновить access токен используя refresh токен
 * @returns {Promise<boolean>} true если обновление успешно
 */
export async function refreshAccessToken() {
    // Prevent multiple simultaneous refresh attempts
    if (isRefreshing) {
        return refreshPromise;
    }
    
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
        return false;
    }
    
    isRefreshing = true;
    refreshPromise = (async () => {
        try {
            const response = await fetch(API_URL + '/token/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: refreshToken }),
                credentials: 'include'  // Include cookies
            });
            
            if (!response.ok) {
                // Refresh token is invalid or expired
                clearAllTokens();
                return false;
            }
            
            const data = await response.json();
            setAuthToken(data.access_token, data.expires_in);
            setRefreshToken(data.refresh_token);
            return true;
        } catch (error) {
            console.error('Token refresh failed:', error);
            clearAllTokens();
            return false;
        } finally {
            isRefreshing = false;
            refreshPromise = null;
        }
    })();
    
    return refreshPromise;
}

/**
 * Универсальная функция для API запросов с автоматическим обновлением токена
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Опции fetch
 * @param {Function} onUnauthorized - Callback при 401 ошибке
 * @returns {Promise<any>}
 */
export async function apiFetch(endpoint, options = {}, onUnauthorized = null) {
    // Check if token is about to expire and refresh proactively
    if (getAuthToken() && isTokenExpired(60) && getRefreshToken()) {
        const refreshed = await refreshAccessToken();
        if (!refreshed && onUnauthorized) {
            onUnauthorized();
            throw new Error('Сессия истекла. Пожалуйста, войдите снова.');
        }
    }
    
    const authToken = getAuthToken();
    const headers = { ...options.headers };
    
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }
    if (!(options.body instanceof FormData) && options.body) {
        headers['Content-Type'] = 'application/json';
    }

    let response = await fetch(API_URL + endpoint, { 
        ...options, 
        headers,
        credentials: 'include'  // Include cookies for refresh token
    });

    // If 401, try to refresh token and retry the request
    if (response.status === 401 && getRefreshToken()) {
        const refreshed = await refreshAccessToken();
        
        if (refreshed) {
            // Retry the original request with new token
            const newHeaders = { ...options.headers };
            const newAuthToken = getAuthToken();
            
            if (newAuthToken) {
                newHeaders['Authorization'] = `Bearer ${newAuthToken}`;
            }
            if (!(options.body instanceof FormData) && options.body) {
                newHeaders['Content-Type'] = 'application/json';
            }
            
            response = await fetch(API_URL + endpoint, { 
                ...options, 
                headers: newHeaders,
                credentials: 'include'
            });
        }
    }

    // Still 401 after refresh attempt
    if (response.status === 401) {
        clearAllTokens();
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
        credentials: 'include'  // Include cookies
    });
    
    if (!response.ok) {
        throw new Error('Неверный логин или пароль.');
    }
    
    const data = await response.json();
    setAuthToken(data.access_token, data.expires_in);
    setRefreshToken(data.refresh_token);
    return data;
}

/**
 * Выход из системы
 * @returns {Promise<void>}
 */
export async function logout() {
    const refreshToken = getRefreshToken();
    
    try {
        // Call backend to revoke token
        await fetch(API_URL + '/token/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
            credentials: 'include'
        });
    } catch (error) {
        console.error('Logout request failed:', error);
    } finally {
        // Always clear local tokens
        clearAllTokens();
    }
}

/**
 * Выход со всех устройств
 * @returns {Promise<Object>}
 */
export async function logoutAllDevices() {
    const authToken = getAuthToken();
    
    const response = await fetch(API_URL + '/token/logout-all', {
        method: 'POST',
        headers: { 
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        },
        credentials: 'include'
    });
    
    if (!response.ok) {
        throw new Error('Не удалось выйти со всех устройств');
    }
    
    const data = await response.json();
    clearAllTokens();
    return data;
}

/**
 * Получить список активных сессий
 * @returns {Promise<Object>}
 */
export async function getActiveSessions() {
    return apiFetch('/token/sessions');
}
