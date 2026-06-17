(function (global) {
    var namespace = global.Pensieve = global.Pensieve || {};
    var navItems = namespace.AppConfig.navItems;
    var accentPalettes = namespace.AppConfig.accentPalettes;
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
        this.setupAuthMode = this.settings.authMode === 'apiKey' ? 'apiKey' : 'password';
        this.router = new namespace.Router(this.renderRoute.bind(this));
        this.focusables = [];
        this.focusIndex = 0;
        this.toastTimer = null;
        this.remote = null;
        this.isBusy = false;
        this.mediaState = {
            recent: createMediaState(),
            videos: createMediaState(),
            favorites: createMediaState()
        };
        this.albumState = {
            items: [],
            loaded: false,
            loading: false,
            error: null
        };
        this.albumDetails = {};
        this.currentAlbumId = '';
        this.viewerAlbumId = '';
        this.mediaSortOrder = {
            recent: 'desc',
            videos: 'desc',
            favorites: 'desc',
            albums: 'desc',
            album: 'desc'
        };
        this.thumbnailUrls = {};
        this.thumbnailLoads = {};
        this.thumbnailErrors = {};
        this.thumbnailTimer = null;
        this.albumThumbnailTimer = null;
        this.viewerImageUrls = {};
        this.viewerImageLoads = {};
        this.viewerImageErrors = {};
        this.viewerVideoUrls = {};
        this.viewerVideoLoads = {};
        this.viewerVideoErrors = {};
        this.profileImageUrl = '';
        this.profileImageUserId = '';
        this.profileImageLoad = '';
        this.profileImageError = false;
        this.viewerOverlayVisible = true;
        this.viewerOverlayTimer = null;
        this.viewerSource = 'recent';
        this.slideshowActive = false;
        this.slideshowSource = 'recent';
        this.slideshowTimer = null;
        this.logoutConfirmVisible = false;
        this.pendingViewerAction = null;
        this.pendingFocusAssetId = null;
        this.pendingScrollTop = null;
        this.dateJumpYear = new Date().getFullYear();
    }

    App.prototype.start = function () {
        this.applyAppearance();
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
                userEmail: user.email || '',
                userProfileImagePath: user.profileImagePath || ''
            }));
            self.router.reset('recent');
        }).catch(function (error) {
            console.warn('Stored session validation failed', error);
            self.settings = namespace.Settings.clear();
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
            this.renderDateJump('recent');
        } else if (route.name === 'videoDateJump') {
            this.renderDateJump('videos');
        } else if (route.name === 'albums') {
            this.renderAlbums();
        } else if (route.name === 'album') {
            this.renderAlbum(route);
        } else if (route.name === 'favorites') {
            this.renderFavorites();
        } else if (route.name === 'videos') {
            this.renderVideos();
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
        var isApiKey = this.setupAuthMode === 'apiKey';
        var loginText = this.isBusy ? 'Signing in...' : (isApiKey ? 'Save API key' : 'Login');
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
            '        <span class="input-icon input-icon-mask" style="-webkit-mask-image: url(\'images/settings/server.svg\'); mask-image: url(\'images/settings/server.svg\');" aria-hidden="true"></span>',
            '        <input id="serverUrl" class="text-input focusable" type="text" inputmode="url" value="' + escapeAttr(this.settings.serverUrl) + '" placeholder="https://immich.example.com" />',
            '      </div>',
            '    </div>',
            isApiKey ? '' : '    <div class="field">',
            isApiKey ? '' : '      <label for="email">Email</label>',
            isApiKey ? '' : '      <div class="input-shell">',
            isApiKey ? '' : '        <span class="input-icon input-icon-mask" style="-webkit-mask-image: url(\'images/settings/user.svg\'); mask-image: url(\'images/settings/user.svg\');" aria-hidden="true"></span>',
            isApiKey ? '' : '        <input id="email" class="text-input focusable" type="email" value="' + escapeAttr(this.settings.userEmail) + '" placeholder="you@example.com" />',
            isApiKey ? '' : '      </div>',
            isApiKey ? '' : '    </div>',
            isApiKey ? '' : '    <div class="field">',
            isApiKey ? '' : '      <label for="password">Password</label>',
            isApiKey ? '' : '      <div class="input-shell">',
            isApiKey ? '' : '        <span class="input-icon input-icon-mask" style="-webkit-mask-image: url(\'images/settings/user-key.svg\'); mask-image: url(\'images/settings/user-key.svg\');" aria-hidden="true"></span>',
            isApiKey ? '' : '        <input id="password" class="text-input focusable" type="password" placeholder="Immich password" />',
            isApiKey ? '' : '      </div>',
            isApiKey ? '' : '    </div>',
            isApiKey ? '    <div class="field">' : '',
            isApiKey ? '      <label for="apiKey">API key</label>' : '',
            isApiKey ? '      <div class="input-shell">' : '',
            isApiKey ? '        <span class="input-icon input-icon-mask" style="-webkit-mask-image: url(\'images/settings/key.svg\'); mask-image: url(\'images/settings/key.svg\');" aria-hidden="true"></span>' : '',
            isApiKey ? '        <input id="apiKey" class="text-input focusable" type="password" value="' + escapeAttr(this.settings.apiKey) + '" placeholder="Immich API key" />' : '',
            isApiKey ? '      </div>' : '',
            isApiKey ? '    </div>' : '',
            '    <button class="primary-action focusable" type="button" data-action="saveSetup"' + (this.isBusy ? ' disabled' : '') + '>' + loginText + '</button>',
            '    <button class="text-action focusable" type="button" data-action="apiKeySetup">' + (isApiKey ? 'Use password instead' : 'Advanced: use API key') + '</button>',
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
                this.renderGridStatus('recent', 'Library', this.mediaSubtitle('recent'), 'No photos or videos were found for ' + state.filter.label + '.', 'Clear filter', 'clearRecentFilter');
                return;
            }

            this.renderGridStatus('recent', 'Library', '', 'No recent photos or videos were found.');
            return;
        }

        var sortedItems = this.sortMediaItems(state.items, 'recent');
        this.renderRecentTimeline(sortedItems);
        this.loadVisibleThumbnails(sortedItems);
    };

    App.prototype.renderVideos = function () {
        var state = this.mediaState.videos;

        if (!state.loaded && !state.loading && !state.error) {
            this.loadVideosMedia();
        }

        if (state.loading && !state.items.length) {
            this.renderGridStatus('videos', 'Videos', '', 'Loading your latest videos...');
            return;
        }

        if (state.error && !state.items.length) {
            this.renderGridStatus('videos', 'Videos', '', 'Unable to load videos.', 'Retry', 'retryVideos');
            return;
        }

        if (state.loaded && !state.items.length) {
            if (state.filter) {
                this.renderGridStatus('videos', 'Videos', this.mediaSubtitle('videos'), 'No videos were found for ' + state.filter.label + '.', 'Clear filter', 'clearVideosFilter');
                return;
            }

            this.renderGridStatus('videos', 'Videos', '', 'No videos were found.');
            return;
        }

        var sortedItems = this.sortMediaItems(state.items, 'videos');
        this.renderMediaTimeline('videos', 'Videos', this.mediaSubtitle('videos'), this.mediaToolbar('videos'), sortedItems, this.timelineHeaderActions('videos'));
        this.loadVisibleThumbnails(sortedItems);
    };

    App.prototype.renderFavorites = function () {
        var state = this.mediaState.favorites;
        var favoriteItems;

        if (!state.loaded && !state.loading && !state.error) {
            this.loadFavoritesMedia();
        }

        if (state.loading && !state.items.length) {
            this.renderGridStatus('favorites', 'Favorites', '', 'Loading your favorites...');
            return;
        }

        if (state.error && !state.items.length) {
            this.renderGridStatus('favorites', 'Favorites', '', 'Unable to load favorites.', 'Retry', 'retryFavorites');
            return;
        }

        favoriteItems = state.items.filter(function (item) {
            return item.isFavorite;
        });

        if (state.loaded && !favoriteItems.length) {
            this.renderGridStatus('favorites', 'Favorites', '', 'No favorites were found.');
            return;
        }

        var sortedItems = this.sortMediaItems(favoriteItems, 'favorites');
        this.renderMediaTimeline('favorites', 'Favorites', '', '', sortedItems, this.sortHeaderAction('favorites') + this.slideshowHeaderAction('favorites'));
        this.loadVisibleThumbnails(sortedItems);
    };

    App.prototype.renderRecentTimeline = function (items) {
        this.renderMediaTimeline('recent', 'Library', this.mediaSubtitle('recent'), this.mediaToolbar('recent'), items, this.timelineHeaderActions('recent'));
    };

    App.prototype.renderMediaTimeline = function (routeName, title, subtitle, toolbar, items, headerActions) {
        var groups = groupMediaByDate(items);

        this.root.innerHTML = this.shell(routeName, [
            '<main class="content-canvas timeline-canvas">',
            this.pageHeader(title, subtitle, headerActions),
            toolbar,
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

    App.prototype.mediaSubtitle = function (source) {
        var filter = this.mediaState[source].filter;
        if (filter) {
            return 'Showing ' + (source === 'videos' ? 'videos' : 'memories') + ' from ' + filter.label + '. Clear the filter to return to latest ' + (source === 'videos' ? 'videos' : 'memories') + '.';
        }

        return '';
    };

    App.prototype.mediaToolbar = function (source) {
        var filter = this.mediaState[source].filter;
        var clearAction = source === 'videos' ? 'clearVideosFilter' : 'clearRecentFilter';
        var controls = [
            filter ? '  <button class="filter-chip focusable" type="button" data-action="' + clearAction + '">Clear filter</button>' : ''
        ].join('');

        if (!controls) {
            return '';
        }

        return [
            '<div class="timeline-toolbar">',
            controls,
            '</div>'
        ].join('');
    };

    App.prototype.timelineHeaderActions = function (source) {
        return this.sortHeaderAction(source) + this.dateJumpHeaderAction(source) + this.slideshowHeaderAction(source);
    };

    App.prototype.dateJumpHeaderAction = function (source) {
        var action = source === 'videos' ? 'openVideosDateJump' : 'openDateJump';
        return [
            '<button class="header-icon-action focusable" type="button" data-action="' + action + '" aria-label="Jump to date">',
            '  <span class="calendar-search-icon" aria-hidden="true"></span>',
            '</button>'
        ].join('');
    };

    App.prototype.sortHeaderAction = function (source) {
        var order = this.getSortOrder(source);
        var nextLabel = order === 'desc' ? 'Sort oldest to latest' : 'Sort latest to oldest';
        var iconClass = order === 'desc' ? 'calendar-arrow-down-icon' : 'calendar-arrow-up-icon';

        return [
            '<button class="header-icon-action focusable" type="button" data-action="toggleSortOrder" data-source="' + escapeAttr(source) + '" aria-label="' + escapeAttr(nextLabel) + '">',
            '  <span class="' + iconClass + '" aria-hidden="true"></span>',
            '</button>'
        ].join('');
    };

    App.prototype.slideshowHeaderAction = function (source) {
        return [
            '<button class="header-icon-action focusable" type="button" data-action="startSlideshow" data-source="' + escapeAttr(source) + '" aria-label="Start slideshow">',
            '  <svg class="header-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.75v12.5a1 1 0 0 0 1.55.83l9.4-6.25a1 1 0 0 0 0-1.66l-9.4-6.25A1 1 0 0 0 8 5.75z"></path></svg>',
            '</button>'
        ].join('');
    };

    App.prototype.getSortOrder = function (source) {
        var key = source === 'videos' ? 'videos' : (source === 'favorites' ? 'favorites' : (source === 'albums' ? 'albums' : (source === 'album' ? 'album' : 'recent')));
        return this.mediaSortOrder[key] === 'asc' ? 'asc' : 'desc';
    };

    App.prototype.sortMediaItems = function (items, source) {
        var order = this.getSortOrder(source);

        return items.slice().sort(function (left, right) {
            var leftTime = mediaTimestamp(left);
            var rightTime = mediaTimestamp(right);

            if (!leftTime && !rightTime) {
                return 0;
            }

            if (!leftTime) {
                return 1;
            }

            if (!rightTime) {
                return -1;
            }

            if (leftTime === rightTime) {
                return String(left.id || '').localeCompare(String(right.id || ''));
            }

            return order === 'asc' ? leftTime - rightTime : rightTime - leftTime;
        });
    };

    App.prototype.sortAlbums = function (albums) {
        var order = this.getSortOrder('albums');

        return albums.slice().sort(function (left, right) {
            var leftTime = albumLatestTimestamp(left);
            var rightTime = albumLatestTimestamp(right);

            if (!leftTime && !rightTime) {
                return String(left.name || '').localeCompare(String(right.name || ''));
            }

            if (!leftTime) {
                return 1;
            }

            if (!rightTime) {
                return -1;
            }

            if (leftTime === rightTime) {
                return String(left.name || '').localeCompare(String(right.name || ''));
            }

            return order === 'asc' ? leftTime - rightTime : rightTime - leftTime;
        });
    };

    function mediaTimestamp(item) {
        var timestamp = item && item.date ? new Date(item.date).getTime() : 0;
        return isNaN(timestamp) ? 0 : timestamp;
    }

    function albumLatestTimestamp(album) {
        var value = album && (album.latestAssetDate || album.endDate || album.updatedAt || album.startDate);
        var timestamp = value ? new Date(value).getTime() : 0;
        return isNaN(timestamp) ? 0 : timestamp;
    }

    function latestAssetDateFromAssets(assets) {
        var latestTime = 0;
        var latestValue = '';

        assets.forEach(function (asset) {
            var value = asset.localDateTime || asset.fileCreatedAt || asset.createdAt || '';
            var timestamp = value ? new Date(value).getTime() : 0;

            if (!isNaN(timestamp) && timestamp > latestTime) {
                latestTime = timestamp;
                latestValue = value;
            }
        });

        return latestValue;
    }

    App.prototype.renderDateJump = function (source) {
        var stateKey = source === 'videos' ? 'videos' : 'recent';
        var activeRoute = stateKey === 'videos' ? 'videos' : 'recent';
        var backAction = stateKey === 'videos' ? 'videos' : 'recent';
        var title = stateKey === 'videos' ? 'Jump to videos' : 'Jump to date';
        var subtitle = stateKey === 'videos' ? 'Pick a year and month to load videos from that part of your Immich timeline.' : 'Pick a year and month to load that part of your Immich timeline directly.';
        var currentYear = new Date().getFullYear();
        var years = [];
        var months = monthOptions();
        var selectedYear = this.dateJumpYear || currentYear;
        var index;

        for (index = 0; index < 30; index += 1) {
            years.push(currentYear - index);
        }

        this.root.innerHTML = this.shell(activeRoute, [
            '<main class="date-jump-canvas">',
            this.pageHeader(title, subtitle),
            '  <section class="jump-section">',
            '    <h2>Year</h2>',
            '    <div class="jump-grid year-grid">',
            years.map(function (year) {
                return '<button class="jump-chip focusable' + (year === selectedYear ? ' active' : '') + '" type="button" data-action="selectJumpYear" data-source="' + stateKey + '" data-year="' + year + '">' + year + '</button>';
            }).join(''),
            '    </div>',
            '  </section>',
            '  <section class="jump-section">',
            '    <h2>' + selectedYear + '</h2>',
            '    <div class="jump-grid month-grid">',
            months.map(function (month) {
                return '<button class="jump-chip focusable" type="button" data-action="jumpToMonth" data-source="' + stateKey + '" data-year="' + selectedYear + '" data-month="' + month.value + '">' + month.label + '</button>';
            }).join(''),
            '    </div>',
            '  </section>',
            '  <button class="primary-action compact-action focusable" type="button" data-action="' + backAction + '">Back to ' + (stateKey === 'videos' ? 'Videos' : 'Library') + '</button>',
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
        var state = this.albumState;
        var sortedAlbums;

        if (!state.loaded && !state.loading && !state.error) {
            this.loadAlbums();
        }

        if (state.loading && !state.items.length) {
            this.renderGridStatus('albums', 'Albums', '', 'Loading your Immich albums...');
            return;
        }

        if (state.error && !state.items.length) {
            this.renderGridStatus('albums', 'Albums', '', 'Unable to load albums.', 'Retry', 'retryAlbums');
            return;
        }

        if (state.loaded && !state.items.length) {
            this.renderGridStatus('albums', 'Albums', '', 'No albums were found.');
            return;
        }

        sortedAlbums = this.sortAlbums(state.items);

        this.root.innerHTML = this.shell('albums', [
            '<main class="content-canvas albums-canvas">',
            this.pageHeader('Albums', '', this.sortHeaderAction('albums')),
            '  <div class="album-grid">',
            sortedAlbums.map(this.albumTile, this).join(''),
            '  </div>',
            '</main>'
        ].join(''));

        this.loadVisibleAlbumThumbnails(sortedAlbums);
    };

    App.prototype.renderAlbum = function (route) {
        var albumId = route && route.params ? route.params.albumId : '';
        var detail = this.getAlbumDetail(albumId);
        var title = detail.album ? detail.album.name : 'Album';
        var subtitle;

        this.currentAlbumId = albumId;

        if (!albumId) {
            this.renderGridStatus('albums', 'Albums', '', 'This album is not available.', 'Back to Albums', 'albums');
            return;
        }

        if (!detail.loaded && !detail.loading && !detail.error) {
            this.loadAlbum(albumId);
        }

        if (detail.loading && !detail.items.length) {
            this.renderGridStatus('albums', title, '', 'Loading album media...');
            return;
        }

        if (detail.error && !detail.items.length) {
            this.renderGridStatus('albums', title, '', 'Unable to load this album.', 'Retry', 'retryAlbum');
            return;
        }

        subtitle = this.albumSubtitle(detail.album, detail.items.length);

        if (detail.loaded && !detail.items.length) {
            this.renderGridStatus('albums', title, subtitle, 'No photos or videos were found in this album.', 'Back to Albums', 'albums');
            return;
        }

        var sortedItems = this.sortMediaItems(detail.items, 'album');
        this.renderMediaTimeline('albums', title, subtitle, this.albumToolbar(), sortedItems, this.sortHeaderAction('album') + this.slideshowHeaderAction('album'));
        this.loadVisibleThumbnails(sortedItems);

    };

    App.prototype.albumTile = function (album) {
        var coverId = album.coverId ? ' data-album-cover-id="' + escapeAttr(album.coverId) + '"' : '';
        var thumbnail = album.thumbnailUrl ? '<img class="media-thumb" src="' + escapeAttr(album.thumbnailUrl) + '" alt="" />' : this.thumbnailPlaceholder(!album.coverId || Boolean(album.coverError));
        var badge = album.shared ? '<span class="album-badge">Shared</span>' : '';
        var countText = album.count + ' item' + (album.count === 1 ? '' : 's');

        return [
            '<button class="album-card focusable" type="button" data-action="openAlbum" data-album-id="' + escapeAttr(album.id) + '"' + coverId + '>',
            '  <span class="album-art">' + thumbnail + '</span>',
            badge,
            '  <span class="album-info">',
            '    <strong>' + escapeHtml(album.name) + '</strong>',
            '    <small>' + escapeHtml(countText) + '</small>',
            '  </span>',
            '</button>'
        ].join('');
    };

    App.prototype.albumToolbar = function () {
        return [
            '<div class="timeline-toolbar">',
            '  <button class="filter-chip focusable" type="button" data-action="albums">Back to Albums</button>',
            '</div>'
        ].join('');
    };

    App.prototype.albumSubtitle = function (album, itemCount) {
        var count = album && album.count ? album.count : itemCount;
        var parts = [count + ' item' + (count === 1 ? '' : 's')];

        if (album && album.shared) {
            parts.push('Shared album');
        }

        return parts.join(' - ');
    };

    App.prototype.getAlbumDetail = function (albumId) {
        if (!this.albumDetails[albumId]) {
            this.albumDetails[albumId] = {
                album: this.findAlbum(albumId),
                items: [],
                loaded: false,
                loading: false,
                error: null
            };
        }

        return this.albumDetails[albumId];
    };

    App.prototype.findAlbum = function (albumId) {
        for (var index = 0; index < this.albumState.items.length; index += 1) {
            if (this.albumState.items[index].id === albumId) {
                return this.albumState.items[index];
            }
        }

        return null;
    };

    App.prototype.normalizeAlbum = function (album) {
        album = album || {};
        var assets = Array.isArray(album.assets) ? album.assets : [];
        var firstAsset = assets.length ? assets[0] : null;
        var coverId = album.albumThumbnailAssetId || firstAsset && firstAsset.id || '';
        var latestAssetDate = album.endDate || latestAssetDateFromAssets(assets) || '';

        return {
            id: album.id,
            name: album.albumName || 'Untitled album',
            coverId: coverId,
            count: Number(album.assetCount || assets.length || 0),
            shared: Boolean(album.shared),
            startDate: album.startDate || '',
            endDate: album.endDate || '',
            latestAssetDate: latestAssetDate,
            updatedAt: album.updatedAt || album.modifiedAt || '',
            thumbnailUrl: coverId && this.thumbnailUrls[coverId] ? this.thumbnailUrls[coverId] : ''
        };
    };

    App.prototype.loadAlbums = function () {
        var self = this;
        var state = this.albumState;

        if (state.loading) {
            return;
        }

        state.loading = true;
        state.error = null;

        this.createClient().getAlbums().then(function (albums) {
            var items = Array.isArray(albums) ? albums : albums && Array.isArray(albums.items) ? albums.items : [];
            state.items = items.filter(function (album) {
                return album && album.id;
            }).map(function (album) {
                return self.normalizeAlbum(album);
            }).sort(function (left, right) {
                return new Date(right.updatedAt || right.endDate || right.startDate || 0) - new Date(left.updatedAt || left.endDate || left.startDate || 0);
            });
            state.loaded = true;
            state.loading = false;
            self.renderRoute({ name: 'albums' });
        }).catch(function (error) {
            console.warn('Albums load failed', error);
            state.error = error;
            state.loading = false;
            state.loaded = false;
            self.renderRoute({ name: 'albums' });
            self.showToast(formatMediaError(error));
        });
    };

    App.prototype.loadAlbum = function (albumId) {
        var self = this;
        var detail = this.getAlbumDetail(albumId);

        if (detail.loading) {
            return;
        }

        detail.loading = true;
        detail.error = null;

        this.createClient().getAlbumInfo(albumId).then(function (album) {
            var normalized = self.normalizeAlbum(album);
            var assets = Array.isArray(album.assets) ? album.assets : [];
            detail.album = normalized;
            detail.items = assets.filter(isSupportedAsset).map(mapAssetToMedia);
            detail.loaded = true;
            detail.loading = false;
            self.albumDetails[albumId] = detail;
            self.updateAlbumSummary(normalized);
            self.renderRoute({ name: 'album', params: { albumId: albumId } });
        }).catch(function (error) {
            console.warn('Album load failed', albumId, error);
            detail.error = error;
            detail.loading = false;
            detail.loaded = false;
            self.renderRoute({ name: 'album', params: { albumId: albumId } });
            self.showToast(formatMediaError(error));
        });
    };

    App.prototype.updateAlbumSummary = function (album) {
        var index;

        if (!album || !album.id) {
            return;
        }

        for (index = 0; index < this.albumState.items.length; index += 1) {
            if (this.albumState.items[index].id === album.id) {
                this.albumState.items[index] = Object.assign({}, this.albumState.items[index], album);
                return;
            }
        }
    };

    App.prototype.loadVisibleAlbumThumbnails = function (albums) {
        var self = this;
        var client = this.createClient();
        var viewportHeight = global.innerHeight || document.documentElement.clientHeight || 720;
        var preloadBefore = viewportHeight * 0.75;
        var preloadAfter = viewportHeight * 1.5;
        var now = Date.now();
        var albumById = this.createItemLookup(albums || this.albumState.items);

        Array.prototype.slice.call(this.root.querySelectorAll('[data-album-cover-id]')).forEach(function (tile) {
            var albumId = tile.getAttribute('data-album-id');
            var coverId = tile.getAttribute('data-album-cover-id');
            var album = albumById[albumId];
            var rect = tile.getBoundingClientRect();

            if (!album || !coverId) {
                return;
            }

            if (rect.bottom < -preloadBefore || rect.top > viewportHeight + preloadAfter) {
                return;
            }

            if (self.thumbnailUrls[coverId]) {
                album.thumbnailUrl = self.thumbnailUrls[coverId];
                self.applyAlbumThumbnailToTile(albumId, self.thumbnailUrls[coverId]);
                return;
            }

            if (self.thumbnailLoads[coverId] === 'loading') {
                return;
            }

            if (self.thumbnailErrors[coverId] && now - self.thumbnailErrors[coverId] < 10000) {
                album.coverError = true;
                return;
            }

            self.thumbnailLoads[coverId] = 'loading';
            client.getAssetThumbnailBlob(coverId, { size: 'thumbnail' }).then(function (blob) {
                var objectUrl = global.URL.createObjectURL(blob);
                self.thumbnailUrls[coverId] = objectUrl;
                self.thumbnailLoads[coverId] = 'loaded';
                delete self.thumbnailErrors[coverId];
                album.thumbnailUrl = objectUrl;
                album.coverError = false;
                self.applyAlbumThumbnailToTile(albumId, objectUrl);
            }).catch(function (error) {
                delete self.thumbnailLoads[coverId];
                self.thumbnailErrors[coverId] = Date.now();
                album.coverError = true;
                self.applyAlbumThumbnailErrorToTile(albumId);
                console.warn('Album thumbnail load failed', coverId, error);
            });
        });
    };

    App.prototype.applyAlbumThumbnailToTile = function (albumId, objectUrl) {
        var tile = this.root.querySelector('[data-album-id="' + cssEscape(albumId) + '"] .album-art');

        if (!tile || tile.querySelector('.media-thumb')) {
            return;
        }

        tile.innerHTML = '<img class="media-thumb" src="' + escapeAttr(objectUrl) + '" alt="" />';
    };

    App.prototype.applyAlbumThumbnailErrorToTile = function (albumId) {
        var tile = this.root.querySelector('[data-album-id="' + cssEscape(albumId) + '"] .album-art');

        if (!tile || tile.querySelector('.media-thumb')) {
            return;
        }

        tile.innerHTML = this.thumbnailPlaceholder(true);
    };

    App.prototype.renderSettings = function () {
        var server = this.settings.serverUrl || 'No server configured';
        var account = this.settings.userEmail || this.settings.userName || 'Not signed in';
        var version = this.settings.serverVersion ? 'Immich ' + this.settings.serverVersion : 'Version unknown';
        this.root.innerHTML = this.shell('settings', [
            '<main class="content-canvas settings-canvas">',
            this.pageHeader('Settings', ''),
            '  <div class="settings-list">',
            '    <section class="settings-section">',
            '      <div class="settings-section-header compact-settings-header">',
            '        <h2>Connection</h2>',
            '        <p>' + escapeHtml(version) + '</p>',
            '      </div>',
            this.settingsItem('Server', server, 'images/settings/server.svg', 'serverConnection', 'Logout', 'danger'),
            this.settingsItem('Account', account, 'images/settings/user.svg', 'accountDetails', 'Info'),
            '    </section>',
            this.slideshowSettings(),
            this.displaySettings(),
            this.appearanceSettings(),
            this.settingsItem('Reset settings', 'Restore app preferences without signing out.', 'images/settings/reset.svg', 'resetSettings', 'Reset'),
            '  </div>',
            '</main>'
        ].join(''));
    };

    App.prototype.getAccentPalette = function (accentId) {
        var selectedId = accentId || this.settings.appearanceAccentId || namespace.Settings.defaults.appearanceAccentId;
        return accentPalettes.find(function (palette) {
            return palette.id === selectedId;
        }) || accentPalettes[0];
    };

    App.prototype.applyAppearance = function () {
        var palette = this.getAccentPalette();
        var rootStyle = document.documentElement.style;

        rootStyle.setProperty('--primary', palette.primary);
        rootStyle.setProperty('--primary-strong', palette.strong);
        rootStyle.setProperty('--on-primary', palette.onPrimary);
        rootStyle.setProperty('--primary-glow', palette.glow);
    };

    App.prototype.appearanceSettings = function () {
        var selectedId = this.getAccentPalette().id;

        return [
            '<section class="settings-section appearance-settings">',
            '  <div class="settings-section-header compact-settings-header">',
            '    <h2>Appearance</h2>',
            '    <p>Accent color</p>',
            '  </div>',
            '  <div class="palette-grid">',
            accentPalettes.map(function (palette) {
                var selected = palette.id === selectedId ? ' selected' : '';
                var ariaLabel = palette.label + (selected ? ', selected' : '');
                return [
                    '<button class="palette-option focusable' + selected + '" type="button" data-action="selectAccent" data-accent-id="' + escapeAttr(palette.id) + '" style="--swatch-color: ' + escapeAttr(palette.primary) + '; --swatch-strong: ' + escapeAttr(palette.strong) + ';" aria-label="' + escapeAttr(ariaLabel) + '">',
                    '  <span class="palette-swatch" aria-hidden="true"></span>',
                    '  <span class="palette-label">' + escapeHtml(palette.label) + '</span>',
                    '</button>'
                ].join('');
            }).join(''),
            '  </div>',
            '</section>'
        ].join('');
    };

    App.prototype.slideshowSettings = function () {
        var interval = this.getSlideshowIntervalSeconds();

        return [
            '<section class="settings-section slideshow-settings">',
            '  <div class="settings-section-header compact-settings-header">',
            '    <h2>Slideshow</h2>',
            '    <p>Photo interval: ' + interval + ' second' + (interval === 1 ? '' : 's') + '.</p>',
            '  </div>',
            '  <div class="slideshow-interval-row">',
            '    <button class="interval-step focusable" type="button" data-action="decreaseSlideshowInterval" aria-label="Decrease slideshow interval">-</button>',
            '    <label class="interval-field">',
            '      <span>Seconds</span>',
            '      <input class="interval-input focusable" id="slideshowInterval" type="number" min="1" max="300" step="1" value="' + interval + '" />',
            '    </label>',
            '    <button class="interval-step focusable" type="button" data-action="increaseSlideshowInterval" aria-label="Increase slideshow interval">+</button>',
            '    <button class="primary-action compact-action focusable" type="button" data-action="saveSlideshowInterval">Save</button>',
            '  </div>',
            '</section>'
        ].join('');
    };

    App.prototype.displaySettings = function () {
        var mode = this.getPhotoDisplayMode();

        return [
            '<section class="settings-section display-settings">',
            '  <div class="settings-section-header compact-settings-header">',
            '    <h2>Display</h2>',
            '    <p>Photo viewer mode</p>',
            '  </div>',
            '  <div class="segmented-control">',
            this.displayModeOption('fit', 'Fit', 'Show the entire photo', mode),
            this.displayModeOption('fill', 'Fill', 'Fill the screen', mode),
            '  </div>',
            '</section>'
        ].join('');
    };

    App.prototype.displayModeOption = function (mode, label, detail, selectedMode) {
        var selected = mode === selectedMode ? ' selected' : '';
        var ariaLabel = label + ', ' + detail + (selected ? ', selected' : '');

        return [
            '<button class="segmented-option focusable' + selected + '" type="button" data-action="selectPhotoDisplayMode" data-display-mode="' + escapeAttr(mode) + '" aria-label="' + escapeAttr(ariaLabel) + '">',
            '  <strong>' + escapeHtml(label) + '</strong>',
            '  <small>' + escapeHtml(detail) + '</small>',
            '</button>'
        ].join('');
    };

    App.prototype.getPhotoDisplayMode = function () {
        return this.settings.photoDisplayMode === 'fill' ? 'fill' : 'fit';
    };

    App.prototype.selectPhotoDisplayMode = function (mode) {
        var nextMode = mode === 'fill' ? 'fill' : 'fit';
        var label = nextMode === 'fill' ? 'Fill screen' : 'Fit to screen';

        this.logoutConfirmVisible = false;
        this.settings = namespace.Settings.write(Object.assign({}, this.settings, {
            photoDisplayMode: nextMode
        }));
        this.renderSettings();
        this.captureFocusables();
        this.showToast('Photo display set to ' + label + '.');
    };

    App.prototype.resetAppSettings = function () {
        this.logoutConfirmVisible = false;
        this.settings = namespace.Settings.write(Object.assign({}, this.settings, {
            appearanceAccentId: namespace.Settings.defaults.appearanceAccentId,
            slideshowIntervalSeconds: namespace.Settings.defaults.slideshowIntervalSeconds,
            slideshowShuffle: namespace.Settings.defaults.slideshowShuffle,
            photoDisplayMode: namespace.Settings.defaults.photoDisplayMode
        }));
        this.applyAppearance();
        this.renderSettings();
        this.captureFocusables();
        this.showToast('App settings reset.');
    };

    App.prototype.showLogoutConfirm = function () {
        this.logoutConfirmVisible = true;
        this.renderSettings();
        this.captureFocusables();
    };

    App.prototype.hideLogoutConfirm = function () {
        this.logoutConfirmVisible = false;
        this.renderSettings();
        this.captureFocusables();
    };

    App.prototype.confirmLogout = function () {
        this.logoutConfirmVisible = false;
        this.profileImageUrl = '';
        this.profileImageUserId = '';
        this.profileImageLoad = '';
        this.profileImageError = false;
        this.settings = namespace.Settings.clear();
        this.setupAuthMode = 'password';
        this.applyAppearance();
        this.router.reset('setup');
        this.showToast('Signed out.');
    };

    App.prototype.getSlideshowIntervalSeconds = function () {
        return this.clampSlideshowInterval(this.settings.slideshowIntervalSeconds);
    };

    App.prototype.clampSlideshowInterval = function (value) {
        var interval = Number(value);

        if (!isFinite(interval)) {
            interval = namespace.Settings.defaults.slideshowIntervalSeconds || 10;
        }

        return Math.max(1, Math.min(300, Math.round(interval)));
    };

    App.prototype.saveSlideshowInterval = function (value) {
        var interval = this.clampSlideshowInterval(value);

        this.logoutConfirmVisible = false;
        this.settings = namespace.Settings.write(Object.assign({}, this.settings, {
            slideshowIntervalSeconds: interval
        }));
        this.renderSettings();
        this.captureFocusables();
        this.showToast('Slideshow interval set to ' + interval + ' second' + (interval === 1 ? '' : 's') + '.');
    };

    App.prototype.selectAccent = function (accentId) {
        var palette = this.getAccentPalette(accentId);

        this.logoutConfirmVisible = false;
        this.settings = namespace.Settings.write(Object.assign({}, this.settings, {
            appearanceAccentId: palette.id
        }));
        this.applyAppearance();
        this.pendingAccentId = palette.id;
        this.renderSettings();
        this.captureFocusables();
        this.showToast(palette.label + ' accent selected.');
    };

    App.prototype.shell = function (activeRoute, content) {
        return [
            '<section class="app-screen">',
            this.navRail(activeRoute),
            this.topBar(),
            content,
            this.logoutConfirmVisible ? this.logoutConfirmDialog() : '',
            '<div id="toast" class="toast"></div>',
            '</section>'
        ].join('');
    };

    App.prototype.logoutConfirmDialog = function () {
        return [
            '<div class="modal-scrim" role="presentation">',
            '  <section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="logoutConfirmTitle">',
            '    <h2 id="logoutConfirmTitle">Log out?</h2>',
            '    <p>You will need to sign in again to browse your Immich library on this TV.</p>',
            '    <div class="confirm-actions">',
            '      <button class="secondary-action focusable" type="button" data-action="cancelLogout">Cancel</button>',
            '      <button class="danger-action focusable" type="button" data-action="confirmLogout">Log out</button>',
            '    </div>',
            '  </section>',
            '</div>'
        ].join('');
    };

    App.prototype.navRail = function (activeRoute) {
        return [
            '<aside class="nav-rail" aria-label="Primary navigation">',
            '  <div class="rail-brand"><img src="images/app-icon.svg" alt="" /></div>',
            '  <nav class="rail-items">',
            navItems.map(function (item) {
                var active = item.action === activeRoute ? ' active' : '';
                var iconUrl = escapeAttr(item.icon);
                return [
                    '<button class="rail-button focusable' + active + '" type="button" data-action="' + item.action + '">',
                    '  <span class="rail-icon" style="-webkit-mask-image: url(\'' + iconUrl + '\'); mask-image: url(\'' + iconUrl + '\');" aria-hidden="true"></span>',
                    '  <span class="rail-label">' + item.label + '</span>',
                    '</button>'
                ].join('');
            }).join(''),
            '  </nav>',
            '</aside>'
        ].join('');
    };

    App.prototype.topBar = function () {
        var initial = (this.settings.userName || this.settings.userEmail || 'P').charAt(0).toUpperCase();
        var title = this.settings.userEmail || this.settings.userName || 'Pensieve';
        var image = this.profileImageUrl ? '<img class="avatar-image" src="' + escapeAttr(this.profileImageUrl) + '" alt="" />' : escapeHtml(initial);

        this.loadUserProfileImage();

        return [
            '<header class="top-bar">',
            '  <div class="avatar" title="' + escapeAttr(title) + '" aria-label="' + escapeAttr(title) + '">' + image + '</div>',
            '</header>'
        ].join('');
    };

    App.prototype.loadUserProfileImage = function () {
        var self = this;
        var userId = this.settings.userId;

        if (this.profileImageUserId && this.profileImageUserId !== userId) {
            this.profileImageUrl = '';
            this.profileImageUserId = '';
            this.profileImageLoad = '';
            this.profileImageError = false;
        }

        if (!userId || this.profileImageUrl || this.profileImageLoad === 'loading' || this.profileImageError || !namespace.Settings.hasConnection(this.settings)) {
            return;
        }

        this.profileImageLoad = 'loading';
        this.createClient().getUserProfileImageBlob(userId).then(function (blob) {
            self.profileImageUrl = global.URL.createObjectURL(blob);
            self.profileImageUserId = userId;
            self.profileImageLoad = 'loaded';
            self.profileImageError = false;
            self.updateTopBarAvatar();
        }).catch(function (error) {
            console.warn('Profile image load failed', error);
            self.profileImageLoad = '';
            self.profileImageError = true;
        });
    };

    App.prototype.updateTopBarAvatar = function () {
        var avatar = this.root.querySelector('.top-bar .avatar');

        if (!avatar || !this.profileImageUrl) {
            return;
        }

        avatar.innerHTML = '<img class="avatar-image" src="' + escapeAttr(this.profileImageUrl) + '" alt="" />';
    };

    App.prototype.pageHeader = function (title, subtitle, actions) {
        var headerClass = 'page-header' + (subtitle ? ' has-subtitle' : '') + (actions ? ' has-actions' : '');

        return [
            '<header class="' + headerClass + '">',
            '  <div class="page-title-row">',
            '    <h1>' + escapeHtml(title) + '</h1>',
            actions ? '    <div class="page-header-actions">' + actions + '</div>' : '',
            '  </div>',
            subtitle ? '  <p>' + escapeHtml(subtitle) + '</p>' : '',
            '</header>'
        ].join('');
    };

    App.prototype.mediaTile = function (item) {
        var badge = item.type === 'video' ? '<span class="media-badge media-video-badge" aria-label="Video"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"></path><rect x="2" y="6" width="14" height="12" rx="2"></rect></svg></span>' : '';
        var favoriteBadge = item.isFavorite ? '<span class="media-favorite-badge" aria-label="Favorite"><svg class="heart-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"></path></svg></span>' : '';
        var assetId = item.id ? ' data-asset-id="' + escapeAttr(item.id) + '"' : '';
        var hasRecentError = item.id && this.thumbnailErrors[item.id] && Date.now() - this.thumbnailErrors[item.id] < 10000;
        var thumbnail = item.thumbnailUrl ? '<img class="media-thumb" src="' + escapeAttr(item.thumbnailUrl) + '" alt="" />' : this.thumbnailPlaceholder(hasRecentError);
        return [
            '<button class="media-card focusable tone-' + (item.tone || 'forest') + ' ' + (item.ratioClass || 'ratio-square') + '" type="button" data-action="openMedia"' + assetId + '>',
            '  <span class="media-art">' + thumbnail + '</span>',
            badge,
            favoriteBadge,
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

        this.createClient().searchAssets({
            page: page,
            size: 60,
            order: this.getSortOrder('recent'),
            visibility: 'timeline',
            withExif: true
        }).then(function (response) {
            var assets = extractSearchItems(response).filter(isSupportedAsset);
            var media = assets.map(mapAssetToMedia);
            state.items = append ? mergeMediaItems(state.items, media) : media;
            state.loaded = true;
            state.loading = false;
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

    App.prototype.loadVideosMedia = function (options) {
        var self = this;
        var state = this.mediaState.videos;
        var loadOptions = options || {};
        var page = loadOptions.page || state.page || 1;
        var append = Boolean(loadOptions.append);
        var silent = Boolean(loadOptions.silent);

        if (state.loading) {
            return;
        }

        if (state.filter && state.filter.timeBucket && !append) {
            this.loadVideosBucket(state.filter);
            return;
        }

        state.loading = true;
        state.error = null;

        this.createClient().searchAssets({
            page: page,
            size: 60,
            order: this.getSortOrder('videos'),
            visibility: 'timeline',
            type: 'VIDEO',
            withExif: true
        }).then(function (response) {
            var assets = extractSearchItems(response).filter(function (asset) {
                return asset && asset.type === 'VIDEO';
            });
            var media = assets.map(mapAssetToMedia);
            state.items = append ? mergeMediaItems(state.items, media) : media;
            state.loaded = true;
            state.loading = false;
            state.page = page;
            state.nextPage = getSearchNextPage(response);
            state.hasMore = Boolean(state.nextPage);
            if (typeof loadOptions.onLoaded === 'function') {
                loadOptions.onLoaded(media, response);
            }

            if (!silent) {
                self.renderRoute({ name: 'videos' });
            }
        }).catch(function (error) {
            console.warn('Videos load failed', error);
            state.error = error;
            state.loading = false;
            state.loaded = append ? state.loaded : false;
            if (typeof loadOptions.onError === 'function') {
                loadOptions.onError(error);
            }

            if (!silent) {
                self.renderRoute({ name: 'videos' });
            }
            self.showToast(formatMediaError(error));
        });
    };

    App.prototype.loadFavoritesMedia = function (options) {
        var self = this;
        var state = this.mediaState.favorites;
        var loadOptions = options || {};
        var page = loadOptions.page || state.page || 1;
        var append = Boolean(loadOptions.append);
        var silent = Boolean(loadOptions.silent);

        if (state.loading) {
            return;
        }

        state.loading = true;
        state.error = null;

        this.createClient().searchAssets({
            page: page,
            size: 60,
            order: this.getSortOrder('favorites'),
            visibility: 'timeline',
            isFavorite: true,
            withExif: true
        }).then(function (response) {
            var assets = extractSearchItems(response).filter(isSupportedAsset);
            var media = assets.map(mapAssetToMedia);
            state.items = append ? mergeMediaItems(state.items, media) : media;
            state.loaded = true;
            state.loading = false;
            state.page = page;
            state.nextPage = getSearchNextPage(response);
            state.hasMore = Boolean(state.nextPage);
            if (typeof loadOptions.onLoaded === 'function') {
                loadOptions.onLoaded(media, response);
            }

            if (!silent) {
                self.renderRoute({ name: 'favorites' });
            }
        }).catch(function (error) {
            console.warn('Favorites load failed', error);
            state.error = error;
            state.loading = false;
            state.loaded = append ? state.loaded : false;
            if (typeof loadOptions.onError === 'function') {
                loadOptions.onError(error);
            }

            if (!silent) {
                self.renderRoute({ name: 'favorites' });
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

    App.prototype.loadVideosBucket = function (filter) {
        var self = this;
        var state = this.mediaState.videos;

        state.loading = true;
        state.error = null;

        this.createClient().getTimelineBucket(filter.timeBucket).then(function (response) {
            state.items = mapTimelineBucketToMedia(response, filter.timeBucket).filter(function (item) {
                return item.type === 'video';
            });
            state.loaded = true;
            state.loading = false;
            state.page = 1;
            state.nextPage = null;
            state.hasMore = false;
            self.renderRoute({ name: 'videos' });
        }).catch(function (error) {
            console.warn('Videos timeline bucket load failed', error);
            state.error = error;
            state.loading = false;
            state.loaded = false;
            self.renderRoute({ name: 'videos' });
            self.showToast(formatMediaError(error));
        });
    };

    App.prototype.currentMediaSource = function () {
        if (this.router.current && this.router.current.name === 'videos') {
            return 'videos';
        }

        if (this.router.current && this.router.current.name === 'favorites') {
            return 'favorites';
        }

        if (this.router.current && this.router.current.name === 'album') {
            return 'album';
        }

        return 'recent';
    };

    App.prototype.currentMediaItems = function () {
        var source = this.currentMediaSource();

        if (source === 'album') {
            return this.sortMediaItems(this.getAlbumDetail(this.currentAlbumId).items, 'album');
        }

        return this.sortMediaItems(this.mediaState[source].items, source);
    };

    App.prototype.loadMoreMediaIfNeeded = function () {
        var source = this.currentMediaSource();
        if (source === 'album') {
            return;
        }

        var state = this.mediaState[source];
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
        this[this.mediaLoaderName(source)]({
            page: nextPage,
            append: true
        });
    };

    App.prototype.mediaLoaderName = function (source) {
        if (source === 'videos') {
            return 'loadVideosMedia';
        }

        if (source === 'favorites') {
            return 'loadFavoritesMedia';
        }

        return 'loadRecentMedia';
    };

    App.prototype.bindScrollLoading = function () {
        var self = this;
        var timeline = this.root.querySelector('.timeline-canvas');
        var albumsCanvas = this.root.querySelector('.albums-canvas');

        if (!timeline && !albumsCanvas) {
            return;
        }

        if (timeline) {
            timeline.addEventListener('scroll', function () {
                self.queueVisibleThumbnailLoad();
                self.loadMoreMediaIfNeeded();
            });
        }

        if (albumsCanvas) {
            albumsCanvas.addEventListener('scroll', function () {
                self.queueVisibleAlbumThumbnailLoad();
            });
        }
    };

    App.prototype.currentThumbnailItems = function () {
        var source = this.currentMediaSource();

        if (source === 'album') {
            return this.getAlbumDetail(this.currentAlbumId).items;
        }

        if (source === 'favorites') {
            return this.mediaState.favorites.items.filter(function (item) {
                return item.isFavorite;
            });
        }

        return this.mediaState[source].items;
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
            self.loadVisibleThumbnails(self.currentThumbnailItems());
        }, 80);
    };

    App.prototype.queueVisibleAlbumThumbnailLoad = function () {
        var self = this;

        if (!this.root.querySelector('.album-grid')) {
            return;
        }

        if (this.albumThumbnailTimer) {
            global.clearTimeout(this.albumThumbnailTimer);
        }

        this.albumThumbnailTimer = global.setTimeout(function () {
            self.albumThumbnailTimer = null;
            self.loadVisibleAlbumThumbnails(self.albumState.items);
        }, 80);
    };

    App.prototype.createItemLookup = function (items) {
        var lookup = {};

        (items || []).forEach(function (item) {
            if (item && item.id) {
                lookup[item.id] = item;
            }
        });

        return lookup;
    };

    App.prototype.loadVisibleThumbnails = function (items) {
        var self = this;
        var client = this.createClient();
        var viewportHeight = global.innerHeight || document.documentElement.clientHeight || 720;
        var preloadBefore = viewportHeight * 0.75;
        var preloadAfter = viewportHeight * 1.5;
        var now = Date.now();
        var mediaById = this.createItemLookup(items);

        Array.prototype.slice.call(this.root.querySelectorAll('[data-asset-id]')).forEach(function (tile) {
            var assetId = tile.getAttribute('data-asset-id');
            var media = mediaById[assetId];
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

    App.prototype.toggleCurrentFavorite = function () {
        var item = this.currentViewerItem ? this.currentViewerItem() : null;
        var nextValue;

        if (!item || !item.id) {
            this.showToast('This item is not available yet.');
            return;
        }

        nextValue = !item.isFavorite;
        this.setMediaFavoriteState(item.id, nextValue);
        this.pendingViewerAction = 'viewerFavorite';
        this.renderViewer(this.router.current);
        this.captureFocusables();

        this.createClient().updateAsset(item.id, {
            isFavorite: nextValue
        }).then(function (asset) {
            var savedValue = asset && asset.isFavorite !== undefined ? Boolean(asset.isFavorite) : nextValue;
            this.setMediaFavoriteState(item.id, savedValue);
            this.showToast(savedValue ? 'Added to favorites.' : 'Removed from favorites.');
        }.bind(this)).catch(function (error) {
            console.warn('Favorite update failed', error);
            this.setMediaFavoriteState(item.id, !nextValue);
            this.renderViewer(this.router.current);
            this.captureFocusables();
            this.showToast(formatMediaError(error));
        }.bind(this));
    };

    App.prototype.setMediaFavoriteState = function (assetId, isFavorite) {
        var self = this;
        var sourceItem = this.findMediaItem(assetId);

        Object.keys(this.mediaState).forEach(function (key) {
            if (key === 'favorites' && isFavorite && sourceItem && self.mediaState[key].loaded && !findById(self.mediaState[key].items, assetId)) {
                self.mediaState[key].items.unshift(Object.assign({}, sourceItem, {
                    isFavorite: true
                }));
                return;
            }

            self.mediaState[key].items.forEach(function (item) {
                if (item.id === assetId) {
                    item.isFavorite = isFavorite;
                }
            });
        });

        Object.keys(this.albumDetails).forEach(function (albumId) {
            self.albumDetails[albumId].items.forEach(function (item) {
                if (item.id === assetId) {
                    item.isFavorite = isFavorite;
                }
            });
        });
    };

    App.prototype.findMediaItem = function (assetId) {
        var found = null;

        Object.keys(this.mediaState).some(function (key) {
            found = findById(this.mediaState[key].items, assetId);
            return Boolean(found);
        }, this);

        if (found) {
            return found;
        }

        Object.keys(this.albumDetails).some(function (albumId) {
            found = findById(this.albumDetails[albumId].items, assetId);
            return Boolean(found);
        }, this);

        return found;
    };

    App.prototype.settingsItem = function (title, detail, icon, action, trailing, tone) {
        var iconMarkup = /\.svg$/i.test(icon) ? '<span class="settings-icon-mask" style="-webkit-mask-image: url(\'' + escapeAttr(icon) + '\'); mask-image: url(\'' + escapeAttr(icon) + '\');" aria-hidden="true"></span>' : escapeHtml(icon);
        var toneClass = tone ? ' settings-item-' + tone : '';

        return [
            '<button class="settings-item focusable' + toneClass + '" type="button" data-action="' + action + '">',
            '  <span class="settings-icon">' + iconMarkup + '</span>',
            '  <span class="settings-copy">',
            '    <strong>' + escapeHtml(title) + '</strong>',
            '    <small>' + escapeHtml(detail) + '</small>',
            '  </span>',
            '  <span class="settings-trailing">' + escapeHtml(trailing || '>') + '</span>',
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
        } else if (action === 'resetSettings') {
            this.resetAppSettings();
        } else if (action === 'selectAccent') {
            this.selectAccent(element.getAttribute('data-accent-id'));
        } else if (action === 'selectPhotoDisplayMode') {
            this.selectPhotoDisplayMode(element.getAttribute('data-display-mode'));
        } else if (action === 'retryRecent') {
            this.mediaState.recent = createMediaState();
            this.renderRecent();
            this.captureFocusables();
        } else if (action === 'retryVideos') {
            this.mediaState.videos = createMediaState();
            this.renderVideos();
            this.captureFocusables();
        } else if (action === 'retryFavorites') {
            this.mediaState.favorites = createMediaState();
            this.renderFavorites();
            this.captureFocusables();
        } else if (action === 'retryAlbums') {
            this.albumState = {
                items: [],
                loaded: false,
                loading: false,
                error: null
            };
            this.renderAlbums();
            this.captureFocusables();
        } else if (action === 'retryAlbum') {
            if (this.currentAlbumId) {
                delete this.albumDetails[this.currentAlbumId];
                this.renderAlbum({ name: 'album', params: { albumId: this.currentAlbumId } });
                this.captureFocusables();
            }
        } else if (action === 'toggleSortOrder') {
            this.toggleSortOrder(element.getAttribute('data-source') || this.currentMediaSource());
        } else if (action === 'startSlideshow') {
            this.startSlideshowFromSource(element.getAttribute('data-source') || this.currentMediaSource());
        } else if (action === 'viewerSlideshow') {
            this.toggleViewerSlideshow();
        } else if (action === 'decreaseSlideshowInterval') {
            var decreaseInput = document.getElementById('slideshowInterval');
            this.saveSlideshowInterval((decreaseInput ? decreaseInput.value : this.getSlideshowIntervalSeconds()) - 1);
        } else if (action === 'increaseSlideshowInterval') {
            var increaseInput = document.getElementById('slideshowInterval');
            this.saveSlideshowInterval(Number(increaseInput ? increaseInput.value : this.getSlideshowIntervalSeconds()) + 1);
        } else if (action === 'saveSlideshowInterval') {
            var intervalInput = document.getElementById('slideshowInterval');
            this.saveSlideshowInterval(intervalInput ? intervalInput.value : this.getSlideshowIntervalSeconds());
        } else if (action === 'openDateJump') {
            this.router.navigate('dateJump');
        } else if (action === 'openVideosDateJump') {
            this.router.navigate('videoDateJump');
        } else if (action === 'selectJumpYear') {
            this.dateJumpYear = Number(element.getAttribute('data-year')) || this.dateJumpYear;
            this.renderDateJump(element.getAttribute('data-source') || 'recent');
            this.captureFocusables();
        } else if (action === 'jumpToMonth') {
            this.applyMediaMonthFilter(
                element.getAttribute('data-source') || 'recent',
                Number(element.getAttribute('data-year')),
                Number(element.getAttribute('data-month'))
            );
        } else if (action === 'clearRecentFilter') {
            this.mediaState.recent = createMediaState();
            this.router.reset('recent');
        } else if (action === 'clearVideosFilter') {
            this.mediaState.videos = createMediaState();
            this.router.reset('videos');
        } else if (action === 'openAlbum') {
            this.currentAlbumId = element.getAttribute('data-album-id') || '';
            this.router.navigate('album', { albumId: this.currentAlbumId });
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
        } else if (action === 'viewerFavorite') {
            this.toggleCurrentFavorite();
        } else if (action === 'serverConnection') {
            this.showLogoutConfirm();
        } else if (action === 'cancelLogout') {
            this.hideLogoutConfirm();
        } else if (action === 'confirmLogout') {
            this.confirmLogout();
        } else if (action === 'accountDetails') {
            this.showToast(this.settings.userEmail || this.settings.userName || 'No account details saved.');
        } else if (action === 'apiKeySetup') {
            this.setupAuthMode = this.setupAuthMode === 'apiKey' ? 'password' : 'apiKey';
            this.renderSetup();
            this.captureFocusables();
        } else {
            this.showToast('This action is not available here.');
        }
    };

    App.prototype.applyMediaMonthFilter = function (source, year, month) {
        var stateKey = source === 'videos' ? 'videos' : 'recent';
        if (!year || !month) {
            this.showToast('Choose a year and month.');
            return;
        }

        this.dateJumpYear = year;
        this.mediaState[stateKey] = createMediaState();
        this.mediaState[stateKey].filter = {
            label: monthName(month) + ' ' + year,
            timeBucket: createMonthBucket(year, month)
        };
        this.router.reset(stateKey === 'videos' ? 'videos' : 'recent');
    };

    App.prototype.toggleSortOrder = function (source) {
        var stateKey = source === 'videos' ? 'videos' : (source === 'favorites' ? 'favorites' : (source === 'albums' ? 'albums' : (source === 'album' ? 'album' : 'recent')));
        var nextOrder = this.getSortOrder(stateKey) === 'desc' ? 'asc' : 'desc';
        var message = nextOrder === 'desc' ? 'Sorted latest to oldest.' : 'Sorted oldest to latest.';

        this.mediaSortOrder[stateKey] = nextOrder;

        if (stateKey === 'albums') {
            this.renderAlbums();
            this.captureFocusables();
            this.showToast(message);
            return;
        }

        if (stateKey === 'album') {
            this.renderAlbum({ name: 'album', params: { albumId: this.currentAlbumId } });
            this.captureFocusables();
            this.showToast(message);
            return;
        }

        var filter = this.mediaState[stateKey].filter;
        this.mediaState[stateKey] = createMediaState();
        this.mediaState[stateKey].filter = filter;
        this.router.reset(stateKey);
        this.showToast(message);
    };

    App.prototype.saveSetup = function () {
        var self = this;
        var serverUrlInput = document.getElementById('serverUrl');
        var emailInput = document.getElementById('email');
        var passwordInput = document.getElementById('password');
        var apiKeyInput = document.getElementById('apiKey');
        var isApiKey = this.setupAuthMode === 'apiKey';
        var serverUrl = serverUrlInput ? serverUrlInput.value.trim() : '';
        var email = emailInput ? emailInput.value.trim() : '';
        var password = passwordInput ? passwordInput.value : '';
        var apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';

        if (!serverUrl) {
            this.showToast('Enter a server URL before continuing.');
            return;
        }

        if (isApiKey) {
            if (!apiKey) {
                this.showToast('Enter an Immich API key.');
                return;
            }

            this.isBusy = true;
            this.settings = Object.assign({}, this.settings, {
                serverUrl: serverUrl,
                authMode: 'apiKey',
                apiKey: apiKey
            });
            this.renderSetup();
            this.captureFocusables();

            var apiClient = this.createClient({
                serverUrl: serverUrl,
                authMode: 'apiKey',
                apiKey: apiKey,
                accessToken: ''
            });

            Promise.all([
                apiClient.validateToken(),
                apiClient.getServerVersion(),
                apiClient.getMyUser()
            ]).then(function (results) {
                var user = results[2] || {};

                self.settings = namespace.Settings.write(Object.assign({}, self.settings, {
                    serverUrl: namespace.normalizeServerUrl(serverUrl),
                    authMode: 'apiKey',
                    accessToken: '',
                    apiKey: apiKey,
                    userId: user.id || '',
                    userName: user.name || '',
                    userEmail: user.email || '',
                    userProfileImagePath: user.profileImagePath || '',
                    serverVersion: formatServerVersion(results[1])
                }));

                self.isBusy = false;
                self.showToast('API key saved.');
                self.router.reset('recent');
            }).catch(function (error) {
                console.warn('Immich API key setup failed', error);
                self.isBusy = false;
                self.settings = Object.assign({}, self.settings, {
                    serverUrl: serverUrl,
                    authMode: 'apiKey',
                    apiKey: apiKey
                });
                self.renderSetup();
                self.captureFocusables();
                self.showToast(formatAuthError(error));
            });
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
            self.settings = namespace.Settings.write(Object.assign({}, self.settings, {
                serverUrl: namespace.normalizeServerUrl(serverUrl),
                authMode: 'password',
                accessToken: result.loginResponse.accessToken,
                apiKey: '',
                userId: result.user.id || result.loginResponse.userId || '',
                userName: result.user.name || result.loginResponse.name || '',
                userEmail: result.user.email || result.loginResponse.userEmail || email,
                userProfileImagePath: result.user.profileImagePath || '',
                serverVersion: formatServerVersion(result.version)
            }));

            if (passwordInput) {
                passwordInput.value = '';
            }

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
