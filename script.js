// ==================== СОСТОЯНИЕ ====================
const STORAGE_KEY = 'autonotes_data';
let appState = {
    users: [],           // все зарегистрированные пользователи
    currentUser: null,   // текущий пользователь
    notes: {},           // заметки по userId: массив заметок
    rooms: [],           // чат-комнаты
    messages: {},        // сообщения по roomId
    lastFileData: null   // последний обработанный файл
};

// Загрузка данных из localStorage
function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            appState.users = parsed.users || [];
            appState.notes = parsed.notes || {};
            appState.rooms = parsed.rooms || [];
            appState.messages = parsed.messages || {};
        } catch(e) {
            console.error('Ошибка загрузки состояния:', e);
            resetState();
        }
    }
}
function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        users: appState.users,
        notes: appState.notes,
        rooms: appState.rooms,
        messages: appState.messages
    }));
}
function resetState() {
    appState = { users: [], currentUser: null, notes: {}, rooms: [], messages: {}, lastFileData: null };
    saveState();
}

// ==================== DOM ЭЛЕМЕНТЫ ====================
// Экраны
const authScreen = document.getElementById('auth-screen');
const mainScreen = document.getElementById('main-screen');
// Формы
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authError = document.getElementById('auth-error');
// Навигация
const navBtns = document.querySelectorAll('.nav-btn[data-page]');
const logoutBtn = document.getElementById('logout-btn');
// Страницы
const pageConspect = document.getElementById('page-conspect');
const pageChats = document.getElementById('page-chats');
const pageProfile = document.getElementById('page-profile');
// Конспект
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileInfo = document.getElementById('file-info');
const fileName = document.getElementById('file-name');
const clearFileBtn = document.getElementById('clear-file');
const loadingBar = document.getElementById('loading-bar');
const loadingText = document.getElementById('loading-text');
const progressFill = document.querySelector('.progress-fill');
const controls = document.getElementById('controls');
const compressionSlider = document.getElementById('compression-slider');
const generateBtn = document.getElementById('generate-btn');
const notesOutput = document.getElementById('notes-output');
const galleryOutput = document.getElementById('gallery-output');
const resultActions = document.getElementById('result-actions');
const copyTextBtn = document.getElementById('copy-text-btn');
const exportPdfBtn = document.getElementById('export-pdf-btn');
const historyMini = document.getElementById('history-mini');
// Чаты
const roomsList = document.getElementById('rooms-list');
const searchRooms = document.getElementById('search-rooms');
const createRoomBtn = document.getElementById('create-room-btn');
const chatWindow = document.getElementById('chat-window');
const chatPlaceholder = document.querySelector('.chat-placeholder');
const chatTitle = document.getElementById('chat-title');
const messagesList = document.getElementById('messages-list');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const closeChat = document.getElementById('close-chat');
// Профиль
const profileEmail = document.getElementById('profile-email');
const profileNotesCount = document.getElementById('profile-notes-count');
const profileRoomsCount = document.getElementById('profile-rooms-count');
const profileNotesList = document.getElementById('profile-notes-list');

let currentRoomId = null;

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
loadState();
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// Если был залогинен — показываем main
if (localStorage.getItem('autonotes_current_user')) {
    const userId = localStorage.getItem('autonotes_current_user');
    const user = appState.users.find(u => u.id === userId);
    if (user) {
        appState.currentUser = user;
        showMain();
    } else {
        localStorage.removeItem('autonotes_current_user');
        showAuth();
    }
} else {
    showAuth();
}

function showAuth() {
    authScreen.classList.add('active');
    mainScreen.classList.remove('active');
}
function showMain() {
    authScreen.classList.remove('active');
    mainScreen.classList.add('active');
    updateProfile();
    renderHistoryMini();
    renderRooms();
    navigateTo('conspect');
}

// ==================== АВТОРИЗАЦИЯ ====================
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab;
        document.getElementById('login-form').classList.toggle('active', target === 'login');
        document.getElementById('register-form').classList.toggle('active', target === 'register');
        authError.textContent = '';
    });
});

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const user = appState.users.find(u => u.email === email);
    if (!user) { authError.textContent = 'Пользователь не найден'; return; }
    if (user.password !== password) { authError.textContent = 'Неверный пароль'; return; }
    appState.currentUser = user;
    localStorage.setItem('autonotes_current_user', user.id);
    showMain();
});

registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    if (!email || password.length < 6) { authError.textContent = 'Пароль минимум 6 символов'; return; }
    if (appState.users.find(u => u.email === email)) { authError.textContent = 'Email уже занят'; return; }
    const newUser = { id: 'u_' + Date.now(), email, password };
    appState.users.push(newUser);
    appState.notes[newUser.id] = [];
    saveState();
    appState.currentUser = newUser;
    localStorage.setItem('autonotes_current_user', newUser.id);
    showMain();
});

logoutBtn.addEventListener('click', () => {
    appState.currentUser = null;
    localStorage.removeItem('autonotes_current_user');
    showAuth();
});

// ==================== НАВИГАЦИЯ ====================
function navigateTo(page) {
    [pageConspect, pageChats, pageProfile].forEach(p => p.classList.remove('active'));
    if (page === 'conspect') pageConspect.classList.add('active');
    if (page === 'chats') pageChats.classList.add('active');
    if (page === 'profile') { pageProfile.classList.add('active'); updateProfile(); }
    navBtns.forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`[data-page="${page}"]`);
    if (activeBtn) activeBtn.classList.add('active');
}
navBtns.forEach(btn => btn.addEventListener('click', () => navigateTo(btn.dataset.page)));

// ==================== ПРОФИЛЬ ====================
function updateProfile() {
    if (!appState.currentUser) return;
    profileEmail.textContent = appState.currentUser.email;
    const notes = appState.notes[appState.currentUser.id] || [];
    profileNotesCount.textContent = notes.length;
    profileRoomsCount.textContent = appState.rooms.filter(r => r.members?.includes(appState.currentUser.id)).length;
    profileNotesList.innerHTML = notes.slice().reverse().slice(0, 10).map((n, i) => `
        <div class="note-card" onclick="loadNoteFromProfile('${n.id}')">
            ${n.fileName || 'Конспект'} — ${new Date(n.createdAt).toLocaleDateString()}
        </div>
    `).join('');
}
window.loadNoteFromProfile = function(noteId) {
    const notes = appState.notes[appState.currentUser.id] || [];
    const note = notes.find(n => n.id === noteId);
    if (note) {
        navigateTo('conspect');
        notesOutput.innerHTML = note.compressedText;
        if (note.images?.length) {
            galleryOutput.innerHTML = note.images.map(img => `<img src="${img}" alt="изображение">`).join('');
            galleryOutput.classList.remove('hidden');
        }
        resultActions.classList.remove('hidden');
    }
};
// ==================== ЗАГРУЗКА И ПАРСИНГ ФАЙЛОВ ====================
let currentFile = null;
let extractedText = '';
let extractedImages = [];

dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    handleFileSelect({ target: { files: e.dataTransfer.files } });
});
clearFileBtn.addEventListener('click', resetUpload);

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    const allowed = ['pdf', 'docx', 'pptx', 'txt'];
    const ext = file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) {
        alert('Неподдерживаемый формат. Используйте PDF, DOCX, PPTX или TXT.');
        return;
    }
    if (file.size > 50 * 1024 * 1024) {
        alert('Файл слишком большой. Максимум 50 МБ.');
        return;
    }
    currentFile = file;
    fileName.textContent = file.name;
    fileInfo.classList.remove('hidden');
    dropZone.classList.add('hidden');
    controls.classList.remove('hidden');
    resetResult();
}

function resetUpload() {
    currentFile = null;
    extractedText = '';
    extractedImages = [];
    fileInfo.classList.add('hidden');
    dropZone.classList.remove('hidden');
    controls.classList.add('hidden');
    loadingBar.classList.add('hidden');
    resetResult();
    fileInput.value = '';
}

function resetResult() {
    notesOutput.innerHTML = '';
    galleryOutput.innerHTML = '';
    galleryOutput.classList.add('hidden');
    resultActions.classList.add('hidden');
}

generateBtn.addEventListener('click', async () => {
    if (!currentFile) return;
    loadingBar.classList.remove('hidden');
    loadingText.textContent = 'Читаю файл...';
    progressFill.style.width = '20%';
    controls.classList.add('hidden');
    
    const ext = currentFile.name.split('.').pop().toLowerCase();
    try {
        if (ext === 'pdf') await parsePDF(currentFile);
        else if (ext === 'docx') await parseDOCX(currentFile);
        else if (ext === 'pptx') await parsePPTX(currentFile);
        else if (ext === 'txt') await parseTXT(currentFile);
        
        progressFill.style.width = '80%';
        loadingText.textContent = 'Анализирую текст...';
        await sleep(300);
        
        const level = parseInt(compressionSlider.value);
        const compressed = analyzeAndCompress(extractedText, level);
        const imagesHtml = extractedImages.map(img => `<img src="${img}" alt="изображение из лекции">`).join('');
        
        progressFill.style.width = '100%';
        loadingText.textContent = 'Готово!';
        await sleep(200);
        
        // Сохраняем в историю
        const noteId = 'n_' + Date.now();
        const note = {
            id: noteId,
            fileName: currentFile.name,
            originalText: extractedText.slice(0, 5000),
            compressedText: compressed,
            images: extractedImages,
            createdAt: new Date().toISOString()
        };
        if (!appState.notes[appState.currentUser.id]) appState.notes[appState.currentUser.id] = [];
        appState.notes[appState.currentUser.id].push(note);
        saveState();
        
        notesOutput.innerHTML = compressed;
        if (extractedImages.length > 0) {
            galleryOutput.innerHTML = imagesHtml;
            galleryOutput.classList.remove('hidden');
        }
        resultActions.classList.remove('hidden');
        renderHistoryMini();
    } catch (err) {
        console.error(err);
        alert('Ошибка при обработке файла: ' + err.message);
    } finally {
        loadingBar.classList.add('hidden');
        controls.classList.remove('hidden');
        progressFill.style.width = '0%';
    }
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// PDF парсинг с картинками
async function parsePDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    extractedImages = [];
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        
        // Текст
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
        
        // Рендер страницы как картинка
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        extractedImages.push(canvas.toDataURL('image/jpeg', 0.8));
    }
    extractedText = fullText;
}

// DOCX парсинг с картинками
async function parseDOCX(file) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer }, {
        convertImage: mammoth.images.imgElement(img => {
            return img.read('base64').then(buf => ({
                src: 'data:' + img.contentType + ';base64,' + buf
            }));
        })
    });
    const div = document.createElement('div');
    div.innerHTML = result.value;
    
    extractedImages = Array.from(div.querySelectorAll('img')).map(img => img.src);
    extractedText = div.textContent || '';
}

// PPTX парсинг с картинками
async function parsePPTX(file) {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    // Извлекаем текст из слайдов
    let fullText = '';
    const slideFiles = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    
    for (const slideFile of slideFiles) {
        const xmlContent = await zip.files[slideFile].async('string');
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
        const texts = xmlDoc.querySelectorAll('a\\:t, t');
        texts.forEach(t => fullText += t.textContent + ' ');
        fullText += '\n';
    }
    
    // Извлекаем картинки из медиа
    extractedImages = [];
    const mediaFiles = Object.keys(zip.files).filter(name => /^ppt\/media\/image\d+\./.test(name));
    for (const mediaFile of mediaFiles) {
        const blob = await zip.files[mediaFile].async('blob');
        const url = URL.createObjectURL(blob);
        extractedImages.push(url);
    }
    
    extractedText = fullText;
}

// TXT парсинг
async function parseTXT(file) {
    extractedText = await file.text();
    extractedImages = [];
}

// ==================== АЛГОРИТМ СЖАТИЯ ====================
function analyzeAndCompress(text, level) {
    let sentences = text.match(/[^\.!\?\n]+[\.!\?]*/g) || [];
    sentences = sentences.map(s => s.trim().replace(/\s+/g, ' ')).filter(s => s.length > 15);
    if (sentences.length === 0) return '<p>Не удалось выделить текст. Возможно, файл содержит только изображения.</p>';
    
    const defRegex = /(это|является|называется|определяется|представляет собой|означает|— это)/i;
    const listRegex = /(во-первых|во-вторых|в-третьих|следующие|включает|состоит из|^\d+\.|^-|^•)/i;
    const termRegex = /\b[A-ZА-Я]{2,}\b/;
    
    let scored = sentences.map(s => {
        let score = 1;
        if (defRegex.test(s)) score += 5;
        if (termRegex.test(s)) score += 3;
        if (listRegex.test(s)) score += 4;
        if (s.split(' ').length < 6) score -= 1;
        return { text: s, score };
    });
    
    scored.sort((a, b) => b.score - a.score);
    const retainPercent = 0.15 + (level * 0.1);
    const numToKeep = Math.max(5, Math.floor(sentences.length * retainPercent));
    const top = scored.slice(0, numToKeep).map(item => item.text);
    
    let html = '';
    if (extractedText.length > 20) {
        const title = extractedText.split(/\.|\n/)[0].slice(0, 80);
        html += `<h2>📌 ${title}...</h2>`;
    }
    top.forEach(s => {
        if (defRegex.test(s)) html += `<div class="definition">💡 ${s}</div>`;
        else if (listRegex.test(s)) html += `<li>${s.replace(/^\d+\.\s*|^-|^•/, '')}</li>`;
        else html += `<p>${s}</p>`;
    });
    
    return html || '<p>Ключевые мысли не найдены. Попробуйте уменьшить сжатие.</p>';
}

// ==================== ИСТОРИЯ МИНИ ====================
function renderHistoryMini() {
    const notes = appState.notes[appState.currentUser?.id] || [];
    if (notes.length === 0) { historyMini.innerHTML = ''; return; }
    historyMini.innerHTML = '<h4>📚 Последние конспекты</h4>' + 
        notes.slice().reverse().slice(0, 5).map(n => `
            <div class="history-item" onclick="loadHistoryNote('${n.id}')">
                📄 ${n.fileName} — ${new Date(n.createdAt).toLocaleDateString()}
            </div>
        `).join('');
}
window.loadHistoryNote = function(noteId) {
    const notes = appState.notes[appState.currentUser?.id] || [];
    const note = notes.find(n => n.id === noteId);
    if (note) {
        notesOutput.innerHTML = note.compressedText;
        if (note.images?.length) {
            galleryOutput.innerHTML = note.images.map(img => `<img src="${img}">`).join('');
            galleryOutput.classList.remove('hidden');
        } else galleryOutput.classList.add('hidden');
        resultActions.classList.remove('hidden');
    }
};

// ==================== КНОПКИ РЕЗУЛЬТАТА ====================
copyTextBtn.addEventListener('click', () => {
    const text = notesOutput.textContent || '';
    navigator.clipboard.writeText(text).then(() => alert('Конспект скопирован!'));
});
exportPdfBtn.addEventListener('click', () => {
    const content = document.createElement('div');
    content.innerHTML = notesOutput.innerHTML + galleryOutput.innerHTML;
    html2pdf().set({ margin: 10, filename: 'Автоконспект.pdf' }).from(content).save();
});

// ==================== ЧАТЫ ====================
function renderRooms(filter = '') {
    const myRooms = appState.rooms.filter(r => r.members?.includes(appState.currentUser?.id));
    const filtered = filter ? myRooms.filter(r => r.topic?.toLowerCase().includes(filter.toLowerCase())) : myRooms;
    roomsList.innerHTML = filtered.map(r => `
        <div class="room-card ${currentRoomId === r.id ? 'active' : ''}" onclick="openRoom('${r.id}')">
            <div class="room-name">${r.name}</div>
            <div class="room-topic">${r.topic || 'Без темы'}</div>
        </div>
    `).join('') || '<p style="color:#666;padding:10px;">Нет чатов. Создайте новый.</p>';
}
searchRooms.addEventListener('input', () => renderRooms(searchRooms.value));

createRoomBtn.addEventListener('click', () => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal">
            <h3>Новый чат</h3>
            <input type="text" id="new-room-name" placeholder="Название чата">
            <input type="text" id="new-room-topic" placeholder="Тема (опционально)">
            <div class="modal-actions">
                <button class="btn-secondary" id="cancel-room">Отмена</button>
                <button class="btn-primary" id="save-room">Создать</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    
    overlay.querySelector('#cancel-room').onclick = () => overlay.remove();
    overlay.querySelector('#save-room').onclick = () => {
        const name = overlay.querySelector('#new-room-name').value.trim();
        const topic = overlay.querySelector('#new-room-topic').value.trim();
        if (!name) { alert('Введите название'); return; }
        const room = {
            id: 'r_' + Date.now(),
            name,
            topic,
            ownerId: appState.currentUser.id,
            members: [appState.currentUser.id],
            createdAt: new Date().toISOString()
        };
        appState.rooms.push(room);
        appState.messages[room.id] = [];
        saveState();
        renderRooms();
        openRoom(room.id);
        overlay.remove();
    };
});

window.openRoom = function(roomId) {
    currentRoomId = roomId;
    const room = appState.rooms.find(r => r.id === roomId);
    if (!room) return;
    
    chatPlaceholder.classList.add('hidden');
    chatWindow.classList.remove('hidden');
    chatTitle.textContent = room.name + (room.topic ? ` — ${room.topic}` : '');
    renderMessages(roomId);
    renderRooms();
};

function renderMessages(roomId) {
    const msgs = appState.messages[roomId] || [];
    messagesList.innerHTML = msgs.map(m => `
        <div class="message ${m.userId === appState.currentUser?.id ? 'mine' : 'other'}">
            <div class="msg-sender">${m.userEmail}</div>
            <div>${m.text}</div>
        </div>
    `).join('');
    messagesList.scrollTop = messagesList.scrollHeight;
}

messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentRoomId) return;
    const text = messageInput.value.trim();
    if (!text) return;
    
    if (!appState.messages[currentRoomId]) appState.messages[currentRoomId] = [];
    const msg = {
        id: 'm_' + Date.now(),
        roomId: currentRoomId,
        userId: appState.currentUser.id,
        userEmail: appState.currentUser.email,
        text,
        createdAt: new Date().toISOString()
    };
    appState.messages[currentRoomId].push(msg);
    saveState();
    renderMessages(currentRoomId);
    messageInput.value = '';
});

closeChat.addEventListener('click', () => {
    currentRoomId = null;
    chatWindow.classList.add('hidden');
    chatPlaceholder.classList.remove('hidden');
    messagesList.innerHTML = '';
    renderRooms();
});

function renderAllRooms() { renderRooms(searchRooms.value); }
