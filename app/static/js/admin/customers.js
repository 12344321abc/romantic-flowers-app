/**
 * Модуль управления клиентами в админ-панели
 */

import { apiFetch } from './api.js';
import { validateForm, setupLiveValidation, rules } from '../validation.js';
import { showContainerSpinner } from '../loading.js';

// DOM элементы
let customerList = null;
let customerForm = null;

// Правила валидации для формы добавления клиента
const customerValidationRules = {
    'customer-username': [rules.required, rules.username],
    'customer-password': [rules.required, rules.password],
    'customer-password-confirm': [
        rules.required,
        rules.match('customer-password', 'Пароль')
    ],
    'customer-contact-name': [rules.required, rules.minLength(2)]
};

/**
 * Инициализация модуля
 */
export function initCustomersModule() {
    customerList = document.getElementById('customer-list');
    customerForm = document.getElementById('customer-form');
    
    if (customerForm) {
        customerForm.addEventListener('submit', addCustomer);
        setupLiveValidation(customerForm, customerValidationRules);
    }
}

/**
 * Загрузить список клиентов
 * @param {Function} [onUnauthorized] - Callback при ошибке авторизации
 */
export async function fetchCustomers(onUnauthorized) {
    if (!customerList) return;
    
    showContainerSpinner(customerList);
    
    try {
        const customers = await apiFetch('/users/', {}, onUnauthorized);
        customerList.innerHTML = '';
        
        customers.filter(u => u.role === 'customer').forEach(customer => {
            const customerDiv = document.createElement('div');
            customerDiv.className = 'customer-item';
            customerDiv.innerHTML = `
                <img src="${customer.photo_url || 'https://via.placeholder.com/100'}" alt="${customer.contact_name}">
                <div class="customer-info">
                    <h4>${customer.contact_name}</h4>
                    <p class="customer-login">@${customer.username}</p>
                    <p class="customer-address">${customer.address || 'Адрес не указан'}</p>
                    <details>
                        <summary>Заметки</summary>
                        <p>${customer.admin_notes || 'Нет заметок.'}</p>
                    </details>
                </div>
                <button class="delete-customer-btn icon-btn" data-id="${customer.id}" data-name="${customer.contact_name}" title="Удалить">🗑</button>
            `;
            customerList.appendChild(customerDiv);
        });
    } catch (error) {
        console.error("Failed to fetch customers:", error);
    }
}

/**
 * Добавить нового клиента
 * @param {Event} event
 */
async function addCustomer(event) {
    event.preventDefault();
    
    // Валидация формы
    if (!validateForm(customerForm, customerValidationRules)) {
        return;
    }

    const formData = new FormData();
    const photoFile = document.getElementById('customer-photo').files[0];
    
    formData.append('username', document.getElementById('customer-username').value);
    formData.append('password', password);
    formData.append('contact_name', document.getElementById('customer-contact-name').value);
    formData.append('address', document.getElementById('customer-address').value);
    formData.append('admin_notes', document.getElementById('customer-admin-notes').value);
    
    if (photoFile) {
        formData.append('photo', photoFile);
    }

    try {
        await apiFetch('/users/', { method: 'POST', body: formData });
        customerForm.reset();
        fetchCustomers();
    } catch (error) {
        console.error('Failed to add customer:', error);
        alert(`Ошибка: ${error.message}`);
    }
}

/**
 * Удалить клиента
 * @param {string|number} customerId
 * @param {Function} [onUnauthorized]
 */
export async function deleteCustomer(customerId, onUnauthorized) {
    if (!confirm('Вы уверены?')) return;
    
    try {
        await apiFetch(`/users/${customerId}`, { method: 'DELETE' }, onUnauthorized);
        fetchCustomers(onUnauthorized);
    } catch (error) {
        console.error('Failed to delete customer:', error);
    }
}
