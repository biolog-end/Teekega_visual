var PunchcardModule = (function () {
    'use strict';

    function init(data) {
        const screen = document.getElementById('viz-punchcard');
        screen.innerHTML = `
            <div class="toolbar">
                <button class="ctrl-btn back-btn" id="punchcard-back">← Назад</button>
                <h2>${escapeHtml(data.chatName)} - Суточный ритм</h2>
                <div></div>
            </div>
            <div class="punchcard-container" id="punchcard-content"></div>
        `;

        document.getElementById('punchcard-back').addEventListener('click', () => UploadModule.goBack());

        render(data);
    }

    function render(data) {
        const container = document.getElementById('punchcard-content');
        const punch = data.hourDayMap['_punch'] || {};

        // Build matrix [day][hour]
        const matrix = [];
        let maxVal = 0;
        const dayTotals = new Array(7).fill(0);
        const hourTotals = new Array(24).fill(0);

        for (let d = 0; d < 7; d++) {
            matrix[d] = [];
            for (let h = 0; h < 24; h++) {
                const key = d + '_' + h;
                const val = punch[key] || 0;
                matrix[d][h] = val;
                if (val > maxVal) maxVal = val;
                dayTotals[d] += val;
                hourTotals[h] += val;
            }
        }

        const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

        // Punch card grid
        let gridHtml = '<div class="punchcard-section"><div class="punchcard-title">Активность по часам и дням недели</div>';
        gridHtml += '<div class="punchcard-grid">';

        // Header row (hours)
        gridHtml += '<div></div>';
        for (let h = 0; h < 24; h++) {
            gridHtml += `<div class="punchcard-hour-label">${h}</div>`;
        }

        // Data rows
        for (let d = 0; d < 7; d++) {
            gridHtml += `<div class="punchcard-day-label">${dayNames[d]}</div>`;
            for (let h = 0; h < 24; h++) {
                const val = matrix[d][h];
                const opacity = maxVal > 0 ? Math.max(0.05, val / maxVal) : 0;
                const size = maxVal > 0 ? Math.max(30, (val / maxVal) * 100) : 30;
                gridHtml += `<div class="punchcard-dot" style="opacity:${opacity};width:${size}%;height:${size}%" title="${val} сообщ."></div>`;
            }
        }

        gridHtml += '</div></div>';

        // Hourly bar chart
        const maxHour = Math.max(...hourTotals);
        let hourHtml = '<div class="punchcard-bar-section"><div class="punchcard-title">Сообщения по часам</div>';
        for (let h = 0; h < 24; h++) {
            const pct = maxHour > 0 ? (hourTotals[h] / maxHour) * 100 : 0;
            hourHtml += `<div class="punchcard-bar-row">
                <div class="punchcard-bar-label">${h}:00</div>
                <div class="punchcard-bar-track">
                    <div class="punchcard-bar-fill" style="width:${pct}%">${hourTotals[h]}</div>
                </div>
            </div>`;
        }
        hourHtml += '</div>';

        // Day of week bar chart
        const maxDay = Math.max(...dayTotals);
        let dayHtml = '<div class="punchcard-bar-section"><div class="punchcard-title">Сообщения по дням недели</div>';
        for (let d = 0; d < 7; d++) {
            const pct = maxDay > 0 ? (dayTotals[d] / maxDay) * 100 : 0;
            dayHtml += `<div class="punchcard-bar-row">
                <div class="punchcard-bar-label">${dayNames[d]}</div>
                <div class="punchcard-bar-track">
                    <div class="punchcard-bar-fill" style="width:${pct}%">${dayTotals[d]}</div>
                </div>
            </div>`;
        }
        dayHtml += '</div>';

        container.innerHTML = gridHtml + hourHtml + dayHtml;
    }

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    return { init };
})();
