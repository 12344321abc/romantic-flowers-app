/**
 * Модуль авторизации
 */

import { getElement } from './utils.js';
import { login } from './api.js';
import { validateForm, setupLiveValidation, rules } from './validation.js';

// Правила валидации для формы логина
const loginValidationRules = {
    'username': [rules.required, rules.username],
    'password': [rules.required, rules.password]
};

/**
 * Инициализация валидации на странице логина
 */
export function initLoginValidation() {
    const form = getElement('login-form');
    if (form) {
        setupLiveValidation(form, loginValidationRules);
    }
}

/**
 * Обработчик формы входа
 * @param {Event} e - Событие submit
 */
export async function handleLogin(e) {
    e.preventDefault();
    const form = e.target;
    const loginError = getElement('login-error');
    
    // Валидируем форму
    if (!validateForm(form, loginValidationRules)) {
        return;
    }
    
    const username = getElement('username')?.value;
    const password = getElement('password')?.value;

    try {
        await login(username, password);
        window.location.href = '/';
    } catch (error) {
        if (loginError) loginError.textContent = error.message;
    }
}
