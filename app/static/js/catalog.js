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
                actionHtml = `
                    <div class="quantity-selector" data-id="${flower.id}" data-name="${flower.name}" data-price="${flower.price}" data-max-quantity="${flower.quantity}" data-display-max="${displayQuantity}">
                        <button class="change-qty-btn" data-change="-1">−</button>
                        <span class="quantity-display">1</span>
                        <button class="change-qty-btn" data-change="1">+</button>
                    </div>
                    <button class="add-to-cart-btn" ${displayQuantity <= 0 ? 'disabled' : ''}>Добавить в корзину</button>
                `;
            }
            
            // Формируем блок информации о наличии с учётом корзины
            const stockHtml = inCartQty > 0
                ? `<span class="flower-in-cart">🛒 В корзине: ${inCartQty} шт</span>
                   <span class="flower-stock">Ещё доступно: ${displayQuantity} шт.</span>`
                : `<span class="flower-stock">В наличии: ${displayQuantity} шт.</span>`;
            
            flowerDiv.innerHTML = `
                <img src="${flower.image_url}" alt="${flower.name}">
                <div class="flower-content">
                    <h3>${flower.name}</h3>
                    <p class="flower-description">${flower.description || ''}</p>
                    <div class="flower-meta">
                        <span class="flower-price">${flower.price} ₽</span>
                        <div class="flower-stock-info">
                            ${stockHtml}
                        </div>
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
    
    // Обновляем только затронутую карточку без перезагрузки всего каталога
    updateFlowerCardStock(flowerItem, newQty, maxQty - newQty);
}

/**
 * Обновить отображение остатка на карточке цветка
 * @param {HTMLElement} flowerItem - Элемент карточки товара
 * @param {number} inCartQty - Количество в корзине
 * @param {number} availableQty - Ещё доступное количество
 */
function updateFlowerCardStock(flowerItem, inCartQty, availableQty) {
    const stockInfoContainer = flowerItem.querySelector('.flower-stock-info');
    const quantitySelector = flowerItem.querySelector('.quantity-selector');
    const addButton = flowerItem.querySelector('.add-to-cart-btn');
    const quantityDisplay = quantitySelector.querySelector('.quantity-display');
    
    // Обновляем data-display-max для корректной работы кнопок +/-
    quantitySelector.dataset.displayMax = availableQty;
    
    // Обновляем блок информации о наличии
    if (inCartQty > 0) {
        stockInfoContainer.innerHTML = `
            <span class="flower-in-cart">🛒 В корзине: ${inCartQty} шт</span>
            <span class="flower-stock">Ещё доступно: ${availableQty} шт.</span>
        `;
    } else {
        stockInfoContainer.innerHTML = `
            <span class="flower-stock">В наличии: ${availableQty} шт.</span>
        `;
    }
    
    // Сбрасываем счётчик на 1
    quantityDisplay.textContent = '1';
    
    if (availableQty <= 0) {
        // Скрываем карточку если товара не осталось
        flowerItem.classList.add('hidden');
    } else {
        // Активируем кнопку
        addButton.disabled = false;
    }
}
