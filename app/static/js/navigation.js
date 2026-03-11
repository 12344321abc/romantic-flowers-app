/**
 * Модуль навигации и управления состоянием авторизации
 */

import { getElement, getCart } from './utils.js';
import { getAuthToken, removeAuthToken } from './api.js';

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
        logoutBtn.addEventListener('click', e => {
            e.preventDefault();
            logout();
        });
    }
}

/**
 * Выход из системы
 * @param {Function} [initPageCallback] - Callback для переинициализации страницы
 */
export function logout(initPageCallback = null) {
    removeAuthToken();
    if (window.location.pathname.includes('cart.html')) {
        window.location.href = '/static/login.html';
    } else if (initPageCallback) {
        initPageCallback();
    } else {
        updateNav();
    }
}
