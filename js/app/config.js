(function (global) {
    var namespace = global.Pensieve = global.Pensieve || {};

    namespace.AppConfig = {
        navItems: [
            { action: 'recent', label: 'Library', icon: 'images/nav/library.svg' },
            { action: 'albums', label: 'Albums', icon: 'images/nav/albums.svg' },
            { action: 'favorites', label: 'Favorites', icon: 'images/nav/favorites.svg' },
            { action: 'videos', label: 'Videos', icon: 'images/nav/videos.svg' },
            { action: 'settings', label: 'Settings', icon: 'images/nav/settings.svg' }
        ],
        accentPalettes: [
            { id: 'mint', label: 'Mint', primary: '#5cf2b6', strong: '#37c98e', onPrimary: '#03130d', glow: 'rgba(92, 242, 182, 0.28)' },
            { id: 'amber', label: 'Amber', primary: '#ffb340', strong: '#d98b12', onPrimary: '#1a0f00', glow: 'rgba(255, 179, 64, 0.32)' },
            { id: 'cyan', label: 'Cyan', primary: '#4de3ff', strong: '#16b5d4', onPrimary: '#00141a', glow: 'rgba(77, 227, 255, 0.3)' },
            { id: 'violet', label: 'Violet', primary: '#b99cff', strong: '#8c6dff', onPrimary: '#120a2c', glow: 'rgba(185, 156, 255, 0.3)' },
            { id: 'coral', label: 'Coral', primary: '#ff7f6e', strong: '#e05243', onPrimary: '#220604', glow: 'rgba(255, 127, 110, 0.3)' },
            { id: 'lime', label: 'Lime', primary: '#c7f65a', strong: '#98c928', onPrimary: '#101900', glow: 'rgba(199, 246, 90, 0.28)' },
            { id: 'rose', label: 'Rose', primary: '#ff78b7', strong: '#d9478b', onPrimary: '#240616', glow: 'rgba(255, 120, 183, 0.3)' },
            { id: 'sky', label: 'Sky', primary: '#78a8ff', strong: '#4778e6', onPrimary: '#07142c', glow: 'rgba(120, 168, 255, 0.3)' },
            { id: 'orange', label: 'Orange', primary: '#ff8f3d', strong: '#d86516', onPrimary: '#1f0b00', glow: 'rgba(255, 143, 61, 0.3)' },
            { id: 'white', label: 'White', primary: '#f4f7fb', strong: '#c8d2df', onPrimary: '#05070a', glow: 'rgba(244, 247, 251, 0.24)' }
        ]
    };
})(window);
