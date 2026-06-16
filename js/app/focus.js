(function (global) {
    var namespace = global.Pensieve = global.Pensieve || {};
    var App = namespace.App;

    App.prototype.captureFocusables = function () {
        this.focusables = Array.prototype.slice.call(this.root.querySelectorAll('.focusable'));
        this.focusIndex = this.findInitialFocusIndex();
        this.applyFocus();
        this.bindPointerActivation();
        this.bindScrollLoading();
    };

    App.prototype.findInitialFocusIndex = function () {
        var pendingAssetId = this.pendingFocusAssetId;
        var pendingViewerAction = this.pendingViewerAction;
        var pendingAccentId = this.pendingAccentId;

        if (pendingViewerAction) {
            var pendingActionIndex = this.focusables.findIndex(function (element) {
                return element.getAttribute('data-action') === pendingViewerAction;
            });

            this.pendingViewerAction = null;
            if (pendingActionIndex >= 0) {
                return pendingActionIndex;
            }
        }

        if (pendingAssetId) {
            var pendingIndex = this.focusables.findIndex(function (element) {
                return element.getAttribute('data-asset-id') === pendingAssetId;
            });

            this.pendingFocusAssetId = null;
            if (pendingIndex >= 0) {
                return pendingIndex;
            }
        }

        if (pendingAccentId) {
            var pendingAccentIndex = this.focusables.findIndex(function (element) {
                return element.getAttribute('data-accent-id') === pendingAccentId;
            });

            this.pendingAccentId = null;
            if (pendingAccentIndex >= 0) {
                return pendingAccentIndex;
            }
        }

        var index = this.focusables.findIndex(function (element) {
            return !element.classList.contains('rail-button');
        });

        if (index >= 0) {
            return index;
        }

        var activeRailIndex = this.focusables.findIndex(function (element) {
            return element.classList.contains('rail-button') && element.classList.contains('active');
        });

        return activeRailIndex >= 0 ? activeRailIndex : 0;
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

        if (this.pendingScrollTop !== null) {
            var timeline = this.root.querySelector('.timeline-canvas');
            if (timeline) {
                timeline.scrollTop = this.pendingScrollTop;
            }
            this.pendingScrollTop = null;
        }

        this.queueVisibleThumbnailLoad();
        this.loadMoreMediaIfNeeded();
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

        if (current.closest('.timeline-grid')) {
            return 6;
        }

        if (current.closest('.album-grid')) {
            return 4;
        }

        if (current.closest('.media-grid')) {
            return 3;
        }

        if (current.closest('.filter-row')) {
            return 4;
        }

        if (current.closest('.jump-grid')) {
            return 6;
        }

        return 1;
    };

    App.prototype.handleRemoteKey = function (event) {
        if (this.router.current && this.router.current.name === 'viewer') {
            var viewerItem = this.currentViewerItem ? this.currentViewerItem() : null;
            var isVideo = viewerItem && viewerItem.type === 'video';

            if (event.key === 'left') {
                this.navigateViewer(-1);
                return;
            }

            if (event.key === 'right') {
                this.navigateViewer(1);
                return;
            }

            if (event.key === 'enter') {
                if (isVideo && this.toggleViewerVideoPlayback()) {
                    return;
                }

                var focusedViewerAction = this.focusables[this.focusIndex] ? this.focusables[this.focusIndex].getAttribute('data-action') : '';
                if (!this.viewerOverlayVisible && focusedViewerAction !== 'viewerRetry') {
                    this.setViewerOverlayVisible(true);
                    return;
                }

                if (focusedViewerAction === 'viewerRetry' || focusedViewerAction === 'viewerClose') {
                    this.activate(this.focusables[this.focusIndex]);
                    return;
                }

                this.toggleViewerOverlay();
                return;
            }

            if (event.key === 'playPause' || event.key === 'play' || event.key === 'pause') {
                if (isVideo && this.toggleViewerVideoPlayback()) {
                    return;
                }
            }

            if (event.key === 'rewind') {
                if (isVideo && this.seekViewerVideo(-10)) {
                    return;
                }
            }

            if (event.key === 'fastForward') {
                if (isVideo && this.seekViewerVideo(10)) {
                    return;
                }
            }

            if (event.key === 'back') {
                this.closeViewer();
                return;
            }

            if ((event.key === 'up' || event.key === 'down') && !this.viewerOverlayVisible) {
                this.setViewerOverlayVisible(true);
                return;
            }
        }

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
})(window);
