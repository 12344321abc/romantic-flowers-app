/**
 * Модуль управления цветами (товарами) в админ-панели
 */

import { apiFetch } from './api.js';

// DOM элементы
let flowerList = null;
let flowerForm = null;
let editFlowerModal = null;
let editFlowerForm = null;

/**
 * Инициализация модуля
 */
export function initFlowersModule() {
    flowerList = document.getElementById('flower-list');
    flowerForm = document.getElementById('flower-form');
    editFlowerModal = document.getElementById('edit-flower-modal');
    editFlowerForm = document.getElementById('edit-flower-form');
    
    if (flowerForm) {
        flowerForm.addEventListener('submit', addFlower);
    }
    
    if (editFlowerForm) {
        editFlowerForm.addEventListener('submit', updateFlower);
    }
    
    // Закрытие модального окна
    const closeButton = document.querySelector('.modal .close-button');
    if (closeButton) {
        closeButton.addEventListener('click', closeEditModal);
    }
    
    window.addEventListener('click', (event) => {
        if (event.target === editFlowerModal) {
            closeEditModal();
        }
    });
}

/**
 * Загрузить список цветов
 * @param {Function} [onUnauthorized] - Callback при ошибке авторизации
 */
export async function fetchFlowers(onUnauthorized) {
    if (!flowerList) return;
    
    try {
        const flowers = await apiFetch('/flowers/', {}, onUnauthorized);
        flowerList.innerHTML = '';
        
        flowers.forEach(flower => {
            const flowerDiv = document.createElement('div');
            flowerDiv.className = 'flower-item';
            flowerDiv.innerHTML = `
                <img src="${flower.image_url}" alt="${flower.name}">
                <h3>${flower.name}</h3>
                <p>${flower.description}</p>
                <p><strong>Цена:</strong> ${flower.price} руб.</p>
                <p><strong>Остаток:</strong> ${flower.quantity} шт.</p>
                <p><strong>Статус:</strong> ${flower.status}</p>
                <div class="actions-container">
                    <div class="quantity-control" data-id="${flower.id}">
                        <input type="number" class="quantity-input" placeholder="Кол-во" min="1">
                        <button class="add-btn" title="Добавить количество">+</button>
                        <button class="sell-btn" title="Продать количество">»</button>
                    </div>
                    <button class="edit-btn" data-id="${flower.id}">Редактировать</button>
                    <button class="delete-btn" data-id="${flower.id}">Удалить партию</button>
                </div>
            `;
            flowerList.appendChild(flowerDiv);
        });
    } catch (error) {
        console.error("Failed to fetch flowers:", error);
    }
}

/**
 * Добавить новый цветок
 * @param {Event} event
 */
async function addFlower(event) {
    event.preventDefault();
    
    const formData = new FormData();
    const imageFile = document.getElementById('flower-image').files[0];
    
    if (!imageFile) {
        alert('Пожалуйста, выберите изображение.');
        return;
    }
    
    formData.append('name', document.getElementById('flower-name').value);
    formData.append('description', document.getElementById('flower-description').value);
    formData.append('price', document.getElementById('flower-price').value);
    formData.append('quantity', document.getElementById('flower-quantity').value);
    formData.append('image', imageFile);
    
    try {
        await apiFetch('/flowers/', { method: 'POST', body: formData });
        flowerForm.reset();
        fetchFlowers();
    } catch (error) {
        console.error('Failed to add flower:', error);
        alert(`Ошибка: ${error.message}`);
    }
}

/**
 * Удалить цветок
 * @param {string|number} flowerId
 * @param {Function} [onUnauthorized]
 */
export async function deleteFlower(flowerId, onUnauthorized) {
    if (!confirm('Вы уверены?')) return;
    
    try {
        await apiFetch(`/flowers/${flowerId}`, { method: 'DELETE' }, onUnauthorized);
        fetchFlowers(onUnauthorized);
    } catch (error) {
        console.error('Failed to delete flower:', error);
    }
}

/**
 * Продать цветы
 * @param {string|number} flowerId
 * @param {number} quantity
 * @param {Function} [onUnauthorized]
 */
export async function sellFlowers(flowerId, quantity, onUnauthorized) {
    try {
        await apiFetch(`/flowers/${flowerId}/sell`, {
            method: 'PATCH',
            body: JSON.stringify({ quantity })
        }, onUnauthorized);
        fetchFlowers(onUnauthorized);
    } catch (error) {
        console.error('Failed to sell flowers:', error);
    }
}

/**
 * Добавить количество цветов
 * @param {string|number} flowerId
 * @param {number} quantity
 * @param {Function} [onUnauthorized]
 */
export async function addFlowerQuantity(flowerId, quantity, onUnauthorized) {
    try {
        await apiFetch(`/flowers/${flowerId}/add`, {
            method: 'PATCH',
            body: JSON.stringify({ quantity })
        }, onUnauthorized);
        fetchFlowers(onUnauthorized);
    } catch (error) {
        console.error('Failed to add quantity:', error);
    }
}

/**
 * Открыть модальное окно редактирования
 * @param {Object} flower - Данные цветка
 */
export function openEditModal(flower) {
    document.getElementById('edit-flower-id').value = flower.id;
    document.getElementById('edit-flower-name').value = flower.name;
    document.getElementById('edit-flower-description').value = flower.description;
    document.getElementById('edit-flower-price').value = flower.price;
    document.getElementById('edit-flower-quantity').value = flower.quantity;
    
    if (editFlowerModal) {
        editFlowerModal.classList.add('is-open');
    }
}

/**
 * Закрыть модальное окно редактирования
 */
export function closeEditModal() {
    if (editFlowerModal) {
        editFlowerModal.classList.remove('is-open');
    }
}

/**
 * Обновить данные цветка
 * @param {Event} event
 */
async function updateFlower(event) {
    event.preventDefault();
    
    const flowerId = document.getElementById('edit-flower-id').value;
    const updatedData = {
        name: document.getElementById('edit-flower-name').value,
        description: document.getElementById('edit-flower-description').value,
        price: parseFloat(document.getElementById('edit-flower-price').value),
        quantity: parseInt(document.getElementById('edit-flower-quantity').value, 10)
    };

    try {
        await apiFetch(`/flowers/${flowerId}`, {
            method: 'PUT',
            body: JSON.stringify(updatedData)
        });
        closeEditModal();
        fetchFlowers();
    } catch (error) {
        console.error('Failed to update flower:', error);
        alert(`Ошибка: ${error.message}`);
    }
}

/**
 * Получить данные цветка по ID
 * @param {string|number} flowerId
 * @returns {Promise<Object>}
 */
export async function getFlowerById(flowerId) {
    return await apiFetch(`/flowers/${flowerId}`);
}
