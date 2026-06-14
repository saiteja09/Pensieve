(function (global) {
    var namespace = global.Pensieve = global.Pensieve || {};

    var keyCodeMap = {
        13: 'enter',
        37: 'left',
        38: 'up',
        39: 'right',
        40: 'down',
        10009: 'back',
        415: 'play',
        19: 'pause',
        10252: 'playPause',
        417: 'fastForward',
        412: 'rewind'
    };

    var keyMap = {
        Enter: 'enter',
        ArrowLeft: 'left',
        ArrowUp: 'up',
        ArrowRight: 'right',
        ArrowDown: 'down',
        Escape: 'back',
        MediaPlay: 'play',
        MediaPause: 'pause',
        MediaPlayPause: 'playPause',
        MediaFastForward: 'fastForward',
        MediaRewind: 'rewind'
    };

    var handledKeys = {
        enter: true,
        left: true,
        up: true,
        right: true,
        down: true,
        back: true,
        play: true,
        pause: true,
        playPause: true,
        fastForward: true,
        rewind: true
    };

    function normalizeKey(event) {
        return keyMap[event.key] || keyCodeMap[event.keyCode] || null;
    }

    function isTextEditingTarget(target) {
        if (!target) {
            return false;
        }

        var tagName = target.tagName;
        return target.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA';
    }

    function registerTizenKeys() {
        if (!global.tizen || !global.tizen.tvinputdevice) {
            return;
        }

        [
            'MediaPlay',
            'MediaPause',
            'MediaPlayPause',
            'MediaFastForward',
            'MediaRewind'
        ].forEach(function (keyName) {
            try {
                global.tizen.tvinputdevice.registerKey(keyName);
            } catch (error) {
                console.warn('Unable to register TV key', keyName, error);
            }
        });
    }

    function createRemoteController(onRemoteKey) {
        function handleKeyDown(event) {
            var key = normalizeKey(event);

            if (isTextEditingTarget(event.target) && key !== 'back') {
                return;
            }

            if (!key) {
                return;
            }

            if (handledKeys[key]) {
                event.preventDefault();
            }

            onRemoteKey({
                key: key,
                originalEvent: event
            });
        }

        document.addEventListener('keydown', handleKeyDown);

        return {
            destroy: function () {
                document.removeEventListener('keydown', handleKeyDown);
            }
        };
    }

    namespace.Remote = {
        registerTizenKeys: registerTizenKeys,
        createRemoteController: createRemoteController,
        normalizeKey: normalizeKey
    };
})(window);
