/**
 * Модуль навигации и управления состоянием авторизации
 */

import { getElement, getCart, clearCart } from './utils.js';
import { getAuthToken, logout as apiLogout } from './api.js';

// Callback для переинициализации страницы после logout
let pageInitCallback = null;

/**
 * Установить callback для переинициализации страницы
 * @param {Function} callback - Функция инициализации страницы
 */
export function setPageInitCallback(callback) {
    pageInitCallback = callback;
}

/**
 * Обновить навигационное меню
 */
export function updateNav() {
    const mainNav = getElement('main-nav');
    if (!mainNav) return;

    const authToken = getAuthToken();
    const cart = getCart();
    const count = Object.keys(cart).length;

    let navHtml = '<a href="/">Каталог</a>';
    if (authToken) {
        navHtml += `<a href="/static/account.html">Личный кабинет</a>`;
        navHtml += `<a href="/static/cart.html">Корзина (${count})</a>`;
        navHtml += '<a href="#" id="logout-btn">Выйти</a>';
    } else {
        navHtml += '<a href="/static/login.html">Вход для клиентов</a>';
    }
    mainNav.innerHTML = navHtml;

    const logoutBtn = getElement('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async e => {
            e.preventDefault();
            await logout();
        });
    }
}

/**
 * Выход из системы
 * Очищает токены, корзину и переинициализирует страницу
 */
export async function logout() {
    await apiLogout();  // Revokes refresh token on server
    clearCart();  // Clear the cart on logout
    
    if (window.location.pathname.includes('cart.html') ||
        window.location.pathname.includes('account.html')) {
        // Redirect to login for protected pages
        window.location.href = '/static/login.html';
    } else if (pageInitCallback) {
        // Re-initialize the current page (e.g., catalog)
        pageInitCallback();
    } else {
        updateNav();
    }
}
