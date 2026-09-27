var LineRaceModule = (function () {
    'use strict';

    // ---- State ----
    let dayMap = {};
    let chatName = '';
    let minDate = '', maxDate = '';

    let granularity = 'month';      // 'day' | 'week' | 'month'
    let buckets = [];               // [{ key, label }]
    let bucketData = [];            // [ { word: count } ] aligned to buckets

    let seriesByWord = {};          // word -> Float64Array of rolling values (len = buckets.length)
    let candidates = [];            // words that ever entered topN
    let peakByWord = {};            // word -> peak rolling value
    let leaderByBucket = [];        // word leading at each integer bucket

    let playT = 0;                  // fractional bucket position
    let playing = false;
    let phase = 'race';             // 'race' | 'final'
    let finalProgress = 0;          // 0..1 for final bar grow
    let lastTs = 0;
    let rafId = null;

    // smoothed Y-axis domain (eased each frame)
    let dispMin = 0, dispMax = 1;

    // current annotation card
    let annotation = null;          // { word, value, until }
    let lastLeader = null;

    // per-word draw persistence: word -> { alpha, frozenAt }
    // frozenAt === null  -> word is live (in current topN), line follows the playhead
    // frozenAt is number  -> word left topN; its line is frozen at that bucket position and fades out
    let drawnState = {};
    let snapAlpha = false;          // when true, alpha jumps to target instantly (after scrub/restart)

    // ---- Settings (persisted) ----
    function loadSetting(key, def) {
        try { const v = localStorage.getItem('lr_' + key); return v === null ? def : JSON.parse(v); }
        catch { return def; }
    }
    function saveSetting(key, val) { try { localStorage.setItem('lr_' + key, JSON.stringify(val)); } catch {} }

    let windowSize = loadSetting('windowSize', 3);   // rolling sum window (buckets)
    let visibleSpan = loadSetting('visibleSpan', 7); // visible buckets on X
    let topN = loadSetting('topN', 10);
    let speedMs = loadSetting('speedMs', 1200);      // ms per bucket step

    // Stop-words (shared spirit with bar chart)
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
        'даже', 'нибудь', 'какой', 'какая', 'какие',
        'такой', 'такая', 'такие', 'который', 'которая', 'которые',
        'потом', 'тогда', 'сейчас', 'здесь', 'туда', 'сюда'
    ];
    let stopWordsSet = new Set(loadSetting('stopWords', DEFAULT_STOP_WORDS));
    let filterActive = loadSetting('filterActive', true);

    // ---- Colors ----
    const COLORS = [
        '#6c63ff', '#ff6b6b', '#ffa502', '#0abde3', '#2ed573',
        '#f368e0', '#a55eea', '#48dbfb', '#feca57', '#ee5a24',
        '#1dd1a1', '#ff9ff3', '#54a0ff', '#5f27cd', '#ff6348',
        '#00d2d3', '#10ac84', '#e84393', '#0984e3', '#fdcb6e'
    ];
    const wordColorMap = {};
    let colorIndex = 0;
    function getWordColor(word) {
        if (!wordColorMap[word]) { wordColorMap[word] = COLORS[colorIndex % COLORS.length]; colorIndex++; }
        return wordColorMap[word];
    }

    // ---- DOM ----
    let els = {};
    let canvas = null, ctx = null, dpr = 1;

    function init(data) {
        dayMap = data.dayMap;
        chatName = data.chatName;
        minDate = data.minDate;
        maxDate = data.maxDate;

        granularity = pickDefaultGranularity();
        renderDOM();
        bindEvents();
        rebuild();
        resizeCanvas();
        playT = 0; phase = 'race'; playing = false; finalProgress = 0;
        startLoop();
    }

    function pickDefaultGranularity() {
        const a = new Date(minDate + 'T00:00:00');
        const b = new Date(maxDate + 'T00:00:00');
        const days = Math.round((b - a) / 86400000);
        if (days >= 540) return 'month';
        if (days >= 120) return 'week';
        return 'day';
    }

    // ---------- Bucketing ----------
    function bucketKey(dateStr) {
        if (granularity === 'day') return dateStr;
        if (granularity === 'month') return dateStr.substring(0, 7); // YYYY-MM
        // week -> Monday of that week (YYYY-MM-DD)
        const d = new Date(dateStr + 'T00:00:00');
        const dow = (d.getDay() + 6) % 7; // Mon=0
        d.setDate(d.getDate() - dow);
        return d.toISOString().substring(0, 10);
    }

    function buildBucketKeys() {
        const keys = [];
        const seen = new Set();
        const start = new Date(minDate + 'T00:00:00');
        const end = new Date(maxDate + 'T00:00:00');
        const cur = new Date(start);
        while (cur <= end) {
            const ds = cur.toISOString().substring(0, 10);
            const k = bucketKey(ds);
            if (!seen.has(k)) { seen.add(k); keys.push(k); }
            cur.setDate(cur.getDate() + 1);
        }
        return keys;
    }

    function bucketLabel(key) {
        if (granularity === 'month') {
            const [y, m] = key.split('-');
            return m + '.' + y;
        }
        // day or week (week labelled by its Monday date)
        const p = key.split('-');
        return p[2] + '.' + p[1];
    }

    function rebuild() {
        const keys = buildBucketKeys();
        const idxOf = {};
        keys.forEach((k, i) => idxOf[k] = i);
        buckets = keys.map(k => ({ key: k, label: bucketLabel(k) }));
        bucketData = keys.map(() => ({}));

        // Aggregate dayMap into buckets
        for (const day in dayMap) {
            const k = bucketKey(day);
            const bi = idxOf[k];
            if (bi === undefined) continue;
            const target = bucketData[bi];
            const words = dayMap[day];
            for (const w in words) {
                if (filterActive && stopWordsSet.has(w)) continue;
                target[w] = (target[w] || 0) + words[w];
            }
        }

        computeSeries();
        drawnState = {}; snapAlpha = true;
    }

    // Sliding-window aggregate to find candidate words and build value series
    function computeSeries() {
        const n = buckets.length;
        seriesByWord = {};
        peakByWord = {};
        leaderByBucket = new Array(n).fill(null);
        const candSet = new Set();

        // Pass 1: candidates (topN at each bucket) + leaders
        let agg = {};
        for (let i = 0; i < n; i++) {
            addMap(agg, bucketData[i]);
            const out = i - windowSize;
            if (out >= 0) subMap(agg, bucketData[out]);
            const top = topEntries(agg, topN);
            for (const [w] of top) candSet.add(w);
            if (top.length) leaderByBucket[i] = top[0][0];
        }

        candidates = Array.from(candSet);

        // Pass 2: build full series for candidates only
        candidates.forEach(w => { seriesByWord[w] = new Float64Array(n); peakByWord[w] = 0; });
        agg = {};
        for (let i = 0; i < n; i++) {
            addMap(agg, bucketData[i]);
            const out = i - windowSize;
            if (out >= 0) subMap(agg, bucketData[out]);
            for (let c = 0; c < candidates.length; c++) {
                const w = candidates[c];
                const v = agg[w] || 0;
                seriesByWord[w][i] = v;
                if (v > peakByWord[w]) peakByWord[w] = v;
            }
        }

        // assign colors deterministically by peak rank
        candidates.sort((a, b) => peakByWord[b] - peakByWord[a]);
        candidates.forEach(getWordColor);
    }

    function addMap(agg, m) { for (const k in m) agg[k] = (agg[k] || 0) + m[k]; }
    function subMap(agg, m) { for (const k in m) { agg[k] -= m[k]; if (agg[k] <= 0) delete agg[k]; } }
    function topEntries(agg, n) {
        return Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, n);
    }

    // value of a word at fractional time t
    function valAt(word, t) {
        const s = seriesByWord[word];
        if (!s) return 0;
        const n = s.length;
        if (n === 0) return 0;
        const i0 = Math.floor(t);
        if (i0 >= n - 1) return s[n - 1];
        if (i0 < 0) return s[0];
        const f = t - i0;
        return s[i0] * (1 - f) + s[i0 + 1] * f;
    }

    // topN words present at fractional t
    function topAt(t) {
        const arr = [];
        for (let c = 0; c < candidates.length; c++) {
            const w = candidates[c];
            const v = valAt(w, t);
            if (v > 0) arr.push([w, v]);
        }
        arr.sort((a, b) => b[1] - a[1]);
        return arr.slice(0, topN);
    }

    // ---------- DOM ----------
    function renderDOM() {
        const screen = document.getElementById('viz-linerace');
        screen.innerHTML = `
            <header class="toolbar">
                <div style="display:flex;align-items:center;gap:0.6rem">
                    <button class="ctrl-btn back-btn" id="lr-back">← Назад</button>
                    <h2 id="lr-title">${escapeHtml(chatName)}</h2>
                </div>
                <div class="toolbar-right">
                    <div class="control-group">
                        <label>Период:</label>
                        <select id="lr-gran">
                            <option value="day">День</option>
                            <option value="week">Неделя</option>
                            <option value="month">Месяц</option>
                        </select>
                    </div>
                    <div class="control-group">
                        <label>Сумма за:</label>
                        <select id="lr-window">
                            ${[1,2,3,4,6,9,12].map(d => `<option value="${d}">${d}</option>`).join('')}
                        </select>
                    </div>
                    <div class="control-group">
                        <label>Видно:</label>
                        <select id="lr-visible">
                            ${[5,7,10,14,20].map(d => `<option value="${d}">${d}</option>`).join('')}
                        </select>
                    </div>
                    <div class="control-group">
                        <label>ТОП:</label>
                        <input type="number" id="lr-topn" value="${topN}" min="3" max="20">
                    </div>
                    <div class="control-group">
                        <label>Скорость:</label>
                        <input type="range" id="lr-speed" min="200" max="3000" value="${speedMs}" step="50">
                    </div>
                    <button class="ctrl-btn" id="lr-filter-btn" title="Фильтр стоп-слов">⚙</button>
                </div>
            </header>
            <div class="main-content" style="position:relative">
                <canvas id="lr-canvas" style="width:100%;height:100%;display:block"></canvas>
            </div>
            <footer class="timeline-bar">
                <div class="playback-controls">
                    <button class="ctrl-btn" id="lr-restart">⏮</button>
                    <button class="ctrl-btn" id="lr-play">▶</button>
                </div>
                <div class="timeline-wrapper">
                    <span class="timeline-label" id="lr-date-start"></span>
                    <input type="range" id="lr-timeline" min="0" max="100" value="0" step="0.001">
                    <span class="timeline-label" id="lr-date-end"></span>
                </div>
            </footer>

            <!-- Filter Modal -->
            <div id="lr-filter-modal" class="modal hidden">
                <div class="modal-backdrop"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Фильтр стоп-слов</h3>
                        <button class="modal-close" id="lr-filter-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="filter-toggle">
                            <label class="toggle-label">
                                <input type="checkbox" id="lr-filter-enabled" ${filterActive?'checked':''}>
                                <span>Включить фильтрацию</span>
                            </label>
                        </div>
                        <p class="filter-hint">Слова через запятую или по строкам:</p>
                        <textarea id="lr-filter-words" rows="8">${Array.from(stopWordsSet).join(', ')}</textarea>
                    </div>
                    <div class="modal-footer">
                        <button class="upload-btn" id="lr-filter-apply">Применить</button>
                    </div>
                </div>
            </div>
        `;

        els = {
            canvas: document.getElementById('lr-canvas'),
            gran: document.getElementById('lr-gran'),
            window: document.getElementById('lr-window'),
            visible: document.getElementById('lr-visible'),
            topn: document.getElementById('lr-topn'),
            speed: document.getElementById('lr-speed'),
            play: document.getElementById('lr-play'),
            restart: document.getElementById('lr-restart'),
            timeline: document.getElementById('lr-timeline'),
            dateStart: document.getElementById('lr-date-start'),
            dateEnd: document.getElementById('lr-date-end'),
        };
        els.gran.value = granularity;
        els.window.value = windowSize;
        els.visible.value = visibleSpan;

        canvas = els.canvas;
        ctx = canvas.getContext('2d');
    }

    function bindEvents() {
        document.getElementById('lr-back').addEventListener('click', () => { pause(); stopLoop(); UploadModule.goBack(); });

        els.play.addEventListener('click', togglePlay);
        els.restart.addEventListener('click', () => { phase = 'race'; finalProgress = 0; playT = 0; drawnState = {}; snapAlpha = true; pause(); });

        els.timeline.addEventListener('input', () => {
            pause();
            phase = 'race'; finalProgress = 0;
            playT = (parseFloat(els.timeline.value) / 100) * (buckets.length - 1);
            drawnState = {}; snapAlpha = true;
        });

        els.gran.addEventListener('change', () => {
            granularity = els.gran.value;
            playT = 0; phase = 'race'; finalProgress = 0; pause();
            rebuild();
        });
        els.window.addEventListener('change', () => {
            windowSize = parseInt(els.window.value, 10);
            saveSetting('windowSize', windowSize);
            playT = 0; phase = 'race'; finalProgress = 0; pause();
            rebuild();
        });
        els.visible.addEventListener('change', () => {
            visibleSpan = parseInt(els.visible.value, 10);
            saveSetting('visibleSpan', visibleSpan);
        });
        els.topn.addEventListener('change', () => {
            topN = Math.max(3, Math.min(20, parseInt(els.topn.value, 10) || 10));
            els.topn.value = topN;
            saveSetting('topN', topN);
            playT = 0; phase = 'race'; finalProgress = 0; pause();
            rebuild();
        });
        els.speed.addEventListener('input', () => {
            speedMs = parseInt(els.speed.value, 10);
            saveSetting('speedMs', speedMs);
        });

        // Filter modal
        const fm = document.getElementById('lr-filter-modal');
        document.getElementById('lr-filter-btn').addEventListener('click', () => fm.classList.remove('hidden'));
        document.getElementById('lr-filter-close').addEventListener('click', () => fm.classList.add('hidden'));
        fm.querySelector('.modal-backdrop').addEventListener('click', () => fm.classList.add('hidden'));
        document.getElementById('lr-filter-apply').addEventListener('click', () => {
            const text = document.getElementById('lr-filter-words').value.toLowerCase();
            const words = text.split(/[,;\n]+/).map(w => w.trim()).filter(w => w.length > 0);
            stopWordsSet = new Set(words);
            filterActive = document.getElementById('lr-filter-enabled').checked;
            saveSetting('stopWords', words);
            saveSetting('filterActive', filterActive);
            fm.classList.add('hidden');
            playT = 0; phase = 'race'; finalProgress = 0; pause();
            rebuild();
        });
        document.getElementById('lr-filter-enabled').addEventListener('change', (e) => {
            filterActive = e.target.checked;
            saveSetting('filterActive', filterActive);
        });

        document.addEventListener('keydown', handleKey);
        window.addEventListener('resize', () => {
            if (document.getElementById('viz-linerace').classList.contains('active')) resizeCanvas();
        });
    }

    function handleKey(e) {
        if (!document.getElementById('viz-linerace').classList.contains('active')) return;
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
        if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    }

    // ---------- Playback ----------
    function togglePlay() { playing ? pause() : play(); }
    function play() {
        if (phase === 'final') { phase = 'race'; finalProgress = 0; playT = 0; }
        if (playT >= buckets.length - 1) playT = 0;
        playing = true; els.play.textContent = '⏸'; els.play.classList.add('active'); lastTs = 0;
    }
    function pause() { playing = false; els.play.textContent = '▶'; els.play.classList.remove('active'); }

    function startLoop() { if (!rafId) rafId = requestAnimationFrame(loop); }
    function stopLoop() { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }

    function loop(ts) {
        rafId = requestAnimationFrame(loop);
        if (!document.getElementById('viz-linerace').classList.contains('active')) return;

        const dt = lastTs ? (ts - lastTs) : 0;
        lastTs = ts;

        if (phase === 'race' && playing) {
            playT += dt / speedMs;
            if (playT >= buckets.length - 1) {
                playT = buckets.length - 1;
                playing = false;
                els.play.textContent = '▶';
                els.play.classList.remove('active');
                phase = 'final';
                finalProgress = 0;
            }
        }
        if (phase === 'final' && finalProgress < 1) {
            finalProgress = Math.min(1, finalProgress + dt / 1400);
        }

        if (phase === 'final') drawFinal();
        else drawRace();
    }

    // ---------- Canvas sizing ----------
    function resizeCanvas() {
        const parent = canvas.parentElement;
        const w = parent.clientWidth, h = parent.clientHeight;
        dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // ---------- Drawing: race ----------
    function drawRace() {
        const W = canvas.width / dpr, H = canvas.height / dpr;
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#15151d';
        ctx.fillRect(0, 0, W, H);

        const n = buckets.length;
        if (n === 0) return;

        const padTop = 56, padBottom = 34, padLeft = 56, padRight = 168;
        const plotL = padLeft, plotR = W - padRight, plotT = padTop, plotB = H - padBottom;
        const plotW = plotR - plotL, plotH = plotB - plotT;

        const t = playT;
        const span = visibleSpan - 1;
        let domStart, domEnd;
        if (t <= span) { domStart = 0; domEnd = span; }
        else { domStart = t - span; domEnd = t; }
        if (domEnd > n - 1 + 0.0001) { domEnd = n - 1; domStart = Math.max(0, domEnd - span); }

        const xScale = (i) => plotL + ((i - domStart) / (domEnd - domStart || 1)) * plotW;

        const tops = topAt(t);

        // Y domain from visible top words over visible window
        let lo = Infinity, hi = -Infinity;
        const iA = Math.max(0, Math.floor(domStart)), iB = Math.min(n - 1, Math.ceil(domEnd));
        for (const [w] of tops) {
            for (let i = iA; i <= iB; i++) { const v = seriesByWord[w][i]; if (v < lo) lo = v; if (v > hi) hi = v; }
            const vt = valAt(w, t); if (vt < lo) lo = vt; if (vt > hi) hi = vt;
        }
        if (!isFinite(lo)) { lo = 0; hi = 1; }
        if (hi <= lo) hi = lo + 1;
        const padY = (hi - lo) * 0.12 || 1;
        const targetMin = Math.max(0, lo - padY), targetMax = hi + padY;
        // ease
        dispMin += (targetMin - dispMin) * 0.12;
        dispMax += (targetMax - dispMax) * 0.12;
        if (Math.abs(dispMax - dispMin) < 0.5) dispMax = dispMin + 1;

        const yScale = (v) => plotB - ((v - dispMin) / (dispMax - dispMin)) * plotH;

        // Grid + Y labels
        drawGrid(ctx, plotL, plotR, plotT, plotB, dispMin, dispMax, yScale);

        // X labels (integer buckets within domain)
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = '13px Inter, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const firstLabel = Math.ceil(domStart - 1e-6);
        for (let i = firstLabel; i <= Math.floor(domEnd + 1e-6); i++) {
            if (i < 0 || i >= n) continue;
            const x = xScale(i);
            if (x < plotL - 1 || x > plotR + 1) continue;
            ctx.fillText(buckets[i].label, x, plotT - 26);
            ctx.strokeStyle = 'rgba(255,255,255,0.04)';
            ctx.beginPath(); ctx.moveTo(x, plotT); ctx.lineTo(x, plotB); ctx.stroke();
        }

        // Title
        ctx.fillStyle = '#f4f4fa';
        ctx.font = '700 22px Inter, "Segoe UI", sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText('Гонка популярных слов', plotL, 12);

        // Clip plot for lines
        ctx.save();
        ctx.beginPath();
        ctx.rect(plotL, plotT - 4, plotW, plotH + 8);
        ctx.clip();

        // --- Persistence: fade words in/out, freeze lines that drop out of topN ---
        const inSet = new Set(tops.map(e => e[0]));
        // ensure/refresh entries for words currently in topN (they are "live")
        for (const [w] of tops) {
            if (!drawnState[w]) drawnState[w] = { alpha: snapAlpha ? 1 : 0, frozenAt: null };
            drawnState[w].frozenAt = null; // back to live
        }
        // ease alpha; freeze + drop words no longer in topN
        for (const w in drawnState) {
            const st = drawnState[w];
            const target = inSet.has(w) ? 1 : 0;
            if (target === 0 && st.frozenAt === null) st.frozenAt = t; // freeze at the moment it left
            st.alpha = snapAlpha ? target : st.alpha + (target - st.alpha) * 0.16;
            if (target === 0 && st.alpha < 0.02) delete drawnState[w];
        }
        snapAlpha = false;

        // helper: end-of-line position for a word (live -> t, frozen -> frozenAt)
        const endTOf = (w) => drawnState[w].frozenAt === null ? t : drawnState[w].frozenAt;

        // draw order: lowest current value first so the leader sits on top
        const drawList = Object.keys(drawnState).sort(
            (a, b) => valAt(a, endTOf(a)) - valAt(b, endTOf(b))
        );

        for (const w of drawList) {
            const st = drawnState[w];
            const endT = endTOf(w);
            const color = getWordColor(w);
            const pts = [];
            const startI = Math.max(0, Math.floor(domStart) - 1);
            const endI = Math.min(n - 1, Math.floor(endT));
            for (let i = startI; i <= endI; i++) pts.push([xScale(i), yScale(seriesByWord[w][i])]);
            pts.push([xScale(endT), yScale(valAt(w, endT))]); // tip at fractional end
            ctx.lineWidth = 3;
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.95 * st.alpha;
            drawSmooth(ctx, pts);
        }
        ctx.restore();
        ctx.globalAlpha = 1;

        // Tips sit at the real line endpoint. Circles may be arbitrarily close to
        // each other; each shrinks based on how near its closest neighbour is so
        // crowded tips stay legible instead of overlapping into a blob.
        const tips = [];
        for (const w of drawList) {
            const st = drawnState[w];
            const endT = endTOf(w);
            const vv = valAt(w, endT);
            tips.push({ w, v: vv, x: xScale(endT), y: yScale(vv), alpha: st.alpha });
        }
        const MAXR = 15, MINR = 3;
        for (let i = 0; i < tips.length; i++) {
            let d = Infinity;
            for (let j = 0; j < tips.length; j++) {
                if (i === j) continue;
                const dist = Math.hypot(tips[i].x - tips[j].x, tips[i].y - tips[j].y);
                if (dist < d) d = dist;
            }
            tips[i].r = Math.max(MINR, Math.min(MAXR, d / 2));
        }
        for (const tp of tips) drawTip(ctx, tp);

        // Annotation card (leader change)
        updateAnnotation(t);
        if (annotation) drawAnnotation(ctx, plotL, plotT);

        // sync timeline + footer labels
        els.timeline.value = ((t / (n - 1 || 1)) * 100).toFixed(3);
        els.dateStart.textContent = buckets[Math.max(0, Math.floor(domStart))].label;
        els.dateEnd.textContent = buckets[Math.min(n - 1, Math.round(t))].label;
    }

    function drawGrid(ctx, l, r, tp, b, vmin, vmax, yScale) {
        const ticks = niceTicks(vmin, vmax, 6);
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.font = '12px Inter, "Segoe UI", sans-serif';
        for (const v of ticks) {
            const y = yScale(v);
            if (y < tp - 1 || y > b + 1) continue;
            ctx.strokeStyle = 'rgba(255,255,255,0.07)';
            ctx.beginPath(); ctx.moveTo(l, y); ctx.lineTo(r, y); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.fillText(Math.round(v).toLocaleString(), l - 8, y);
        }
    }

    function niceTicks(min, max, count) {
        const range = max - min || 1;
        const raw = range / count;
        const mag = Math.pow(10, Math.floor(Math.log10(raw)));
        const norm = raw / mag;
        let step;
        if (norm < 1.5) step = 1; else if (norm < 3) step = 2; else if (norm < 7) step = 5; else step = 10;
        step *= mag;
        const start = Math.ceil(min / step) * step;
        const out = [];
        for (let v = start; v <= max + 1e-6; v += step) out.push(v);
        return out;
    }

    // Catmull-Rom -> bezier smoothing
    function drawSmooth(ctx, pts) {
        if (pts.length === 0) return;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        if (pts.length < 3) {
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
            ctx.stroke();
            return;
        }
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i - 1] || pts[i];
            const p1 = pts[i];
            const p2 = pts[i + 1];
            const p3 = pts[i + 2] || p2;
            const c1x = p1[0] + (p2[0] - p0[0]) / 6;
            const c1y = p1[1] + (p2[1] - p0[1]) / 6;
            const c2x = p2[0] - (p3[0] - p1[0]) / 6;
            const c2y = p2[1] - (p3[1] - p1[1]) / 6;
            ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2[0], p2[1]);
        }
        ctx.stroke();
    }

    function drawTip(ctx, tp) {
        const color = getWordColor(tp.w);
        const a = tp.alpha === undefined ? 1 : tp.alpha;
        const r = tp.r === undefined ? 15 : tp.r;
        ctx.globalAlpha = a;

        // avatar circle at the line tip
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#15151d';
        ctx.stroke();

        // initials only when the circle is large enough to read
        if (r >= 7) {
            ctx.fillStyle = '#fff';
            ctx.font = '700 ' + Math.round(r * 0.85) + 'px Inter, "Segoe UI", sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(tp.w.substring(0, 2).toUpperCase(), tp.x, tp.y + 1);
        }

        // label: word + value
        const lx = tp.x + r + 6;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.font = '600 14px Inter, "Segoe UI", sans-serif';
        ctx.fillStyle = color;
        ctx.fillText(tp.w, lx, tp.y);
        const wWidth = ctx.measureText(tp.w).width;
        ctx.font = '500 13px Inter, "Segoe UI", sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillText(Math.round(tp.v).toLocaleString(), lx + wWidth + 7, tp.y);
        ctx.globalAlpha = 1;
    }

    // ---------- Annotation ----------
    function updateAnnotation(t) {
        const bi = Math.round(t);
        if (bi < 0 || bi >= buckets.length) return;
        const leader = leaderByBucket[bi];
        if (leader && leader !== lastLeader) {
            lastLeader = leader;
            annotation = {
                word: leader,
                value: Math.round(valAt(leader, t)),
                label: buckets[bi].label,
                born: performance.now()
            };
        }
        if (annotation && performance.now() - annotation.born > 3500) annotation = null;
    }

    function drawAnnotation(ctx, plotL, plotT) {
        const age = performance.now() - annotation.born;
        let alpha = 1;
        if (age < 250) alpha = age / 250;
        else if (age > 3000) alpha = Math.max(0, 1 - (age - 3000) / 500);
        ctx.globalAlpha = alpha;
        const x = plotL, y = plotT + 6;
        const color = getWordColor(annotation.word);
        const text1 = '👑 Лидирует: ' + annotation.word;
        const text2 = annotation.label + ' · ' + annotation.value.toLocaleString();
        ctx.font = '700 14px Inter, "Segoe UI", sans-serif';
        const w1 = ctx.measureText(text1).width;
        ctx.font = '500 12px Inter, "Segoe UI", sans-serif';
        const w2 = ctx.measureText(text2).width;
        const cardW = Math.max(w1, w2) + 26;
        const cardH = 50;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        roundRect(ctx, x, y, cardW, cardH, 8); ctx.fill();
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 4, cardH);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.font = '700 14px Inter, "Segoe UI", sans-serif';
        ctx.fillText(text1, x + 14, y + 9);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '500 12px Inter, "Segoe UI", sans-serif';
        ctx.fillText(text2, x + 14, y + 29);
        ctx.globalAlpha = 1;
    }

    // ---------- Drawing: final bar chart ----------
    function drawFinal() {
        const W = canvas.width / dpr, H = canvas.height / dpr;
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#15151d';
        ctx.fillRect(0, 0, W, H);

        const ranked = candidates.slice()
            .filter(w => peakByWord[w] > 0)
            .sort((a, b) => peakByWord[b] - peakByWord[a])
            .slice(0, topN);

        ctx.fillStyle = '#f4f4fa';
        ctx.font = '700 22px Inter, "Segoe UI", sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText('Пиковая популярность за всю историю', 40, 16);

        if (ranked.length === 0) return;
        const maxPeak = peakByWord[ranked[0]];
        const padTop = 64, padBottom = 30, padLeft = 130, padRight = 100;
        const plotW = W - padLeft - padRight;
        const gap = 10;
        const barH = Math.max(16, Math.min(46, (H - padTop - padBottom - gap * ranked.length) / ranked.length));
        const total = barH + gap;
        const ease = easeOutCubic(finalProgress);

        ctx.textBaseline = 'middle';
        ranked.forEach((w, i) => {
            const y = padTop + i * total;
            const color = getWordColor(w);
            const fullW = (peakByWord[w] / maxPeak) * plotW;
            const bw = Math.max(2, fullW * ease);
            // label
            ctx.fillStyle = '#ece5da';
            ctx.font = '600 ' + Math.round(barH * 0.4) + 'px Inter, "Segoe UI", sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(w, padLeft - 12, y + barH / 2);
            // bar
            ctx.fillStyle = color;
            roundRect(ctx, padLeft, y, bw, barH, 5); ctx.fill();
            // avatar at end
            const cx = padLeft + bw;
            ctx.beginPath(); ctx.arc(cx, y + barH / 2, Math.min(barH / 2, 16), 0, Math.PI * 2);
            ctx.fillStyle = color; ctx.fill();
            ctx.strokeStyle = '#15151d'; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = '700 11px Inter, "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(w.substring(0, 2).toUpperCase(), cx, y + barH / 2 + 1);
            // value
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.font = '600 ' + Math.round(barH * 0.38) + 'px Inter, "Segoe UI", sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(Math.round(peakByWord[w] * ease).toLocaleString(), cx + 20, y + barH / 2);
        });
    }

    function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }

    function roundRect(ctx, x, y, w, h, r) {
        r = Math.min(r, h / 2, w / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function escapeHtml(str) {
        const d = document.createElement('div'); d.textContent = str; return d.innerHTML;
    }

    return { init };
})();
