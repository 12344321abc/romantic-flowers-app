/**
 * Главный модуль админ-панели
 */

import { getAuthToken, apiFetch, login, logout as apiLogout } from './api.js';
import { initFlowersModule, fetchFlowers, deleteFlower, sellFlowers, addFlowerQuantity, openEditModal, getFlowerById } from './flowers.js';
import { initCustomersModule, fetchCustomers, deleteCustomer, openEditCustomerModal, getCustomerById } from './customers.js';
import { initOrdersModule, fetchOrders } from './orders.js';
import { sendBroadcast } from './broadcast.js';

// DOM элементы
let loginView = null;
let adminView = null;
let loginForm = null;
let logoutBtn = null;
let loginError = null;
let mainViews = null;
let navButtons = null;
let flowerList = null;
let customerList = null;

/**
 * Инициализация админ-панели
 */
function init() {
    // Получаем DOM элементы
    loginView = document.getElementById('admin-login-view');
    adminView = document.getElementById('admin-main-view');
    loginForm = document.getElementById('login-form');
    logoutBtn = document.getElementById('logout-btn');
    loginError = document.getElementById('login-error');
    mainViews = document.querySelectorAll('#admin-main-view main > div');
    navButtons = document.querySelectorAll('.nav-btn');
    flowerList = document.getElementById('flower-list');
    customerList = document.getElementById('customer-list');
    
    // Инициализация модулей
    initFlowersModule();
    initCustomersModule();
    initOrdersModule();
    
    // Обработчики событий
    setupEventListeners();
    
    // Проверка авторизации
    updateLoginView();
}

/**
 * Настройка обработчиков событий
 */
function setupEventListeners() {
    // Форма входа
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Кнопка выхода
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
    
    // Навигация
    const headerNav = document.querySelector('header nav');
    if (headerNav) {
        headerNav.addEventListener('click', (e) => {
            if (e.target.classList.contains('nav-btn')) {
                switchView(e.target.dataset.view);
            }
        });
    }
    
    // Действия со списком цветов
    if (flowerList) {
        flowerList.addEventListener('click', handleFlowerListClick);
    }
    
    // Действия со списком клиентов
    if (customerList) {
        customerList.addEventListener('click', handleCustomerListClick);
    }
    
    // Кнопка рассылки
    document.body.addEventListener('click', (e) => {
        if (e.target.id === 'broadcast-btn') {
            sendBroadcast(logout);
        }
    });
}

/**
 * Переключение вида (раздела)
 * @param {string} viewId
 */
function switchView(viewId) {
    // Скрываем все виды
    mainViews.forEach(view => view.classList.add('hidden'));
    
    // Показываем нужный вид
    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.classList.remove('hidden');
    }

    // Обновляем активную кнопку навигации
    navButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewId);
    });

    // Загружаем данные для соответствующего раздела
    if (viewId === 'flowers-view') fetchFlowers(logout);
    if (viewId === 'customers-view') fetchCustomers(logout);
    if (viewId === 'orders-view') fetchOrders(logout);
}

/**
 * Обновление состояния авторизации
 */
async function updateLoginView() {
    const authToken = getAuthToken();
    
    if (!authToken) {
        showLoginView();
        return;
    }
    
    try {
        await apiFetch('/users/me/admin/', {}, logout);
        showAdminView();
        
        // Если нет активной вкладки, открываем "Товары"
        if (!document.querySelector('.nav-btn.active')) {
            switchView('flowers-view');
        }
    } catch (error) {
        logout();
    }
}

/**
 * Показать форму входа
 */
function showLoginView() {
    if (loginView) loginView.classList.remove('hidden');
    if (adminView) adminView.classList.add('hidden');
}

/**
 * Показать админ-панель
 */
function showAdminView() {
    if (loginView) loginView.classList.add('hidden');
    if (adminView) adminView.classList.remove('hidden');
}

/**
 * Обработчик формы входа
 * @param {Event} e
 */
async function handleLogin(e) {
    e.preventDefault();
    const username = e.target.username.value;
    const password = e.target.password.value;
    
    try {
        await login(username, password);
        if (loginError) loginError.textContent = '';
        updateLoginView();
    } catch (error) {
        if (loginError) loginError.textContent = error.message;
    }
}

/**
 * Выход из системы
 */
async function logout() {
    await apiLogout();  // Revokes refresh token on server
    updateLoginView();
}

/**
 * Обработчик кликов по списку цветов
 * @param {Event} e
 */
async function handleFlowerListClick(e) {
    const target = e.target;
    
    // Удаление
    if (target.classList.contains('delete-btn')) {
        const flowerName = target.dataset.name || 'этот цветок';
        deleteFlower(target.dataset.id, flowerName, logout);
        return;
    }
    
    // Редактирование
    if (target.classList.contains('edit-btn')) {
        try {
            const flower = await getFlowerById(target.dataset.id);
            openEditModal(flower);
        } catch (error) {
            console.error('Failed to fetch flower details:', error);
        }
        return;
    }
    
    // Управление количеством (добавить/списать)
    if (target.classList.contains('add-btn') || target.classList.contains('sell-btn')) {
        const flowerId = target.dataset.id;
        const actionsContainer = target.closest('.admin-actions');
        const quantityInput = actionsContainer?.querySelector('.admin-qty-input');
        const quantity = parseInt(quantityInput?.value, 10);
        
        if (isNaN(quantity) || quantity <= 0) {
            alert('Введите корректное количество.');
            return;
        }
        
        if (target.classList.contains('add-btn')) {
            addFlowerQuantity(flowerId, quantity, logout);
        } else if (target.classList.contains('sell-btn')) {
            sellFlowers(flowerId, quantity, logout);
        }
        
        if (quantityInput) quantityInput.value = '';
    }
}

/**
 * Обработчик кликов по списку клиентов
 * @param {Event} e
 */
async function handleCustomerListClick(e) {
    const target = e.target;
    
    // Удаление
    if (target.classList.contains('delete-customer-btn')) {
        const customerName = target.dataset.name || 'этого клиента';
        deleteCustomer(target.dataset.id, customerName, logout);
        return;
    }
    
    // Редактирование
    if (target.classList.contains('edit-customer-btn')) {
        try {
            const customer = await getCustomerById(target.dataset.id);
            openEditCustomerModal(customer);
        } catch (error) {
            console.error('Failed to fetch customer details:', error);
        }
        return;
    }
}

// Запуск при загрузке DOM
document.addEventListener('DOMContentLoaded', init);
