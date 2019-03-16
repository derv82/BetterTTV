const $ = require('jquery');
const watcher = require('../../watcher');
const settings = require('../../settings');
const keyCodes = require('../../utils/keycodes');
const twitch = require('../../utils/twitch');
const debounce = require('lodash.debounce');

const VIDEO_PLAYER_SELECTOR = '.video-player .player';
const CANCEL_VOD_RECOMMENDATION_SELECTOR = '.recommendations-overlay .pl-rec__cancel.pl-button';
const PLAYER_VOLUME_SELECTOR = '.player-button--volume';

function stepPlaybackSpeed(faster) {
    const currentPlayer = twitch.getCurrentPlayer();
    if (!currentPlayer || !currentPlayer.props.vodID) return;
    const rates = [ 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0 ];
    let idx = rates.indexOf(currentPlayer.player.getPlaybackRate());
    if (idx === -1) return;
    idx += faster ? 1 : -1;
    if (idx < 0 || idx >= rates.length) return;
    currentPlayer.player.setPlaybackRate(rates[idx]);
}

function watchPlayerRecommendationVodsAutoplay() {
    const currentPlayer = twitch.getCurrentPlayer();
    if (!currentPlayer || !currentPlayer.player) return;

    currentPlayer.player.addEventListener('ended', () => {
        if (settings.get('disableVodRecommendationAutoplay') !== true) return;
        watcher.waitForLoad('vodRecommendation').then(() => $(CANCEL_VOD_RECOMMENDATION_SELECTOR).trigger('click'));
    });
}

function handleKeyEvent(keypress) {
    if (keypress.ctrlKey || keypress.metaKey) return;
    if ($('input, textarea, select').is(':focus')) return;

    const $player = $(VIDEO_PLAYER_SELECTOR);
    if (!$player.length) return;

    switch (keypress.charCode || keypress.keyCode) {
        case keyCodes.KeyPress.LessThan:
        case keyCodes.KeyPress.Comma:
            stepPlaybackSpeed(false);
            break;
        case keyCodes.KeyPress.GreaterThan:
        case keyCodes.KeyPress.Period:
            stepPlaybackSpeed(true);
            break;
        case keyCodes.KeyPress.k:
            $player.find('.qa-pause-play-button').click();
            break;
        case keyCodes.KeyPress.f:
            $player.find('.qa-fullscreen-button').click();
            break;
        case keyCodes.KeyPress.m:
            $player.find('.qa-control-volume').click();
            break;
    }
}

let clicks = 0;
function handlePlayerClick(e) {
    if (e.target !== this) {
        $('.video-player__container').focus();
        return;
    }
    clicks++;
    setTimeout(() => {
        if (clicks === 1) {
            const $player = $(VIDEO_PLAYER_SELECTOR);
            const isPaused = $player.data('paused');
            if (!isPaused) $player.find('.qa-pause-play-button').click();
        }
        clicks = 0;
    }, 250);
}

function togglePlayerCursor(hide) {
    $('body').toggleClass('bttv-hide-player-cursor', hide);
}

class VideoPlayerModule {
    constructor() {
        this.keybinds();
        watcher.on('load.player', () => {
            this.clickToPause();
            watchPlayerRecommendationVodsAutoplay();

            const currentPlayer = twitch.getCurrentPlayer();
            this.isMutedByUser =
                currentPlayer &&
                currentPlayer.player &&
                currentPlayer.player.getMuted();

            this.onVisibilityChange = this.onVisibilityChange.bind(this);
            this.onWindowBlur = this.onWindowBlur.bind(this);
            this.onWindowFocus = this.onWindowFocus.bind(this);
            this.volumeClickHandler = this.volumeClickHandler.bind(this);
            this.muteInvisibleTabs();
        });
        settings.add({
            id: 'hidePlayerExtensions',
            name: 'Hide Twitch Extensions',
            defaultValue: false,
            description: 'Hides the interactive overlays on top of Twitch\'s video player'
        });
        settings.add({
            id: 'clickToPlay',
            name: 'Click to Play/Pause Stream',
            defaultValue: false,
            description: 'Click on the twitch player to pause/resume playback'
        });
        settings.add({
            id: 'disableVodRecommendationAutoplay',
            name: 'Disable VoD Recommendation Autoplay',
            defaultValue: false,
            description: 'Disables autoplay of recommended videos on VoDs'
        });
        settings.add({
            id: 'muteInvisibleTabs',
            name: 'Mute Streams in Invisible Tabs',
            defaultValue: false,
            description: 'Automatically mute/unmute streams so only visible tabs have audio'
        });
        settings.on('changed.hidePlayerExtensions', () => this.toggleHidePlayerExtensions());
        settings.on('changed.clickToPlay', () => this.clickToPause());
        settings.on('changed.muteInvisibleTabs', () => this.muteInvisibleTabs());
        this.toggleHidePlayerExtensions();
        this.loadHidePlayerCursorFullscreen();
    }

    toggleHidePlayerExtensions() {
        $('body').toggleClass('bttv-hide-player-extensions', settings.get('hidePlayerExtensions'));
    }

    keybinds() {
        $(document).on('keypress.playerControls', handleKeyEvent);
    }

    clickToPause() {
        $(VIDEO_PLAYER_SELECTOR).off('click', '.player-overlay.pl-overlay__fullscreen,.player-video,.js-paused-overlay', handlePlayerClick);

        if (settings.get('clickToPlay') === true) {
            $(VIDEO_PLAYER_SELECTOR).on('click', '.player-overlay.pl-overlay__fullscreen,.player-video,.js-paused-overlay', handlePlayerClick);
        }
    }

    loadHidePlayerCursorFullscreen() {
        const hidePlayerCursor = debounce(() => togglePlayerCursor(true), 5000);
        $('body').on('mousemove', '.video-player--fullscreen', () => {
            togglePlayerCursor(false);
            hidePlayerCursor();
        });
    }

    volumeClickHandler() {
        this.isMutedByUser = !this.isMutedByUser;
    }

    onWindowBlur() {
        const currentPlayer = twitch.getCurrentPlayer();
        if (!currentPlayer || !currentPlayer.player || !document.hidden) return;
        currentPlayer.player.setMuted(true);
    }

    onWindowFocus() {
        const currentPlayer = twitch.getCurrentPlayer();
        if (!currentPlayer || !currentPlayer.player) return;
        currentPlayer.player.setMuted(this.isMutedByUser);
    }

    onVisibilityChange() {
        if (document.hidden) {
            this.onWindowBlur();
        } else {
            this.onWindowFocus();
        }
    }

    muteInvisibleTabs() {
        $(document).off('visibilitychange', this.onVisibilityChange);
        $(window).off('blur', this.onWindowBlur);
        $(window).off('focus', this.onWindowFocus);
        $(PLAYER_VOLUME_SELECTOR).off('click', this.volumeClickHandler);

        if (settings.get('muteInvisibleTabs')) {
            $(document).on('visibilitychange', this.onVisibilityChange);
            $(window).on('blur', this.onWindowBlur);
            $(window).on('focus', this.onWindowFocus);
            $(PLAYER_VOLUME_SELECTOR).on('click', this.volumeClickHandler);
        }
    }
}

module.exports = new VideoPlayerModule();
