/**
 * Модуль каталога товаров
 */

import { getElement, getCart, saveCart, showToast } from './utils.js';
import { apiFetch, getAuthToken } from './api.js';
import { updateNav, logout } from './navigation.js';
import { showContainerSpinner } from './loading.js';

/**
 * Инициализация страницы каталога
 */
export async function initCatalogPage() {
    const catalog = getElement('flower-catalog');
    if (!catalog) return;
    
    const authToken = getAuthToken();
    
    // Показываем спиннер пока загружается каталог
    showContainerSpinner(catalog);
    
    try {
        const flowers = await apiFetch('/flowers/', {}, logout);
        const availableFlowers = flowers.filter(f => f.status === 'available');
        const cart = getCart();
        catalog.innerHTML = '';

        if (availableFlowers.length === 0) {
            catalog.classList.add('is-empty');
            catalog.innerHTML = `
                <div class="empty-catalog-message">
                    <p>На данный момент свежих цветов в наличии нет.</p>
                    <p>Подпишитесь, чтобы первым узнать о новой поставке!</p>
                    <a href="https://t.me/romantic_shopping_bot" target="_blank" rel="noopener noreferrer" class="button">🔔 Оповещения в Telegram</a>
                </div>
            `;
            return;
        }
        
        catalog.classList.remove('is-empty');
        availableFlowers.forEach(flower => {
            const itemInCart = cart[flower.id];
            const inCartQty = itemInCart ? itemInCart.quantity : 0;
            const displayQuantity = flower.quantity - inCartQty;

            const flowerDiv = document.createElement('div');
            flowerDiv.className = 'flower-item';
            
            // Hide the item if it's in the cart and the quantity is fully reserved.
            if (displayQuantity <= 0) {
                flowerDiv.classList.add('hidden');
            }

            let actionHtml = `<p class="login-prompt"><a href="/static/login.html">Войдите</a>, чтобы добавить в корзину</p>`;
            if (authToken) {
                actionHtml = renderCartActions(flower.id, flower.name, flower.price, flower.quantity, inCartQty, displayQuantity);
            }
            flowerDiv.innerHTML = `
                <img src="${flower.image_url}" alt="${flower.name}">
                <div class="flower-content">
                    <h3>${flower.name}</h3>
                    <p class="flower-description">${flower.description || ''}</p>
                    <div class="flower-meta">
                        <span class="flower-price">${flower.price} ₽</span>
                        <span class="flower-stock">В наличии: ${displayQuantity} шт.</span>
                    </div>
                </div>
                <div class="actions-container">
                    ${actionHtml}
                </div>
            `;
            catalog.appendChild(flowerDiv);
        });
    } catch (error) {
        catalog.innerHTML = `<p style="color:red;">${error.message}</p>`;
    }
}

/**
 * Генерирует HTML для action-секции карточки цветка
 * @param {number} id - ID цветка
 * @param {string} name - Название
 * @param {number} price - Цена
 * @param {number} maxQuantity - Максимальное количество
 * @param {number} inCartQty - Количество в корзине
 * @param {number} displayQuantity - Доступное количество
 */
function renderCartActions(id, name, price, maxQuantity, inCartQty, displayQuantity) {
    if (inCartQty > 0) {
        // Товар уже в корзине - показываем статус и кнопку "Ещё"
        return `
            <div class="cart-status-row">
                <a href="/static/cart.html" class="in-cart-badge">🛒 В корзине: ${inCartQty} шт.</a>
                ${displayQuantity > 0 ? `<button class="add-more-btn" data-id="${id}" data-name="${name}" data-price="${price}" data-max-quantity="${maxQuantity}">+ Ещё</button>` : ''}
            </div>
            <div class="add-more-panel hidden" data-id="${id}">
                <div class="quantity-selector" data-id="${id}" data-name="${name}" data-price="${price}" data-max-quantity="${maxQuantity}" data-display-max="${displayQuantity}">
                    <button class="change-qty-btn" data-change="-1">−</button>
                    <span class="quantity-display">1</span>
                    <button class="change-qty-btn" data-change="1">+</button>
                </div>
                <button class="add-to-cart-btn">Добавить</button>
            </div>
        `;
    } else {
        // Товар ещё не в корзине - стандартный вид
        return `
            <div class="quantity-selector" data-id="${id}" data-name="${name}" data-price="${price}" data-max-quantity="${maxQuantity}" data-display-max="${displayQuantity}">
                <button class="change-qty-btn" data-change="-1">−</button>
                <span class="quantity-display">1</span>
                <button class="change-qty-btn" data-change="1">+</button>
            </div>
            <button class="add-to-cart-btn" ${displayQuantity <= 0 ? 'disabled' : ''}>В корзину</button>
        `;
    }
}

/**
 * Обработчик добавления товара в корзину
 * @param {HTMLElement} flowerItem - Элемент товара
 */
export function handleAddToCart(flowerItem) {
    const quantitySelector = flowerItem.querySelector('.quantity-selector');
    const quantityDisplay = quantitySelector.querySelector('.quantity-display');
    const quantity = parseInt(quantityDisplay.textContent);
    const { id, name, price, maxQuantity } = quantitySelector.dataset;

    const cart = getCart();
    const existingQty = cart[id] ? cart[id].quantity : 0;
    const newQty = existingQty + quantity;
    const maxQty = parseInt(maxQuantity);

    if (newQty > maxQty) {
        showToast(`Нельзя добавить больше, чем есть в наличии (${maxQty} шт.)`);
        return;
    }
    
    cart[id] = { name, price: parseFloat(price), quantity: newQty, maxQuantity: maxQty };
    saveCart(cart, updateNav);
    showToast(`"${name}" (${quantity} шт) добавлено.`, '/static/cart.html', 'В корзину');
    
    // Обновляем карточку: остаток и UI
    const displayQty = maxQty - newQty;
    updateFlowerCardUI(flowerItem, id, name, parseFloat(price), maxQty, newQty, displayQty);
}

/**
 * Обновить UI карточки цветка после добавления в корзину
 */
function updateFlowerCardUI(flowerItem, id, name, price, maxQuantity, inCartQty, displayQuantity) {
    const stockElement = flowerItem.querySelector('.flower-stock');
    const actionsContainer = flowerItem.querySelector('.actions-container');
    
    // Обновляем текст остатка
    stockElement.textContent = `В наличии: ${displayQuantity} шт.`;
    
    if (displayQuantity <= 0) {
        // Скрываем карточку если товара не осталось
        flowerItem.classList.add('hidden');
    } else {
        // Перерисовываем action-секцию
        actionsContainer.innerHTML = renderCartActions(id, name, price, maxQuantity, inCartQty, displayQuantity);
    }
}

/**
 * Обработчик клика на "Ещё" - показывает панель добавления
 * @param {HTMLElement} button - Кнопка "Ещё"
 */
export function handleAddMoreClick(button) {
    const panel = button.closest('.actions-container').querySelector('.add-more-panel');
    if (panel) {
        panel.classList.toggle('hidden');
        button.classList.toggle('active');
    }
}
