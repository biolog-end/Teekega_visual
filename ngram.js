var NgramModule = (function () {
    'use strict';

    let data = null;
    let periodList = []; // current list of period keys
    let periodLabels = []; // human-readable labels for periods
    let canvas, ctx;
    let lastSeries = null;
    let lastWords = null;
    let tooltip = null;
    let chartGeom = null; // { padTop, padLeft, padRight, padBottom, chartW, chartH, cssW, cssH }
    let currentGranularity = 'month'; // 'day' | 'week' | 'month' | 'quarter'

    // Up to 10 distinct line colours
    const COLORS = ['#6c63ff', '#ff6b6b', '#ffa502', '#2ed573', '#0abde3',
                    '#e056fd', '#ff7f50', '#7bed9f', '#eccc68', '#48dbfb'];
    const MAX_WORDS = 10;

    // Default Russian/short stop-words filtered out of "before/after/together" ratings
    // so the lists show meaningful neighbours instead of particles & prepositions.
    const DEFAULT_STOP_WORDS = [
        'и','в','во','не','на','я','что','он','с','со','как','а','то','все','она','так',
        'его','но','да','ты','к','у','же','вы','за','бы','по','только','ее','мне','было',
        'вот','от','меня','еще','нет','о','из','ему','теперь','когда','даже','ну','вдруг',
        'ли','если','уже','или','ни','быть','был','него','до','вас','нибудь','опять','уж',
        'вам','ведь','там','потом','себя','ничего','ей','может','они','тут','где','есть',
        'надо','ней','для','мы','тебя','их','чем','была','сам','чтоб','без','будто','чего',
        'раз','тоже','себе','под','будет','ж','тогда','кто','этот','того','потому','этого',
        'какой','совсем','ним','здесь','этом','один','почти','мой','тем','чтобы','нее','были',
        'куда','зачем','всех','никогда','можно','при','наконец','два','об','другой','хоть',
        'после','над','больше','тот','через','эти','нас','про','всего','них','какая','много',
        'разве','эту','моя','свою','этой','перед','иногда','лучше','чуть','том','нельзя',
        'такой','им','более','всегда','конечно','всю','между','это','эта','той','ту',
        'те','этих','этим','оно','её','мои','наш','ваш','свой','лишь','ага','хм',
        'оо','эээ','ммм'
    ];

    let stopWords = new Set(DEFAULT_STOP_WORDS);
    let stopEnabled = true;

    function isStop(w) { return w.length < 2 || (stopEnabled && stopWords.has(w)); }

    function init(d) {
        data = d;

        const screen = document.getElementById('viz-ngram');
        screen.innerHTML = `
            <div class="toolbar">
                <button class="ctrl-btn back-btn" id="ngram-back">← Назад</button>
                <h2>Ngram трекер - ${esc(d.chatName)}</h2>
                <div class="toolbar-right">
                    <div class="control-group">
                        <label>Разбивка:</label>
                        <select id="ngram-granularity">
                            <option value="day">По дням</option>
                            <option value="week">По неделям</option>
                            <option value="month" selected>По месяцам</option>
                            <option value="quarter">По кварталам</option>
                        </select>
                    </div>
                    <button class="ctrl-btn ngram-hype-open" id="ngram-hype-btn">📡 Радар хайпа</button>
                </div>
            </div>
            <div class="ngram-container">
                <div class="ngram-search">
                    <input type="text" id="ngram-input" placeholder="Введите слова через запятую (до 10, напр: привет, пока)" autocomplete="off">
                    <button class="upload-btn" id="ngram-go">Показать</button>
                </div>
                <div class="ngram-options">
                    <label class="toggle-label">
                        <input type="checkbox" id="ngram-stop-toggle" checked>
                        Фильтровать стоп-слова
                    </label>
                    <button class="ctrl-btn" id="ngram-stop-edit">✎ Редактировать стоп-слова</button>
                </div>
                <div class="ngram-stop-editor hidden" id="ngram-stop-editor">
                    <p class="filter-hint">Стоп-слова (через пробел, запятую или с новой строки) - не попадают в рейтинги соседей:</p>
                    <textarea id="ngram-stop-text" rows="5" spellcheck="false"></textarea>
                    <div class="ngram-stop-actions">
                        <button class="upload-btn" id="ngram-stop-save">Сохранить</button>
                        <button class="ctrl-btn" id="ngram-stop-reset">Сбросить по умолчанию</button>
                    </div>
                </div>
                <div class="ngram-info" id="ngram-info"></div>
                <div class="ngram-chart-wrap" id="ngram-chart-wrap">
                    <button class="ngram-fs-btn" id="ngram-fs-btn" title="Открыть на весь экран">⛶</button>
                    <canvas id="ngram-canvas"></canvas>
                    <div class="ngram-crosshair" id="ngram-crosshair"></div>
                </div>
                <div class="heatmap-tooltip" id="ngram-tooltip"></div>
                <div class="ngram-details" id="ngram-details"></div>
            </div>

            <div class="hype-modal hidden" id="hype-modal">
                <div class="hype-modal-inner">
                    <div class="hype-modal-header">
                        <h3>📡 Радар хайпа</h3>
                        <button class="modal-close" id="hype-close" title="Закрыть">✕</button>
                    </div>
                    <p class="hype-desc">Ищет слова, которые в какой-то момент начали употребляться <b>намного чаще</b> (или реже) обычного. Новые слова, вспыхнувшие из нуля, помечены <span class="hype-tag-new">🆕 новое</span>.</p>
                    <div class="hype-settings">
                        <div class="control-group">
                            <label>Режим:</label>
                            <select id="hype-mode">
                                <option value="rise" selected>📈 Хайп (резкий рост)</option>
                                <option value="fall">📉 Падение (резкий спад)</option>
                            </select>
                        </div>
                        <div class="control-group">
                            <label>Разбивка:</label>
                            <select id="hype-gran">
                                <option value="day">По дням</option>
                                <option value="week" selected>По неделям</option>
                                <option value="month">По месяцам</option>
                                <option value="quarter">По кварталам</option>
                            </select>
                        </div>
                        <div class="control-group">
                            <label title="Сколько периодов до пика берём как «норму»">Окно сравнения:</label>
                            <input type="number" id="hype-window" min="1" max="24" value="4">
                        </div>
                        <div class="control-group">
                            <label title="Во сколько раз пик должен превышать норму">Порог (×):</label>
                            <input type="number" id="hype-threshold" min="1.2" step="0.5" value="4">
                        </div>
                        <div class="control-group">
                            <label title="Минимум упоминаний слова на пике">Мин. на пике:</label>
                            <input type="number" id="hype-minpeak" min="1" value="4">
                        </div>
                        <div class="control-group">
                            <label title="Сколько всего раз слово должно встречаться за всю историю">Мин. всего:</label>
                            <input type="number" id="hype-mintotal" min="1" value="6">
                        </div>
                        <div class="control-group">
                            <label>Показать:</label>
                            <input type="number" id="hype-limit" min="5" max="200" value="40">
                        </div>
                        <div class="control-group">
                            <label title="Слово должно встречаться хотя бы в стольких периодах - отсекает случайные всплески «один раз и всё»">Мин. активных периодов:</label>
                            <input type="number" id="hype-minactive" min="1" max="50" value="2">
                        </div>
                        <div class="control-group">
                            <label title="Как обходиться со словами, вспыхнувшими из нуля (часто это просто слова с первого месяца)">Новые слова:</label>
                            <select id="hype-newmode">
                                <option value="include" selected>Учитывать</option>
                                <option value="only">Только новые</option>
                                <option value="exclude">Исключить</option>
                            </select>
                        </div>
                        <label class="toggle-label">
                            <input type="checkbox" id="hype-usestop" checked>
                            Фильтровать стоп-слова
                        </label>
                        <button class="upload-btn" id="hype-scan">Сканировать</button>
                    </div>
                    <div class="hype-results" id="hype-results">
                        <p class="hype-empty">Настройте параметры и нажмите «Сканировать».</p>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('ngram-back').addEventListener('click', () => UploadModule.goBack());
        document.getElementById('ngram-go').addEventListener('click', doSearch);
        document.getElementById('ngram-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
        document.getElementById('ngram-granularity').addEventListener('change', (e) => {
            currentGranularity = e.target.value;
            buildPeriods();
            doSearch();
        });

        // Stop-word controls
        const stopToggle = document.getElementById('ngram-stop-toggle');
        const stopEditBtn = document.getElementById('ngram-stop-edit');
        const stopEditor = document.getElementById('ngram-stop-editor');
        const stopText = document.getElementById('ngram-stop-text');

        stopToggle.addEventListener('change', (e) => {
            stopEnabled = e.target.checked;
            doSearch();
        });
        stopEditBtn.addEventListener('click', () => {
            stopEditor.classList.toggle('hidden');
            if (!stopEditor.classList.contains('hidden')) {
                stopText.value = Array.from(stopWords).join(' ');
            }
        });
        document.getElementById('ngram-stop-save').addEventListener('click', () => {
            const parts = stopText.value.toLowerCase().split(/[\s,;]+/).map(w => w.trim()).filter(Boolean);
            stopWords = new Set(parts);
            stopEditor.classList.add('hidden');
            doSearch();
        });
        document.getElementById('ngram-stop-reset').addEventListener('click', () => {
            stopWords = new Set(DEFAULT_STOP_WORDS);
            stopText.value = Array.from(stopWords).join(' ');
            doSearch();
        });

        canvas = document.getElementById('ngram-canvas');
        ctx = canvas.getContext('2d');
        tooltip = document.getElementById('ngram-tooltip');

        canvas.addEventListener('mousemove', onCanvasMouseMove);
        canvas.addEventListener('mouseleave', () => {
            if (tooltip) tooltip.classList.remove('visible');
            const ch = document.getElementById('ngram-crosshair');
            if (ch) ch.style.opacity = '0';
        });

        // Fullscreen toggle for the chart
        document.getElementById('ngram-fs-btn').addEventListener('click', toggleFullscreen);

        // Hype radar modal
        const hypeModal = document.getElementById('hype-modal');
        document.getElementById('ngram-hype-btn').addEventListener('click', () => {
            hypeModal.classList.remove('hidden');
        });
        document.getElementById('hype-close').addEventListener('click', () => {
            hypeModal.classList.add('hidden');
        });
        hypeModal.addEventListener('click', (e) => {
            if (e.target === hypeModal) hypeModal.classList.add('hidden');
        });
        document.getElementById('hype-scan').addEventListener('click', scanHype);

        // ESC closes modal / exits fullscreen
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (!hypeModal.classList.contains('hidden')) {
                hypeModal.classList.add('hidden');
            } else if (isFullscreen) {
                toggleFullscreen();
            }
        });

        buildPeriods();
    }

    let isFullscreen = false;
    function toggleFullscreen() {
        const wrap = document.getElementById('ngram-chart-wrap');
        const btn = document.getElementById('ngram-fs-btn');
        isFullscreen = !isFullscreen;
        wrap.classList.toggle('fullscreen', isFullscreen);
        document.body.classList.toggle('ngram-fs-active', isFullscreen);
        btn.textContent = isFullscreen ? '✕' : '⛶';
        btn.title = isFullscreen ? 'Закрыть полноэкранный режим' : 'Открыть на весь экран';
        // Redraw to fit new dimensions
        if (lastWords && lastSeries) {
            requestAnimationFrame(() => drawChart(lastWords, lastSeries));
        }
    }

    // === Period builders ===
    function buildPeriods() {
        switch (currentGranularity) {
            case 'day': buildDayList(); break;
            case 'week': buildWeekList(); break;
            case 'month': buildMonthList(); break;
            case 'quarter': buildQuarterList(); break;
            default: buildMonthList();
        }
    }

    function buildDayList() {
        periodList = [];
        periodLabels = [];
        const allDates = Object.keys(data.dayMap).filter(d => !d.startsWith('_')).sort();
        if (allDates.length === 0) return;

        const start = new Date(allDates[0] + 'T00:00:00');
        const end = new Date(allDates[allDates.length - 1] + 'T00:00:00');
        const cur = new Date(start);

        const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
        while (cur <= end) {
            const key = cur.toISOString().substring(0, 10);
            periodList.push(key);
            periodLabels.push(cur.getDate() + ' ' + months[cur.getMonth()]);
            cur.setDate(cur.getDate() + 1);
        }
    }

    function buildWeekList() {
        periodList = [];
        periodLabels = [];
        const allDates = Object.keys(data.dayMap).filter(d => !d.startsWith('_')).sort();
        if (allDates.length === 0) return;

        const start = new Date(allDates[0] + 'T00:00:00');
        const end = new Date(allDates[allDates.length - 1] + 'T00:00:00');

        // Align to Monday
        const cur = new Date(start);
        const dayOfWeek = cur.getDay();
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        cur.setDate(cur.getDate() + diff);

        const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
        while (cur <= end) {
            const key = cur.toISOString().substring(0, 10);
            periodList.push(key);
            periodLabels.push(cur.getDate() + ' ' + months[cur.getMonth()]);
            cur.setDate(cur.getDate() + 7);
        }
    }

    function buildMonthList() {
        periodList = [];
        periodLabels = [];
        const [sy, sm] = data.minDate.substring(0, 7).split('-').map(Number);
        const [ey, em] = data.maxDate.substring(0, 7).split('-').map(Number);
        let y = sy, m = sm;
        const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
        while (y < ey || (y === ey && m <= em)) {
            const key = y + '-' + String(m).padStart(2, '0');
            periodList.push(key);
            periodLabels.push(months[m - 1] + ' ' + y);
            m++;
            if (m > 12) { m = 1; y++; }
        }
    }

    function buildQuarterList() {
        periodList = [];
        periodLabels = [];
        const [sy, sm] = data.minDate.substring(0, 7).split('-').map(Number);
        const [ey, em] = data.maxDate.substring(0, 7).split('-').map(Number);
        let y = sy, q = Math.ceil(sm / 3);
        const endQ = Math.ceil(em / 3);
        while (y < ey || (y === ey && q <= endQ)) {
            const key = y + '-Q' + q;
            periodList.push(key);
            periodLabels.push('Q' + q + ' ' + y);
            q++;
            if (q > 4) { q = 1; y++; }
        }
    }

    // === Map a date to its period index ===
    function dateToPeriodIdx(date) {
        switch (currentGranularity) {
            case 'day':
                return periodList.indexOf(date);
            case 'week': {
                const d = new Date(date + 'T00:00:00');
                const dayOfWeek = d.getDay();
                const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
                d.setDate(d.getDate() + diff);
                const weekKey = d.toISOString().substring(0, 10);
                return periodList.indexOf(weekKey);
            }
            case 'month':
                return periodList.indexOf(date.substring(0, 7));
            case 'quarter': {
                const parts = date.split('-');
                const yr = parseInt(parts[0]);
                const mo = parseInt(parts[1]);
                const qKey = yr + '-Q' + Math.ceil(mo / 3);
                return periodList.indexOf(qKey);
            }
            default:
                return -1;
        }
    }

    function doSearch() {
        const input = document.getElementById('ngram-input').value.toLowerCase().trim();
        if (!input) return;

        const words = input.split(/[,;]+/).map(w => w.trim()).filter(w => w.length > 0).slice(0, MAX_WORDS);
        if (words.length === 0) return;
        if (periodList.length === 0) return;

        // Compute frequency for each word per period
        const series = {};
        const before = {};   // word immediately to the LEFT
        const after = {};     // word immediately to the RIGHT
        const sameMsg = {};   // co-occurs in the SAME message
        const perUser = {};
        const wordSet = new Set(words);

        for (const w of words) {
            series[w] = new Array(periodList.length).fill(0);
            before[w] = {};
            after[w] = {};
            sameMsg[w] = {};
            perUser[w] = {};
        }

        // Iterate dayMap for the time series
        for (const date in data.dayMap) {
            if (date.startsWith('_')) continue;
            const idx = dateToPeriodIdx(date);
            if (idx < 0) continue;

            const dayWords = data.dayMap[date];
            for (const w of words) {
                if (dayWords[w]) {
                    series[w][idx] += dayWords[w];
                }
            }
        }

        // Per-user counts
        if (data.userWords) {
            for (const user in data.userWords) {
                const uw = data.userWords[user];
                for (const w of words) {
                    if (uw[w]) {
                        perUser[w][user] = (perUser[w][user] || 0) + uw[w];
                    }
                }
            }
        }

        // Real neighbours: scan per-message token streams.
        // - before/after: the word EXACTLY to the left / right
        // - sameMsg: any other word appearing in the same message (counted once per message)
        if (data.msgTokens) {
            for (let m = 0; m < data.msgTokens.length; m++) {
                const toks = data.msgTokens[m].t;

                // Adjacency pass (uses real positions)
                for (let i = 0; i < toks.length; i++) {
                    const tk = toks[i];
                    if (!wordSet.has(tk)) continue;
                    if (i > 0) {
                        const p = toks[i - 1];
                        if (p !== tk && !isStop(p)) before[tk][p] = (before[tk][p] || 0) + 1;
                    }
                    if (i < toks.length - 1) {
                        const nx = toks[i + 1];
                        if (nx !== tk && !isStop(nx)) after[tk][nx] = (after[tk][nx] || 0) + 1;
                    }
                }

                // Same-message pass (count each distinct neighbour once per message)
                let hasSearch = false;
                for (const w of words) { if (toks.indexOf(w) !== -1) { hasSearch = true; break; } }
                if (!hasSearch) continue;
                const uniq = new Set(toks);
                for (const w of words) {
                    if (!uniq.has(w)) continue;
                    for (const o of uniq) {
                        if (o === w || isStop(o)) continue;
                        sameMsg[w][o] = (sameMsg[w][o] || 0) + 1;
                    }
                }
            }
        }

        drawChart(words, series);
        lastSeries = series;
        lastWords = words;
        showDetails(words, series, before, after, sameMsg, perUser);
    }

    function drawChart(words, series) {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.parentElement.getBoundingClientRect();
        const W = rect.width;
        const H = Math.max(220, rect.height);
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const pad = { top: 30, right: 20, bottom: 50, left: 50 };

        // --- Lay out a wrapping legend first, so we know how much top space it needs ---
        ctx.font = '11px system-ui, sans-serif';
        const legendPos = [];
        let lx = pad.left, ly = 14, legendRows = 1;
        words.forEach((word, wi) => {
            const itemW = 16 + ctx.measureText(word).width + 16;
            if (lx + itemW > W - pad.right && lx > pad.left) {
                lx = pad.left; ly += 18; legendRows++;
            }
            legendPos.push({ x: lx, y: ly, word: word, color: COLORS[wi % COLORS.length] });
            lx += itemW;
        });
        pad.top = 14 + legendRows * 18 + 8;

        const chartW = W - pad.left - pad.right;
        const chartH = H - pad.top - pad.bottom;

        // Store geometry so the crosshair can match the real chart area
        chartGeom = {
            padTop: pad.top, padLeft: pad.left, padRight: pad.right, padBottom: pad.bottom,
            chartW: chartW, chartH: chartH, cssW: W, cssH: H
        };

        // Find max
        let maxVal = 1;
        for (const w in series) {
            for (const v of series[w]) {
                if (v > maxVal) maxVal = v;
            }
        }

        // Background
        ctx.fillStyle = '#12100e';
        ctx.fillRect(0, 0, W, H);

        // Grid
        ctx.strokeStyle = '#2a2a3a';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= 4; i++) {
            const y = pad.top + (chartH / 4) * i;
            ctx.beginPath();
            ctx.moveTo(pad.left, y);
            ctx.lineTo(W - pad.right, y);
            ctx.stroke();

            ctx.fillStyle = '#5e564d';
            ctx.font = '10px system-ui, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(Math.round(maxVal * (1 - i / 4)), pad.left - 6, y + 4);
        }

        // X labels
        const numLabels = Math.min(periodList.length, 14);
        const step = Math.max(1, Math.floor(periodList.length / numLabels));
        ctx.fillStyle = '#5e564d';
        ctx.font = '9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        for (let i = 0; i < periodList.length; i += step) {
            const x = pad.left + (i / Math.max(1, periodList.length - 1)) * chartW;
            ctx.fillText(periodLabels[i], x, H - pad.bottom + 16);
        }

        // Draw lines
        const n = periodList.length;
        words.forEach((word, wi) => {
            const vals = series[word];
            const color = COLORS[wi % COLORS.length];

            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.beginPath();

            for (let i = 0; i < n; i++) {
                const x = pad.left + (i / Math.max(1, n - 1)) * chartW;
                const y = pad.top + chartH - (vals[i] / maxVal) * chartH;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Label at end
            const lastVal = vals[n - 1];
            const lastX = W - pad.right + 4;
            const lastY = pad.top + chartH - (lastVal / maxVal) * chartH;
            ctx.fillStyle = color;
            ctx.font = 'bold 11px system-ui, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(word, lastX, lastY);
        });

        // Legend (wrapping, positions computed above)
        ctx.textAlign = 'left';
        ctx.font = '11px system-ui, sans-serif';
        legendPos.forEach(item => {
            ctx.fillStyle = item.color;
            ctx.fillRect(item.x, item.y - 10, 12, 12);
            ctx.fillStyle = '#ece5da';
            ctx.fillText(item.word, item.x + 16, item.y);
        });
    }

    function showDetails(words, series, before, after, sameMsg, perUser) {
        let html = '';

        words.forEach((word, wi) => {
            const color = COLORS[wi % COLORS.length];
            const total = series[word].reduce((a, b) => a + b, 0);

            const chips = (obj) => {
                const top = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, 12);
                if (top.length === 0) return '<span class="lex-empty">-</span>';
                return top.map(([w, c]) => `<span class="lex-word" style="border-color:${color}">${esc(w)} <small>${c}</small></span>`).join('');
            };

            // Initiator - who said the word first in the whole chat
            let initHtml = '<span class="lex-empty">нет данных</span>';
            const first = data.wordFirst && data.wordFirst[word];
            if (first) {
                initHtml = `<span class="ngram-initiator-user">${esc(first.user)}</span> <span class="ngram-initiator-date">${fmtDate(first.ts)}</span>`;
            }

            let userHtml = '';
            const userEntries = Object.entries(perUser[word] || {}).sort((a, b) => b[1] - a[1]);
            for (const [user, c] of userEntries) {
                userHtml += `<span class="ngram-user">${esc(user)}: ${c}</span> `;
            }

            html += `
                <div class="ngram-word-detail">
                    <h4 style="color:${color}">"${esc(word)}" - ${total} раз за всё время</h4>
                    <div class="ngram-initiator">👑 Инициатор: ${initHtml}</div>
                    <div class="ngram-users">${userHtml || 'Нет данных по пользователям'}</div>
                    <div class="ngram-neighbours">
                        <div class="ngram-neigh-col">
                            <p class="filter-hint">← Часто перед (слово слева)</p>
                            <div class="lex-words">${chips(before[word])}</div>
                        </div>
                        <div class="ngram-neigh-col">
                            <p class="filter-hint">Часто после (слово справа) →</p>
                            <div class="lex-words">${chips(after[word])}</div>
                        </div>
                        <div class="ngram-neigh-col">
                            <p class="filter-hint">⛶ Часто в одном сообщении</p>
                            <div class="lex-words">${chips(sameMsg[word])}</div>
                        </div>
                    </div>
                </div>
            `;
        });

        document.getElementById('ngram-details').innerHTML = html;
    }

    function fmtDate(ts) {
        if (!ts) return '';
        const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
        const d = new Date(ts);
        if (isNaN(d.getTime())) return esc(String(ts).substring(0, 10));
        return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
    }

    function onCanvasMouseMove(e) {
        if (!lastSeries || !lastWords || lastWords.length === 0) return;
        if (periodList.length < 2) return;
        if (!chartGeom) return;

        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;

        const padLeft = chartGeom.padLeft;
        const chartW = chartGeom.chartW;

        const crosshair = document.getElementById('ngram-crosshair');

        const relX = mx - padLeft;
        if (relX < 0 || relX > chartW) {
            tooltip.classList.remove('visible');
            if (crosshair) crosshair.style.opacity = '0';
            return;
        }

        const idx = Math.round((relX / chartW) * (periodList.length - 1));
        if (idx < 0 || idx >= periodList.length) {
            tooltip.classList.remove('visible');
            if (crosshair) crosshair.style.opacity = '0';
            return;
        }

        // Position crosshair at snapped X and make it span the full chart height
        const snappedX = padLeft + (idx / (periodList.length - 1)) * chartW;
        if (crosshair) {
            crosshair.style.left = snappedX + 'px';
            crosshair.style.top = chartGeom.padTop + 'px';
            crosshair.style.height = chartGeom.chartH + 'px';
            crosshair.style.bottom = 'auto';
            crosshair.style.opacity = '1';
        }

        const label = periodLabels[idx];

        let lines = `<strong>${label}</strong>`;
        for (let i = 0; i < lastWords.length; i++) {
            const w = lastWords[i];
            const val = lastSeries[w][idx] || 0;
            const color = COLORS[i % COLORS.length];
            lines += `<br><span style="color:${color}">●</span> ${esc(w)}: <strong>${val}</strong>`;
        }

        tooltip.innerHTML = lines;
        tooltip.classList.add('visible');
        tooltip.style.left = (e.clientX + 14) + 'px';
        tooltip.style.top = (e.clientY - 30) + 'px';
    }

    // ====================================================================
    // HYPE RADAR - detect words that suddenly spiked (or collapsed)
    // ====================================================================

    // Generic period key for a date string (YYYY-MM-DD) at a given granularity
    function periodKeyFor(date, gran) {
        switch (gran) {
            case 'day':
                return date;
            case 'week': {
                const d = new Date(date + 'T00:00:00');
                const dow = d.getDay();
                const diff = dow === 0 ? -6 : 1 - dow;
                d.setDate(d.getDate() + diff);
                return d.toISOString().substring(0, 10);
            }
            case 'month':
                return date.substring(0, 7);
            case 'quarter': {
                const parts = date.split('-');
                return parts[0] + '-Q' + Math.ceil(parseInt(parts[1]) / 3);
            }
            default:
                return date.substring(0, 7);
        }
    }

    // Build a continuous, chronologically ordered list of period keys + labels
    function buildPeriodRange(gran) {
        const list = [];
        const labels = [];
        const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

        if (gran === 'day' || gran === 'week') {
            const allDates = Object.keys(data.dayMap).filter(d => !d.startsWith('_')).sort();
            if (allDates.length === 0) return { list, labels };
            const start = new Date(allDates[0] + 'T00:00:00');
            const end = new Date(allDates[allDates.length - 1] + 'T00:00:00');
            const cur = new Date(start);
            if (gran === 'week') {
                const dow = cur.getDay();
                cur.setDate(cur.getDate() + (dow === 0 ? -6 : 1 - dow));
            }
            const stepDays = gran === 'week' ? 7 : 1;
            while (cur <= end) {
                list.push(cur.toISOString().substring(0, 10));
                labels.push(cur.getDate() + ' ' + months[cur.getMonth()] + ' ' + cur.getFullYear());
                cur.setDate(cur.getDate() + stepDays);
            }
        } else if (gran === 'quarter') {
            const [sy, sm] = data.minDate.substring(0, 7).split('-').map(Number);
            const [ey, em] = data.maxDate.substring(0, 7).split('-').map(Number);
            let y = sy, q = Math.ceil(sm / 3);
            const endQ = Math.ceil(em / 3);
            while (y < ey || (y === ey && q <= endQ)) {
                list.push(y + '-Q' + q);
                labels.push('Q' + q + ' ' + y);
                q++;
                if (q > 4) { q = 1; y++; }
            }
        } else { // month
            const [sy, sm] = data.minDate.substring(0, 7).split('-').map(Number);
            const [ey, em] = data.maxDate.substring(0, 7).split('-').map(Number);
            let y = sy, m = sm;
            while (y < ey || (y === ey && m <= em)) {
                list.push(y + '-' + String(m).padStart(2, '0'));
                labels.push(months[m - 1] + ' ' + y);
                m++;
                if (m > 12) { m = 1; y++; }
            }
        }
        return { list, labels };
    }

    function scanHype() {
        const resultsEl = document.getElementById('hype-results');
        if (!data || !data.dayMap) {
            resultsEl.innerHTML = '<p class="hype-empty">Нет данных.</p>';
            return;
        }

        const mode = document.getElementById('hype-mode').value; // 'rise' | 'fall'
        const gran = document.getElementById('hype-gran').value;
        const win = Math.max(1, parseInt(document.getElementById('hype-window').value) || 4);
        const threshold = Math.max(1.1, parseFloat(document.getElementById('hype-threshold').value) || 4);
        const minPeak = Math.max(1, parseInt(document.getElementById('hype-minpeak').value) || 4);
        const minTotal = Math.max(1, parseInt(document.getElementById('hype-mintotal').value) || 6);
        const limit = Math.max(1, parseInt(document.getElementById('hype-limit').value) || 40);
        const minActive = Math.max(1, parseInt(document.getElementById('hype-minactive').value) || 1);
        const newMode = document.getElementById('hype-newmode').value; // 'include' | 'only' | 'exclude'
        const useStop = document.getElementById('hype-usestop').checked;

        resultsEl.innerHTML = '<p class="hype-empty">Сканирую…</p>';

        // Build periods + index map
        const { list, labels } = buildPeriodRange(gran);
        if (list.length < 2) {
            resultsEl.innerHTML = '<p class="hype-empty">Слишком мало данных для выбранной разбивки.</p>';
            return;
        }
        const idxOf = {};
        for (let i = 0; i < list.length; i++) idxOf[list[i]] = i;

        // Pass 1 - total counts per word (cheap filter)
        const totals = {};
        for (const date in data.dayMap) {
            if (date.startsWith('_')) continue;
            const dw = data.dayMap[date];
            for (const w in dw) {
                totals[w] = (totals[w] || 0) + dw[w];
            }
        }

        // Candidate words after total + stop filter
        const candidates = [];
        for (const w in totals) {
            if (totals[w] < minTotal) continue;
            if (w.length < 2) continue;
            if (useStop && stopWords.has(w)) continue;
            candidates.push(w);
        }
        if (candidates.length === 0) {
            resultsEl.innerHTML = '<p class="hype-empty">Ничего не найдено. Попробуйте снизить «Мин. всего».</p>';
            return;
        }
        const candSet = new Set(candidates);

        // Pass 2 - build per-period series only for candidates
        const series = {};
        for (const w of candidates) series[w] = new Array(list.length).fill(0);
        for (const date in data.dayMap) {
            if (date.startsWith('_')) continue;
            const pIdx = idxOf[periodKeyFor(date, gran)];
            if (pIdx === undefined) continue;
            const dw = data.dayMap[date];
            for (const w in dw) {
                if (candSet.has(w)) series[w][pIdx] += dw[w];
            }
        }

        // Pass 3 - score every candidate at its best moment
        const SMOOTH = 1; // additive smoothing to avoid div-by-zero
        const found = [];
        for (const w of candidates) {
            const vals = series[w];

            // Random-spike filter: a word that only ever showed up in a single
            // period (e.g. "пара раз за один день и всё") isn't real hype.
            let activePeriods = 0;
            for (let i = 0; i < vals.length; i++) if (vals[i] > 0) activePeriods++;
            if (activePeriods < minActive) continue;

            let cumBefore = 0;          // running sum of everything before period i
            let best = null;
            for (let i = 0; i < vals.length; i++) {
                const cur = vals[i];
                // baseline = mean over the previous `win` periods
                let sum = 0;
                const from = Math.max(0, i - win);
                for (let k = from; k < i; k++) sum += vals[k];
                const baseMean = (i - from) > 0 ? sum / (i - from) : 0;

                const isNew = cumBefore === 0; // nothing before this period

                let ratio, score, prev, peak;
                if (mode === 'rise') {
                    if (cur < minPeak) { cumBefore += cur; continue; }
                    // New-word handling (words bursting from 0 - often just words
                    // present since the very first month)
                    if (newMode === 'only' && !isNew) { cumBefore += cur; continue; }
                    if (newMode === 'exclude' && isNew) { cumBefore += cur; continue; }
                    ratio = cur / (baseMean + SMOOTH);
                    if (ratio < threshold) { cumBefore += cur; continue; }
                    prev = baseMean; peak = cur;
                    // reward both ratio and absolute size of the spike
                    score = ratio * Math.log2(cur + 1);
                } else { // fall - sharp collapse from a high baseline
                    if (baseMean < minPeak) { cumBefore += cur; continue; }
                    if (isNew) { cumBefore += cur; continue; } // can't fall from nothing
                    ratio = baseMean / (cur + SMOOTH);
                    if (ratio < threshold) { cumBefore += cur; continue; }
                    prev = baseMean; peak = cur;
                    score = ratio * Math.log2(baseMean + 1);
                }

                if (!best || score > best.score) {
                    best = { idx: i, ratio, score, prev, peak, isNew };
                }
                cumBefore += cur;
            }
            if (best) {
                found.push({
                    word: w,
                    total: totals[w],
                    idx: best.idx,
                    label: labels[best.idx],
                    ratio: best.ratio,
                    score: best.score,
                    prev: best.prev,
                    peak: best.peak,
                    isNew: best.isNew && mode === 'rise'
                });
            }
        }

        found.sort((a, b) => b.score - a.score);
        const top = found.slice(0, limit);
        renderHypeResults(top, mode, gran);
    }

    function renderHypeResults(items, mode, gran) {
        const resultsEl = document.getElementById('hype-results');
        if (items.length === 0) {
            resultsEl.innerHTML = '<p class="hype-empty">Ничего не найдено под эти параметры. Попробуйте снизить порог или окно сравнения.</p>';
            return;
        }

        const isRise = mode === 'rise';
        const arrow = isRise ? '↗' : '↘';
        let html = `<div class="hype-count">Найдено: ${items.length} · режим: ${isRise ? 'хайп 📈' : 'падение 📉'}</div><div class="hype-list">`;

        items.forEach((it, rank) => {
            const ratioTxt = '×' + (it.ratio >= 100 ? Math.round(it.ratio) : it.ratio.toFixed(1));
            const prevTxt = it.prev < 1 ? it.prev.toFixed(1) : Math.round(it.prev);
            const first = data.wordFirst && data.wordFirst[it.word];
            const initTxt = first ? `· впервые: ${esc(first.user)}` : '';
            const newTag = it.isNew ? '<span class="hype-tag-new">🆕 новое</span>' : '';
            const flow = isRise
                ? `было ~${prevTxt}/период → стало <b>${it.peak}</b>`
                : `было ~${prevTxt}/период → упало до <b>${it.peak}</b>`;

            html += `
                <div class="hype-item ${isRise ? 'rise' : 'fall'}" data-word="${esc(it.word)}" data-gran="${gran}">
                    <div class="hype-rank">${rank + 1}</div>
                    <div class="hype-body">
                        <div class="hype-word-row">
                            <span class="hype-word">${esc(it.word)}</span>
                            ${newTag}
                            <span class="hype-ratio ${isRise ? 'up' : 'down'}">${arrow} ${ratioTxt}</span>
                        </div>
                        <div class="hype-meta">${esc(it.label)} · ${flow} · всего ${it.total} ${initTxt}</div>
                    </div>
                </div>`;
        });
        html += '</div>';
        resultsEl.innerHTML = html;

        // Click a result → load it into the chart with matching granularity
        resultsEl.querySelectorAll('.hype-item').forEach(el => {
            el.addEventListener('click', () => {
                const word = el.dataset.word;
                const g = el.dataset.gran;
                document.getElementById('hype-modal').classList.add('hidden');
                const granSel = document.getElementById('ngram-granularity');
                if (granSel.value !== g) {
                    granSel.value = g;
                    currentGranularity = g;
                    buildPeriods();
                }
                document.getElementById('ngram-input').value = word;
                doSearch();
            });
        });
    }

    function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

    return { init };
})();
