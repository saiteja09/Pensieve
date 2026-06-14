(function (global) {
    var namespace = global.Pensieve = global.Pensieve || {};
    var navItems = namespace.AppConfig.navItems;
    var helpers = namespace.AppHelpers;
    var escapeHtml = helpers.escapeHtml;
    var escapeAttr = helpers.escapeAttr;
    var formatServerVersion = helpers.formatServerVersion;
    var formatAuthError = helpers.formatAuthError;
    var createMediaState = helpers.createMediaState;
    var getSearchNextPage = helpers.getSearchNextPage;
    var normalizeNextPage = helpers.normalizeNextPage;
    var mergeMediaItems = helpers.mergeMediaItems;
    var extractSearchItems = helpers.extractSearchItems;
    var isSupportedAsset = helpers.isSupportedAsset;
    var mapAssetToMedia = helpers.mapAssetToMedia;
    var mapTimelineBucketToMedia = helpers.mapTimelineBucketToMedia;
    var monthOptions = helpers.monthOptions;
    var monthName = helpers.monthName;
    var createMonthBucket = helpers.createMonthBucket;
    var groupMediaByDate = helpers.groupMediaByDate;
    var findById = helpers.findById;
    var cssEscape = helpers.cssEscape;
    var formatMediaError = helpers.formatMediaError;

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
        this.mediaState = {
            recent: createMediaState()
        };
        this.thumbnailUrls = {};
        this.thumbnailLoads = {};
        this.thumbnailErrors = {};
        this.thumbnailTimer = null;
        this.viewerImageUrls = {};
        this.viewerImageLoads = {};
        this.viewerImageErrors = {};
        this.viewerImageWarnings = {};
        this.viewerOverlayVisible = true;
        this.pendingViewerAction = null;
        this.pendingFocusAssetId = null;
        this.pendingScrollTop = null;
        this.dateJumpYear = new Date().getFullYear();
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
            '  <div class="brand-mark"><img src="images/app-icon.svg" alt="" /></div>',
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
        } else if (route.name === 'viewer') {
            this.renderViewer(route);
        } else if (route.name === 'settings') {
            this.renderSettings();
        } else if (route.name === 'dateJump') {
            this.renderDateJump();
        } else if (route.name === 'albums') {
            this.renderAlbums();
        } else if (route.name === 'favorites') {
            this.renderGridStatus('favorites', 'Favorites', '', 'Favorites will connect to Immich in the next library slice.');
        } else if (route.name === 'videos') {
            this.renderGridStatus('videos', 'Videos', '', 'Video browsing will connect to Immich in the next library slice.');
        } else {
            this.renderRecent();
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
            '      <div class="brand-mark"><img src="images/app-icon.svg" alt="" /></div>',
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

    App.prototype.renderRecent = function () {
        var state = this.mediaState.recent;

        if (!state.loaded && !state.loading && !state.error) {
            this.loadRecentMedia();
        }

        if (state.loading && !state.items.length) {
            this.renderGridStatus('recent', 'Library', '', 'Loading your latest Immich memories...');
            return;
        }

        if (state.error && !state.items.length) {
            this.renderGridStatus('recent', 'Library', '', 'Unable to load recent media.', 'Retry', 'retryRecent');
            return;
        }

        if (state.loaded && !state.items.length) {
            if (state.filter) {
                this.renderGridStatus('recent', 'Library', this.recentSubtitle(), 'No photos or videos were found for ' + state.filter.label + '.', 'Clear filter', 'clearRecentFilter');
                return;
            }

            this.renderGridStatus('recent', 'Library', '', 'No recent photos or videos were found.');
            return;
        }

        this.renderRecentTimeline(state.items);
        this.loadVisibleThumbnails(state.items);
    };

    App.prototype.renderRecentTimeline = function (items) {
        var groups = groupMediaByDate(items);

        this.root.innerHTML = this.shell('recent', [
            '<main class="content-canvas timeline-canvas">',
            this.pageHeader('Library', this.recentSubtitle()),
            this.recentToolbar(),
            groups.map(function (group) {
                return [
                    '  <section class="date-section timeline-section">',
                    '    <div class="section-heading compact-heading"><h2>' + escapeHtml(group.label) + '</h2><span>' + group.items.length + ' item' + (group.items.length === 1 ? '' : 's') + '</span></div>',
                    '    <div class="media-grid timeline-grid">',
                    group.items.map(this.mediaTile, this).join(''),
                    '    </div>',
                    '  </section>'
                ].join('');
            }, this).join(''),
            '</main>'
        ].join(''));
    };

    App.prototype.recentSubtitle = function () {
        var filter = this.mediaState.recent.filter;
        if (filter) {
            return 'Showing memories from ' + filter.label + '. Clear the filter to return to latest memories.';
        }

        return '';
    };

    App.prototype.recentToolbar = function () {
        var filter = this.mediaState.recent.filter;
        return [
            '<div class="timeline-toolbar">',
            '  <button class="filter-chip focusable" type="button" data-action="openDateJump">Jump to date</button>',
            filter ? '  <button class="filter-chip focusable" type="button" data-action="clearRecentFilter">Clear filter</button>' : '',
            '</div>'
        ].join('');
    };

    App.prototype.renderDateJump = function () {
        var currentYear = new Date().getFullYear();
        var years = [];
        var months = monthOptions();
        var selectedYear = this.dateJumpYear || currentYear;
        var index;

        for (index = 0; index < 30; index += 1) {
            years.push(currentYear - index);
        }

        this.root.innerHTML = this.shell('recent', [
            '<main class="date-jump-canvas">',
            this.pageHeader('Jump to date', 'Pick a year and month to load that part of your Immich timeline directly.'),
            '  <section class="jump-section">',
            '    <h2>Year</h2>',
            '    <div class="jump-grid year-grid">',
            years.map(function (year) {
                return '<button class="jump-chip focusable' + (year === selectedYear ? ' active' : '') + '" type="button" data-action="selectJumpYear" data-year="' + year + '">' + year + '</button>';
            }).join(''),
            '    </div>',
            '  </section>',
            '  <section class="jump-section">',
            '    <h2>' + selectedYear + '</h2>',
            '    <div class="jump-grid month-grid">',
            months.map(function (month) {
                return '<button class="jump-chip focusable" type="button" data-action="jumpToMonth" data-year="' + selectedYear + '" data-month="' + month.value + '">' + month.label + '</button>';
            }).join(''),
            '    </div>',
            '  </section>',
            '  <button class="primary-action compact-action focusable" type="button" data-action="recent">Back to Library</button>',
            '</main>'
        ].join(''));
    };

    App.prototype.renderGridStatus = function (routeName, title, subtitle, message, actionLabel, action) {
        this.root.innerHTML = this.shell(routeName, [
            '<main class="content-canvas">',
            this.pageHeader(title, subtitle),
            '  <section class="grid-status">',
            '    <p>' + escapeHtml(message) + '</p>',
            action ? '    <button class="primary-action compact-action focusable" type="button" data-action="' + action + '">' + escapeHtml(actionLabel || 'Retry') + '</button>' : '',
            '  </section>',
            '</main>'
        ].join(''));
    };

    App.prototype.renderAlbums = function () {
        this.renderGridStatus('albums', 'Albums', '', 'Albums will connect to Immich in the next library slice.');
    };

    App.prototype.renderSettings = function () {
        var server = this.settings.serverUrl || 'No server configured';
        var account = this.settings.userEmail || this.settings.userName || 'Not signed in';
        var version = this.settings.serverVersion ? 'Immich ' + this.settings.serverVersion : 'Version unknown';
        this.root.innerHTML = this.shell('settings', [
            '<main class="settings-canvas">',
            this.pageHeader('Settings', ''),
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
            '  <div class="rail-brand"><img src="images/app-icon.svg" alt="" /></div>',
            '  <nav class="rail-items">',
            navItems.map(function (item) {
                var active = item.action === activeRoute ? ' active' : '';
                return [
                    '<button class="rail-button focusable' + active + '" type="button" data-action="' + item.action + '">',
                    '  <span class="rail-icon"><img src="' + escapeAttr(item.icon) + '" alt="" aria-hidden="true" /></span>',
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
        var connectionTitle = connected ? 'Connected to Immich' : 'Immich offline';
        var version = this.settings.serverVersion || 'Sync pending';
        return [
            '<header class="top-bar">',
            '  <div class="status-cluster">',
            '    <span class="connection-indicator ' + (connected ? 'connected' : 'offline') + '" title="' + escapeAttr(connectionTitle) + '" aria-label="' + escapeAttr(connectionTitle) + '">',
            '      <span class="connection-dot"></span>',
            '      <span class="connection-cloud" aria-hidden="true"></span>',
            '    </span>',
            '    <span class="version-pill" title="Immich server version">' + escapeHtml(version) + '</span>',
            '  </div>',
            '  <div class="avatar" title="' + escapeAttr(this.settings.userEmail || this.settings.userName || 'Pensieve') + '">' + escapeHtml(initial) + '</div>',
            '</header>'
        ].join('');
    };

    App.prototype.pageHeader = function (title, subtitle) {
        return [
            '<header class="page-header">',
            '  <h1>' + escapeHtml(title) + '</h1>',
            subtitle ? '  <p>' + escapeHtml(subtitle) + '</p>' : '',
            '</header>'
        ].join('');
    };

    App.prototype.mediaTile = function (item) {
        var badge = item.type === 'video' ? '<span class="media-badge">VID</span>' : '';
        var assetId = item.id ? ' data-asset-id="' + escapeAttr(item.id) + '"' : '';
        var hasRecentError = item.id && this.thumbnailErrors[item.id] && Date.now() - this.thumbnailErrors[item.id] < 10000;
        var thumbnail = item.thumbnailUrl ? '<img class="media-thumb" src="' + escapeAttr(item.thumbnailUrl) + '" alt="" />' : this.thumbnailPlaceholder(hasRecentError);
        return [
            '<button class="media-card focusable tone-' + (item.tone || 'forest') + ' ' + (item.ratioClass || 'ratio-square') + '" type="button" data-action="openMedia"' + assetId + '>',
            '  <span class="media-art">' + thumbnail + '</span>',
            badge,
            '</button>'
        ].join('');
    };

    App.prototype.thumbnailPlaceholder = function (hasError) {
        if (hasError) {
            return '<span class="media-pending thumbnail-error"><img class="thumbnail-unavailable-icon" src="images/thumbnail-unavailable.svg" alt="" /><span>Thumbnail not available</span></span>';
        }

        return '<span class="media-pending thumbnail-loading"><span class="thumbnail-loading-dot" aria-hidden="true"></span><span>Loading thumbnail</span></span>';
    };

    App.prototype.loadRecentMedia = function (options) {
        var self = this;
        var state = this.mediaState.recent;
        var loadOptions = options || {};
        var page = loadOptions.page || state.page || 1;
        var append = Boolean(loadOptions.append);
        var silent = Boolean(loadOptions.silent);

        if (state.loading) {
            return;
        }

        if (state.filter && state.filter.timeBucket && !append) {
            this.loadRecentBucket(state.filter);
            return;
        }

        state.loading = true;
        state.error = null;
        state.loadingMore = append;

        this.createClient().searchAssets({
            page: page,
            size: 60,
            order: 'desc',
            visibility: 'timeline',
            withExif: true
        }).then(function (response) {
            var assets = extractSearchItems(response).filter(isSupportedAsset);
            var media = assets.map(mapAssetToMedia);
            state.items = append ? mergeMediaItems(state.items, media) : media;
            state.loaded = true;
            state.loading = false;
            state.loadingMore = false;
            state.page = page;
            state.nextPage = getSearchNextPage(response);
            state.hasMore = Boolean(state.nextPage);
            if (typeof loadOptions.onLoaded === 'function') {
                loadOptions.onLoaded(media, response);
            }

            if (!silent) {
                self.renderRoute({ name: 'recent' });
            }
        }).catch(function (error) {
            console.warn('Recent media load failed', error);
            state.error = error;
            state.loading = false;
            state.loadingMore = false;
            state.loaded = append ? state.loaded : false;
            if (typeof loadOptions.onError === 'function') {
                loadOptions.onError(error);
            }

            if (!silent) {
                self.renderRoute({ name: 'recent' });
            }
            self.showToast(formatMediaError(error));
        });
    };

    App.prototype.loadRecentBucket = function (filter) {
        var self = this;
        var state = this.mediaState.recent;

        state.loading = true;
        state.error = null;

        this.createClient().getTimelineBucket(filter.timeBucket).then(function (response) {
            state.items = mapTimelineBucketToMedia(response, filter.timeBucket);
            state.loaded = true;
            state.loading = false;
            state.loadingMore = false;
            state.page = 1;
            state.nextPage = null;
            state.hasMore = false;
            self.renderRoute({ name: 'recent' });
        }).catch(function (error) {
            console.warn('Recent timeline bucket load failed', error);
            state.error = error;
            state.loading = false;
            state.loaded = false;
            self.renderRoute({ name: 'recent' });
            self.showToast(formatMediaError(error));
        });
    };

    App.prototype.loadMoreRecentIfNeeded = function () {
        var state = this.mediaState.recent;
        var focused = this.focusables[this.focusIndex];
        var timeline = this.root.querySelector('.timeline-canvas');
        var assetId = focused ? focused.getAttribute('data-asset-id') : null;
        var remainingItems = state.items.length - this.focusIndex;
        var nearBottom = timeline ? timeline.scrollTop + timeline.clientHeight > timeline.scrollHeight - (timeline.clientHeight * 0.9) : false;
        var nextPage = normalizeNextPage(state.nextPage, state.page);

        if (!state.loaded || state.loading || !state.hasMore || !nextPage) {
            return;
        }

        if (remainingItems > 18 && !nearBottom) {
            return;
        }

        this.pendingFocusAssetId = assetId;
        this.pendingScrollTop = timeline ? timeline.scrollTop : null;
        this.loadRecentMedia({
            page: nextPage,
            append: true
        });
    };

    App.prototype.bindScrollLoading = function () {
        var self = this;
        var timeline = this.root.querySelector('.timeline-canvas');

        if (!timeline) {
            return;
        }

        timeline.addEventListener('scroll', function () {
            self.queueVisibleThumbnailLoad();
            self.loadMoreRecentIfNeeded();
        });
    };

    App.prototype.queueVisibleThumbnailLoad = function () {
        var self = this;

        if (!this.root.querySelector('.timeline-grid')) {
            return;
        }

        if (this.thumbnailTimer) {
            global.clearTimeout(this.thumbnailTimer);
        }

        this.thumbnailTimer = global.setTimeout(function () {
            self.thumbnailTimer = null;
            self.loadVisibleThumbnails(self.mediaState.recent.items);
        }, 80);
    };

    App.prototype.loadVisibleThumbnails = function (items) {
        var self = this;
        var client = this.createClient();
        var viewportHeight = global.innerHeight || document.documentElement.clientHeight || 720;
        var preloadBefore = viewportHeight * 0.75;
        var preloadAfter = viewportHeight * 1.5;
        var now = Date.now();

        Array.prototype.slice.call(this.root.querySelectorAll('[data-asset-id]')).forEach(function (tile) {
            var assetId = tile.getAttribute('data-asset-id');
            var media = findById(items, assetId);
            var rect = tile.getBoundingClientRect();

            if (!media) {
                return;
            }

            if (rect.bottom < -preloadBefore || rect.top > viewportHeight + preloadAfter) {
                return;
            }

            if (self.thumbnailUrls[assetId]) {
                media.thumbnailUrl = self.thumbnailUrls[assetId];
                self.applyThumbnailToTile(assetId, self.thumbnailUrls[assetId]);
                return;
            }

            if (self.thumbnailLoads[assetId] === 'loading') {
                return;
            }

            if (self.thumbnailErrors[assetId] && now - self.thumbnailErrors[assetId] < 10000) {
                return;
            }

            self.thumbnailLoads[assetId] = 'loading';
            client.getAssetThumbnailBlob(assetId, { size: 'thumbnail' }).then(function (blob) {
                var objectUrl = global.URL.createObjectURL(blob);
                self.thumbnailUrls[assetId] = objectUrl;
                self.thumbnailLoads[assetId] = 'loaded';
                delete self.thumbnailErrors[assetId];
                media.thumbnailUrl = objectUrl;
                self.applyThumbnailToTile(assetId, objectUrl);
            }).catch(function (error) {
                delete self.thumbnailLoads[assetId];
                self.thumbnailErrors[assetId] = Date.now();
                self.applyThumbnailErrorToTile(assetId);
                console.warn('Thumbnail load failed', assetId, error);
            });
        });
    };

    App.prototype.applyThumbnailToTile = function (assetId, objectUrl) {
        var tile = this.root.querySelector('[data-asset-id="' + cssEscape(assetId) + '"] .media-art');

        if (!tile || tile.querySelector('.media-thumb')) {
            return;
        }

        tile.innerHTML = '<img class="media-thumb" src="' + escapeAttr(objectUrl) + '" alt="" />';
    };

    App.prototype.applyThumbnailErrorToTile = function (assetId) {
        var tile = this.root.querySelector('[data-asset-id="' + cssEscape(assetId) + '"] .media-art');

        if (!tile || tile.querySelector('.media-thumb')) {
            return;
        }

        tile.innerHTML = this.thumbnailPlaceholder(true);
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
        } else if (action === 'retryRecent') {
            this.mediaState.recent = createMediaState();
            this.renderRecent();
            this.captureFocusables();
        } else if (action === 'openDateJump') {
            this.router.navigate('dateJump');
        } else if (action === 'selectJumpYear') {
            this.dateJumpYear = Number(element.getAttribute('data-year')) || this.dateJumpYear;
            this.renderDateJump();
            this.captureFocusables();
        } else if (action === 'jumpToMonth') {
            this.applyRecentMonthFilter(
                Number(element.getAttribute('data-year')),
                Number(element.getAttribute('data-month'))
            );
        } else if (action === 'clearRecentFilter') {
            this.mediaState.recent = createMediaState();
            this.router.reset('recent');
        } else if (action === 'openMedia') {
            this.openMediaViewer(element);
        } else if (action === 'viewerPrev') {
            this.navigateViewer(-1);
        } else if (action === 'viewerNext') {
            this.navigateViewer(1);
        } else if (action === 'viewerClose') {
            this.closeViewer();
        } else if (action === 'viewerRetry') {
            this.retryViewerImage();
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

    App.prototype.applyRecentMonthFilter = function (year, month) {
        if (!year || !month) {
            this.showToast('Choose a year and month.');
            return;
        }

        this.dateJumpYear = year;
        this.mediaState.recent = createMediaState();
        this.mediaState.recent.filter = {
            label: monthName(month) + ' ' + year,
            timeBucket: createMonthBucket(year, month)
        };
        this.router.reset('recent');
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

        if (this.router.current && this.router.current.name === 'viewer') {
            this.closeViewer();
            return;
        }

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

    namespace.App = App;
})(window);
