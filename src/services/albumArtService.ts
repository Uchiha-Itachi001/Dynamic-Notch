import { TrackColorTheme } from "../types";

const MAX_CACHE_SIZE = 20;
const artCache = new Map<string, string>();
const colorCache = new Map<string, TrackColorTheme>();

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
    return artCache.get(`${title}__${artist}`) || null;
  },

  getColorTheme(title: string, artist: string, artBase64?: string): TrackColorTheme {
    const key = `${title}__${artist}`;
    if (colorCache.has(key)) {
      return colorCache.get(key)!;
    }

    if (artBase64) {
      // In-memory theme extraction or fallback
      const theme = getFallbackTrackTheme(title, artist);
      if (colorCache.size >= MAX_CACHE_SIZE) {
        const firstKey = colorCache.keys().next().value;
        if (firstKey) colorCache.delete(firstKey);
      }
      colorCache.set(key, theme);
      return theme;
    }

    return getFallbackTrackTheme(title, artist);
  },
};
