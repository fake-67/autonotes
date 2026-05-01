// --- DOM Элементы ---
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileInfo = document.getElementById('file-info');
const fileName = document.getElementById('file-name');
const clearFileBtn = document.getElementById('clear-file');
const loading = document.getElementById('loading');
const controlsSection = document.getElementById('controls-section');
const resultSection = document.getElementById('result-section');
const notesOutput = document.getElementById('notes-output');
const generateBtn = document.getElementById('generate-btn');
const compressionSlider = document.getElementById('compression-slider');
const copyTextBtn = document.getElementById('copy-text-btn');
const exportPdfBtn = document.getElementById('export-pdf-btn');
const themeToggleBtn = document.getElementById('theme-toggle-btn');

let currentFile = null;
let extractedText = '';
let extractedImages = []; // Для картинок из DOCX

// --- Инициализация библиотек ---
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// --- Обработчики загрузки ---
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('active');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('active'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('active');
    handleFileSelect({ target: { files: e.dataTransfer.files } });
});
clearFileBtn.addEventListener('click', resetApp);

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    currentFile = file;
    fileName.textContent = file.name;
    fileInfo.classList.remove('hidden');
    dropZone.classList.add('hidden');
    controlsSection.classList.remove('hidden');
    resultSection.classList.add('hidden');
    extractedText = '';
    extractedImages = [];
    notesOutput.innerHTML = '';
}

async function parseFile() {
    const file = currentFile;
    const type = file.name.split('.').pop().toLowerCase();
    loading.classList.remove('hidden');

    try {
        if (type === 'pdf') {
            await parsePDF(file);
        } else if (type === 'docx') {
            await parseDOCX(file);
        } else if (type === 'txt') {
            await parseTXT(file);
        } else {
            alert('Формат не поддерживается. Выберите PDF, DOCX или TXT.');
            loading.classList.add('hidden');
            return;
        }
        generateNotes();
    } catch (error) {
        console.error(error);
        alert('Ошибка при обработке файла. Убедитесь, что файл не поврежден.');
    } finally {
        loading.classList.add('hidden');
        resultSection.classList.remove('hidden');
    }
}

// --- Парсеры форматов ---
async function parsePDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
    }
    extractedText = fullText;
    // В этом прототипе изображения из PDF мы не извлекаем отдельно (требует сложной логики)
}

async function parseDOCX(file) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer }, {
        convertImage: mammoth.images.imgElement(function(image) {
            return image.read("base64").then(function(imageBuffer) {
                return {
                    src: "data:" + image.contentType + ";base64," + imageBuffer
                };
            });
        })
    });
    // Извлекаем текст, убирая HTML теги для анализа
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = result.value;
    
    // Сохраняем картинки
    const imgs = tempDiv.querySelectorAll('img');
    extractedImages = Array.from(imgs).map(img => img.outerHTML);
    
    // Чистый текст
    extractedText = tempDiv.textContent || tempDiv.innerText || '';
}

async function parseTXT(file) {
    extractedText = await file.text();
    extractedImages = []; // В txt картинок нет
}

// --- Алгоритм анализа и сжатия ---
function analyzeAndCompress(text, level) {
    // Очистка
    let sentences = text.match(/[^\.!\?\n]+[\.!\?]*/g) || [];
    sentences = sentences
        .map(s => s.trim().replace(/\s+/g, ' '))
        .filter(s => s.length > 15); // Убираем мусор и короткие обрывки

    // Ключевые маркеры важности
    const definitionRegex = /(это|является|называется|определяется|представляет собой|означает|— это|:) /i;
    const listMarkerRegex = /(во-первых|во-вторых|в-третьих|следующие|включает|состоит из|\d+\.\s|\-\s|•)/i;
    const termRegex = /\b[A-ZА-Я]{2,}\b/; // Аббревиатуры и заглавные слова

    let scored = sentences.map(s => {
        let score = 1;
        if (definitionRegex.test(s)) score += 5;
        if (termRegex.test(s)) score += 3;
        if (listMarkerRegex.test(s)) score += 4;
        if (s.split(' ').length < 6) score -= 1; // короткие неинформативные
        return { text: s, score };
    });

    // Сортировка по важности
    scored.sort((a, b) => b.score - a.score);
    
    // Отбор в зависимости от уровня сжатия (1-5)
    const retainPercent = 0.15 + (level * 0.1); // 25% при 1, до 65% при 5
    const numToKeep = Math.max(3, Math.floor(sentences.length * retainPercent));
    
    return scored.slice(0, numToKeep).map(item => item.text);
}

// --- Сборка конспекта ---
function generateNotes() {
    const level = parseInt(compressionSlider.value, 10);
    const topSentences = analyzeAndCompress(extractedText, level);
    
    let html = '';
    
    // Заголовок (пробуем взять первое длинное предложение как название)
    if (extractedText.length > 20) {
        html += `<h2>📌 ${extractedText.split(/\.|\n/)[0].slice(0, 60)}...</h2>`;
    }
    
    // Перемешиваем текст с картинками
    let imgIndex = 0;
    topSentences.forEach((sentence, index) => {
        // Ищем определения и оформляем их
        if (/является|это|представляет собой/.test(sentence)) {
            html += `<div class="definition">💡 ${sentence}</div>`;
        } else if (/^\d+\.|^\-|^•/.test(sentence.trim())) {
            html += `<li>${sentence.replace(/^\d+\.\s*|^\-|^•/, '')}</li>`;
        } else {
            html += `<p>${sentence}</p>`;
        }
        
        // Вставляем картинку примерно после 2-3 предложений, если они есть
        if (extractedImages.length > 0 && index > 0 && index % 3 === 0 && imgIndex < extractedImages.length) {
            html += extractedImages[imgIndex];
            imgIndex++;
        }
    });

    // Добавляем оставшиеся картинки в конец
    if (imgIndex < extractedImages.length) {
        html += '<h3>🖼️ Оставшиеся изображения из лекции:</h3>';
        for (let i = imgIndex; i < extractedImages.length; i++) {
            html += extractedImages[i];
        }
    }
    
    // Если вообще ничего не нашлось
    if (html === '') {
        html = '<p>Не удалось выделить ключевые мысли. Возможно, файл содержит слишком мало текста или только сканы страниц.</p>';
    }

    notesOutput.innerHTML = html;
}

// --- Кнопки действий ---
generateBtn.addEventListener('click', parseFile);

copyTextBtn.addEventListener('click', () => {
    const text = notesOutput.textContent || notesOutput.innerText;
    navigator.clipboard.writeText(text).then(() => {
        alert('Текст конспекта скопирован!');
    });
});

exportPdfBtn.addEventListener('click', () => {
    const element = document.getElementById('notes-output');
    html2pdf().set({ margin: 10, filename: 'Автоконспект.pdf', image: { type: 'jpeg', quality: 0.98 } }).from(element).save();
});

themeToggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark');
});

function resetApp() {
    currentFile = null;
    extractedText = '';
    extractedImages = [];
    notesOutput.innerHTML = '';
    fileInfo.classList.add('hidden');
    controlsSection.classList.add('hidden');
    resultSection.classList.add('hidden');
    dropZone.classList.remove('hidden');
    fileInput.value = '';
}