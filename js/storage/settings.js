(function (global) {
    var namespace = global.Pensieve = global.Pensieve || {};
    var STORAGE_KEY = 'pensieve.settings.v1';

    var defaults = {
        serverUrl: '',
        authMode: 'password',
        accessToken: '',
        apiKey: '',
        userId: '',
        userName: '',
        userEmail: '',
        serverVersion: '',
        slideshowIntervalSeconds: 10,
        slideshowShuffle: false,
        photoDisplayMode: 'fit'
    };

    function read() {
        try {
            var raw = global.localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                return Object.assign({}, defaults);
            }

            return Object.assign({}, defaults, JSON.parse(raw));
        } catch (error) {
            console.warn('Failed to read settings', error);
            return Object.assign({}, defaults);
        }
    }

    function write(settings) {
        var next = Object.assign({}, defaults, settings);
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
    }

    function clear() {
        global.localStorage.removeItem(STORAGE_KEY);
        return Object.assign({}, defaults);
    }

    function hasConnection(settings) {
        var current = settings || read();
        if (!current.serverUrl) {
            return false;
        }

        if (current.authMode === 'apiKey') {
            return Boolean(current.apiKey);
        }

        return Boolean(current.accessToken);
    }

    namespace.Settings = {
        read: read,
        write: write,
        clear: clear,
        hasConnection: hasConnection,
        defaults: defaults
    };
})(window);
