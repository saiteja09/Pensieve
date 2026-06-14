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
    var formatViewerTitle = helpers.formatViewerTitle;
    var currentViewerAction = helpers.currentViewerAction;

    App.prototype.renderViewer = function (route) {
        var assetId = route && route.params ? route.params.assetId : '';
        var items = this.viewerItems();
        var index = findIndexById(items, assetId);
        var item = index >= 0 ? items[index] : null;

        if (!item) {
            this.root.innerHTML = [
                '<section class="viewer-screen">',
                '  <div class="viewer-status">',
                '    <strong>Photo unavailable</strong>',
                '    <button class="primary-action compact-action focusable" type="button" data-action="viewerClose">Back to Library</button>',
                '  </div>',
                '  <div id="toast" class="toast"></div>',
                '</section>'
            ].join('');
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

    App.prototype.openMediaViewer = function (element) {
        var assetId = element.getAttribute('data-asset-id');
        var item = findById(this.mediaState.recent.items, assetId);

        if (!item) {
            this.showToast('This item is not available yet.');
            return;
        }

        if (item.type === 'video') {
            this.showToast('Video playback is coming next.');
            return;
        }

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
        return this.mediaState.recent.items.filter(function (item) {
            return item.type === 'image';
        });
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
            this.showToast('This is the first photo.');
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
        var state = this.mediaState.recent;
        var nextPage = normalizeNextPage(state.nextPage, state.page);

        if (state.loading) {
            this.showToast('Loading more photos...');
            return;
        }

        if (!state.hasMore || !nextPage || state.filter) {
            this.showToast('No more photos loaded.');
            return;
        }

        this.pendingViewerAction = 'viewerNext';
        this.showToast('Loading more photos...');
        this.loadRecentMedia({
            page: nextPage,
            append: true,
            silent: true,
            onLoaded: function (media) {
                var nextImage = media.find(function (item) {
                    return item.type === 'image';
                });

                if (!nextImage) {
                    self.showToast('No more photos found on the next page.');
                    return;
                }

                self.pendingFocusAssetId = nextImage.id;
                self.pendingViewerAction = 'viewerNext';
                self.router.navigate('viewer', { assetId: nextImage.id }, { replace: true });
            },
            onError: function () {
                self.pendingViewerAction = null;
            }
        });
    };

    App.prototype.toggleViewerOverlay = function () {
        this.viewerOverlayVisible = !this.viewerOverlayVisible;
        this.renderViewer(this.router.current);
        this.captureFocusables();
    };

    App.prototype.retryViewerImage = function () {
        var assetId = this.router.current && this.router.current.params ? this.router.current.params.assetId : '';
        delete this.viewerImageErrors[viewerCacheKey(assetId, 'preview')];
        delete this.viewerImageErrors[viewerCacheKey(assetId, 'fullsize')];
        delete this.viewerImageWarnings[assetId];
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

            if (size === 'fullsize' && self.viewerImageUrls[viewerCacheKey(assetId, 'preview')]) {
                self.viewerImageWarnings[assetId] = true;
            }
        });
    };

    App.prototype.preloadViewerNeighbors = function (items, index) {
        if (!items.length || index < 0) {
            return;
        }

        var previous = items[index === 0 ? items.length - 1 : index - 1];
        var next = items[index === items.length - 1 ? 0 : index + 1];

        if (previous) {
            this.loadViewerImageSize(previous.id, 'preview', false);
        }

        if (next && next.id !== previous.id) {
            this.loadViewerImageSize(next.id, 'preview', false);
        }
    };
})(window);
