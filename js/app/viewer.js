(function (global) {
    var namespace = global.Pensieve = global.Pensieve || {};
    var App = namespace.App;
    var helpers = namespace.AppHelpers;
    var escapeHtml = helpers.escapeHtml;
    var escapeAttr = helpers.escapeAttr;
    var normalizeNextPage = helpers.normalizeNextPage;
    var findById = helpers.findById;
    var findIndexById = helpers.findIndexById;
    var viewerCacheKey = helpers.viewerCacheKey;
    var currentViewerAction = helpers.currentViewerAction;

    App.prototype.currentViewerItem = function () {
        var assetId = this.router.current && this.router.current.params ? this.router.current.params.assetId : '';
        return findById(this.viewerItems(), assetId);
    };

    App.prototype.renderViewer = function (route) {
        var assetId = route && route.params ? route.params.assetId : '';
        var items = this.viewerItems();
        var index = findIndexById(items, assetId);
        var item = index >= 0 ? items[index] : null;

        if (!item) {
            this.root.innerHTML = [
                '<section class="viewer-screen">',
                '  <div class="viewer-status">',
                '    <strong>Media unavailable</strong>',
                '    <button class="primary-action compact-action focusable" type="button" data-action="viewerClose">Back to Library</button>',
                '  </div>',
                '  <div id="toast" class="toast"></div>',
                '</section>'
            ].join('');
            return;
        }

        if (item.type === 'video') {
            this.renderVideoViewer(item, items, index);
            return;
        }

        var fullUrl = this.viewerImageUrls[viewerCacheKey(item.id, 'fullsize')];
        var previewUrl = this.viewerImageUrls[viewerCacheKey(item.id, 'preview')];
        var imageUrl = fullUrl || previewUrl || this.thumbnailUrls[item.id] || '';
        var isLoading = this.viewerImageLoads[viewerCacheKey(item.id, 'preview')] === 'loading' || this.viewerImageLoads[viewerCacheKey(item.id, 'fullsize')] === 'loading';
        var hasError = !imageUrl && (this.viewerImageErrors[viewerCacheKey(item.id, 'preview')] || this.viewerImageErrors[viewerCacheKey(item.id, 'fullsize')]);
        var overlayClass = this.viewerOverlayVisible ? ' visible' : '';

        this.root.innerHTML = [
            '<section class="viewer-screen">',
            imageUrl ? '  <img class="viewer-photo" src="' + escapeAttr(imageUrl) + '" alt="" />' : '',
            !imageUrl && isLoading ? '  <div class="viewer-status"><span class="viewer-loading-dot"></span><strong>Loading photo</strong></div>' : '',
            hasError ? '  <div class="viewer-status"><strong>Unable to load this photo.</strong><button class="primary-action compact-action focusable" type="button" data-action="viewerRetry">Retry</button></div>' : '',
            !imageUrl && !isLoading && !hasError ? '  <div class="viewer-status"><span class="viewer-loading-dot"></span><strong>Preparing photo</strong></div>' : '',
            '  <div class="viewer-overlay' + overlayClass + '">',
            '    <div class="viewer-topbar">',
            '      <button class="viewer-action viewer-back focusable" type="button" data-action="viewerClose" aria-label="Back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg></button>',
            '    </div>',
            '    <button class="viewer-action viewer-edge viewer-prev focusable" type="button" data-action="viewerPrev" aria-label="Previous photo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg></button>',
            '    <button class="viewer-action viewer-edge viewer-next focusable" type="button" data-action="viewerNext" aria-label="Next photo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg></button>',
            '  </div>',
            '  <div id="toast" class="toast"></div>',
            '</section>'
        ].join('');

        this.loadViewerImage(item.id);
        this.preloadViewerNeighbors(items, index);
    };

    App.prototype.renderVideoViewer = function (item) {
        var videoUrl = this.viewerVideoUrls[item.id] || '';
        var posterUrl = this.thumbnailUrls[item.id] || '';
        var isLoading = this.viewerVideoLoads[item.id] === 'loading';
        var hasError = this.viewerVideoErrors[item.id];
        var overlayClass = this.viewerOverlayVisible ? ' visible' : '';

        this.root.innerHTML = [
            '<section class="viewer-screen">',
            videoUrl && !hasError ? '  <video id="viewerVideo" class="viewer-video" src="' + escapeAttr(videoUrl) + '"' + (posterUrl ? ' poster="' + escapeAttr(posterUrl) + '"' : '') + ' autoplay controls playsinline preload="auto"></video>' : '',
            !videoUrl && isLoading ? '  <div class="viewer-status"><span class="viewer-loading-dot"></span><strong>Loading video</strong></div>' : '',
            hasError ? '  <div class="viewer-status"><strong>Unable to play this video.</strong><p class="viewer-status-copy">This file may use a codec unsupported by this TV.</p><button class="primary-action compact-action focusable" type="button" data-action="viewerRetry">Retry</button></div>' : '',
            !videoUrl && !isLoading && !hasError ? '  <div class="viewer-status"><span class="viewer-loading-dot"></span><strong>Preparing video</strong></div>' : '',
            '  <div class="viewer-overlay video-viewer-overlay' + overlayClass + '">',
            '    <div class="viewer-topbar">',
            '      <button class="viewer-action viewer-back focusable" type="button" data-action="viewerClose" aria-label="Back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg></button>',
            '    </div>',
            '    <button class="viewer-action viewer-edge viewer-prev focusable" type="button" data-action="viewerPrev" aria-label="Previous item"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg></button>',
            '    <button class="viewer-action viewer-edge viewer-next focusable" type="button" data-action="viewerNext" aria-label="Next item"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg></button>',
            '  </div>',
            '  <div id="toast" class="toast"></div>',
            '</section>'
        ].join('');

        this.loadViewerVideo(item.id);
        this.bindViewerVideo(item.id);
    };

    App.prototype.loadViewerVideo = function (assetId) {
        var self = this;

        if (!assetId || this.viewerVideoUrls[assetId] || this.viewerVideoLoads[assetId] === 'loading' || this.viewerVideoErrors[assetId]) {
            return;
        }

        this.viewerVideoLoads[assetId] = 'loading';
        this.createClient().getAssetVideoPlaybackBlob(assetId).then(function (blob) {
            var objectUrl = global.URL.createObjectURL(blob);
            self.viewerVideoUrls[assetId] = objectUrl;
            self.viewerVideoLoads[assetId] = 'loaded';
            delete self.viewerVideoErrors[assetId];

            if (self.router.current && self.router.current.name === 'viewer' && self.router.current.params.assetId === assetId) {
                self.pendingViewerAction = currentViewerAction(self) || self.pendingViewerAction;
                self.renderViewer(self.router.current);
                self.captureFocusables();
            }
        }).catch(function (error) {
            delete self.viewerVideoLoads[assetId];
            self.viewerVideoErrors[assetId] = error;

            if (self.router.current && self.router.current.name === 'viewer' && self.router.current.params.assetId === assetId) {
                self.pendingViewerAction = currentViewerAction(self) || self.pendingViewerAction;
                self.renderViewer(self.router.current);
                self.captureFocusables();
            }
        });
    };

    App.prototype.bindViewerVideo = function (assetId) {
        var self = this;
        var video = document.getElementById('viewerVideo');

        if (!video) {
            return;
        }

        video.addEventListener('loadeddata', function () {
            self.scheduleViewerOverlayAutoHide(video);
        });
        video.addEventListener('play', function () {
            self.scheduleViewerOverlayAutoHide(video);
        });
        video.addEventListener('pause', function () {
            self.setViewerOverlayVisible(true);
        });
        video.addEventListener('ended', function () {
            self.setViewerOverlayVisible(true);
        });
        video.addEventListener('error', function () {
            self.viewerVideoErrors[assetId] = new Error('Video playback failed.');
            if (self.router.current && self.router.current.name === 'viewer' && self.router.current.params.assetId === assetId) {
                self.renderViewer(self.router.current);
                self.captureFocusables();
            }
        });

        video.play().then(function () {
            self.scheduleViewerOverlayAutoHide(video);
        }).catch(function () {
            self.setViewerOverlayVisible(true);
            self.showToast('Press Play/Pause to start video.');
        });
    };

    App.prototype.toggleViewerVideoPlayback = function () {
        var video = document.getElementById('viewerVideo');

        if (!video) {
            return false;
        }

        if (video.paused || video.ended) {
            var self = this;
            video.play().then(function () {
                self.scheduleViewerOverlayAutoHide(video);
            }).catch(function () {});
        } else {
            video.pause();
        }

        this.setViewerOverlayVisible(true);
        return true;
    };

    App.prototype.seekViewerVideo = function (seconds) {
        var video = document.getElementById('viewerVideo');

        if (!video || !isFinite(video.duration)) {
            return false;
        }

        video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
        this.setViewerOverlayVisible(true);
        return true;
    };

    App.prototype.openMediaViewer = function (element) {
        var assetId = element.getAttribute('data-asset-id');
        var source = this.currentMediaSource ? this.currentMediaSource() : 'recent';
        var items = this.currentMediaItems ? this.currentMediaItems() : this.mediaState[source].items;
        var item = findById(items, assetId);

        if (!item) {
            this.showToast('This item is not available yet.');
            return;
        }

        this.viewerSource = source;
        this.viewerAlbumId = source === 'album' ? this.currentAlbumId : '';
        this.pendingFocusAssetId = assetId;
        this.viewerOverlayVisible = true;
        this.router.navigate('viewer', { assetId: assetId });
    };

    App.prototype.closeViewer = function () {
        if (!this.router.back()) {
            this.router.reset('recent');
        }
    };

    App.prototype.viewerItems = function () {
        var source = this.viewerSource === 'album' ? 'album' : (this.viewerSource === 'videos' ? 'videos' : 'recent');
        var items = source === 'album' ? this.getAlbumDetail(this.viewerAlbumId).items : this.mediaState[source].items;

        if (!findById(items, this.router.current && this.router.current.params ? this.router.current.params.assetId : '')) {
            items = this.mediaState.recent.items.concat(this.mediaState.videos.items);
            if (this.viewerAlbumId) {
                items = items.concat(this.getAlbumDetail(this.viewerAlbumId).items);
            }
        }

        items = items.filter(function (item) {
            return source === 'videos' ? item.type === 'video' : (item.type === 'image' || item.type === 'video');
        });

        return this.sortMediaItems ? this.sortMediaItems(items, source) : items;
    };

    App.prototype.navigateViewer = function (direction) {
        var current = this.router.current && this.router.current.params ? this.router.current.params.assetId : '';
        var items = this.viewerItems();
        var index = findIndexById(items, current);

        if (index < 0 || !items.length) {
            return;
        }

        var nextIndex = index + direction;
        if (nextIndex < 0) {
            this.showToast('This is the first item.');
            return;
        } else if (nextIndex >= items.length) {
            this.loadNextViewerPage();
            return;
        }

        this.pendingFocusAssetId = items[nextIndex].id;
        this.pendingViewerAction = direction > 0 ? 'viewerNext' : 'viewerPrev';
        this.router.navigate('viewer', { assetId: items[nextIndex].id }, { replace: true });
    };

    App.prototype.loadNextViewerPage = function () {
        var self = this;
        var source = this.viewerSource === 'album' ? 'album' : (this.viewerSource === 'videos' ? 'videos' : 'recent');
        if (source === 'album') {
            this.showToast('No more items in this album.');
            return;
        }

        var state = this.mediaState[source];
        var nextPage = normalizeNextPage(state.nextPage, state.page);

        if (state.loading) {
            this.showToast(source === 'videos' ? 'Loading more videos...' : 'Loading more media...');
            return;
        }

        if (!state.hasMore || !nextPage || state.filter) {
            this.showToast(source === 'videos' ? 'No more videos loaded.' : 'No more media loaded.');
            return;
        }

        this.pendingViewerAction = 'viewerNext';
        this.showToast(source === 'videos' ? 'Loading more videos...' : 'Loading more media...');
        this[source === 'videos' ? 'loadVideosMedia' : 'loadRecentMedia']({
            page: nextPage,
            append: true,
            silent: true,
            onLoaded: function (media) {
                var nextItem = media.find(function (item) {
                    return source === 'videos' ? item.type === 'video' : (item.type === 'image' || item.type === 'video');
                });

                if (!nextItem) {
                    self.showToast(source === 'videos' ? 'No more videos found on the next page.' : 'No more media found on the next page.');
                    return;
                }

                self.pendingFocusAssetId = nextItem.id;
                self.pendingViewerAction = 'viewerNext';
                self.router.navigate('viewer', { assetId: nextItem.id }, { replace: true });
            },
            onError: function () {
                self.pendingViewerAction = null;
            }
        });
    };

    App.prototype.toggleViewerOverlay = function () {
        this.setViewerOverlayVisible(!this.viewerOverlayVisible);
    };

    App.prototype.setViewerOverlayVisible = function (visible) {
        var overlay = this.root.querySelector('.viewer-overlay');
        var video = document.getElementById('viewerVideo');
        this.viewerOverlayVisible = visible;

        if (this.viewerOverlayTimer) {
            global.clearTimeout(this.viewerOverlayTimer);
            this.viewerOverlayTimer = null;
        }

        if (overlay) {
            overlay.classList.toggle('visible', visible);
        }

        if (visible && video && !video.paused && !video.ended) {
            this.scheduleViewerOverlayAutoHide(video);
        }
    };

    App.prototype.scheduleViewerOverlayAutoHide = function (video) {
        var self = this;
        var activeVideo = video || document.getElementById('viewerVideo');

        if (!activeVideo || activeVideo.paused || activeVideo.ended) {
            return;
        }

        if (this.viewerOverlayTimer) {
            global.clearTimeout(this.viewerOverlayTimer);
        }

        this.viewerOverlayTimer = global.setTimeout(function () {
            self.viewerOverlayTimer = null;
            self.setViewerOverlayVisible(false);
        }, 2200);
    };

    App.prototype.retryViewerImage = function () {
        var assetId = this.router.current && this.router.current.params ? this.router.current.params.assetId : '';
        delete this.viewerVideoErrors[assetId];
        delete this.viewerVideoLoads[assetId];
        delete this.viewerImageErrors[viewerCacheKey(assetId, 'preview')];
        delete this.viewerImageErrors[viewerCacheKey(assetId, 'fullsize')];
        this.renderViewer(this.router.current);
        this.captureFocusables();
    };

    App.prototype.loadViewerImage = function (assetId) {
        var previewKey = viewerCacheKey(assetId, 'preview');
        var fullsizeKey = viewerCacheKey(assetId, 'fullsize');

        if (!assetId || this.viewerImageUrls[fullsizeKey]) {
            return;
        }

        if (this.viewerImageUrls[previewKey] || this.viewerImageErrors[previewKey]) {
            if (!this.viewerImageErrors[fullsizeKey]) {
                this.loadViewerImageSize(assetId, 'fullsize', true);
            }
            return;
        }

        if (!this.viewerImageErrors[previewKey]) {
            this.loadViewerImageSize(assetId, 'preview', true);
        }
    };

    App.prototype.loadViewerImageSize = function (assetId, size, shouldRender) {
        var self = this;
        var key = viewerCacheKey(assetId, size);

        if (this.viewerImageUrls[key] || this.viewerImageLoads[key] === 'loading' || this.viewerImageErrors[key]) {
            return;
        }

        this.viewerImageLoads[key] = 'loading';
        this.createClient().getAssetThumbnailBlob(assetId, { size: size }).then(function (blob) {
            var objectUrl = global.URL.createObjectURL(blob);
            self.viewerImageUrls[key] = objectUrl;
            self.viewerImageLoads[key] = 'loaded';
            delete self.viewerImageErrors[key];

            if (self.router.current && self.router.current.name === 'viewer' && self.router.current.params.assetId === assetId) {
                self.pendingViewerAction = currentViewerAction(self) || self.pendingViewerAction;
                self.renderViewer(self.router.current);
                self.captureFocusables();
            }

            if (size === 'preview') {
                self.loadViewerImageSize(assetId, 'fullsize', true);
            }
        }).catch(function (error) {
            delete self.viewerImageLoads[key];
            self.viewerImageErrors[key] = error;

            if (size === 'preview') {
                self.loadViewerImageSize(assetId, 'fullsize', shouldRender);
            }

            if (shouldRender && self.router.current && self.router.current.name === 'viewer' && self.router.current.params.assetId === assetId) {
                self.pendingViewerAction = currentViewerAction(self) || self.pendingViewerAction;
                self.renderViewer(self.router.current);
                self.captureFocusables();
            }
        });
    };

    App.prototype.preloadViewerNeighbors = function (items, index) {
        if (!items.length || index < 0) {
            return;
        }

        var previous = items[index === 0 ? items.length - 1 : index - 1];
        var next = items[index === items.length - 1 ? 0 : index + 1];

        if (previous && previous.type === 'image') {
            this.loadViewerImageSize(previous.id, 'preview', false);
        }

        if (next && next.type === 'image' && next.id !== previous.id) {
            this.loadViewerImageSize(next.id, 'preview', false);
        }
    };
})(window);
