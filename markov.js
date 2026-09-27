var MarkovModule = (function () {
    'use strict';

    let data = null;
    let selectedUser = null;
    let currentWord = '';
    let phrase = [];

    function init(d) {
        data = d;
        const users = d.users.slice(0, 2);

        const screen = document.getElementById('viz-markov');
        screen.innerHTML = `
            <div class="toolbar">
                <button class="ctrl-btn back-btn" id="markov-back">\u2190 Назад</button>
                <h2>Т9 чата - ${esc(d.chatName)}</h2>
                <div></div>
            </div>
            <div class="markov-container">
                <div class="markov-header">
                    <h3>Генератор фраз</h3>
                    <p>Выберите автора, введите первое слово и собирайте фразу кликами</p>
                </div>
                <div class="markov-user-select" id="markov-users"></div>
                <div class="markov-seed">
                    <input type="text" id="markov-input" placeholder="Первое слово (напр: я, ты, мне)">
                    <button class="upload-btn" id="markov-start">Начать</button>
                </div>
                <div class="markov-phrase" id="markov-phrase">
                    <span class="filter-hint">Выберите автора и введите слово для начала</span>
                </div>
                <div class="markov-choices" id="markov-choices"></div>
                <div class="markov-actions">
                    <button class="markov-action-btn" id="markov-reset">Сбросить</button>
                    <button class="markov-action-btn" id="markov-copy">Копировать</button>
                </div>
            </div>
        `;

        // Render user buttons
        const usersDiv = document.getElementById('markov-users');
        users.forEach(u => {
            const btn = document.createElement('button');
            btn.className = 'markov-user-btn';
            btn.textContent = u;
            btn.addEventListener('click', () => {
                selectedUser = u;
                usersDiv.querySelectorAll('.markov-user-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
            usersDiv.appendChild(btn);
        });

        // Select first user by default
        if (users.length > 0) {
            selectedUser = users[0];
            usersDiv.querySelector('.markov-user-btn').classList.add('active');
        }

        document.getElementById('markov-back').addEventListener('click', () => UploadModule.goBack());
        document.getElementById('markov-start').addEventListener('click', startGeneration);
        document.getElementById('markov-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') startGeneration(); });
        document.getElementById('markov-reset').addEventListener('click', resetPhrase);
        document.getElementById('markov-copy').addEventListener('click', copyPhrase);
    }

    function startGeneration() {
        if (!selectedUser) { alert('Выберите автора'); return; }

        const input = document.getElementById('markov-input').value.toLowerCase().trim();
        if (!input) return;

        phrase = [input];
        currentWord = input;
        renderPhrase();
        showChoices();
    }

    function resetPhrase() {
        phrase = [];
        currentWord = '';
        document.getElementById('markov-phrase').innerHTML = '<span class="filter-hint">Выберите автора и введите слово для начала</span>';
        document.getElementById('markov-choices').innerHTML = '';
    }

    function copyPhrase() {
        if (phrase.length === 0) return;
        const text = phrase.join(' ');
        navigator.clipboard.writeText(text).catch(() => {});
    }

    function showChoices() {
        const choicesDiv = document.getElementById('markov-choices');
        const bigrams = data.userBigrams[selectedUser];

        if (!bigrams || !bigrams[currentWord]) {
            choicesDiv.innerHTML = '<span class="filter-hint">Нет продолжений для этого слова. Попробуйте другое.</span>';
            return;
        }

        const nextWords = bigrams[currentWord];
        // Sort by frequency, take top 10
        const sorted = Object.entries(nextWords).sort((a, b) => b[1] - a[1]).slice(0, 10);

        choicesDiv.innerHTML = '';
        sorted.forEach(([word, freq]) => {
            const btn = document.createElement('button');
            btn.className = 'markov-choice-btn';
            btn.innerHTML = `${esc(word)} <span class="choice-freq">${freq}</span>`;
            btn.addEventListener('click', () => {
                phrase.push(word);
                currentWord = word;
                renderPhrase();
                showChoices();
            });
            choicesDiv.appendChild(btn);
        });
    }

    function renderPhrase() {
        const phraseDiv = document.getElementById('markov-phrase');
        const html = phrase.map((w, i) => {
            if (i === 0) return `<span class="seed-word">${esc(w)}</span>`;
            return `<span class="gen-word">${esc(w)}</span>`;
        }).join(' ');
        phraseDiv.innerHTML = html;
    }

    function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

    return { init };
})();
