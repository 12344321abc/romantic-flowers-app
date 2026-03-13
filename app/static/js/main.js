/**
 * Главный модуль приложения
 * Инициализирует все страницы и обработчики событий
 */

import { getElement, showToast } from './utils.js';
import { updateNav, setPageInitCallback } from './navigation.js';
import { initCatalogPage, handleAddToCart } from './catalog.js';
import { initCartPage, handlePlaceOrder, updateCartQuantity, removeFromCart } from './cart.js';
import { initAccountPage } from './account.js';
import { handleLogin, initLoginValidation } from './auth.js';

/**
 * Инициализация страницы в зависимости от контекста
 */
function initPage() {
    updateNav();
    
    // Определяем какую страницу нужно инициализировать
    if (getElement('flower-catalog')) {
        initCatalogPage();
    }
    
    if (getElement('login-form')) {
        initLoginValidation();
        getElement('login-form').addEventListener('submit', handleLogin);
    }
    
    if (getElement('cart-items-container')) {
        initCartPage();
    }
    
    if (getElement('order-form')) {
        getElement('order-form').addEventListener('submit', handlePlaceOrder);
    }
    
    if (getElement('order-history-container')) {
        initAccountPage();
    }
}

// Регистрируем callback для переинициализации страницы при logout
setPageInitCallback(initPage);

/**
 * Глобальные обработчики событий клика
 */
document.body.addEventListener('click', e => {
    // Добавление в корзину
    if (e.target.matches('.add-to-cart-btn')) {
        const flowerItem = e.target.closest('.flower-item');
        if (flowerItem) {
            handleAddToCart(flowerItem);
        }
    }
    
    // Удаление из корзины
    if (e.target.matches('.remove-from-cart-btn')) {
        const { id } = e.target.dataset;
        removeFromCart(id);
    }
    
    // Изменение количества (+ / -)
    if (e.target.matches('.change-qty-btn')) {
        const parent = e.target.parentElement;
        const quantityInput = parent.querySelector('.quantity-input');
        const quantityDisplay = parent.querySelector('.quantity-display');
        
        // Определяем, работаем с input или span
        const isInputMode = !!quantityInput;
        const currentValue = isInputMode
            ? parseInt(quantityInput.value)
            : parseInt(quantityDisplay.textContent);
        const change = parseInt(e.target.dataset.change);
        const newValue = currentValue + change;
        
        const min = isInputMode ? (parseInt(quantityInput.min) || 1) : 1;
        const max = isInputMode
            ? parseInt(quantityInput.max)
            : parseInt(parent.dataset.displayMax);
        
        if (newValue < min) {
            // Достигнут минимум
            return;
        }
        
        if (max && newValue > max) {
            // Достигнут максимум - показываем уведомление
            showToast(`Доступно только ${max} шт.`);
            return;
        }
        
        if (isInputMode) {
            quantityInput.value = newValue;
        } else {
            quantityDisplay.textContent = newValue;
        }
        
        // Если это корзина, обновляем количество
        if (e.target.closest('.cart-item-controls')) {
            const selector = e.target.closest('.quantity-selector');
            const itemId = selector?.dataset.id || e.target.dataset.id;
            if (itemId) {
                updateCartQuantity(itemId, newValue);
            }
        }
    }
});

/**
 * Обработчик ввода в поля количества
 */
document.body.addEventListener('input', e => {
    if (e.target.matches('.quantity-input')) {
        // Разрешаем только цифры
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
        
        // Если это корзина, обновляем количество
        if (e.target.closest('.cart-item-controls')) {
            const { id } = e.target.dataset;
            const newQuantity = parseInt(e.target.value, 10);
            if (!isNaN(newQuantity) && id) {
                updateCartQuantity(id, newQuantity);
            }
        }
    }
});

/**
 * Финальная валидация при потере фокуса
 */
document.body.addEventListener('change', e => {
    if (e.target.matches('.quantity-input')) {
        const min = parseInt(e.target.min, 10) || 1;
        const max = parseInt(e.target.max, 10);
        let value = parseInt(e.target.value, 10);

        if (isNaN(value) || value < min) {
            e.target.value = min;
        } else if (!isNaN(max) && value > max) {
            e.target.value = max;
        }
        
        // Финальное обновление для корзины
        if (e.target.closest('.cart-item-controls')) {
            const { id } = e.target.dataset;
            const newQuantity = parseInt(e.target.value, 10);
            if (id) {
                updateCartQuantity(id, newQuantity);
            }
        }
    }
});

// Запуск приложения при загрузке DOM
document.addEventListener('DOMContentLoaded', initPage);
