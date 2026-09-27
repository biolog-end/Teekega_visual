(function () {
    'use strict';

    function onModeSelected(mode, data) {
        switch (mode) {
            case 'barchart':
                BarchartModule.init(data);
                break;
            case 'linerace':
                LineRaceModule.init(data);
                break;
            case 'heatmap':
                HeatmapModule.init(data);
                break;
            case 'punchcard':
                PunchcardModule.init(data);
                break;
            case 'balance':
                BalanceModule.init(data);
                break;
            case 'ngram':
                NgramModule.init(data);
                break;
            case 'bubble':
                BubbleModule.init(data);
                break;
            case 'versus':
                VersusModule.init(data);
                break;
            case 'markov':
                MarkovModule.init(data);
                break;
            case 'openwords':
                OpenWordsModule.init(data);
                break;
        }
    }

    UploadModule.init(onModeSelected);
})();
