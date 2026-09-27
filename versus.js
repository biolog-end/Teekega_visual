var VersusModule = (function () {
    'use strict';

    let data = null;
    let dateList = [];
    let currentIndex = 0;
    let isPlaying = false;
    let playTimer = null;
    let word1 = '', word2 = '';

    function init(d) {
        data = d;
        dateList = buildDateRange(d.minDate, d.maxDate);

        const screen = document.getElementById('viz-versus');
        screen.innerHTML = `
            <div class="toolbar">
                <button class="ctrl-btn back-btn" id="versus-back">\u2190 Назад</button>
                <h2>Перетягивание каната</h2>
                <div class="toolbar-right">
                    <div class="control-group">
                        <label>Окно:</label>
                        <select id="versus-window">
                            <option value="1">1 день</option>
                            <option value="7" selected>7 дней</option>
                            <option value="14">14 дней</option>
                            <option value="30">30 дней</option>
                            <option value="60">60 дней</option>
                            <option value="90">90 дней</option>
                        </select>
                    </div>
                    <div class="control-group">
                        <label>Скорость:</label>
                        <input type="range" id="versus-speed" min="30" max="1000" value="150" step="10">
                        <span id="versus-speed-val">150</span>
                    </div>
                </div>
            </div>
            <div class="versus-container">
                <div class="versus-input-row">
                    <input type="text" id="versus-word1" placeholder="Слово 1 (напр: да)" class="versus-input">
                    <span class="versus-vs">VS</span>
                    <input type="text" id="versus-word2" placeholder="Слово 2 (напр: нет)" class="versus-input">
                    <button class="upload-btn" id="versus-go">Начать</button>
                </div>
                <div class="versus-arena" id="versus-arena">
                    <div class="versus-month-label" id="versus-month"></div>
                    <div class="versus-rope-wrap">
                        <div class="versus-label-left" id="versus-label1"></div>
                        <div class="versus-rope">
                            <div class="versus-rope-fill" id="versus-fill"></div>
                            <div class="versus-knot" id="versus-knot"></div>
                        </div>
                        <div class="versus-label-right" id="versus-label2"></div>
                    </div>
                    <div class="versus-scores" id="versus-scores"></div>
                </div>
                <div class="versus-controls">
                    <button class="ctrl-btn" id="versus-prev">\u23EE</button>
                    <button class="ctrl-btn" id="versus-play">\u25B6</button>
                    <button class="ctrl-btn" id="versus-next">\u23ED</button>
                    <input type="range" id="versus-timeline" min="0" max="${dateList.length - 1}" value="0" style="flex:1;accent-color:var(--accent)">
                    <span class="timeline-label" id="versus-date-label"></span>
                </div>
            </div>
        `;

        document.getElementById('versus-back').addEventListener('click', () => { pause(); UploadModule.goBack(); });
        document.getElementById('versus-go').addEventListener('click', startVersus);
        document.getElementById('versus-word1').addEventListener('keydown', (e) => { if (e.key === 'Enter') startVersus(); });
        document.getElementById('versus-word2').addEventListener('keydown', (e) => { if (e.key === 'Enter') startVersus(); });

        document.getElementById('versus-play').addEventListener('click', togglePlay);
        document.getElementById('versus-prev').addEventListener('click', () => { if (currentIndex > 0) { currentIndex--; updateView(); } });
        document.getElementById('versus-next').addEventListener('click', () => { if (currentIndex < dateList.length - 1) { currentIndex++; updateView(); } });
        document.getElementById('versus-timeline').addEventListener('input', (e) => { currentIndex = parseInt(e.target.value, 10); updateView(); });
        document.getElementById('versus-speed').addEventListener('input', (e) => { document.getElementById('versus-speed-val').textContent = e.target.value; });
    }

    function startVersus() {
        word1 = document.getElementById('versus-word1').value.toLowerCase().trim();
        word2 = document.getElementById('versus-word2').value.toLowerCase().trim();
        if (!word1 || !word2) return;

        currentIndex = 0;
        document.getElementById('versus-label1').textContent = word1;
        document.getElementById('versus-label2').textContent = word2;

        updateView();
    }

    function getWindowCounts() {
        const windowSize = parseInt(document.getElementById('versus-window').value, 10);
        const startIdx = Math.max(0, currentIndex - windowSize + 1);

        let c1 = 0, c2 = 0;
        for (let i = startIdx; i <= currentIndex; i++) {
            const day = dateList[i];
            const dw = data.dayMap[day];
            if (!dw) continue;
            if (dw[word1]) c1 += dw[word1];
            if (dw[word2]) c2 += dw[word2];
        }
        return { c1, c2 };
    }

    function updateView() {
        if (!word1 || !word2) return;

        const { c1, c2 } = getWindowCounts();
        const total = c1 + c2 || 1;
        const pct1 = (c1 / total) * 100;

        const knot = document.getElementById('versus-knot');
        const fill = document.getElementById('versus-fill');
        knot.style.left = pct1 + '%';
        fill.style.width = pct1 + '%';

        const dateStr = dateList[currentIndex];
        document.getElementById('versus-month').textContent = formatDate(dateStr);
        document.getElementById('versus-scores').innerHTML = `
            <span style="color:#6c63ff"><strong>${word1}</strong>: ${c1} (${pct1.toFixed(0)}%)</span>
            <span style="color:#888">vs</span>
            <span style="color:#ff6b6b"><strong>${word2}</strong>: ${c2} (${(100 - pct1).toFixed(0)}%)</span>
        `;

        document.getElementById('versus-timeline').value = currentIndex;
        document.getElementById('versus-date-label').textContent = formatDate(dateStr);
    }

    function togglePlay() { isPlaying ? pause() : play(); }

    function play() {
        isPlaying = true;
        document.getElementById('versus-play').textContent = '\u23F8';
        document.getElementById('versus-play').classList.add('active');
        scheduleNext();
    }

    function pause() {
        isPlaying = false;
        document.getElementById('versus-play').textContent = '\u25B6';
        document.getElementById('versus-play').classList.remove('active');
        if (playTimer) { clearTimeout(playTimer); playTimer = null; }
    }

    function scheduleNext() {
        if (!isPlaying) return;
        const speed = parseInt(document.getElementById('versus-speed').value, 10);
        playTimer = setTimeout(() => {
            if (currentIndex < dateList.length - 1) {
                currentIndex++;
                updateView();
                scheduleNext();
            } else {
                pause();
            }
        }, speed);
    }

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

    function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

    return { init };
})();
