var BubbleModule = (function () {
    'use strict';

    let data = null;
    let canvas, ctx;
    let bubbles = []; // { x, y, r, date, msgs, avgLen, type, topWords }
    let allRawBubbles = []; // unfiltered raw data
    let tooltip = null;
    let sidebar = null;
    let hoveredBubble = null;

    // Zoom & crop state
    let cropStart = 0;   // 0..1 range slider left
    let cropEnd = 1;     // 0..1 range slider right
    let yCapPercent = 100; // Y-axis cap percentage (trim top outliers)
    let isDraggingRange = null; // 'left' | 'right' | 'middle' | null
    let dragStartX = 0;
    let dragStartCropStart = 0;
    let dragStartCropEnd = 0;

    // Stop words for filtering top words display
    const STOP = new Set(['не','ну','как','что','это','на','но','да','то','он','она','они','мы','вы','за','от','по','из','до','же','ли','бы','так','все','вот','еще','ещё','уже','если','или','ни','для','при','без','под','над','про','его','её','ее','их','кто','где','когда','чтобы','только','очень','просто','может','надо','тебе','тебя','себя','себе','был','была','было','были','быть','есть','будет','мне','меня','ты']);

    function init(d) {
        data = d;
        cropStart = 0;
        cropEnd = 1;
        yCapPercent = 100;

        const screen = document.getElementById('viz-bubble');
        screen.innerHTML = `
            <div class="toolbar">
                <button class="ctrl-btn back-btn" id="bubble-back">← Назад</button>
                <h2>Пузырьковая хроника - ${esc(d.chatName)}</h2>
                <div class="toolbar-right">
                    <div class="control-group">
                        <label>Обрезать верх:</label>
                        <input type="range" id="bubble-ycap" min="10" max="100" value="100" step="1">
                        <span id="bubble-ycap-val">100%</span>
                    </div>
                    <button class="ctrl-btn" id="bubble-reset-zoom" title="Сбросить зум">⟲</button>
                </div>
            </div>
            <div class="bubble-layout">
                <div class="bubble-chart-area">
                    <canvas id="bubble-canvas"></canvas>
                    <div class="bubble-range-bar" id="bubble-range-bar">
                        <canvas id="bubble-minimap" height="40"></canvas>
                        <div class="bubble-range-overlay" id="bubble-range-overlay">
                            <div class="bubble-range-handle left" id="bubble-handle-left"></div>
                            <div class="bubble-range-handle right" id="bubble-handle-right"></div>
                        </div>
                    </div>
                </div>
                <div class="bubble-sidebar hidden" id="bubble-sidebar"></div>
            </div>
            <div class="heatmap-tooltip" id="bubble-tooltip"></div>
        `;

        document.getElementById('bubble-back').addEventListener('click', () => UploadModule.goBack());

        canvas = document.getElementById('bubble-canvas');
        ctx = canvas.getContext('2d');
        tooltip = document.getElementById('bubble-tooltip');
        sidebar = document.getElementById('bubble-sidebar');

        // Y-cap slider
        const ycapSlider = document.getElementById('bubble-ycap');
        const ycapVal = document.getElementById('bubble-ycap-val');
        ycapSlider.addEventListener('input', () => {
            yCapPercent = parseInt(ycapSlider.value);
            ycapVal.textContent = yCapPercent + '%';
            computeBubbles();
            drawChart();
        });

        // Reset button
        document.getElementById('bubble-reset-zoom').addEventListener('click', () => {
            cropStart = 0;
            cropEnd = 1;
            yCapPercent = 100;
            ycapSlider.value = 100;
            ycapVal.textContent = '100%';
            computeBubbles();
            drawChart();
            drawMinimap();
            updateRangeOverlay();
        });

        computeRawBubbles();
        computeBubbles();
        drawChart();
        initMinimap();

        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('click', onClick);
        canvas.addEventListener('mouseleave', () => { tooltip.classList.remove('visible'); hoveredBubble = null; });
        canvas.addEventListener('wheel', onWheel, { passive: false });
        window.addEventListener('resize', () => { if (document.getElementById('viz-bubble').classList.contains('active')) { computeBubbles(); drawChart(); drawMinimap(); updateRangeOverlay(); } });
    }

    function computeRawBubbles() {
        allRawBubbles = [];
        const { hourDayMap, dayMap } = data;

        const allDates = [];
        for (const date in hourDayMap) {
            if (date.startsWith('_')) continue;
            allDates.push(date);
        }
        allDates.sort();

        if (allDates.length === 0) return;

        for (const date of allDates) {
            const info = hourDayMap[date];
            const msgs = info.msgs;
            const avgLen = msgs > 0 ? info.words / msgs : 0;

            let type = 'text';
            if (avgLen < 3) type = 'media';
            else if (avgLen > 15) type = 'long';

            let topWords = [];
            if (dayMap[date]) {
                topWords = Object.entries(dayMap[date])
                    .filter(([w]) => !STOP.has(w))
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 30);
            }

            allRawBubbles.push({ date, msgs, avgLen, type, topWords, ts: new Date(date + 'T00:00:00').getTime() });
        }
    }

    function computeBubbles() {
        bubbles = [];
        if (allRawBubbles.length === 0) return;

        // Determine visible range based on crop
        const totalStart = allRawBubbles[0].ts;
        const totalEnd = allRawBubbles[allRawBubbles.length - 1].ts;
        const totalRange = totalEnd - totalStart || 1;

        const visStart = totalStart + cropStart * totalRange;
        const visEnd = totalStart + cropEnd * totalRange;

        // Filter to visible range
        const visible = allRawBubbles.filter(b => b.ts >= visStart && b.ts <= visEnd);
        if (visible.length === 0) return;

        const rangeStart = visible[0].ts;
        const rangeEnd = visible[visible.length - 1].ts;
        const range = rangeEnd - rangeStart || 1;

        // Compute max values within visible range
        let maxMsgs = 1, maxAvgLen = 1;
        for (const b of visible) {
            if (b.msgs > maxMsgs) maxMsgs = b.msgs;
            if (b.avgLen > maxAvgLen) maxAvgLen = b.avgLen;
        }

        // Apply Y-cap: limit the Y axis to a percentage of the max
        const yCap = maxAvgLen * (yCapPercent / 100);

        // Canvas sizing
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.parentElement.getBoundingClientRect();
        const W = rect.width;
        const H = Math.max(400, rect.height - 60); // leave room for minimap
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';

        const pad = { top: 40, right: 30, bottom: 50, left: 50 };
        const chartW = W - pad.left - pad.right;
        const chartH = H - pad.top - pad.bottom;

        for (const b of visible) {
            const x = pad.left + ((b.ts - rangeStart) / range) * chartW;
            const clampedAvg = Math.min(b.avgLen, yCap);
            const y = pad.top + chartH - (clampedAvg / yCap) * chartH;
            const r = Math.max(3, Math.min(20, (b.msgs / maxMsgs) * 18));

            bubbles.push({ ...b, x, y, r, clamped: b.avgLen > yCap });
        }
    }

    function drawChart() {
        const dpr = window.devicePixelRatio || 1;
        const W = canvas.width / dpr;
        const H = canvas.height / dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        ctx.fillStyle = '#12100e';
        ctx.fillRect(0, 0, W, H);

        const pad = { top: 40, right: 30, bottom: 50, left: 50 };

        // Axes labels
        ctx.fillStyle = '#5e564d';
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Время →', W / 2, H - 8);
        ctx.save();
        ctx.translate(12, H / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Средняя длина сообщений ↑', 0, 0);
        ctx.restore();

        // Y-cap indicator
        if (yCapPercent < 100) {
            ctx.fillStyle = '#ff6b6b44';
            ctx.font = '9px system-ui, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText('▼ обрезано ' + (100 - yCapPercent) + '%', W - pad.right, pad.top - 5);
        }

        // Grid
        ctx.strokeStyle = '#23201c';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= 4; i++) {
            const y = pad.top + ((H - pad.top - pad.bottom) / 4) * i;
            ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
        }

        // Date labels on X axis
        if (bubbles.length > 0) {
            ctx.fillStyle = '#5e564d';
            ctx.font = '9px system-ui, sans-serif';
            ctx.textAlign = 'center';
            const step = Math.max(1, Math.floor(bubbles.length / 8));
            for (let i = 0; i < bubbles.length; i += step) {
                const b = bubbles[i];
                ctx.fillText(formatDateShort(b.date), b.x, H - pad.bottom + 16);
            }
            // Always show last date
            const last = bubbles[bubbles.length - 1];
            ctx.fillText(formatDateShort(last.date), last.x, H - pad.bottom + 16);
        }

        // Draw bubbles
        const typeColors = { text: '#a55eea', media: '#2ed573', long: '#0abde3' };

        for (const b of bubbles) {
            ctx.globalAlpha = 0.6;
            ctx.fillStyle = typeColors[b.type] || '#a55eea';
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            ctx.fill();

            // Mark clamped bubbles with a small triangle
            if (b.clamped) {
                ctx.globalAlpha = 0.8;
                ctx.fillStyle = '#ff6b6b';
                ctx.beginPath();
                ctx.moveTo(b.x, b.y - b.r - 4);
                ctx.lineTo(b.x - 3, b.y - b.r - 1);
                ctx.lineTo(b.x + 3, b.y - b.r - 1);
                ctx.closePath();
                ctx.fill();
            }

            ctx.globalAlpha = 1;
        }

        // Legend
        const legendItems = [['Текст', '#a55eea'], ['Медиа/короткие', '#2ed573'], ['Длинные тексты', '#0abde3']];
        ctx.textAlign = 'left';
        legendItems.forEach(([label, color], i) => {
            const x = pad.left + i * 140;
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.7;
            ctx.beginPath(); ctx.arc(x + 6, 18, 5, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#9a9082';
            ctx.font = '10px system-ui, sans-serif';
            ctx.fillText(label, x + 14, 22);
        });

        // Zoom info
        if (cropStart > 0 || cropEnd < 1) {
            ctx.fillStyle = 'rgba(201,137,86,0.53)';
            ctx.font = '9px system-ui, sans-serif';
            ctx.textAlign = 'left';
            const pct = Math.round((cropEnd - cropStart) * 100);
            ctx.fillText('Показано ' + pct + '% диапазона', pad.left, H - 4);
        }
    }

    function onMouseMove(e) {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        hoveredBubble = null;
        for (let i = bubbles.length - 1; i >= 0; i--) {
            const b = bubbles[i];
            const dx = mx - b.x, dy = my - b.y;
            if (dx * dx + dy * dy <= (b.r + 3) * (b.r + 3)) {
                hoveredBubble = b;
                break;
            }
        }

        if (hoveredBubble) {
            tooltip.innerHTML = `<strong>${formatDateRu(hoveredBubble.date)}</strong><br>${hoveredBubble.msgs} сообщ., ~${hoveredBubble.avgLen.toFixed(1)} слов/сообщ.`;
            tooltip.classList.add('visible');
            tooltip.style.left = (e.clientX + 12) + 'px';
            tooltip.style.top = (e.clientY - 40) + 'px';
            canvas.style.cursor = 'pointer';
        } else {
            tooltip.classList.remove('visible');
            canvas.style.cursor = 'default';
        }
    }

    function onClick() {
        if (!hoveredBubble) { sidebar.classList.add('hidden'); return; }
        const b = hoveredBubble;

        const wordsHtml = b.topWords.map(([w, c]) => `<span class="lex-word" style="border-color:var(--accent)">${esc(w)} <small>${c}</small></span>`).join('');

        sidebar.innerHTML = `
            <div class="bubble-card">
                <h3>${formatDateRu(b.date)}</h3>
                <p><strong>${b.msgs}</strong> сообщений</p>
                <p>~${b.avgLen.toFixed(1)} слов/сообщение</p>
                <p>Тип: ${b.type === 'text' ? 'Текстовый' : b.type === 'media' ? 'Медиа/короткий' : 'Длинные тексты'}</p>
                <h4>ТОП-30 слов дня:</h4>
                <div class="lex-words">${wordsHtml || '-'}</div>
            </div>
        `;
        sidebar.classList.remove('hidden');
    }

    function formatDateRu(dateStr) {
        const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        const p = dateStr.split('-');
        return parseInt(p[2], 10) + ' ' + months[parseInt(p[1], 10) - 1] + ' ' + p[0];
    }

    function formatDateShort(dateStr) {
        const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        const p = dateStr.split('-');
        return parseInt(p[2], 10) + ' ' + months[parseInt(p[1], 10) - 1];
    }

    function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

    // === Minimap & Range Slider ===
    function initMinimap() {
        drawMinimap();
        updateRangeOverlay();

        const rangeBar = document.getElementById('bubble-range-bar');
        const overlay = document.getElementById('bubble-range-overlay');
        const handleLeft = document.getElementById('bubble-handle-left');
        const handleRight = document.getElementById('bubble-handle-right');

        handleLeft.addEventListener('mousedown', (e) => { e.stopPropagation(); startDrag(e, 'left'); });
        handleRight.addEventListener('mousedown', (e) => { e.stopPropagation(); startDrag(e, 'right'); });
        overlay.addEventListener('mousedown', (e) => {
            if (e.target === handleLeft || e.target === handleRight) return;
            startDrag(e, 'middle');
        });

        // Click on minimap background to jump
        rangeBar.addEventListener('mousedown', (e) => {
            if (e.target !== rangeBar && e.target.id !== 'bubble-minimap') return;
            const rect = rangeBar.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            const width = cropEnd - cropStart;
            cropStart = Math.max(0, Math.min(1 - width, pos - width / 2));
            cropEnd = cropStart + width;
            computeBubbles();
            drawChart();
            updateRangeOverlay();
        });

        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
    }

    function drawMinimap() {
        const minimapCanvas = document.getElementById('bubble-minimap');
        if (!minimapCanvas) return;
        const rect = minimapCanvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const W = rect.width;
        const H = 40;
        minimapCanvas.width = W * dpr;
        minimapCanvas.height = H * dpr;
        minimapCanvas.style.width = W + 'px';
        minimapCanvas.style.height = H + 'px';

        const mctx = minimapCanvas.getContext('2d');
        mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        mctx.fillStyle = '#0d0d14';
        mctx.fillRect(0, 0, W, H);

        if (allRawBubbles.length === 0) return;

        const startTs = allRawBubbles[0].ts;
        const endTs = allRawBubbles[allRawBubbles.length - 1].ts;
        const range = endTs - startTs || 1;
        let maxAvg = 1;
        for (const b of allRawBubbles) { if (b.avgLen > maxAvg) maxAvg = b.avgLen; }

        const typeColors = { text: '#a55eea', media: '#2ed573', long: '#0abde3' };
        const pad = 4;

        for (const b of allRawBubbles) {
            const x = pad + ((b.ts - startTs) / range) * (W - pad * 2);
            const y = H - pad - (b.avgLen / maxAvg) * (H - pad * 2);
            mctx.globalAlpha = 0.5;
            mctx.fillStyle = typeColors[b.type] || '#a55eea';
            mctx.beginPath();
            mctx.arc(x, y, 2, 0, Math.PI * 2);
            mctx.fill();
        }
        mctx.globalAlpha = 1;
    }

    function updateRangeOverlay() {
        const overlay = document.getElementById('bubble-range-overlay');
        if (!overlay) return;
        overlay.style.left = (cropStart * 100) + '%';
        overlay.style.width = ((cropEnd - cropStart) * 100) + '%';
    }

    function startDrag(e, type) {
        isDraggingRange = type;
        dragStartX = e.clientX;
        dragStartCropStart = cropStart;
        dragStartCropEnd = cropEnd;
        e.preventDefault();
    }

    function onDragMove(e) {
        if (!isDraggingRange) return;
        const rangeBar = document.getElementById('bubble-range-bar');
        if (!rangeBar) return;
        const rect = rangeBar.getBoundingClientRect();
        const dx = (e.clientX - dragStartX) / rect.width;

        if (isDraggingRange === 'left') {
            cropStart = Math.max(0, Math.min(cropEnd - 0.02, dragStartCropStart + dx));
        } else if (isDraggingRange === 'right') {
            cropEnd = Math.max(cropStart + 0.02, Math.min(1, dragStartCropEnd + dx));
        } else if (isDraggingRange === 'middle') {
            const width = dragStartCropEnd - dragStartCropStart;
            let newStart = dragStartCropStart + dx;
            if (newStart < 0) newStart = 0;
            if (newStart + width > 1) newStart = 1 - width;
            cropStart = newStart;
            cropEnd = newStart + width;
        }

        computeBubbles();
        drawChart();
        updateRangeOverlay();
    }

    function onDragEnd() {
        isDraggingRange = null;
    }

    // === Mouse Wheel Zoom ===
    function onWheel(e) {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left) / rect.width; // 0..1 position on chart

        const zoomFactor = e.deltaY > 0 ? 1.15 : 0.85; // scroll down = zoom out, up = zoom in
        const currentWidth = cropEnd - cropStart;
        const newWidth = Math.max(0.02, Math.min(1, currentWidth * zoomFactor));

        // Zoom centered on mouse position within the current range
        const center = cropStart + mouseX * currentWidth;
        let newStart = center - mouseX * newWidth;
        let newEnd = newStart + newWidth;

        // Clamp
        if (newStart < 0) { newStart = 0; newEnd = newWidth; }
        if (newEnd > 1) { newEnd = 1; newStart = 1 - newWidth; }

        cropStart = newStart;
        cropEnd = newEnd;

        computeBubbles();
        drawChart();
        updateRangeOverlay();
    }

    return { init };
})();
