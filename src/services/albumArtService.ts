import { TrackColorTheme } from "../types";

const MAX_MEM_CACHE = 80;
const artCache = new Map<string, string>();
const colorCache = new Map<string, TrackColorTheme>();
const inFlightRequests = new Map<string, Promise<string | null>>();

const STORAGE_KEY = "notch_album_art_cache_v1";
const STORAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Initialize memory cache from localStorage on startup
try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const parsed = JSON.parse(stored) as Record<string, { url: string; time: number }>;
    const now = Date.now();
    for (const [key, item] of Object.entries(parsed)) {
      if (now - item.time < STORAGE_TTL_MS && item.url) {
        artCache.set(key, item.url);
      }
    }
  }
} catch {
  // Silent fallback if storage is restricted
}

function persistToStorage(key: string, url: string) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data: Record<string, { url: string; time: number }> = raw ? JSON.parse(raw) : {};
    data[key] = { url, time: Date.now() };

    // Limit persistent entries to 50 items
    const entries = Object.entries(data);
    if (entries.length > 50) {
      entries.sort((a, b) => a[1].time - b[1].time);
      const toDelete = entries.slice(0, entries.length - 50);
      for (const [k] of toDelete) {
        delete data[k];
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage write errors
  }
}

export function cleanTrackTitleForSearch(title: string): string {
  let cleaned = title.trim();

  // Strip file extensions
  cleaned = cleaned.replace(/\.(mp3|mp4|mkv|wav|flac|avi|mov|webm|m4a|aac|opus|ogg|wma)$/i, "");

  // Strip common YouTube tag brackets
  cleaned = cleaned.replace(
    /\s*[\(\[]\s*(official\s*(music\s*)?video|video|mv|official\s*audio|audio|lyrics?|lyric\s*video|hd|4k|remastered|visualizer|live|acoustic|instrumental|sped\s*up|slowed(\s*\+\s*reverb)?)\s*[\)\]]/gi,
    ""
  );

  // Strip YouTube trailing or leading channel stamps
  cleaned = cleaned.replace(/\s*\|\s*.*$/g, "");
  cleaned = cleaned.replace(/\s*-\s*YouTube$/gi, "");

  return cleaned.trim();
}

function makeCacheKey(title: string, artist: string): string {
  return `${title.trim().toLowerCase()}__${artist.trim().toLowerCase()}`;
}

async function preloadImage(url: string, timeoutMs = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    }, timeoutMs);

    img.onload = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(true);
      }
    };

    img.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(false);
      }
    };

    img.src = url;
  });
}

async function queryItunesArtwork(query: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.results && data.results.length > 0 && data.results[0].artworkUrl100) {
      // Upgrade to 600x600 high-resolution artwork
      return data.results[0].artworkUrl100.replace("100x100bb", "600x600bb");
    }
  } catch {
    // Aborted or network error
  }
  return null;
}

async function queryDeezerArtwork(query: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=1`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.data && data.data.length > 0) {
      const album = data.data[0].album;
      return album?.cover_big || album?.cover_medium || null;
    }
  } catch {
    // Aborted or network error
  }
  return null;
}

export function getFallbackTrackTheme(title: string, artist: string): TrackColorTheme {
  let hash = 0;
  const str = `${title}__${artist}`;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  const topColor = `hsl(${hue}, 90%, 82%)`;
  const botColor = `hsl(${hue}, 85%, 46%)`;
  return {
    waveColor: `hsl(${hue}, 88%, 58%)`,
    waveGradient: `linear-gradient(180deg, ${topColor} 0%, ${botColor} 100%)`,
    waveGradientTop: topColor,
    waveGradientBottom: botColor,
    glowColor: `hsla(${hue}, 88%, 58%, 0.45)`,
  };
}

export const albumArtService = {
  getCached(title: string, artist: string): string | null {
    if (!title && !artist) return null;
    const key = makeCacheKey(title, artist);
    return artCache.get(key) || null;
  },

  setCached(title: string, artist: string, urlOrBase64: string): void {
    if (!title && !artist) return;
    const key = makeCacheKey(title, artist);
    if (artCache.size >= MAX_MEM_CACHE) {
      const oldest = artCache.keys().next().value;
      if (oldest) artCache.delete(oldest);
    }
    artCache.set(key, urlOrBase64);
    if (urlOrBase64.startsWith("http")) {
      persistToStorage(key, urlOrBase64);
    }
  },

  async fetchAlbumArt(title: string, artist: string, signal?: AbortSignal): Promise<string | null> {
    const cleanTitle = cleanTrackTitleForSearch(title);
    const cleanArtist = artist.trim();

    if (!cleanTitle && !cleanArtist) return null;

    const cacheKey = makeCacheKey(title, artist);
    const existing = artCache.get(cacheKey);
    if (existing) return existing;

    // Deduplicate in-flight fetches for identical tracks
    const inFlight = inFlightRequests.get(cacheKey);
    if (inFlight) return inFlight;

    const fetchPromise = (async () => {
      // 1. Search with both Artist & Title
      let query = cleanArtist && cleanArtist !== "Local Media" && cleanArtist !== "Brave" && cleanArtist !== "Chrome"
        ? `${cleanArtist} ${cleanTitle}`
        : cleanTitle;

      let artworkUrl = await queryItunesArtwork(query, signal);

      // 2. Fallback to Deezer
      if (!artworkUrl) {
        artworkUrl = await queryDeezerArtwork(query, signal);
      }

      // 3. Fallback: if artist was a browser or generic, search just cleanTitle
      if (!artworkUrl && query !== cleanTitle) {
        artworkUrl = await queryItunesArtwork(cleanTitle, signal);
        if (!artworkUrl) {
          artworkUrl = await queryDeezerArtwork(cleanTitle, signal);
        }
      }

      // 4. Verify & Preload the artwork before returning to prevent broken image flashes
      if (artworkUrl) {
        const loaded = await preloadImage(artworkUrl);
        if (loaded) {
          albumArtService.setCached(title, artist, artworkUrl);
          return artworkUrl;
        }
      }

      return null;
    })();

    inFlightRequests.set(cacheKey, fetchPromise);
    try {
      return await fetchPromise;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  },

  getColorTheme(title: string, artist: string, artBase64?: string): TrackColorTheme {
    const key = `${title}__${artist}`;
    if (colorCache.has(key)) {
      return colorCache.get(key)!;
    }

    if (artBase64) {
      const theme = getFallbackTrackTheme(title, artist);
      if (colorCache.size >= MAX_MEM_CACHE) {
        const firstKey = colorCache.keys().next().value;
        if (firstKey) colorCache.delete(firstKey);
      }
      colorCache.set(key, theme);
      return theme;
    }

    return getFallbackTrackTheme(title, artist);
  },
};
