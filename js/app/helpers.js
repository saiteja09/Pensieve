(function (global) {
    var namespace = global.Pensieve = global.Pensieve || {};

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

    function createMediaState() {
        return {
            items: [],
            loaded: false,
            loading: false,
            error: null,
            page: 1,
            nextPage: null,
            hasMore: false,
            filter: null
        };
    }

    function getSearchNextPage(response) {
        if (response && response.assets && response.assets.nextPage !== undefined) {
            return response.assets.nextPage;
        }

        if (response && response.nextPage !== undefined) {
            return response.nextPage;
        }

        return null;
    }

    function normalizeNextPage(nextPage, currentPage) {
        if (nextPage === null || nextPage === undefined || nextPage === false || nextPage === '') {
            return null;
        }

        if (nextPage === true) {
            return currentPage + 1;
        }

        var parsed = Number(nextPage);
        if (!isNaN(parsed) && parsed > currentPage) {
            return parsed;
        }

        return null;
    }

    function mergeMediaItems(existingItems, nextItems) {
        var seen = {};
        var merged = [];

        existingItems.concat(nextItems).forEach(function (item) {
            if (!item || !item.id || seen[item.id]) {
                return;
            }

            seen[item.id] = true;
            merged.push(item);
        });

        return merged;
    }

    function extractSearchItems(response) {
        if (!response) {
            return [];
        }

        if (response.assets && Array.isArray(response.assets.items)) {
            return response.assets.items;
        }

        if (Array.isArray(response.items)) {
            return response.items;
        }

        return [];
    }

    function isSupportedAsset(asset) {
        return asset && (asset.type === 'IMAGE' || asset.type === 'VIDEO');
    }

    function mapAssetToMedia(asset) {
        return {
            id: asset.id,
            title: asset.originalFileName || asset.fileName || formatAssetDate(asset.localDateTime || asset.fileCreatedAt) || 'Untitled',
            type: asset.type === 'VIDEO' ? 'video' : 'image',
            tone: toneFromId(asset.id),
            date: asset.localDateTime || asset.fileCreatedAt || '',
            dateKey: formatDateKey(asset.localDateTime || asset.fileCreatedAt),
            dateLabel: formatTimelineDate(asset.localDateTime || asset.fileCreatedAt),
            aspectRatio: getAssetAspectRatio(asset),
            ratioClass: getRatioClass(asset),
            duration: asset.duration || '',
            isFavorite: Boolean(asset.isFavorite)
        };
    }

    function mapTimelineBucketToMedia(bucket, timeBucket) {
        if (!bucket || !Array.isArray(bucket.id)) {
            return [];
        }

        return bucket.id.map(function (id, index) {
            var fileCreatedAt = bucket.fileCreatedAt && bucket.fileCreatedAt[index] ? bucket.fileCreatedAt[index] : timeBucket;
            var isImage = bucket.isImage ? bucket.isImage[index] !== false : true;
            var ratio = bucket.ratio && bucket.ratio[index] ? bucket.ratio[index] : null;

            return {
                id: id,
                title: formatAssetDate(fileCreatedAt) || 'Untitled',
                type: isImage ? 'image' : 'video',
                tone: toneFromId(id),
                date: fileCreatedAt,
                dateKey: formatDateKey(fileCreatedAt),
                dateLabel: formatTimelineDate(fileCreatedAt),
                aspectRatio: getBucketAspectRatio(ratio, isImage),
                ratioClass: getRatioClass({ ratio: ratio, type: isImage ? 'IMAGE' : 'VIDEO' }),
                duration: bucket.duration && bucket.duration[index] ? bucket.duration[index] : '',
                isFavorite: bucket.isFavorite ? Boolean(bucket.isFavorite[index]) : false
            };
        });
    }

    function monthOptions() {
        return [
            { value: 1, label: 'Jan' },
            { value: 2, label: 'Feb' },
            { value: 3, label: 'Mar' },
            { value: 4, label: 'Apr' },
            { value: 5, label: 'May' },
            { value: 6, label: 'Jun' },
            { value: 7, label: 'Jul' },
            { value: 8, label: 'Aug' },
            { value: 9, label: 'Sep' },
            { value: 10, label: 'Oct' },
            { value: 11, label: 'Nov' },
            { value: 12, label: 'Dec' }
        ];
    }

    function monthName(month) {
        var monthOption = monthOptions().filter(function (option) {
            return option.value === month;
        })[0];

        return monthOption ? monthOption.label : 'Month';
    }

    function createMonthBucket(year, month) {
        return year + '-' + padDatePart(month) + '-01T00:00:00.000Z';
    }

    function groupMediaByDate(items) {
        var groupsByKey = {};
        var groups = [];

        items.forEach(function (item) {
            var key = item.dateKey || 'unknown';

            if (!groupsByKey[key]) {
                groupsByKey[key] = {
                    key: key,
                    label: item.dateLabel || 'Unknown date',
                    items: []
                };
                groups.push(groupsByKey[key]);
            }

            groupsByKey[key].items.push(item);
        });

        return groups;
    }

    function formatDateKey(value) {
        var date = parseAssetDate(value);
        if (!date) {
            return 'unknown';
        }

        return date.getFullYear() + '-' + padDatePart(date.getMonth() + 1) + '-' + padDatePart(date.getDate());
    }

    function formatTimelineDate(value) {
        var date = parseAssetDate(value);
        var now = new Date();
        var options = {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
        };

        if (!date) {
            return 'Unknown date';
        }

        if (date.getFullYear() !== now.getFullYear()) {
            options.year = 'numeric';
        }

        return date.toLocaleDateString(undefined, options);
    }

    function parseAssetDate(value) {
        if (!value) {
            return null;
        }

        var date = new Date(value);
        if (isNaN(date.getTime())) {
            return null;
        }

        return date;
    }

    function padDatePart(value) {
        return value < 10 ? '0' + value : String(value);
    }

    function getAssetAspectRatio(asset) {
        if (asset.ratio) {
            return String(Math.max(0.56, Math.min(2.2, Number(asset.ratio))).toFixed(4));
        }

        var width = Number(asset.width || asset.exifInfo && asset.exifInfo.exifImageWidth || 0);
        var height = Number(asset.height || asset.exifInfo && asset.exifInfo.exifImageHeight || 0);

        if (!width || !height) {
            return asset.type === 'VIDEO' ? '1.7778' : '1';
        }

        return String(Math.max(0.56, Math.min(2.2, width / height)).toFixed(4));
    }

    function getBucketAspectRatio(ratio, isImage) {
        if (ratio) {
            return String(Math.max(0.56, Math.min(2.2, Number(ratio))).toFixed(4));
        }

        return isImage ? '1' : '1.7778';
    }

    function getRatioClass(asset) {
        var ratio = Number(getAssetAspectRatio(asset));

        if (ratio >= 1.65) {
            return 'ratio-wide';
        }

        if (ratio <= 0.72) {
            return 'ratio-tall';
        }

        if (ratio < 0.9) {
            return 'ratio-portrait';
        }

        return 'ratio-square';
    }

    function formatAssetDate(value) {
        if (!value) {
            return '';
        }

        var date = new Date(value);
        if (isNaN(date.getTime())) {
            return '';
        }

        return date.toLocaleDateString();
    }

    function toneFromId(value) {
        var tones = ['sunset', 'forest', 'mountain', 'architecture', 'lake', 'valley', 'autumn', 'redwood'];
        var text = String(value || '');
        var total = 0;

        for (var index = 0; index < text.length; index += 1) {
            total += text.charCodeAt(index);
        }

        return tones[total % tones.length];
    }

    function findById(items, assetId) {
        for (var index = 0; index < items.length; index += 1) {
            if (items[index].id === assetId) {
                return items[index];
            }
        }

        return null;
    }

    function findIndexById(items, assetId) {
        for (var index = 0; index < items.length; index += 1) {
            if (items[index].id === assetId) {
                return index;
            }
        }

        return -1;
    }

    function viewerCacheKey(assetId, size) {
        return assetId + ':' + size;
    }

    function currentViewerAction(app) {
        var current = app.focusables[app.focusIndex];
        var action = current ? current.getAttribute('data-action') : '';
        return action && action.indexOf('viewer') === 0 ? action : null;
    }

    function cssEscape(value) {
        return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    function formatMediaError(error) {
        if (!error) {
            return 'Unable to load media from Immich.';
        }

        if (error.code === 'NETWORK_UNAVAILABLE') {
            return 'Unable to reach Immich while loading media.';
        }

        if (error.code === 'AUTH_INVALID') {
            return 'Your Immich session expired. Sign in again.';
        }

        if (error.code === 'PERMISSION_DENIED') {
            return 'This Immich account cannot read media.';
        }

        return error.message || 'Unable to load media from Immich.';
    }

    namespace.AppHelpers = {
        escapeHtml: escapeHtml,
        escapeAttr: escapeAttr,
        formatServerVersion: formatServerVersion,
        formatAuthError: formatAuthError,
        createMediaState: createMediaState,
        getSearchNextPage: getSearchNextPage,
        normalizeNextPage: normalizeNextPage,
        mergeMediaItems: mergeMediaItems,
        extractSearchItems: extractSearchItems,
        isSupportedAsset: isSupportedAsset,
        mapAssetToMedia: mapAssetToMedia,
        mapTimelineBucketToMedia: mapTimelineBucketToMedia,
        monthOptions: monthOptions,
        monthName: monthName,
        createMonthBucket: createMonthBucket,
        groupMediaByDate: groupMediaByDate,
        findById: findById,
        findIndexById: findIndexById,
        viewerCacheKey: viewerCacheKey,
        currentViewerAction: currentViewerAction,
        cssEscape: cssEscape,
        formatMediaError: formatMediaError
    };
})(window);
