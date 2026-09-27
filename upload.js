var UploadModule = (function () {
    'use strict';

    let onDataCallback = null;
    let parsedData = null;

    function init(callback) {
        onDataCallback = callback;
        renderUploadScreen();
        renderModeScreen();
    }

    function renderUploadScreen() {
        const screen = document.getElementById('upload-screen');
        screen.innerHTML = `
            <div class="upload-wrap">
                <h1>Telegram Chat Visualizer</h1>
                <p class="upload-subtitle">Загрузите JSON-экспорт чата для визуализации</p>
                <div id="drop-zone" class="drop-zone">
                    <div class="drop-zone-inner">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="17 8 12 3 7 8"/>
                            <line x1="12" y1="3" x2="12" y2="15"/>
                        </svg>
                        <p>Перетащите JSON-файл сюда</p>
                        <span class="or-text">или</span>
                        <label class="upload-btn">
                            Выберите файл
                            <input type="file" id="file-input" accept=".json" hidden>
                        </label>
                    </div>
                </div>
                <div id="upload-loader" class="upload-loader hidden">
                    <div class="spinner"></div>
                    <p id="loader-text">Обработка...</p>
                    <div class="progress-bar"><div id="progress-fill" class="progress-fill"></div></div>
                    <p id="progress-text" class="progress-text">0%</p>
                </div>
            </div>
        `;

        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');

        dropZone.addEventListener('click', (e) => {
            if (e.target.closest('.upload-btn')) return;
            fileInput.click();
        });
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
        });
        fileInput.addEventListener('change', () => {
            if (fileInput.files[0]) handleFile(fileInput.files[0]);
        });
    }

    function renderModeScreen() {
        const screen = document.getElementById('mode-screen');
        screen.innerHTML = `
            <div class="mode-wrap">
                <h2>Выберите визуализацию</h2>
                <p class="mode-subtitle" id="mode-chat-name"></p>
                <div class="mode-grid">
                    <div class="mode-card" data-mode="barchart">
                        <div class="mode-card-icon">📊</div>
                        <div class="mode-card-title">Bar Chart Race</div>
                        <div class="mode-card-desc">Гонка слов - анимированный рейтинг самых частых слов в скользящем окне</div>
                    </div>
                    <div class="mode-card" data-mode="linerace">
                        <div class="mode-card-icon">📈</div>
                        <div class="mode-card-title">Line Chart Race</div>
                        <div class="mode-card-desc">Гонка трендов - плавные линии популярности слов на скользящем таймлайне с аватарами и финальным рейтингом по пику</div>
                    </div>
                    <div class="mode-card" data-mode="heatmap">
                        <div class="mode-card-icon">🟩</div>
                        <div class="mode-card-title">Тепловая карта</div>
                        <div class="mode-card-desc">Календарь активности в стиле GitHub - интенсивность сообщений по дням</div>
                    </div>
                    <div class="mode-card" data-mode="punchcard">
                        <div class="mode-card-icon">🕐</div>
                        <div class="mode-card-title">Суточный ритм</div>
                        <div class="mode-card-desc">Punch Card - в какие часы и дни недели чат наиболее активен</div>
                    </div>
                    <div class="mode-card" data-mode="balance">
                        <div class="mode-card-icon">⚖️</div>
                        <div class="mode-card-title">Баланс сил</div>
                        <div class="mode-card-desc">Кто больше говорит, кто инициатор, время ответа, уникальный лексикон и золотой день</div>
                    </div>
                    <div class="mode-card" data-mode="ngram">
                        <div class="mode-card-icon">🔍</div>
                        <div class="mode-card-title">Ngram трекер</div>
                        <div class="mode-card-desc">Персональный Google Ngram - частота любого слова по месяцам за всю историю чата</div>
                    </div>
                    <div class="mode-card" data-mode="bubble">
                        <div class="mode-card-icon">🔵</div>
                        <div class="mode-card-title">Пузырьковая хроника</div>
                        <div class="mode-card-desc">Scatter-карта дней: размер = сообщения, высота = длина текстов, цвет = тип контента</div>
                    </div>
                    <!-- <div class="mode-card" data-mode="versus">
                        <div class="mode-card-icon">⚔️</div>
                        <div class="mode-card-title">Перетягивание каната</div>
                        <div class="mode-card-desc">Анимированное соревнование двух слов на таймлайне - кто побеждает в каждом месяце</div>
                    </div> -->
                    <div class="mode-card" data-mode="markov">
                        <div class="mode-card-icon">⌨️</div>
                        <div class="mode-card-title">Т9 чата</div>
                        <div class="mode-card-desc">Генератор фраз на Марковских цепях - собирайте абсурдные фразы в стиле каждого собеседника</div>
                    </div>
                    <div class="mode-card" data-mode="openwords">
                        <div class="mode-card-icon">📖</div>
                        <div class="mode-card-title">Открытые слова</div>
                        <div class="mode-card-desc">Частотный словарь русского языка: какие популярные слова вы уже «открыли» в чате, а какие - ещё нет</div>
                    </div>
                </div>
            </div>
        `;

        screen.querySelectorAll('.mode-card').forEach(card => {
            card.addEventListener('click', () => {
                const mode = card.dataset.mode;
                showScreen(mode);
                if (onDataCallback) onDataCallback(mode, parsedData);
            });
        });
    }

    function handleFile(file) {
        if (!file.name.endsWith('.json')) {
            alert('Выберите JSON-файл экспорта Telegram.');
            return;
        }

        const dropZone = document.getElementById('drop-zone');
        const loader = document.getElementById('upload-loader');
        const loaderText = document.getElementById('loader-text');
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');

        dropZone.classList.add('hidden');
        loader.classList.remove('hidden');
        loaderText.textContent = 'Чтение файла...';
        progressFill.style.width = '0%';
        progressText.textContent = '0%';

        const reader = new FileReader();
        reader.onprogress = (e) => {
            if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 50);
                progressFill.style.width = pct + '%';
                progressText.textContent = pct + '%';
            }
        };
        reader.onload = (e) => {
            loaderText.textContent = 'Парсинг сообщений...';
            progressFill.style.width = '50%';
            progressText.textContent = '50%';
            startWorker(e.target.result);
        };
        reader.onerror = () => { alert('Ошибка чтения файла.'); resetUpload(); };
        reader.readAsText(file);
    }

    function startWorker(text) {
        const workerCode = `
const URL_RE = /https?:\\/\\/[^\\s]+/g;
const PUNCT_RE = /[^\\p{L}\\p{N}\\s'-]/gu;
const MULTI_SPACE = /\\s+/g;

self.onmessage = function (e) {
    const text = e.data;
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (err) { self.postMessage({ type:'error', message:'JSON parse error: '+err.message }); return; }

    const messages = parsed.messages;
    if (!messages || !Array.isArray(messages)) { self.postMessage({ type:'error', message:'No messages array found.' }); return; }

    const chatName = parsed.name || parsed.id || 'Telegram Chat';
    const totalMessages = messages.length;
    const dayMap = {};
    const hourDayMap = {};
    let minDate = null, maxDate = null;
    const BATCH = 10000;

    // Per-user data for "Balance" mode
    // userDayMsgs: { date: { userName: count } }
    const userDayMsgs = {};
    // userWords: { userName: { word: count } }
    const userWords = {};
    // msgTimeline: array of { from, ts } for response time & initiator analysis
    const msgTimeline = [];
    // users set
    const usersSet = {};
    // Markov bigrams: { userName: { word: { nextWord: count } } }
    const userBigrams = {};
    // Per-message token streams (chronological) for accurate adjacency / co-occurrence:
    // [{ u: userName, t: [word, word, ...] }]
    const msgTokens = [];
    // First chronological occurrence of each word: { word: { user, ts } }
    const wordFirst = {};

    for (let i = 0; i < totalMessages; i++) {
        const msg = messages[i];
        if (i % BATCH === 0) self.postMessage({ type:'progress', value: i/totalMessages });
        if (msg.type !== 'message') continue;

        let content = '';
        if (typeof msg.text === 'string') content = msg.text;
        else if (Array.isArray(msg.text)) content = msg.text.map(p => typeof p === 'string' ? p : (p.text||'')).join('');

        const dateStr = msg.date ? msg.date.substring(0, 10) : null;
        if (!dateStr) continue;

        if (!minDate || dateStr < minDate) minDate = dateStr;
        if (!maxDate || dateStr > maxDate) maxDate = dateStr;

        const hour = parseInt(msg.date.substring(11, 13), 10);
        const dateObj = new Date(dateStr + 'T00:00:00');
        const dow = dateObj.getDay();

        if (!hourDayMap[dateStr]) hourDayMap[dateStr] = { msgs: 0, words: 0 };
        hourDayMap[dateStr].msgs++;

        const hdKey = dow + '_' + hour;
        if (!hourDayMap['_punch']) hourDayMap['_punch'] = {};
        hourDayMap['_punch'][hdKey] = (hourDayMap['_punch'][hdKey] || 0) + 1;

        // Per-user tracking
        const userName = msg.from || msg.from_id || 'Unknown';
        usersSet[userName] = true;

        if (!userDayMsgs[dateStr]) userDayMsgs[dateStr] = {};
        userDayMsgs[dateStr][userName] = (userDayMsgs[dateStr][userName] || 0) + 1;

        // Timeline for response time (store timestamp as ISO string for compactness)
        msgTimeline.push({ from: userName, ts: msg.date });

        if (!content.trim()) continue;

        const rawWords = content.trim().split(/\\s+/).length;
        hourDayMap[dateStr].words += rawWords;

        // Per-user word tracking
        let cleaned = content.toLowerCase();
        cleaned = cleaned.replace(URL_RE, ' ');
        cleaned = cleaned.replace(PUNCT_RE, ' ');
        cleaned = cleaned.replace(MULTI_SPACE, ' ').trim();
        if (!cleaned) continue;

        const words = cleaned.split(' ');

        if (!dayMap[dateStr]) dayMap[dateStr] = {};
        const dayWords = dayMap[dateStr];

        if (!userWords[userName]) userWords[userName] = {};
        const uw = userWords[userName];
        if (!userBigrams[userName]) userBigrams[userName] = {};
        const ub = userBigrams[userName];

        const msgTok = [];
        for (let w = 0; w < words.length; w++) {
            const word = words[w];
            if (word.length < 2) continue;
            dayWords[word] = (dayWords[word] || 0) + 1;
            uw[word] = (uw[word] || 0) + 1;
            msgTok.push(word);

            // First time this word appears in the whole chat -> initiator
            if (!wordFirst[word]) wordFirst[word] = { user: userName, ts: msg.date };

            // Bigram: current -> next
            if (w < words.length - 1) {
                const next = words[w + 1];
                if (next.length < 2) continue;
                if (!ub[word]) ub[word] = {};
                ub[word][next] = (ub[word][next] || 0) + 1;
            }
        }
        if (msgTok.length) msgTokens.push({ u: userName, t: msgTok });
    }

    const users = Object.keys(usersSet);

    self.postMessage({ type:'progress', value: 1 });
    self.postMessage({ type:'done', data: {
        chatName, dayMap, hourDayMap, minDate, maxDate, totalMessages,
        userDayMsgs, userWords, userBigrams, msgTimeline, users, msgTokens, wordFirst
    }});
};
`;
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        const worker = new Worker(url);

        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');

        worker.onmessage = (e) => {
            const msg = e.data;
            if (msg.type === 'progress') {
                const pct = Math.round(50 + msg.value * 50);
                progressFill.style.width = pct + '%';
                progressText.textContent = pct + '%';
            } else if (msg.type === 'done') {
                worker.terminate();
                URL.revokeObjectURL(url);
                parsedData = msg.data;
                goToModeSelection();
            } else if (msg.type === 'error') {
                worker.terminate();
                URL.revokeObjectURL(url);
                alert(msg.message);
                resetUpload();
            }
        };
        worker.onerror = (err) => { worker.terminate(); URL.revokeObjectURL(url); alert('Worker error: ' + err.message); resetUpload(); };
        worker.postMessage(text);
    }

    function resetUpload() {
        document.getElementById('drop-zone').classList.remove('hidden');
        document.getElementById('upload-loader').classList.add('hidden');
    }

    function goToModeSelection() {
        document.getElementById('mode-chat-name').textContent = parsedData.chatName + ' - ' + parsedData.totalMessages.toLocaleString() + ' сообщений';
        showScreen('mode');
    }

    function showScreen(name) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        if (name === 'mode') {
            document.getElementById('mode-screen').classList.add('active');
        } else if (name === 'barchart') {
            document.getElementById('viz-barchart').classList.add('active');
        } else if (name === 'linerace') {
            document.getElementById('viz-linerace').classList.add('active');
        } else if (name === 'heatmap') {
            document.getElementById('viz-heatmap').classList.add('active');
        } else if (name === 'punchcard') {
            document.getElementById('viz-punchcard').classList.add('active');
        } else if (name === 'balance') {
            document.getElementById('viz-balance').classList.add('active');
        } else if (name === 'ngram') {
            document.getElementById('viz-ngram').classList.add('active');
        } else if (name === 'bubble') {
            document.getElementById('viz-bubble').classList.add('active');
        } else if (name === 'versus') {
            document.getElementById('viz-versus').classList.add('active');
        } else if (name === 'markov') {
            document.getElementById('viz-markov').classList.add('active');
        } else if (name === 'openwords') {
            document.getElementById('viz-openwords').classList.add('active');
        }
    }

    function goBack() {
        showScreen('mode');
    }

    return { init, goBack, showScreen };
})();
