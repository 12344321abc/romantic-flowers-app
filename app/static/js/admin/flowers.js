/**
 * Модуль управления цветами (товарами) в админ-панели
 */

import { apiFetch } from './api.js';
import { validateForm, setupLiveValidation, rules } from '../validation.js';
import { showContainerSpinner } from '../loading.js';

// DOM элементы
let flowerList = null;
let flowerForm = null;
let editFlowerModal = null;
let editFlowerForm = null;

// Правила валидации для формы добавления цветка
const flowerValidationRules = {
    'flower-name': [rules.required, rules.minLength(2)],
    'flower-description': [rules.required],
    'flower-price': [rules.required, rules.positiveNumber],
    'flower-quantity': [rules.required, rules.positiveNumber, rules.integer]
};

// Правила валидации для формы редактирования
const editFlowerValidationRules = {
    'edit-flower-name': [rules.required, rules.minLength(2)],
    'edit-flower-description': [rules.required],
    'edit-flower-price': [rules.required, rules.positiveNumber],
    'edit-flower-quantity': [rules.required, rules.positiveNumber, rules.integer]
};

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
        setupLiveValidation(flowerForm, flowerValidationRules);
    }
    
    if (editFlowerForm) {
        editFlowerForm.addEventListener('submit', updateFlower);
        setupLiveValidation(editFlowerForm, editFlowerValidationRules);
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
    
    showContainerSpinner(flowerList);
    
    try {
        const flowers = await apiFetch('/flowers/', {}, onUnauthorized);
        flowerList.innerHTML = '';
        
        flowers.forEach(flower => {
            const flowerDiv = document.createElement('div');
            flowerDiv.className = 'flower-item';
            
            const statusText = flower.status === 'available' ? 'В продаже' :
                              flower.status === 'sold_out' ? 'Распродано' : flower.status;
            const statusClass = flower.status === 'available' ? 'status-ready' : 'status-completed';
            
            flowerDiv.innerHTML = `
                <div class="flower-quick-actions">
                    <button class="edit-btn icon-btn" data-id="${flower.id}" title="Изменить">✏️</button>
                    <button class="delete-btn icon-btn" data-id="${flower.id}" data-name="${flower.name}" title="Удалить">🗑</button>
                </div>
                <img src="${flower.image_url}" alt="${flower.name}">
                <div class="flower-content">
                    <h3>${flower.name}</h3>
                    <p class="flower-description">${flower.description}</p>
                    <div class="flower-meta">
                        <span class="flower-price">${flower.price} ₽</span>
                        <span class="flower-stock">Остаток: ${flower.quantity} шт.</span>
                    </div>
                    <div class="flower-status">
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </div>
                </div>
                <div class="actions-container admin-actions">
                    <div class="admin-qty-row">
                        <input type="number" class="admin-qty-input" placeholder="Кол-во" min="1" data-id="${flower.id}">
                        <button class="add-btn" data-id="${flower.id}" title="Добавить">+ Добавить</button>
                        <button class="sell-btn" data-id="${flower.id}" title="Списать">− Списать</button>
                    </div>
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
    
    // Валидация формы
    if (!validateForm(flowerForm, flowerValidationRules)) {
        return;
    }
    
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
 * @param {string} flowerName - Название цветка для подтверждения
 * @param {Function} [onUnauthorized]
 */
export async function deleteFlower(flowerId, flowerName, onUnauthorized) {
    const confirmMessage = `Удалить "${flowerName}"?\n\nЭто действие нельзя отменить.`;
    if (!confirm(confirmMessage)) return;
    
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
    
    // Валидация формы
    if (!validateForm(editFlowerForm, editFlowerValidationRules)) {
        return;
    }
    
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
