(function (global) {
    function init() {
        var root = document.getElementById('app');
        var app = new global.Pensieve.App(root);
        app.start();
        global.Pensieve.app = app;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(window);
