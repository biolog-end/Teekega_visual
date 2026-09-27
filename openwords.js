// Frequency dictionary source: https://github.com/hermitdave/FrequencyWords (CC-BY-SA 4.0)
var OpenWordsModule = (function () {
    'use strict';

    const SOURCES = {
        '50k': {
            label: 'Субтитры - топ 50k',
            format: 'freq',
            url: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/ru/ru_50k.txt'
        },
        'full': {
            label: 'Субтитры - полный (~450k)',
            format: 'freq',
            url: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/ru/ru_full.txt'
        },
        'corpus': {
            label: 'Корпус Лидса - 10k (леммы)',
            format: 'plain',
            url: 'https://raw.githubusercontent.com/hingston/russian/master/10000-russian-words-cyrillic-only.txt',
            note: 'Частотный список лемм по корпусу Университета Лидса (исследовательский, не из фильмов). Слова в начальной форме, поэтому совпадений с чатом может быть меньше.'
        },
        'detcorpus': {
            label: 'Детский корпус - худож. (леммы)',
            format: 'csv',
            url: 'https://raw.githubusercontent.com/Digital-Pushkin-Lab/Russian-Word-Frequency-Lists-for-Children/main/wordlist_detcorpus_50000.csv',
            note: 'Частотный список лемм по корпусу детской художественной литературы (detcorpus, Digital Pushkin Lab, CC0). Слова в начальной форме.'
        },
        'detcorpus_nf': {
            label: 'Детский корпус - научпоп (леммы)',
            format: 'csv',
            url: 'https://raw.githubusercontent.com/Digital-Pushkin-Lab/Russian-Word-Frequency-Lists-for-Children/main/wordlist_detcorpus_nonfiction_new_with_ipm.csv',
            note: 'Частотный список лемм по корпусу детского научпопа (detcorpus, Digital Pushkin Lab, CC0). Слова в начальной форме.'
        }
    };

    // Отдельный словарь имён (кириллица, по имени на строку)
    const NAMES_URL = 'https://raw.githubusercontent.com/curiv/russian_names/master/russian_names.txt';

    const RENDER_BATCH = 300;

    // Латиница и прочий не-кириллический мусор из субтитров (s, b, tv, ...)
    const NON_CYRILLIC_RE = /[a-z]/i;

    // Частые имена из субтитров (OpenSubtitles), которые засоряют рейтинг.
    // Список курируемый и заведомо неполный - переключается галочкой "Скрывать имена".
    const NAMES = new Set([
        // транслитерация иностранных имён
        'джон','джейн','джеймс','джимми','джими','джим','джек','джеки','джо','джоуи','джоди',
        'майк','майкл','мэтт','мэттью','том','томми','томас','сэм','сэмми','саманта',
        'дэвид','дэйв','дэнни','дэн','дэниел','дэниэл','эми','эмили','эмма','бен','бенни','бенджамин',
        'гарри','генри','фрэнк','фрэнки','чарли','чарльз','билли','билл','бобби','боб','роберт',
        'ник','никки','николас','рик','рики','ричард','макс','максвелл','алекс','александр',
        'питер','пит','пол','стив','стиви','стивен','стефан','кейт','кэти','кэтрин','кэрол','кэролайн',
        'мэри','мэрри','сара','сэра','лиза','лили','роуз','рози','джейк','джейкоб','люк','лукас',
        'ной','итан','райан','кевин','брайан','брэд','скотт','дуглас','дон','донна','рон','ронни',
        'кен','кенни','барри','ларри','джерри','терри','кэрри','гэри','бетти','салли','молли','полли',
        'ванесса','дженни','дженнифер','джессика','джесси','кэтлин','элизабет','маргарет','хелен','хелена',
        'оливер','оскар','уолтер','уилл','уильям','вилли','хэнк','хэл','грег','грэг','грэм','митч',
        'тэд','тед','эдди','эд','эдвард','джордж','джорджи','фред','фредди','альберт','артур','арти',
        'марк','мартин','митчелл','натан','нэйт','оуэн','патрик','пэт','перри','куинн','рекс','роджер',
        'сесил','шон','шэрон','спенсер','тоби','трэвис','трой','винс','винсент','уэйн','зак','зои','зоя',
        'анна','аня','мария','маша','маруся','ольга','оля','елена','лена','наташа','наталья','наталия',
        'сергей','серёжа','серега','андрей','андрюша','дмитрий','дима','алексей','лёша','леша','алёша',
        'михаил','миша','николай','коля','владимир','вова','володя','александр','саша','шура',
        'иван','ваня','пётр','петр','петя','павел','паша','борис','боря','глеб','егор','игорь','кирилл',
        'максим','макс','роман','рома','денис','антон','артём','артем','тёма','тема','костя','константин',
        'вася','василий','федя','фёдор','федор','гена','геннадий','витя','виктор','юра','юрий',
        'таня','татьяна','света','светлана','катя','катерина','екатерина','даша','дарья','настя','анастасия',
        'юля','юлия','вера','надя','надежда','люба','любовь','галя','галина','тоня','соня','софья','софия',
        'нина','зина','клава','рая','тома','тамара','валя','валентина','валера','валерий','лида','лидия',
        // обращения/титулы, тоже не несут смысла как "слова"
        'месье','мадам','мадемуазель','сэр','мистер','миссис','мисс','герр','сеньор','синьор','донна'
    ]);

    let data = null;
    let chatWordCounts = null;   // { word: totalCountInChat }
    let dictCache = {};          // { sourceKey: [{ word, freq, rank }] }
    let fetchedNames = null;     // Set имён из внешнего словаря (или null, пока не загружен)
    let currentSource = '50k';
    let currentView = 'opened';  // 'opened' | 'unopened'
    let filterText = '';
    let hideNames = true;

    let fullList = [];           // отфильтрованный список для текущего вида
    let renderedCount = 0;       // сколько строк уже отрисовано

    function init(d) {
        data = d;
        currentView = 'opened';
        filterText = '';

        buildChatWordCounts();

        const screen = document.getElementById('viz-openwords');
        screen.innerHTML = `
            <div class="toolbar">
                <button class="ctrl-btn back-btn" id="ow-back">← Назад</button>
                <h2>Открытые слова - ${esc(d.chatName)}</h2>
                <div class="toolbar-right">
                    <div class="control-group">
                        <label>Словарь:</label>
                        <select id="ow-dict">
                            <option value="50k">${SOURCES['50k'].label}</option>
                            <option value="full">${SOURCES['full'].label}</option>
                            <option value="corpus">${SOURCES['corpus'].label}</option>
                            <option value="detcorpus">${SOURCES['detcorpus'].label}</option>
                            <option value="detcorpus_nf">${SOURCES['detcorpus_nf'].label}</option>
                        </select>
                    </div>
                    <div class="control-group">
                        <label class="ow-check"><input type="checkbox" id="ow-hide-names" checked> Скрывать имена и латиницу</label>
                    </div>
                </div>
            </div>
            <div class="ow-container">
                <div class="ow-status" id="ow-status"></div>
                <div class="ow-main hidden" id="ow-main">
                    <div class="ow-stats" id="ow-stats"></div>
                    <div class="ow-note" id="ow-note"></div>
                    <div class="ow-tabs">
                        <button class="ow-tab active" data-view="opened">🟢 Открытые</button>
                        <button class="ow-tab" data-view="unopened">⚫ Не открытые</button>
                    </div>
                    <div class="ow-search">
                        <input type="text" id="ow-filter" placeholder="Фильтр по слову..." autocomplete="off">
                    </div>
                    <div class="ow-list-head">
                        <span class="ow-col-pos">#</span>
                        <span class="ow-col-word">Слово</span>
                        <span class="ow-col-rank">Рейтинг в языке</span>
                        <span class="ow-col-count">В чате</span>
                    </div>
                    <div class="ow-list" id="ow-list"></div>
                    <button class="upload-btn ow-more hidden" id="ow-more">Показать ещё</button>
                </div>
            </div>
        `;

        document.getElementById('ow-back').addEventListener('click', () => UploadModule.goBack());
        document.getElementById('ow-dict').addEventListener('change', (e) => {
            currentSource = e.target.value;
            loadDictionary();
        });
        screen.querySelectorAll('.ow-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                if (tab.dataset.view === currentView) return;
                screen.querySelectorAll('.ow-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                currentView = tab.dataset.view;
                rebuildList();
            });
        });
        document.getElementById('ow-filter').addEventListener('input', (e) => {
            filterText = e.target.value.toLowerCase().trim();
            rebuildList();
        });
        document.getElementById('ow-hide-names').addEventListener('change', (e) => {
            hideNames = e.target.checked;
            rebuildStats();
            rebuildList();
        });
        document.getElementById('ow-more').addEventListener('click', renderMore);

        loadNames();
        loadDictionary();
    }

    // Собираем суммарные счётчики слов по всему чату из dayMap
    function buildChatWordCounts() {
        chatWordCounts = {};
        if (!data.dayMap) return;
        for (const date in data.dayMap) {
            if (date.startsWith('_')) continue;
            const dayWords = data.dayMap[date];
            for (const word in dayWords) {
                chatWordCounts[word] = (chatWordCounts[word] || 0) + dayWords[word];
            }
        }
    }

    function loadDictionary() {
        const status = document.getElementById('ow-status');
        const main = document.getElementById('ow-main');
        main.classList.add('hidden');

        if (dictCache[currentSource]) {
            status.innerHTML = '';
            main.classList.remove('hidden');
            rebuildStats();
            rebuildList();
            return;
        }

        const src = SOURCES[currentSource];
        status.innerHTML = `
            <div class="ow-loading">
                <div class="spinner"></div>
                <p>Загрузка частотного словаря (${src.label})...</p>
                <p class="filter-hint">Источник: hermitdave/FrequencyWords</p>
            </div>
        `;

        fetch(src.url)
            .then(r => {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.text();
            })
            .then(text => {
                dictCache[currentSource] = parseDictionary(text, src.format);
                status.innerHTML = '';
                main.classList.remove('hidden');
                rebuildStats();
                rebuildList();
            })
            .catch(err => {
                status.innerHTML = `
                    <div class="ow-error">
                        <p>⚠️ Не удалось загрузить словарь.</p>
                        <p class="filter-hint">${esc(err.message)} - проверьте подключение к интернету.</p>
                        <button class="upload-btn" id="ow-retry">Повторить</button>
                    </div>
                `;
                const retry = document.getElementById('ow-retry');
                if (retry) retry.addEventListener('click', loadDictionary);
            });
    }

    function parseDictionary(text, format) {
        const lines = text.split('\n');
        const list = [];
        let rank = 0;
        // CSV-источники (detcorpus) начинаются со строки-заголовка "lemma,abs_frequency,ipm"
        const start = (format === 'csv') ? 1 : 0;
        for (let i = start; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            let word, freq;
            if (format === 'csv') {
                const c1 = line.indexOf(',');
                word = c1 === -1 ? line : line.substring(0, c1);
                let freqStr = '';
                if (c1 !== -1) {
                    const rest = line.substring(c1 + 1);
                    const c2 = rest.indexOf(',');
                    freqStr = c2 === -1 ? rest : rest.substring(0, c2);
                }
                freq = parseInt(freqStr, 10) || 0;
            } else {
                // freq: "слово число", plain: "слово"
                const sp = line.indexOf(' ');
                word = sp === -1 ? line : line.substring(0, sp);
                freq = sp === -1 ? 0 : (parseInt(line.substring(sp + 1), 10) || 0);
            }

            word = word.trim().toLowerCase();
            if (!word) continue;
            // rank отражает реальное место в глобальном рейтинге частотности,
            // поэтому считаем его для каждого слова словаря.
            rank++;
            // Парсер чата не учитывает слова короче 2 символов, поэтому такие
            // слова в принципе не могут быть "открыты". Исключаем их из рейтинга,
            // чтобы они не показывались как не открытые (настоящий global rank сохраняем).
            if (word.length < 2) continue;
            list.push({ word: word, freq: freq, rank: rank });
        }
        return list;
    }

    // Слова, которые исключаются из рейтинга при включённой галочке:
    // латиница (мусор из субтитров) и имена/обращения.
    function isFilteredOut(word) {
        if (!hideNames) return false;
        if (NON_CYRILLIC_RE.test(word)) return true;
        if (NAMES.has(word)) return true;
        if (fetchedNames && fetchedNames.has(word)) return true;
        return false;
    }

    // Загрузка внешнего словаря имён (один раз за сессию)
    function loadNames() {
        if (fetchedNames) return;
        fetch(NAMES_URL)
            .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
            .then(text => {
                const set = new Set();
                const lines = text.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    const name = lines[i].trim().toLowerCase();
                    if (name.length >= 2) set.add(name);
                }
                fetchedNames = set;
                // Если словарь уже отрисован и фильтр включён - пересобираем с учётом имён
                if (hideNames && dictCache[currentSource]) {
                    rebuildStats();
                    rebuildList();
                }
            })
            .catch(() => { /* без внешних имён - используем встроенный список */ });
    }

    function rebuildStats() {
        const dict = dictCache[currentSource];
        if (!dict) return;

        let openedCount = 0;
        let total = 0;
        let rarestOpened = null;   // открытое слово с самым большим (худшим) глобальным рейтингом
        for (let i = 0; i < dict.length; i++) {
            if (isFilteredOut(dict[i].word)) continue;
            total++;
            if (chatWordCounts[dict[i].word]) {
                openedCount++;
                rarestOpened = dict[i]; // т.к. список упорядочен по частоте, последнее найденное - самое редкое
            }
        }

        const pct = total ? ((openedCount / total) * 100) : 0;

        const noteEl = document.getElementById('ow-note');
        if (noteEl) {
            const note = SOURCES[currentSource].note;
            noteEl.innerHTML = note ? `<p class="filter-hint">ℹ️ ${esc(note)}</p>` : '';
        }

        let rareHtml = '';
        if (rarestOpened) {
            rareHtml = `<div class="ow-stat">
                <span class="ow-stat-num">#${rarestOpened.rank.toLocaleString('ru-RU')}</span>
                <span class="ow-stat-lbl">самое редкое слово в коллекции:<br><b>${esc(rarestOpened.word)}</b></span>
            </div>`;
        }

        document.getElementById('ow-stats').innerHTML = `
            <div class="ow-stat">
                <span class="ow-stat-num">${openedCount.toLocaleString('ru-RU')}</span>
                <span class="ow-stat-lbl">открыто слов</span>
            </div>
            <div class="ow-stat">
                <span class="ow-stat-num">${pct.toFixed(1)}%</span>
                <span class="ow-stat-lbl">из топ-${total.toLocaleString('ru-RU')}<br>словаря языка</span>
            </div>
            ${rareHtml}
        `;
    }

    function rebuildList() {
        const dict = dictCache[currentSource];
        if (!dict) return;

        // Формируем список под текущий вид
        fullList = [];
        for (let i = 0; i < dict.length; i++) {
            const entry = dict[i];
            if (isFilteredOut(entry.word)) continue;
            const inChat = !!chatWordCounts[entry.word];
            if (currentView === 'opened' && !inChat) continue;
            if (currentView === 'unopened' && inChat) continue;
            if (filterText && entry.word.indexOf(filterText) === -1) continue;
            fullList.push(entry);
        }

        const listEl = document.getElementById('ow-list');
        listEl.innerHTML = '';
        renderedCount = 0;

        if (fullList.length === 0) {
            listEl.innerHTML = `<div class="ow-empty">${
                currentView === 'opened'
                    ? 'Пока ни одно слово из словаря не встречалось в чате.'
                    : 'Все слова словаря уже открыты - впечатляюще!'
            }</div>`;
            document.getElementById('ow-more').classList.add('hidden');
            return;
        }

        renderMore();
    }

    function renderMore() {
        const listEl = document.getElementById('ow-list');
        const moreBtn = document.getElementById('ow-more');
        const end = Math.min(renderedCount + RENDER_BATCH, fullList.length);

        let html = '';
        for (let i = renderedCount; i < end; i++) {
            const entry = fullList[i];
            const pos = i + 1;
            const count = chatWordCounts[entry.word] || 0;
            const countHtml = currentView === 'opened'
                ? `<span class="ow-col-count ow-count-val">${count.toLocaleString('ru-RU')}</span>`
                : `<span class="ow-col-count ow-count-zero">-</span>`;
            html += `
                <div class="ow-row ${currentView === 'unopened' ? 'ow-row-locked' : ''}">
                    <span class="ow-col-pos">${pos.toLocaleString('ru-RU')}</span>
                    <span class="ow-col-word">${esc(entry.word)}</span>
                    <span class="ow-col-rank">#${entry.rank.toLocaleString('ru-RU')}</span>
                    ${countHtml}
                </div>
            `;
        }
        listEl.insertAdjacentHTML('beforeend', html);
        renderedCount = end;

        if (renderedCount < fullList.length) {
            moreBtn.classList.remove('hidden');
            moreBtn.textContent = `Показать ещё (осталось ${(fullList.length - renderedCount).toLocaleString('ru-RU')})`;
        } else {
            moreBtn.classList.add('hidden');
        }
    }

    function esc(str) { const d = document.createElement('div'); d.textContent = str == null ? '' : str; return d.innerHTML; }

    return { init };
})();
