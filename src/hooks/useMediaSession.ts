import { useState, useEffect, useCallback } from "react";
import { MediaSessionInfo, TrackColorTheme } from "../types";
import { tauriBridge } from "../services/tauriBridge";
import { albumArtService } from "../services/albumArtService";

export interface MediaSessionState {
  liveMedia: MediaSessionInfo | null;
  dynamicTheme: TrackColorTheme | null;
  isPlaying: boolean;
  currentSec: number;
  durationSec: number;
  progressPercent: number;
  hasLiveMedia: boolean;
}

const DEFAULT_STATE: MediaSessionState = {
  liveMedia: null,
  dynamicTheme: null,
  isPlaying: false,
  currentSec: 0,
  durationSec: 0,
  progressPercent: 0,
  hasLiveMedia: false,
};

let currentState: MediaSessionState = DEFAULT_STATE;
const listeners = new Set<(state: MediaSessionState) => void>();
let pollTimer: number | null = null;
let progressTimer: number | null = null;
let unlistenMediaEvents: (() => void) | null = null;

let anchorPositionSec = 0;
let anchorTimestamp = performance.now();
let optimisticPlayState: { target: boolean; expiresAt: number } | null = null;

let disconnectGraceTimer: number | null = null;
const DISCONNECT_GRACE_MS = 3200;

let lastKnownTrack: MediaSessionInfo | null = null;
let lastKnownArt: string | undefined = undefined;
let activeArtFetchKey = "";
let artFetchAbortCtrl: AbortController | null = null;

const GENERIC_NAMES = new Set([
  "spotify", "chrome", "google chrome", "edge", "microsoft edge",
  "brave", "firefox", "opera", "vivaldi", "arc", "vlc", "vlc media player",
  "media player", "windows media player", "movies & tv", "local media"
]);

function isGenericTitle(title?: string): boolean {
  if (!title || !title.trim()) return true;
  return GENERIC_NAMES.has(title.trim().toLowerCase());
}

function triggerBackgroundArtFetch(title: string, artist: string) {
  if (!title || isGenericTitle(title)) return;
  const key = `${title.toLowerCase()}__${artist.toLowerCase()}`;
  if (activeArtFetchKey === key) return;

  activeArtFetchKey = key;
  if (artFetchAbortCtrl) {
    artFetchAbortCtrl.abort();
  }
  artFetchAbortCtrl = new AbortController();
  const signal = artFetchAbortCtrl.signal;

  albumArtService.fetchAlbumArt(title, artist, signal).then((fetchedArt) => {
    if (!fetchedArt || signal.aborted) return;

    if (
      currentState.liveMedia &&
      currentState.liveMedia.title === title &&
      !currentState.liveMedia.album_art_base64
    ) {
      lastKnownArt = fetchedArt;
      const updatedMedia: MediaSessionInfo = {
        ...currentState.liveMedia,
        album_art_base64: fetchedArt,
      };
      if (lastKnownTrack && lastKnownTrack.title === title) {
        lastKnownTrack.album_art_base64 = fetchedArt;
      }
      currentState = {
        ...currentState,
        liveMedia: updatedMedia,
        dynamicTheme: albumArtService.getColorTheme(title, artist, fetchedArt),
      };
      notifyListeners();
    }
  });
}

function notifyListeners() {
  listeners.forEach((fn) => fn(currentState));
}

function updatePlaybackTicker() {
  if (currentState.isPlaying && currentState.hasLiveMedia && currentState.durationSec > 0) {
    if (progressTimer === null) {
      progressTimer = window.setInterval(() => {
        if (!currentState.isPlaying || !currentState.hasLiveMedia || currentState.durationSec <= 0) {
          if (progressTimer !== null) {
            clearInterval(progressTimer);
            progressTimer = null;
          }
          return;
        }

        const duration = currentState.durationSec;
        const elapsed = (performance.now() - anchorTimestamp) / 1000;
        const exactSec = Math.min(duration, Math.max(0, anchorPositionSec + elapsed));
        const pct = duration > 0 ? Math.min(100, Math.max(0, (exactSec / duration) * 100)) : 0;

        currentState = {
          ...currentState,
          currentSec: Math.floor(exactSec),
          progressPercent: pct,
        };
        notifyListeners();
      }, 250);
    }
  } else {
    if (progressTimer !== null) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
  }
}

function processIncomingSession(session: MediaSessionInfo | null) {
  if (session && (session.title?.trim() || session.artist?.trim() || session.is_playing)) {
    if (disconnectGraceTimer !== null) {
      window.clearTimeout(disconnectGraceTimer);
      disconnectGraceTimer = null;
    }

    let title = session.title?.trim() || "";
    let artist = session.artist?.trim() || "";
    let art: string | undefined = session.album_art_base64 || undefined;

    // If incoming title is generic (e.g. app name on pause), restore last known valid title/artist
    if (isGenericTitle(title) && lastKnownTrack && !isGenericTitle(lastKnownTrack.title)) {
      title = lastKnownTrack.title;
      if (!artist || isGenericTitle(artist)) {
        artist = lastKnownTrack.artist;
      }
    }

    const isSameTrack = Boolean(
      lastKnownTrack &&
      !isGenericTitle(title) &&
      !isGenericTitle(lastKnownTrack.title) &&
      lastKnownTrack.title.trim().toLowerCase() === title.trim().toLowerCase()
    );

    // If incoming art is missing (e.g. stream dropped on pause), restore last known art only for same track
    if (!art && lastKnownTrack && (isSameTrack || isGenericTitle(session.title))) {
      art = lastKnownTrack.album_art_base64 || lastKnownArt;
    }

    // Check high-speed albumArtService cache if still missing
    if (!art && title) {
      const cached = albumArtService.getCached(title, artist);
      if (cached) {
        art = cached;
      }
    }

    if (art) {
      lastKnownArt = art;
      albumArtService.setCached(title, artist, art);
    } else if (!isGenericTitle(title)) {
      triggerBackgroundArtFetch(title, artist);
    }

    let duration = 0;
    if (typeof session.duration_sec === "number" && session.duration_sec > 0) {
      duration = session.duration_sec;
    } else if (typeof session.duration_ms === "number" && session.duration_ms > 0) {
      duration = Math.floor(session.duration_ms / 1000);
    } else if (isSameTrack && lastKnownTrack && (lastKnownTrack.duration_sec ?? 0) > 0) {
      duration = lastKnownTrack.duration_sec ?? 0;
    }

    let currentSec = 0;
    if (typeof session.current_sec === "number") {
      currentSec = session.current_sec;
    } else if (typeof session.position_ms === "number") {
      currentSec = Math.floor(session.position_ms / 1000);
    } else if (isSameTrack && lastKnownTrack && typeof lastKnownTrack.current_sec === "number") {
      currentSec = lastKnownTrack.current_sec;
    }

    // Strictly clamp currentSec to [0, duration]
    if (duration > 0) {
      currentSec = Math.min(duration, Math.max(0, currentSec));
    } else {
      currentSec = Math.max(0, currentSec);
    }

    const progressPercent = duration > 0
      ? Math.min(100, Math.max(0, (currentSec / duration) * 100))
      : 0;

    const mergedSession: MediaSessionInfo = {
      ...session,
      title,
      artist,
      album_art_base64: art || undefined,
      duration_sec: duration,
      current_sec: currentSec,
    };

    if (!isGenericTitle(title)) {
      lastKnownTrack = mergedSession;
    }

    let isPlaying = session.is_playing;
    if (optimisticPlayState) {
      if (performance.now() > optimisticPlayState.expiresAt) {
        optimisticPlayState = null;
      } else {
        isPlaying = optimisticPlayState.target;
      }
    }

    if (!isSameTrack || !isPlaying || Math.abs(currentSec - anchorPositionSec) > 2) {
      anchorPositionSec = currentSec;
      anchorTimestamp = performance.now();
    }

    const theme = albumArtService.getColorTheme(title, artist, art || undefined);

    // Performance Optimization: Deduplicate state updates if nothing changed
    if (
      currentState.hasLiveMedia &&
      currentState.liveMedia?.title === title &&
      currentState.liveMedia?.artist === artist &&
      currentState.liveMedia?.album_art_base64 === art &&
      currentState.isPlaying === isPlaying &&
      Math.abs(currentState.currentSec - currentSec) < 1 &&
      currentState.durationSec === duration
    ) {
      return;
    }

    currentState = {
      liveMedia: mergedSession,
      dynamicTheme: theme,
      isPlaying,
      currentSec,
      durationSec: duration,
      progressPercent,
      hasLiveMedia: true,
    };

    notifyListeners();
    updatePlaybackTicker();
    return;
  }

  // Incoming session is null, closed, or has no track details.
  // Hold current media state in grace period (3.2s) so next track buffering never drops to clock/battery!
  if (currentState.hasLiveMedia) {
    if (disconnectGraceTimer === null) {
      disconnectGraceTimer = window.setTimeout(() => {
        disconnectGraceTimer = null;
        lastKnownTrack = null;
        lastKnownArt = undefined;
        if (currentState.hasLiveMedia) {
          anchorPositionSec = 0;
          anchorTimestamp = performance.now();
          currentState = DEFAULT_STATE;
          notifyListeners();
          updatePlaybackTicker();
        }
      }, DISCONNECT_GRACE_MS);
    }
    return;
  }

  lastKnownTrack = null;
  lastKnownArt = undefined;
}

async function fetchAndUpdate() {
  if (listeners.size === 0) {
    stopPolling();
    return;
  }

  try {
    const session = await tauriBridge.getMediaSessionInfo();
    processIncomingSession(session);
  } catch (err) {
    console.error("Error polling media session:", err);
  }
}

async function startPolling() {
  if (listeners.size === 0) return;

  if (!unlistenMediaEvents) {
    try {
      const unlisten = await tauriBridge.onMediaSessionUpdated((session) => {
        processIncomingSession(session);
      });
      unlistenMediaEvents = unlisten;
    } catch (err) {
      console.error("Failed to subscribe to media events:", err);
    }
  }

  fetchAndUpdate();

  if (pollTimer === null) {
    pollTimer = window.setInterval(fetchAndUpdate, 6000);
  }
}

function stopPolling() {
  if (listeners.size === 0) {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (progressTimer !== null) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
    if (unlistenMediaEvents) {
      unlistenMediaEvents();
      unlistenMediaEvents = null;
    }
  }
}

export function useMediaSession(enabled: boolean = true) {
  const [state, setState] = useState<MediaSessionState>(currentState);

  useEffect(() => {
    if (!enabled) return;

    listeners.add(setState);
    startPolling();

    return () => {
      listeners.delete(setState);
      stopPolling();
    };
  }, [enabled]);

  const togglePlay = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const nextPlaying = !currentState.isPlaying;
    optimisticPlayState = {
      target: nextPlaying,
      expiresAt: performance.now() + 850,
    };
    if (nextPlaying) {
      anchorTimestamp = performance.now();
    } else {
      anchorPositionSec = currentState.currentSec;
    }
    currentState = {
      ...currentState,
      isPlaying: nextPlaying,
    };
    notifyListeners();
    updatePlaybackTicker();
    tauriBridge.toggleMediaPlayPause().catch(console.error);
  }, []);

  const nextTrack = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    tauriBridge.mediaNextTrack().catch(console.error);
    setTimeout(fetchAndUpdate, 100);
    setTimeout(fetchAndUpdate, 350);
  }, []);

  const prevTrack = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    tauriBridge.mediaPrevTrack().catch(console.error);
    setTimeout(fetchAndUpdate, 100);
    setTimeout(fetchAndUpdate, 350);
  }, []);

  const toggleMute = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    tauriBridge.mediaVolumeMute().catch(console.error);
  }, []);

  const volumeUp = useCallback(() => {
    tauriBridge.mediaVolumeUp().catch(console.error);
  }, []);

  const volumeDown = useCallback(() => {
    tauriBridge.mediaVolumeDown().catch(console.error);
  }, []);

  const seekTrack = useCallback((sec: number) => {
    const duration = currentState.durationSec;
    const boundedSec = duration > 0 ? Math.max(0, Math.min(duration, sec)) : Math.max(0, sec);
    const pct = duration > 0 ? Math.min(100, Math.max(0, (boundedSec / duration) * 100)) : 0;
    anchorPositionSec = boundedSec;
    anchorTimestamp = performance.now();
    currentState = {
      ...currentState,
      currentSec: boundedSec,
      progressPercent: pct,
    };
    notifyListeners();
    tauriBridge.mediaSeek(boundedSec).catch(console.error);
  }, []);

  const focusMediaApp = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    tauriBridge.focusMediaApp().catch(console.error);
  }, []);

  return {
    ...state,
    togglePlay,
    nextTrack,
    prevTrack,
    toggleMute,
    volumeUp,
    volumeDown,
    seekTrack,
    focusMediaApp,
  };
}
