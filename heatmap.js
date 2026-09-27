var HeatmapModule = (function () {
    'use strict';

    let container = null;
    let tooltip = null;

    function init(data) {
        const screen = document.getElementById('viz-heatmap');
        screen.innerHTML = `
            <div class="toolbar">
                <button class="ctrl-btn back-btn" id="heatmap-back">← Назад</button>
                <h2>${escapeHtml(data.chatName)} - Тепловая карта</h2>
                <div></div>
            </div>
            <div class="heatmap-container" id="heatmap-content"></div>
            <div class="heatmap-tooltip" id="heatmap-tooltip"></div>
        `;

        document.getElementById('heatmap-back').addEventListener('click', () => UploadModule.goBack());

        container = document.getElementById('heatmap-content');
        tooltip = document.getElementById('heatmap-tooltip');

        render(data);
    }

    function render(data) {
        const { hourDayMap, minDate, maxDate } = data;

        // Collect all day counts
        const dayCounts = {};
        let maxMsgs = 0;
        for (const key in hourDayMap) {
            if (key.startsWith('_')) continue;
            const d = hourDayMap[key];
            dayCounts[key] = d;
            if (d.msgs > maxMsgs) maxMsgs = d.msgs;
        }

        // Group by year
        const startYear = parseInt(minDate.substring(0, 4), 10);
        const endYear = parseInt(maxDate.substring(0, 4), 10);

        let html = '';

        for (let year = startYear; year <= endYear; year++) {
            html += `<div class="heatmap-year">`;
            html += `<div class="heatmap-year-title">${year}</div>`;
            html += renderYear(year, dayCounts, maxMsgs);
            html += renderLegend(maxMsgs);
            html += `</div>`;
        }

        container.innerHTML = html;

        // Tooltip events
        container.addEventListener('mouseover', (e) => {
            const cell = e.target.closest('.heatmap-cell');
            if (!cell) { tooltip.classList.remove('visible'); return; }
            const date = cell.dataset.date;
            const msgs = cell.dataset.msgs || '0';
            const words = cell.dataset.words || '0';
            tooltip.innerHTML = `<strong>${formatDateRu(date)}</strong><br>${msgs} сообщ. / ${words} слов`;
            tooltip.classList.add('visible');
        });

        container.addEventListener('mousemove', (e) => {
            tooltip.style.left = (e.clientX + 12) + 'px';
            tooltip.style.top = (e.clientY - 40) + 'px';
        });

        container.addEventListener('mouseout', (e) => {
            if (!e.target.closest('.heatmap-cell')) tooltip.classList.remove('visible');
        });
    }

    function renderYear(year, dayCounts, maxMsgs) {
        // Build weeks grid (Sun=0 start)
        const jan1 = new Date(year, 0, 1);
        const dec31 = new Date(year, 11, 31);
        const startDow = jan1.getDay();

        let html = '<div class="heatmap-grid">';

        // Iterate week by week
        const current = new Date(jan1);
        // Go back to the Sunday of the first week
        current.setDate(current.getDate() - startDow);

        while (current <= dec31 || current.getDay() !== 0) {
            html += '<div class="heatmap-week">';
            for (let d = 0; d < 7; d++) {
                const dateStr = current.toISOString().substring(0, 10);
                const inYear = current.getFullYear() === year;
                const info = dayCounts[dateStr];
                const msgs = info ? info.msgs : 0;
                const words = info ? info.words : 0;
                const level = inYear ? getLevel(msgs, maxMsgs) : 0;
                const color = getColor(level);

                html += `<div class="heatmap-cell" style="background:${color}" data-date="${dateStr}" data-msgs="${msgs}" data-words="${words}" data-count="${msgs}"></div>`;
                current.setDate(current.getDate() + 1);
            }
            html += '</div>';
            if (current > dec31 && current.getDay() === 0) break;
        }

        html += '</div>';
        return html;
    }

    function renderLegend(maxMsgs) {
        let html = '<div class="heatmap-legend">Меньше ';
        for (let i = 0; i <= 4; i++) {
            html += `<div class="heatmap-legend-cell" style="background:${getColor(i)}"></div>`;
        }
        html += ' Больше</div>';
        return html;
    }

    function getLevel(count, max) {
        if (count === 0) return 0;
        const ratio = count / max;
        if (ratio < 0.15) return 1;
        if (ratio < 0.35) return 2;
        if (ratio < 0.6) return 3;
        return 4;
    }

    function getColor(level) {
        const colors = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];
        return colors[level] || colors[0];
    }

    function formatDateRu(dateStr) {
        const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        const parts = dateStr.split('-');
        return parseInt(parts[2], 10) + ' ' + months[parseInt(parts[1], 10) - 1] + ' ' + parts[0];
    }

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    return { init };
})();
