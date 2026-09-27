var BalanceModule = (function () {
    'use strict';

    const PAUSE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours

    function init(data) {
        const screen = document.getElementById('viz-balance');
        screen.innerHTML = `
            <div class="toolbar">
                <button class="ctrl-btn back-btn" id="balance-back">← Назад</button>
                <h2>${esc(data.chatName)} - Баланс сил</h2>
                <div></div>
            </div>
            <div class="balance-container" id="balance-content"></div>
        `;
        document.getElementById('balance-back').addEventListener('click', () => UploadModule.goBack());

        const users = data.users.slice(0, 2); // only first 2 participants
        if (users.length < 2) {
            document.getElementById('balance-content').innerHTML = '<p style="padding:2rem;color:var(--text-secondary)">Для этой визуализации нужен диалог двух собеседников.</p>';
            return;
        }

        const analysis = analyze(data, users);
        render(document.getElementById('balance-content'), analysis, users, data);
    }

    function analyze(data, users) {
        const { userDayMsgs, msgTimeline, userWords, minDate, maxDate, hourDayMap } = data;
        const [u1, u2] = users;

        // 1. Monthly balance
        const monthlyBalance = computeMonthlyBalance(userDayMsgs, users, minDate, maxDate);

        // 2. Initiator analysis
        const initiator = computeInitiator(msgTimeline, users);

        // 3. Response time
        const responseTime = computeResponseTime(msgTimeline, users);

        // 4. Unique lexicon
        const lexicon = computeUniqueLexicon(userWords, users);

        // 5. Golden day
        const goldenDay = computeGoldenDay(userDayMsgs, hourDayMap, data.dayMap, users);

        return { monthlyBalance, initiator, responseTime, lexicon, goldenDay };
    }

    function computeMonthlyBalance(userDayMsgs, users, minDate, maxDate) {
        const [u1, u2] = users;
        const months = {};

        for (const date in userDayMsgs) {
            const monthKey = date.substring(0, 7); // YYYY-MM
            if (!months[monthKey]) months[monthKey] = { [u1]: 0, [u2]: 0 };
            const day = userDayMsgs[date];
            if (day[u1]) months[monthKey][u1] += day[u1];
            if (day[u2]) months[monthKey][u2] += day[u2];
        }

        // Sort by month
        const sorted = Object.entries(months).sort((a, b) => a[0].localeCompare(b[0]));
        return sorted.map(([month, counts]) => {
            const total = counts[u1] + counts[u2];
            return { month, u1: counts[u1], u2: counts[u2], total, pct1: total > 0 ? (counts[u1] / total * 100) : 50 };
        });
    }

    function computeInitiator(msgTimeline, users) {
        const [u1, u2] = users;
        let initiations = { [u1]: 0, [u2]: 0 };
        // Also track by month
        const monthlyInit = {};

        for (let i = 0; i < msgTimeline.length; i++) {
            if (i === 0) {
                const from = msgTimeline[i].from;
                if (from === u1 || from === u2) initiations[from]++;
                continue;
            }
            const prevTs = new Date(msgTimeline[i - 1].ts).getTime();
            const curTs = new Date(msgTimeline[i].ts).getTime();
            const gap = curTs - prevTs;

            if (gap >= PAUSE_THRESHOLD_MS) {
                const from = msgTimeline[i].from;
                if (from === u1 || from === u2) {
                    initiations[from]++;
                    const monthKey = msgTimeline[i].ts.substring(0, 7);
                    if (!monthlyInit[monthKey]) monthlyInit[monthKey] = { [u1]: 0, [u2]: 0 };
                    monthlyInit[monthKey][from]++;
                }
            }
        }

        return { totals: initiations, monthly: monthlyInit };
    }

    function computeResponseTime(msgTimeline, users) {
        const [u1, u2] = users;
        // response times in minutes
        const responseTimes = { [u1]: [], [u2]: [] };
        let longestWait = { from: '', to: '', minutes: 0, date: '' };

        for (let i = 1; i < msgTimeline.length; i++) {
            const prev = msgTimeline[i - 1];
            const cur = msgTimeline[i];

            if (prev.from !== cur.from && (prev.from === u1 || prev.from === u2) && (cur.from === u1 || cur.from === u2)) {
                const prevTs = new Date(prev.ts).getTime();
                const curTs = new Date(cur.ts).getTime();
                const diffMin = (curTs - prevTs) / 60000;

                // Skip unreasonably long gaps (>24h) for average calculation
                if (diffMin > 0 && diffMin <= 1440) {
                    responseTimes[cur.from].push(diffMin);
                }

                // Track longest wait regardless
                if (diffMin > longestWait.minutes) {
                    longestWait = { from: prev.from, to: cur.from, minutes: diffMin, date: cur.ts.substring(0, 10) };
                }
            }
        }

        const avg = {};
        for (const u of users) {
            const times = responseTimes[u];
            avg[u] = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
        }

        return { avg, longestWait, counts: { [u1]: responseTimes[u1].length, [u2]: responseTimes[u2].length } };
    }

    // Typo/laugh pattern filter - matches repetitive consonant patterns like пхпхпх, хпхпхп, хахпхпхпх etc.
    const TYPO_PATTERNS = [
        /^[хп]{4,}$/,           // хпхп, пхпх, хппх...
        /^(пх|хп|пхп|хпх)+$/,  // repeating пх/хп
        /^(ха)+[хп]*$/,        // хахахпх...
        /^[хпа]{5,}$/,         // any long mix of х, п, а
        /^х+п+х*п*х*$/,        // хппхх...
        /^п+х+п*х*п*$/,        // пххп...
    ];

    function isTypoWord(word) {
        if (word.length < 4) return false;
        // Check if word is mostly repetitive consonants (х, п with optional а)
        for (const re of TYPO_PATTERNS) {
            if (re.test(word)) return true;
        }
        // Generic: if word has 4+ chars and consists only of х, п, а
        if (/^[хпа]{4,}$/.test(word)) return true;
        return false;
    }

    function computeUniqueLexicon(userWords, users) {
        const [u1, u2] = users;
        const w1 = userWords[u1] || {};
        const w2 = userWords[u2] || {};

        const unique1 = [];
        const unique2 = [];

        for (const word in w1) {
            if (w1[word] >= 3 && (!w2[word] || w2[word] <= 1) && !isTypoWord(word)) {
                unique1.push([word, w1[word]]);
            }
        }
        for (const word in w2) {
            if (w2[word] >= 3 && (!w1[word] || w1[word] <= 1) && !isTypoWord(word)) {
                unique2.push([word, w2[word]]);
            }
        }

        unique1.sort((a, b) => b[1] - a[1]);
        unique2.sort((a, b) => b[1] - a[1]);

        // Store all, render will slice based on user setting
        return { [u1]: unique1, [u2]: unique2 };
    }

    function computeGoldenDay(userDayMsgs, hourDayMap, dayMap, users) {
        let maxDay = '';
        let maxCount = 0;

        for (const date in userDayMsgs) {
            if (date.startsWith('_')) continue;
            const total = Object.values(userDayMsgs[date]).reduce((a, b) => a + b, 0);
            if (total > maxCount) {
                maxCount = total;
                maxDay = date;
            }
        }

        // Get top words of that day
        const topWords = [];
        if (dayMap[maxDay]) {
            const entries = Object.entries(dayMap[maxDay]).sort((a, b) => b[1] - a[1]).slice(0, 20);
            topWords.push(...entries);
        }

        // Per-user breakdown
        const perUser = userDayMsgs[maxDay] || {};

        return { date: maxDay, totalMsgs: maxCount, perUser, topWords };
    }

    // === Rendering ===
    function render(container, analysis, users, data) {
        const [u1, u2] = users;
        const color1 = '#6c63ff';
        const color2 = '#ff6b6b';

        let html = '';

        // Section 1: Balance Area Chart
        html += renderBalanceChart(analysis.monthlyBalance, u1, u2, color1, color2);

        // Section 2: Initiator
        html += renderInitiator(analysis.initiator, u1, u2, color1, color2);

        // Section 3: Response Time
        html += renderResponseTime(analysis.responseTime, u1, u2, color1, color2);

        // Section 4: Unique Lexicon
        html += renderLexicon(analysis.lexicon, u1, u2, color1, color2);

        // Section 5: Golden Day
        html += renderGoldenDay(analysis.goldenDay, u1, u2, color1, color2);

        container.innerHTML = html;

        // Bind lexicon update button
        const lexBtn = document.getElementById('lex-update');
        if (lexBtn) {
            lexBtn.addEventListener('click', () => {
                const count = parseInt(document.getElementById('lex-count').value, 10) || 60;
                const allWords1 = analysis.lexicon[u1] || [];
                const allWords2 = analysis.lexicon[u2] || [];
                const w1 = allWords1.slice(0, count);
                const w2 = allWords2.slice(0, count);

                document.getElementById('lex-words-1').innerHTML = w1.length > 0
                    ? w1.map(([w, c]) => `<span class="lex-word" style="border-color:${color1}">${esc(w)} <small>${c}</small></span>`).join('')
                    : '<span class="lex-empty">Нет</span>';
                document.getElementById('lex-words-2').innerHTML = w2.length > 0
                    ? w2.map(([w, c]) => `<span class="lex-word" style="border-color:${color2}">${esc(w)} <small>${c}</small></span>`).join('')
                    : '<span class="lex-empty">Нет</span>';
            });
        }
    }

    function renderBalanceChart(monthly, u1, u2, c1, c2) {
        let rows = '';
        for (const m of monthly) {
            const pct1 = m.pct1.toFixed(0);
            const pct2 = (100 - m.pct1).toFixed(0);
            rows += `
                <div class="balance-row">
                    <span class="balance-month">${m.month}</span>
                    <span class="balance-pct" style="color:${c1}">${pct1}%</span>
                    <div class="balance-bar">
                        <div class="balance-bar-left" style="width:${m.pct1}%;background:${c1}" title="${esc(u1)}: ${m.u1} (${pct1}%)"></div>
                        <div class="balance-bar-right" style="width:${100-m.pct1}%;background:${c2}" title="${esc(u2)}: ${m.u2} (${pct2}%)"></div>
                    </div>
                    <span class="balance-pct" style="color:${c2}">${pct2}%</span>
                    <span class="balance-counts">${m.u1} / ${m.u2}</span>
                </div>
            `;
        }

        return `
            <div class="balance-section">
                <h3 class="balance-title">📊 Баланс сил во времени</h3>
                <div class="balance-legend">
                    <span class="balance-legend-item"><span class="legend-dot" style="background:${c1}"></span>${esc(u1)}</span>
                    <span class="balance-legend-item"><span class="legend-dot" style="background:${c2}"></span>${esc(u2)}</span>
                </div>
                <div class="balance-chart">${rows}</div>
            </div>
        `;
    }

    function renderInitiator(initiator, u1, u2, c1, c2) {
        const t1 = initiator.totals[u1] || 0;
        const t2 = initiator.totals[u2] || 0;
        const total = t1 + t2 || 1;
        const pct1 = (t1 / total * 100).toFixed(1);
        const pct2 = (t2 / total * 100).toFixed(1);

        return `
            <div class="balance-section">
                <h3 class="balance-title">🏁 Кто первый? (Инициатор после паузы 6ч+)</h3>
                <div class="initiator-wrap">
                    <div class="initiator-pie">
                        <svg viewBox="0 0 36 36" class="pie-svg">
                            <circle cx="18" cy="18" r="15.9" fill="none" stroke="${c2}" stroke-width="4" stroke-dasharray="${pct2} ${pct1}" stroke-dashoffset="25"/>
                            <circle cx="18" cy="18" r="15.9" fill="none" stroke="${c1}" stroke-width="4" stroke-dasharray="${pct1} ${pct2}" stroke-dashoffset="${25 - parseFloat(pct2)}"/>
                        </svg>
                    </div>
                    <div class="initiator-stats">
                        <p><span class="legend-dot" style="background:${c1}"></span><strong>${esc(u1)}</strong>: ${t1} раз (${pct1}%)</p>
                        <p><span class="legend-dot" style="background:${c2}"></span><strong>${esc(u2)}</strong>: ${t2} раз (${pct2}%)</p>
                        <p class="initiator-note">Всего пауз: ${total}</p>
                    </div>
                </div>
            </div>
        `;
    }

    function renderResponseTime(rt, u1, u2, c1, c2) {
        const avg1 = rt.avg[u1];
        const avg2 = rt.avg[u2];
        const maxAvg = Math.max(avg1, avg2) || 1;

        const longestMin = rt.longestWait.minutes;
        let longestText = '';
        if (longestMin > 0) {
            const days = Math.floor(longestMin / 1440);
            const hours = Math.floor((longestMin % 1440) / 60);
            const mins = Math.round(longestMin % 60);
            let parts = [];
            if (days > 0) parts.push(days + ' дн');
            if (hours > 0) parts.push(hours + ' ч');
            if (mins > 0) parts.push(mins + ' мин');
            longestText = `🏆 Рекорд ожидания: <strong>${parts.join(' ')}</strong> - ${esc(rt.longestWait.from)} не отвечал(а) до ${rt.longestWait.date}`;
        }

        return `
            <div class="balance-section">
                <h3 class="balance-title">⏱ Режим ожидания (среднее время ответа)</h3>
                <div class="response-bars">
                    <div class="response-row">
                        <span class="response-name" style="color:${c1}">${esc(u1)}</span>
                        <div class="response-track">
                            <div class="response-fill" style="width:${(avg1/maxAvg*100).toFixed(1)}%;background:${c1}">${formatMinutes(avg1)}</div>
                        </div>
                    </div>
                    <div class="response-row">
                        <span class="response-name" style="color:${c2}">${esc(u2)}</span>
                        <div class="response-track">
                            <div class="response-fill" style="width:${(avg2/maxAvg*100).toFixed(1)}%;background:${c2}">${formatMinutes(avg2)}</div>
                        </div>
                    </div>
                </div>
                ${longestText ? `<p class="response-record">${longestText}</p>` : ''}
            </div>
        `;
    }

    function renderLexicon(lexicon, u1, u2, c1, c2) {
        const defaultCount = 60;
        const allWords1 = lexicon[u1] || [];
        const allWords2 = lexicon[u2] || [];
        const words1 = allWords1.slice(0, defaultCount);
        const words2 = allWords2.slice(0, defaultCount);

        let list1 = words1.map(([w, c]) => `<span class="lex-word" style="border-color:${c1}">${esc(w)} <small>${c}</small></span>`).join('');
        let list2 = words2.map(([w, c]) => `<span class="lex-word" style="border-color:${c2}">${esc(w)} <small>${c}</small></span>`).join('');

        if (!list1) list1 = '<span class="lex-empty">Нет уникальных слов</span>';
        if (!list2) list2 = '<span class="lex-empty">Нет уникальных слов</span>';

        const total1 = allWords1.length;
        const total2 = allWords2.length;

        return `
            <div class="balance-section" id="lex-section">
                <h3 class="balance-title">💬 Уникальный лексикон</h3>
                <div class="lex-controls">
                    <span class="filter-hint">Слова, которые использует только один (≥3 раз, другой ≤1). Фильтр опечаток включён.</span>
                    <div class="control-group" style="margin-top:0.5rem">
                        <label>Показать слов:</label>
                        <input type="number" id="lex-count" value="${defaultCount}" min="10" max="500" style="width:70px">
                        <button class="upload-btn" id="lex-update" style="padding:0.3rem 0.8rem;font-size:0.75rem">Обновить</button>
                        <span class="filter-hint" style="margin:0 0 0 0.5rem">(${esc(u1)}: ${total1} всего, ${esc(u2)}: ${total2} всего)</span>
                    </div>
                </div>
                <div class="lex-columns" id="lex-columns">
                    <div class="lex-col">
                        <h4 style="color:${c1}">${esc(u1)}</h4>
                        <div class="lex-words" id="lex-words-1">${list1}</div>
                    </div>
                    <div class="lex-col">
                        <h4 style="color:${c2}">${esc(u2)}</h4>
                        <div class="lex-words" id="lex-words-2">${list2}</div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderGoldenDay(golden, u1, u2, c1, c2) {
        if (!golden.date) return '';

        const perUser = golden.perUser;

        return `
            <div class="balance-section">
                <h3 class="balance-title">🌟 Золотой день - ${formatDateRu(golden.date)}</h3>
                <div class="golden-stats">
                    <p><strong>${golden.totalMsgs}</strong> сообщений за день</p>
                    <p style="color:${c1}">${esc(u1)}: ${perUser[u1] || 0}</p>
                    <p style="color:${c2}">${esc(u2)}: ${perUser[u2] || 0}</p>
                </div>
            </div>
        `;
    }

    // Helpers
    function formatMinutes(min) {
        if (min < 1) return '<1 мин';
        if (min < 60) return Math.round(min) + ' мин';
        const h = Math.floor(min / 60);
        const m = Math.round(min % 60);
        return h + ' ч ' + m + ' мин';
    }

    function formatDateRu(dateStr) {
        const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
        const p = dateStr.split('-');
        return parseInt(p[2], 10) + ' ' + months[parseInt(p[1], 10) - 1] + ' ' + p[0];
    }

    function esc(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    return { init };
})();
