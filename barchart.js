var BarchartModule = (function () {
    'use strict';

    // State
    let dayMap = {};
    let dateList = [];
    let currentIndex = 0;
    let isPlaying = false;
    let playTimer = null;
    let transitionSpeed = 200;
    let currentBars = [];
    let chatName = '';

    // Stop-words
    const DEFAULT_STOP_WORDS = [
        'не', 'ну', 'как', 'что', 'меня', 'мне', 'ты', 'это', 'на', 'но',
        'да', 'то', 'он', 'она', 'они', 'мы', 'вы', 'за', 'от', 'по',
        'из', 'до', 'же', 'ли', 'бы', 'так', 'все', 'вот', 'ещё', 'еще',
        'уже', 'тут', 'там', 'тоже', 'если', 'или', 'ни', 'ой', 'ах',
        'вс', 'ок', 'нет', 'для', 'при', 'без', 'под', 'над',
        'про', 'его', 'её', 'ее', 'их', 'ей', 'ему', 'им', 'ним',
        'чем', 'кто', 'где', 'когда', 'чтобы', 'потому', 'только',
        'очень', 'просто', 'может', 'надо', 'тебе', 'тебя', 'себя',
        'себе', 'этот', 'эта', 'эти', 'этого', 'этой', 'этих',
        'был', 'была', 'было', 'были', 'быть', 'есть', 'будет',
        'будут', 'буду', 'будем', 'будешь', 'будете', 'вообще',
        'даже', 'ещё', 'еще', 'нибудь', 'какой', 'какая', 'какие',
        'такой', 'такая', 'такие', 'который', 'которая', 'которые',
        'потом', 'тогда', 'сейчас', 'здесь', 'туда', 'сюда'
    ];

    let stopWordsSet = new Set(loadSetting('stopWords', DEFAULT_STOP_WORDS));
    let filterActive = loadSetting('filterActive', true);

    // Colors
    const COLORS = [
        '#6c63ff', '#ff6b6b', '#ffa502', '#ff9f43', '#ee5a24',
        '#f368e0', '#a55eea', '#5f27cd', '#0abde3', '#48dbfb',
        '#00d2d3', '#10ac84', '#01a3a4', '#2ed573', '#7bed9f',
        '#ffc048', '#ff6348', '#ff4757', '#3742fa', '#1e90ff',
        '#70a1ff', '#5352ed', '#c0392b', '#e17055', '#fdcb6e',
        '#00cec9', '#55efc4', '#74b9ff', '#a29bfe', '#fd79a8'
    ];
    const wordColorMap = {};
    let colorIndex = 0;

    function getWordColor(word) {
        if (!wordColorMap[word]) {
            wordColorMap[word] = COLORS[colorIndex % COLORS.length];
            colorIndex++;
        }
        return wordColorMap[word];
    }

    // LocalStorage helpers
    function loadSetting(key, defaultVal) {
        try {
            const v = localStorage.getItem('bcr_' + key);
            if (v === null) return defaultVal;
            return JSON.parse(v);
        } catch { return defaultVal; }
    }

    function saveSetting(key, val) {
        try { localStorage.setItem('bcr_' + key, JSON.stringify(val)); } catch {}
    }

    // DOM refs (set after init)
    let els = {};

    function init(data) {
        dayMap = data.dayMap;
        chatName = data.chatName;
        dateList = buildDateRange(data.minDate, data.maxDate);
        currentIndex = 0;
        currentBars = [];

        renderDOM();
        bindEvents();
        renderChart();
    }

    function renderDOM() {
        const screen = document.getElementById('viz-barchart');
        const savedWindow = loadSetting('windowSize', 7);
        const savedTopN = loadSetting('topN', 15);
        const savedSpeed = loadSetting('speed', 500);

        screen.innerHTML = `
            <header class="toolbar">
                <div style="display:flex;align-items:center;gap:0.6rem">
                    <button class="ctrl-btn back-btn" id="bc-back">← Назад</button>
                    <h2 id="bc-title">${escapeHtml(chatName)}</h2>
                </div>
                <div class="toolbar-right">
                    <div class="control-group">
                        <label>Окно:</label>
                        <select id="bc-window">
                            ${[1,3,7,14,30,60,90].map(d => `<option value="${d}" ${d==savedWindow?'selected':''}>${d}д</option>`).join('')}
                        </select>
                    </div>
                    <div class="control-group">
                        <label>ТОП:</label>
                        <input type="number" id="bc-topn" value="${savedTopN}" min="3" max="50">
                    </div>
                    <div class="control-group">
                        <label>Скорость:</label>
                        <input type="range" id="bc-speed" min="30" max="2000" value="${savedSpeed}" step="10">
                        <span id="bc-speed-val">${savedSpeed}</span>
                    </div>
                    <button class="ctrl-btn" id="bc-filter-btn" title="Фильтр">⚙</button>
                    <button class="ctrl-btn" id="bc-export-btn" title="Экспорт видео" style="color:#ff6b6b">⏺</button>
                </div>
            </header>
            <div class="main-content">
                <div id="bc-chart" class="chart-container"></div>
                <div id="bc-date" class="current-date"></div>
            </div>
            <footer class="timeline-bar">
                <div class="playback-controls">
                    <button class="ctrl-btn" id="bc-prev">⏮</button>
                    <button class="ctrl-btn" id="bc-play">▶</button>
                    <button class="ctrl-btn" id="bc-next">⏭</button>
                </div>
                <div class="timeline-wrapper">
                    <span class="timeline-label" id="bc-date-start"></span>
                    <input type="range" id="bc-timeline" min="0" max="${dateList.length-1}" value="0" step="1">
                    <span class="timeline-label" id="bc-date-end"></span>
                </div>
            </footer>

            <!-- Filter Modal -->
            <div id="bc-filter-modal" class="modal hidden">
                <div class="modal-backdrop"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Фильтр стоп-слов</h3>
                        <button class="modal-close" id="bc-filter-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="filter-toggle">
                            <label class="toggle-label">
                                <input type="checkbox" id="bc-filter-enabled" ${filterActive?'checked':''}>
                                <span>Включить фильтрацию</span>
                            </label>
                        </div>
                        <p class="filter-hint">Слова через запятую или по строкам:</p>
                        <textarea id="bc-filter-words" rows="8">${Array.from(stopWordsSet).join(', ')}</textarea>
                    </div>
                    <div class="modal-footer">
                        <button class="upload-btn" id="bc-filter-apply">Применить</button>
                    </div>
                </div>
            </div>

            <!-- Export Modal -->
            <div id="bc-export-modal" class="modal hidden">
                <div class="modal-backdrop"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Экспорт видео</h3>
                        <button class="modal-close" id="bc-export-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="control-group export-group">
                            <label>Разрешение:</label>
                            <select id="bc-export-res">
                                <option value="1280x720">1280×720</option>
                                <option value="1920x1080" selected>1920×1080</option>
                            </select>
                        </div>
                        <div class="control-group export-group">
                            <label>FPS:</label>
                            <select id="bc-export-fps">
                                <option value="24">24</option>
                                <option value="30" selected>30</option>
                                <option value="60">60</option>
                            </select>
                        </div>
                        <p class="filter-hint" id="bc-export-info"></p>
                        <div id="bc-export-progress" class="hidden">
                            <div class="progress-bar"><div id="bc-export-fill" class="progress-fill"></div></div>
                            <p id="bc-export-pct" class="progress-text">0%</p>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="upload-btn" id="bc-export-start">Начать запись</button>
                        <button class="btn-cancel hidden" id="bc-export-cancel">Отмена</button>
                    </div>
                </div>
            </div>
        `;

        // Cache elements
        els = {
            chart: document.getElementById('bc-chart'),
            date: document.getElementById('bc-date'),
            timeline: document.getElementById('bc-timeline'),
            dateStart: document.getElementById('bc-date-start'),
            dateEnd: document.getElementById('bc-date-end'),
            play: document.getElementById('bc-play'),
            prev: document.getElementById('bc-prev'),
            next: document.getElementById('bc-next'),
            window: document.getElementById('bc-window'),
            topn: document.getElementById('bc-topn'),
            speed: document.getElementById('bc-speed'),
            speedVal: document.getElementById('bc-speed-val'),
        };

        els.dateStart.textContent = formatDate(dateList[0]);
        els.dateEnd.textContent = formatDate(dateList[dateList.length - 1]);
    }

    function bindEvents() {
        // Back
        document.getElementById('bc-back').addEventListener('click', () => { pause(); UploadModule.goBack(); });

        // Timeline
        els.timeline.addEventListener('input', () => { currentIndex = parseInt(els.timeline.value, 10); renderChart(); });

        // Playback
        els.play.addEventListener('click', togglePlay);
        els.prev.addEventListener('click', () => { if (currentIndex > 0) { currentIndex--; renderChart(); } });
        els.next.addEventListener('click', () => { if (currentIndex < dateList.length - 1) { currentIndex++; renderChart(); } });

        // Settings
        els.speed.addEventListener('input', () => {
            els.speedVal.textContent = els.speed.value;
            saveSetting('speed', parseInt(els.speed.value, 10));
            updateTransitionSpeed();
        });
        els.window.addEventListener('change', () => { saveSetting('windowSize', parseInt(els.window.value, 10)); renderChart(); });
        els.topn.addEventListener('change', () => { saveSetting('topN', parseInt(els.topn.value, 10)); renderChart(); });

        updateTransitionSpeed();

        // Filter modal
        const filterModal = document.getElementById('bc-filter-modal');
        document.getElementById('bc-filter-btn').addEventListener('click', () => filterModal.classList.remove('hidden'));
        document.getElementById('bc-filter-close').addEventListener('click', () => filterModal.classList.add('hidden'));
        filterModal.querySelector('.modal-backdrop').addEventListener('click', () => filterModal.classList.add('hidden'));
        document.getElementById('bc-filter-apply').addEventListener('click', () => {
            const text = document.getElementById('bc-filter-words').value.toLowerCase();
            const words = text.split(/[,;\n]+/).map(w => w.trim()).filter(w => w.length > 0);
            stopWordsSet = new Set(words);
            filterActive = document.getElementById('bc-filter-enabled').checked;
            saveSetting('stopWords', words);
            saveSetting('filterActive', filterActive);
            filterModal.classList.add('hidden');
            renderChart();
        });
        document.getElementById('bc-filter-enabled').addEventListener('change', (e) => {
            filterActive = e.target.checked;
            saveSetting('filterActive', filterActive);
            renderChart();
        });

        // Export modal
        const exportModal = document.getElementById('bc-export-modal');
        document.getElementById('bc-export-btn').addEventListener('click', () => {
            document.getElementById('bc-export-info').textContent = `Запись от кадра ${currentIndex} до ${dateList.length-1} (${dateList.length-1-currentIndex} шагов)`;
            exportModal.classList.remove('hidden');
        });
        document.getElementById('bc-export-close').addEventListener('click', () => { if (!isExporting) exportModal.classList.add('hidden'); });
        exportModal.querySelector('.modal-backdrop').addEventListener('click', () => { if (!isExporting) exportModal.classList.add('hidden'); });
        document.getElementById('bc-export-start').addEventListener('click', startExport);
        document.getElementById('bc-export-cancel').addEventListener('click', () => { exportCancelled = true; });

        // Keyboard
        document.addEventListener('keydown', handleKey);

        // Resize
        window.addEventListener('resize', () => {
            if (document.getElementById('viz-barchart').classList.contains('active')) renderChart();
        });
    }

    function handleKey(e) {
        if (!document.getElementById('viz-barchart').classList.contains('active')) return;
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
        if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
        else if (e.code === 'ArrowLeft') { e.preventDefault(); if (currentIndex > 0) { currentIndex--; renderChart(); } }
        else if (e.code === 'ArrowRight') { e.preventDefault(); if (currentIndex < dateList.length - 1) { currentIndex++; renderChart(); } }
    }

    function updateTransitionSpeed() {
        const speed = parseInt(els.speed.value, 10);
        transitionSpeed = Math.min(speed * 0.4, 300);
        document.documentElement.style.setProperty('--transition-speed', transitionSpeed + 'ms');
    }

    // Playback
    function togglePlay() { isPlaying ? pause() : play(); }

    function play() {
        isPlaying = true;
        els.play.textContent = '⏸';
        els.play.classList.add('active');
        scheduleNext();
    }

    function pause() {
        isPlaying = false;
        els.play.textContent = '▶';
        els.play.classList.remove('active');
        if (playTimer) { clearTimeout(playTimer); playTimer = null; }
    }

    function scheduleNext() {
        if (!isPlaying) return;
        const speed = parseInt(els.speed.value, 10);
        playTimer = setTimeout(() => {
            if (currentIndex < dateList.length - 1) { currentIndex++; renderChart(); scheduleNext(); }
            else pause();
        }, speed);
    }

    // Data
    function getTopWords(idx) {
        const windowSize = parseInt(els.window.value, 10);
        const topN = parseInt(els.topn.value, 10) || 15;
        const startIdx = Math.max(0, idx - windowSize + 1);

        const agg = {};
        for (let i = startIdx; i <= idx; i++) {
            const day = dateList[i];
            const words = dayMap[day];
            if (!words) continue;
            for (const word in words) {
                if (filterActive && stopWordsSet.has(word)) continue;
                agg[word] = (agg[word] || 0) + words[word];
            }
        }

        return Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, topN);
    }

    // Render
    function renderChart() {
        const topWords = getTopWords(currentIndex);
        const topN = parseInt(els.topn.value, 10) || 15;
        const dateStr = dateList[currentIndex];

        els.date.textContent = formatDate(dateStr);

        const containerHeight = els.chart.clientHeight;
        const GAP = 4;
        const barHeight = Math.max(14, Math.min(40, Math.floor((containerHeight - GAP * topN) / topN)));
        const totalBarHeight = barHeight + GAP;

        const maxCount = topWords.length > 0 ? topWords[0][1] : 1;

        const existingMap = {};
        currentBars.forEach(bar => { existingMap[bar.dataset.word] = bar; });

        const newBarSet = new Set();
        const newBarsArr = [];

        topWords.forEach(([word, count], index) => {
            newBarSet.add(word);
            const topPos = index * totalBarHeight;
            const widthPct = (count / maxCount) * 100;
            const color = getWordColor(word);

            let barEl = existingMap[word];
            if (barEl) {
                barEl.style.top = topPos + 'px';
                barEl.style.height = barHeight + 'px';
                barEl.style.opacity = '1';
                const fill = barEl.querySelector('.bar-fill');
                fill.style.width = widthPct + '%';
                fill.style.background = color;
                fill.style.height = barHeight + 'px';
                fill.querySelector('.bar-value').textContent = count.toLocaleString();
                barEl.querySelector('.bar-label').textContent = word;
            } else {
                barEl = document.createElement('div');
                barEl.className = 'bar-row';
                barEl.dataset.word = word;
                barEl.style.top = topPos + 'px';
                barEl.style.height = barHeight + 'px';
                barEl.style.opacity = '0';
                barEl.innerHTML = `
                    <span class="bar-label">${escapeHtml(word)}</span>
                    <div class="bar-track">
                        <div class="bar-fill" style="width:${widthPct}%;background:${color};height:${barHeight}px">
                            <span class="bar-value">${count.toLocaleString()}</span>
                        </div>
                    </div>
                `;
                els.chart.appendChild(barEl);
                barEl.offsetHeight;
                barEl.style.opacity = '1';
            }
            newBarsArr.push(barEl);
        });

        currentBars.forEach(bar => {
            if (!newBarSet.has(bar.dataset.word)) {
                bar.style.opacity = '0';
                setTimeout(() => { if (bar.parentNode) bar.parentNode.removeChild(bar); }, transitionSpeed);
            }
        });

        currentBars = newBarsArr;
        els.timeline.value = currentIndex;
    }

    // Export
    let isExporting = false;
    let exportCancelled = false;

    async function startExport() {
        if (isExporting) return;
        isExporting = true;
        exportCancelled = false;

        const startBtn = document.getElementById('bc-export-start');
        const cancelBtn = document.getElementById('bc-export-cancel');
        const progressDiv = document.getElementById('bc-export-progress');
        const fillEl = document.getElementById('bc-export-fill');
        const pctEl = document.getElementById('bc-export-pct');

        startBtn.classList.add('hidden');
        cancelBtn.classList.remove('hidden');
        progressDiv.classList.remove('hidden');
        fillEl.style.width = '0%';
        pctEl.textContent = '0%';

        const [w, h] = document.getElementById('bc-export-res').value.split('x').map(Number);
        const fps = parseInt(document.getElementById('bc-export-fps').value, 10);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');

        const stream = canvas.captureStream(fps);
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
        const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8000000 });
        const chunks = [];

        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'bar_chart_race.webm';
            a.click();
            URL.revokeObjectURL(url);
            finishExport();
        };

        recorder.start();

        const startFrame = currentIndex;
        const totalFrames = dateList.length - 1 - startFrame;
        const frameDuration = 1000 / fps;
        const stepDuration = parseInt(els.speed.value, 10);
        const framesPerStep = Math.max(1, Math.round(stepDuration / frameDuration));

        for (let i = startFrame; i <= dateList.length - 1; i++) {
            if (exportCancelled) break;

            drawFrameToCanvas(ctx, w, h, i);

            for (let f = 0; f < framesPerStep; f++) {
                await yieldFrame();
            }

            const progress = totalFrames > 0 ? Math.round(((i - startFrame) / totalFrames) * 100) : 100;
            fillEl.style.width = progress + '%';
            pctEl.textContent = progress + '%';
        }

        currentIndex = Math.min(dateList.length - 1, currentIndex);
        renderChart();
        recorder.stop();
    }

    function yieldFrame() { return new Promise(resolve => requestAnimationFrame(resolve)); }

    function drawFrameToCanvas(ctx, w, h, frameIndex) {
        const topN = parseInt(els.topn.value, 10) || 15;
        const topWords = getTopWords(frameIndex);
        const dateStr = dateList[frameIndex];

        ctx.fillStyle = '#12100e';
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.font = `bold ${Math.round(h * 0.06)}px Inter, Segoe UI, sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(formatDate(dateStr), w - 40, 30);

        if (topWords.length === 0) return;

        const maxCount = topWords[0][1];
        const padding = 40;
        const labelWidth = Math.round(w * 0.1);
        const barAreaWidth = w - labelWidth - padding * 2 - 20;
        const gap = 5;
        const barHeight = Math.max(14, Math.floor((h - padding * 2 - 60 - gap * topN) / topN));
        const totalBarH = barHeight + gap;
        const startY = padding + 60;

        ctx.textBaseline = 'middle';

        topWords.forEach(([word, count], idx) => {
            const y = startY + idx * totalBarH;
            const barW = Math.max(30, (count / maxCount) * barAreaWidth);
            const color = getWordColor(word);

            ctx.fillStyle = '#ece5da';
            ctx.font = `500 ${Math.round(barHeight * 0.55)}px Inter, Segoe UI, sans-serif`;
            ctx.textAlign = 'right';
            ctx.fillText(word, labelWidth + padding - 10, y + barHeight / 2);

            ctx.fillStyle = color;
            const barX = labelWidth + padding;
            ctx.beginPath();
            ctx.roundRect(barX, y, barW, barHeight, 4);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.font = `600 ${Math.round(barHeight * 0.48)}px Inter, Segoe UI, sans-serif`;
            ctx.textAlign = 'right';
            ctx.fillText(count.toLocaleString(), barX + barW - 8, y + barHeight / 2);
        });
    }

    function finishExport() {
        isExporting = false;
        exportCancelled = false;
        document.getElementById('bc-export-start').classList.remove('hidden');
        document.getElementById('bc-export-cancel').classList.add('hidden');
        document.getElementById('bc-export-progress').classList.add('hidden');
        document.getElementById('bc-export-modal').classList.add('hidden');
    }

    // Helpers
    function buildDateRange(minDate, maxDate) {
        const dates = [];
        const start = new Date(minDate + 'T00:00:00');
        const end = new Date(maxDate + 'T00:00:00');
        const cur = new Date(start);
        while (cur <= end) {
            dates.push(cur.toISOString().substring(0, 10));
            cur.setDate(cur.getDate() + 1);
        }
        return dates;
    }

    function formatDate(dateStr) {
        const p = dateStr.split('-');
        return p[2] + '.' + p[1] + '.' + p[0];
    }

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    return { init };
})();
