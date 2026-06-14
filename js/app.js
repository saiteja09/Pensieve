(function (global) {
    var namespace = global.Pensieve = global.Pensieve || {};

    var navItems = [
        { action: 'recent', label: 'Photos', icon: 'P' },
        { action: 'albums', label: 'Albums', icon: 'A' },
        { action: 'favorites', label: 'Favorites', icon: 'F' },
        { action: 'videos', label: 'Videos', icon: 'V' },
        { action: 'settings', label: 'Settings', icon: 'S' }
    ];

    var sampleMedia = [
        { title: 'Fjord Sunset', tone: 'sunset', type: 'video' },
        { title: 'Morning Mist', tone: 'forest', type: 'image' },
        { title: 'Above the Clouds', tone: 'mountain', type: 'image' },
        { title: 'Quiet Geometry', tone: 'architecture', type: 'image' },
        { title: 'Lake Dawn', tone: 'lake', type: 'image' },
        { title: 'Alpine Road', tone: 'valley', type: 'image' },
        { title: 'Autumn Ripples', tone: 'autumn', type: 'image' },
        { title: 'Redwood Light', tone: 'redwood', type: 'image' }
    ];

    var sampleAlbums = [
        { title: 'Summer Roadtrip', meta: '142 photos - 2023', tone: 'valley' },
        { title: 'Winter Cabin', meta: '86 photos - shared', tone: 'mountain' },
        { title: 'Family Favorites', meta: '58 photos', tone: 'lake' },
        { title: 'The Wedding', meta: '312 photos - 2022', tone: 'sunset' },
        { title: 'Weekend Hikes', meta: '204 photos', tone: 'forest' },
        { title: 'Architecture', meta: '41 photos', tone: 'architecture' }
    ];

    function App(root) {
        this.root = root;
        this.settings = namespace.Settings.read();
        this.router = new namespace.Router(this.renderRoute.bind(this));
        this.focusables = [];
        this.focusIndex = 0;
        this.toastTimer = null;
        this.remote = null;
        this.isBusy = false;
        this.sessionStatus = 'checking';
    }

    App.prototype.start = function () {
        namespace.Remote.registerTizenKeys();
        this.remote = namespace.Remote.createRemoteController(this.handleRemoteKey.bind(this));

        this.validateStartupSession();

        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) {
                console.log('Pensieve resumed');
            }
        });
    };

    App.prototype.validateStartupSession = function () {
        var self = this;

        if (!namespace.Settings.hasConnection(this.settings)) {
            this.sessionStatus = 'signedOut';
            this.router.reset('setup');
            return;
        }

        this.renderBoot('Connecting to Immich...');

        this.createClient().validateToken().then(function (status) {
            if (!status || status.authStatus !== true) {
                throw new namespace.ImmichError('AUTH_INVALID', 'Saved Immich session expired.');
            }

            return Promise.all([
                self.createClient().getServerVersion(),
                self.createClient().getMyUser()
            ]);
        }).then(function (results) {
            var version = results[0];
            var user = results[1];
            self.settings = namespace.Settings.write(Object.assign({}, self.settings, {
                serverVersion: formatServerVersion(version),
                userId: user.id || '',
                userName: user.name || '',
                userEmail: user.email || ''
            }));
            self.sessionStatus = 'signedIn';
            self.router.reset('recent');
        }).catch(function (error) {
            console.warn('Stored session validation failed', error);
            self.settings = namespace.Settings.clear();
            self.sessionStatus = 'signedOut';
            self.router.reset('setup');
            self.showToast(error.message || 'Please sign in again.');
        });
    };

    App.prototype.renderBoot = function (message) {
        this.root.innerHTML = [
            '<section class="boot-screen">',
            '  <div class="brand-mark">P</div>',
            '  <h1>Pensieve</h1>',
            '  <p>' + escapeHtml(message || 'Starting...') + '</p>',
            '</section>'
        ].join('');
    };

    App.prototype.renderRoute = function (route) {
        if (route.name !== 'setup' && !namespace.Settings.hasConnection(this.settings)) {
            this.router.reset('setup');
            return;
        }

        if (route.name === 'setup') {
            this.renderSetup();
        } else if (route.name === 'settings') {
            this.renderSettings();
        } else if (route.name === 'albums') {
            this.renderAlbums();
        } else if (route.name === 'favorites') {
            this.renderMediaPage('favorites', 'Favorites', 'Photos and videos marked as favorites in Immich.', sampleMedia.slice(0, 6));
        } else if (route.name === 'videos') {
            this.renderMediaPage('videos', 'Videos', 'Clips from your Immich library, ready for TV playback.', sampleMedia.filter(function (item) {
                return item.type === 'video';
            }).concat(sampleMedia.slice(1, 4)));
        } else {
            this.renderMediaPage('recent', 'Recents', 'Exploring your latest memories from all connected devices.', sampleMedia);
        }

        this.captureFocusables();
    };

    App.prototype.createClient = function (overrides) {
        var options = Object.assign({}, this.settings, overrides || {});
        return new namespace.ImmichClient({
            serverUrl: options.serverUrl,
            accessToken: options.accessToken,
            apiKey: options.apiKey,
            authMode: options.authMode
        });
    };

    App.prototype.renderSetup = function () {
        var loginText = this.isBusy ? 'Signing in...' : 'Login';
        this.root.innerHTML = [
            '<section class="login-screen">',
            '  <div class="login-brand">',
            '    <div class="brand-row">',
            '      <div class="brand-mark">P</div>',
            '      <h1>Pensieve for Immich</h1>',
            '    </div>',
            '    <p class="login-copy">Experience your Immich memories on the big screen. Sign in once, then browse from the couch.</p>',
            '  </div>',
            '  <div class="login-card">',
            '    <div class="field">',
            '      <label for="serverUrl">Server</label>',
            '      <div class="input-shell">',
            '        <span class="input-icon">URL</span>',
            '        <input id="serverUrl" class="text-input focusable" type="text" inputmode="url" value="' + escapeAttr(this.settings.serverUrl) + '" placeholder="https://immich.example.com" />',
            '      </div>',
            '    </div>',
            '    <div class="field">',
            '      <label for="email">Email</label>',
            '      <div class="input-shell">',
            '        <span class="input-icon">@</span>',
            '        <input id="email" class="text-input focusable" type="email" value="' + escapeAttr(this.settings.userEmail) + '" placeholder="you@example.com" />',
            '      </div>',
            '    </div>',
            '    <div class="field">',
            '      <label for="password">Password</label>',
            '      <div class="input-shell">',
            '        <span class="input-icon">PWD</span>',
            '        <input id="password" class="text-input focusable" type="password" placeholder="Immich password" />',
            '      </div>',
            '    </div>',
            '    <button class="primary-action focusable" type="button" data-action="saveSetup"' + (this.isBusy ? ' disabled' : '') + '>' + loginText + '</button>',
            '    <button class="text-action focusable" type="button" data-action="apiKeySetup">Advanced: use API key</button>',
            '  </div>',
            '  <div id="toast" class="toast"></div>',
            '</section>'
        ].join('');
    };

    App.prototype.renderMediaPage = function (routeName, title, subtitle, media) {
        this.root.innerHTML = this.shell(routeName, [
            '<main class="content-canvas">',
            this.pageHeader(title, subtitle),
            '  <section class="date-section">',
            '    <div class="section-heading"><h2>Today</h2><span>Latest from Immich</span></div>',
            '    <div class="media-grid">',
            media.slice(0, 4).map(this.mediaTile).join(''),
            '    </div>',
            '  </section>',
            '  <section class="date-section">',
            '    <div class="section-heading"><h2>Yesterday</h2><span>Recently added</span></div>',
            '    <div class="media-grid">',
            media.slice(4).map(this.mediaTile).join(''),
            '    </div>',
            '  </section>',
            '</main>'
        ].join(''));
    };

    App.prototype.renderAlbums = function () {
        this.root.innerHTML = this.shell('albums', [
            '<main class="content-canvas">',
            this.pageHeader('Albums', 'Personal collections, trips, events, and shared libraries.'),
            '  <div class="filter-row">',
            '    <button class="filter-chip active focusable" type="button" data-action="comingSoon">All albums</button>',
            '    <button class="filter-chip focusable" type="button" data-action="comingSoon">Shared</button>',
            '    <button class="filter-chip focusable" type="button" data-action="favorites">Favorites</button>',
            '  </div>',
            '  <section class="album-grid">',
            sampleAlbums.map(this.albumTile).join(''),
            '  </section>',
            '</main>'
        ].join(''));
    };

    App.prototype.renderSettings = function () {
        var server = this.settings.serverUrl || 'No server configured';
        var account = this.settings.userEmail || this.settings.userName || 'Not signed in';
        var version = this.settings.serverVersion ? 'Immich ' + this.settings.serverVersion : 'Version unknown';
        this.root.innerHTML = this.shell('settings', [
            '<main class="settings-canvas">',
            this.pageHeader('Settings', 'Connection, account, slideshow, and TV display preferences.'),
            '  <div class="settings-list">',
            this.settingsItem('Server Connection', server + ' - ' + version, 'DNS', 'serverConnection'),
            this.settingsItem('Account', account, 'USR', 'accountDetails'),
            this.settingsItem('Slideshow', 'Interval: 10 seconds - Videos skipped by default.', 'PLY', 'comingSoon'),
            this.settingsItem('Display', 'Photo mode: Fit to screen.', 'PIC', 'comingSoon'),
            this.settingsItem('Clear saved settings', 'Remove local server and session details.', 'CLR', 'clearSettings'),
            '  </div>',
            '</main>'
        ].join(''));
    };

    App.prototype.shell = function (activeRoute, content) {
        return [
            '<section class="app-screen">',
            this.navRail(activeRoute),
            this.topBar(),
            content,
            '<div id="toast" class="toast"></div>',
            '</section>'
        ].join('');
    };

    App.prototype.navRail = function (activeRoute) {
        return [
            '<aside class="nav-rail" aria-label="Primary navigation">',
            '  <div class="rail-brand">P</div>',
            '  <nav class="rail-items">',
            navItems.map(function (item) {
                var active = item.action === activeRoute ? ' active' : '';
                return [
                    '<button class="rail-button focusable' + active + '" type="button" data-action="' + item.action + '">',
                    '  <span class="rail-icon">' + item.icon + '</span>',
                    '  <span class="rail-label">' + item.label + '</span>',
                    '</button>'
                ].join('');
            }).join(''),
            '  </nav>',
            '</aside>'
        ].join('');
    };

    App.prototype.topBar = function () {
        var connected = namespace.Settings.hasConnection(this.settings);
        var initial = (this.settings.userName || this.settings.userEmail || 'P').charAt(0).toUpperCase();
        return [
            '<header class="top-bar">',
            '  <div class="top-status ' + (connected ? 'connected' : '') + '">Cloud ' + (connected ? 'Connected' : 'Offline') + '</div>',
            '  <div class="top-status">' + escapeHtml(this.settings.serverVersion || 'Sync pending') + '</div>',
            '  <div class="avatar">' + escapeHtml(initial) + '</div>',
            '</header>'
        ].join('');
    };

    App.prototype.pageHeader = function (title, subtitle) {
        return [
            '<header class="page-header">',
            '  <h1>' + escapeHtml(title) + '</h1>',
            '  <p>' + escapeHtml(subtitle) + '</p>',
            '</header>'
        ].join('');
    };

    App.prototype.mediaTile = function (item) {
        var badge = item.type === 'video' ? '<span class="media-badge">VID</span>' : '';
        return [
            '<button class="media-card focusable tone-' + item.tone + '" type="button" data-action="mediaPlaceholder">',
            '  <span class="media-art"></span>',
            badge,
            '  <span class="media-caption">' + escapeHtml(item.title) + '</span>',
            '</button>'
        ].join('');
    };

    App.prototype.albumTile = function (item) {
        return [
            '<button class="album-card focusable tone-' + item.tone + '" type="button" data-action="albumPlaceholder">',
            '  <span class="album-art"></span>',
            '  <span class="album-info">',
            '    <strong>' + escapeHtml(item.title) + '</strong>',
            '    <small>' + escapeHtml(item.meta) + '</small>',
            '  </span>',
            '</button>'
        ].join('');
    };

    App.prototype.settingsItem = function (title, detail, icon, action) {
        return [
            '<button class="settings-item focusable" type="button" data-action="' + action + '">',
            '  <span class="settings-icon">' + icon + '</span>',
            '  <span class="settings-copy">',
            '    <strong>' + escapeHtml(title) + '</strong>',
            '    <small>' + escapeHtml(detail) + '</small>',
            '  </span>',
            '  <span class="chevron">></span>',
            '</button>'
        ].join('');
    };

    App.prototype.captureFocusables = function () {
        this.focusables = Array.prototype.slice.call(this.root.querySelectorAll('.focusable'));
        this.focusIndex = this.findInitialFocusIndex();
        this.applyFocus();
        this.bindPointerActivation();
    };

    App.prototype.findInitialFocusIndex = function () {
        var index = this.focusables.findIndex(function (element) {
            return !element.classList.contains('rail-button');
        });

        return index >= 0 ? index : 0;
    };

    App.prototype.bindPointerActivation = function () {
        var self = this;
        this.focusables.forEach(function (element, index) {
            element.addEventListener('focus', function () {
                self.focusIndex = index;
            });

            element.addEventListener('click', function () {
                self.activate(element);
            });

            element.addEventListener('keydown', function (event) {
                if (event.key === 'Enter' && element.tagName !== 'INPUT') {
                    event.preventDefault();
                    event.stopPropagation();
                    self.activate(element);
                }
            });
        });
    };

    App.prototype.applyFocus = function () {
        if (!this.focusables.length) {
            return;
        }

        this.focusIndex = Math.max(0, Math.min(this.focusIndex, this.focusables.length - 1));
        this.focusables[this.focusIndex].focus();
    };

    App.prototype.moveFocus = function (direction) {
        if (!this.focusables.length) {
            return;
        }

        var current = this.focusables[this.focusIndex];
        var next = this.focusIndex;
        var columns = this.currentGridColumns(current);

        if (direction === 'left') {
            next = this.findLeftTarget(current);
        } else if (direction === 'right') {
            next = this.findRightTarget(current);
        } else if (direction === 'up') {
            next -= columns;
        } else if (direction === 'down') {
            next += columns;
        }

        if (next < 0 || next >= this.focusables.length) {
            return;
        }

        this.focusIndex = next;
        this.applyFocus();
    };

    App.prototype.findLeftTarget = function (current) {
        if (current.classList.contains('rail-button')) {
            return this.focusIndex;
        }

        var currentRow = current.getBoundingClientRect().top;
        var closest = -1;
        var closestDistance = Infinity;

        this.focusables.forEach(function (element, index) {
            if (!element.classList.contains('rail-button')) {
                return;
            }

            var distance = Math.abs(element.getBoundingClientRect().top - currentRow);
            if (distance < closestDistance) {
                closest = index;
                closestDistance = distance;
            }
        });

        return closest >= 0 ? closest : this.focusIndex - 1;
    };

    App.prototype.findRightTarget = function (current) {
        if (!current.classList.contains('rail-button')) {
            return this.focusIndex + 1;
        }

        var currentRow = current.getBoundingClientRect().top;
        var closest = -1;
        var closestDistance = Infinity;

        this.focusables.forEach(function (element, index) {
            if (element.classList.contains('rail-button')) {
                return;
            }

            var distance = Math.abs(element.getBoundingClientRect().top - currentRow);
            if (distance < closestDistance) {
                closest = index;
                closestDistance = distance;
            }
        });

        return closest >= 0 ? closest : this.focusIndex + 1;
    };

    App.prototype.currentGridColumns = function (current) {
        if (!current) {
            return 1;
        }

        if (current.classList.contains('rail-button')) {
            return 1;
        }

        if (current.closest('.media-grid')) {
            return 3;
        }

        if (current.closest('.album-grid')) {
            return 4;
        }

        if (current.closest('.filter-row')) {
            return 4;
        }

        return 1;
    };

    App.prototype.handleRemoteKey = function (event) {
        if (event.key === 'left' || event.key === 'right' || event.key === 'up' || event.key === 'down') {
            this.moveFocus(event.key);
            return;
        }

        if (event.key === 'enter') {
            this.activate(this.focusables[this.focusIndex]);
            return;
        }

        if (event.key === 'back') {
            this.handleBack();
            return;
        }

        if (event.key === 'playPause' || event.key === 'play' || event.key === 'pause') {
            this.showToast('Slideshow controls will be connected after media browsing.');
        }
    };

    App.prototype.activate = function (element) {
        if (!element) {
            return;
        }

        if (this.isBusy) {
            return;
        }

        if (element.tagName === 'INPUT') {
            element.focus();
            return;
        }

        var action = element.getAttribute('data-action');

        if (action === 'recent' || action === 'albums' || action === 'favorites' || action === 'videos' || action === 'settings') {
            if (!namespace.Settings.hasConnection(this.settings)) {
                this.router.reset('setup');
                this.showToast('Sign in to continue.');
                return;
            }

            this.router.navigate(action);
        } else if (action === 'setup') {
            this.router.navigate('setup');
        } else if (action === 'saveSetup') {
            this.saveSetup();
        } else if (action === 'clearSettings') {
            this.settings = namespace.Settings.clear();
            this.showToast('Saved connection cleared.');
            this.router.reset('setup');
        } else if (action === 'serverConnection') {
            this.showToast('Connection editing will be added after media browsing.');
        } else if (action === 'accountDetails') {
            this.showToast('Account details will be added after media browsing.');
        } else if (action === 'apiKeySetup') {
            this.showToast('Advanced API-key setup comes after password login.');
        } else {
            this.showToast('This section will connect to Immich in a later slice.');
        }
    };

    App.prototype.saveSetup = function () {
        var self = this;
        var serverUrlInput = document.getElementById('serverUrl');
        var emailInput = document.getElementById('email');
        var passwordInput = document.getElementById('password');
        var serverUrl = serverUrlInput ? serverUrlInput.value.trim() : '';
        var email = emailInput ? emailInput.value.trim() : '';
        var password = passwordInput ? passwordInput.value : '';

        if (!serverUrl) {
            this.showToast('Enter a server URL before continuing.');
            return;
        }

        if (!email || !password) {
            this.showToast('Enter your Immich email and password.');
            return;
        }

        this.isBusy = true;
        this.settings = Object.assign({}, this.settings, {
            serverUrl: serverUrl,
            userEmail: email,
            authMode: 'password'
        });
        this.renderSetup();
        this.captureFocusables();

        var client = this.createClient({
            serverUrl: serverUrl,
            authMode: 'password',
            accessToken: ''
        });

        Promise.all([
            client.pingServer(),
            client.getServerVersion()
        ]).then(function (results) {
            var version = results[1];
            return client.login({
                email: email,
                password: password
            }).then(function (loginResponse) {
                var signedInClient = self.createClient({
                    serverUrl: serverUrl,
                    authMode: 'password',
                    accessToken: loginResponse.accessToken
                });

                return signedInClient.getMyUser().then(function (user) {
                    return {
                        loginResponse: loginResponse,
                        user: user,
                        version: version
                    };
                });
            });
        }).then(function (result) {
            self.settings = namespace.Settings.write({
                serverUrl: namespace.normalizeServerUrl(serverUrl),
                authMode: 'password',
                accessToken: result.loginResponse.accessToken,
                apiKey: '',
                userId: result.user.id || result.loginResponse.userId || '',
                userName: result.user.name || result.loginResponse.name || '',
                userEmail: result.user.email || result.loginResponse.userEmail || email,
                serverVersion: formatServerVersion(result.version)
            });

            if (passwordInput) {
                passwordInput.value = '';
            }

            self.sessionStatus = 'signedIn';
            self.isBusy = false;
            self.showToast('Signed in to Immich.');
            self.router.reset('recent');
        }).catch(function (error) {
            console.warn('Immich login failed', error);
            self.isBusy = false;
            self.settings = Object.assign({}, self.settings, {
                serverUrl: serverUrl,
                userEmail: email
            });
            self.renderSetup();
            self.captureFocusables();
            self.showToast(formatAuthError(error));
        });
    };

    App.prototype.handleBack = function () {
        var isConnected = namespace.Settings.hasConnection(this.settings);

        if (this.router.back()) {
            return;
        }

        if (this.router.current && this.router.current.name !== 'recent') {
            if (isConnected) {
                this.router.reset('recent');
            } else {
                this.router.reset('setup');
            }
            return;
        }

        if (global.tizen && global.tizen.application) {
            global.tizen.application.getCurrentApplication().exit();
        }
    };

    App.prototype.showToast = function (message) {
        var toast = document.getElementById('toast');

        if (!toast) {
            return;
        }

        toast.textContent = message;
        toast.classList.add('is-visible');

        if (this.toastTimer) {
            global.clearTimeout(this.toastTimer);
        }

        this.toastTimer = global.setTimeout(function () {
            toast.classList.remove('is-visible');
        }, 2600);
    };

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, function (character) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[character];
        });
    }

    function escapeAttr(value) {
        return escapeHtml(value).replace(/`/g, '&#96;');
    }

    function formatServerVersion(version) {
        if (!version) {
            return '';
        }

        if (typeof version === 'string') {
            return version;
        }

        if (version.major !== undefined && version.minor !== undefined && version.patch !== undefined) {
            return version.major + '.' + version.minor + '.' + version.patch;
        }

        return '';
    }

    function formatAuthError(error) {
        if (!error) {
            return 'Unable to sign in to Immich.';
        }

        if (error.code === 'NETWORK_UNAVAILABLE') {
            return 'Unable to reach the Immich server. Check the URL and network.';
        }

        if (error.code === 'TIMEOUT') {
            return 'Immich server request timed out.';
        }

        if (error.code === 'AUTH_INVALID') {
            return 'Invalid Immich email or password.';
        }

        if (error.code === 'NOT_FOUND') {
            return 'Immich API was not found. Check the server URL.';
        }

        if (error.code === 'PERMISSION_DENIED') {
            return 'This Immich account does not have permission to continue.';
        }

        return error.message || 'Unable to sign in to Immich.';
    }

    namespace.App = App;
})(window);
