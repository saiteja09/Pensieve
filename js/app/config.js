(function (global) {
    var namespace = global.Pensieve = global.Pensieve || {};

    namespace.AppConfig = {
        navItems: [
            { action: 'recent', label: 'Library', icon: 'images/nav/library.svg' },
            { action: 'albums', label: 'Albums', icon: 'images/nav/albums.svg' },
            { action: 'favorites', label: 'Favorites', icon: 'images/nav/favorites.svg' },
            { action: 'videos', label: 'Videos', icon: 'images/nav/videos.svg' },
            { action: 'settings', label: 'Settings', icon: 'images/nav/settings.svg' }
        ]
    };
})(window);
