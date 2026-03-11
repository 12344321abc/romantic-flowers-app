/**
 * Модуль авторизации
 */

import { getElement } from './utils.js';
import { login } from './api.js';

/**
 * Обработчик формы входа
 * @param {Event} e - Событие submit
 */
export async function handleLogin(e) {
    e.preventDefault();
    const loginError = getElement('login-error');
    const username = getElement('username')?.value;
    const password = getElement('password')?.value;

    if (!username || !password) {
        if (loginError) loginError.textContent = 'Введите логин и пароль';
        return;
    }

    try {
        await login(username, password);
        window.location.href = '/';
    } catch (error) {
        if (loginError) loginError.textContent = error.message;
    }
}
