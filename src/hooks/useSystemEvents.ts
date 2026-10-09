import { useEffect } from "react";
import { DownloadActivity, tauriBridge } from "../services/tauriBridge";

interface SystemEventActions {
  showVolume: (pct: number) => void;
  setMicMuted: (muted: boolean) => void;
  showDownload: (data: {
    filename: string;
    downloadedBytes: number;
    totalBytes?: number | null;
    speedBps: number;
    paused: boolean;
  }) => void;
  dismissDownload: () => void;
}

/** Bridges Windows events into the island. Native payloads are the source of
 * truth: the UI never invents a download or radio state. */
export function useSystemEvents({
  showVolume,
  setMicMuted,
  showDownload,
  dismissDownload,
}: SystemEventActions) {
  useEffect(() => {
    const unlisteners: Array<() => void> = [];
    const add = (listener: Promise<() => void>) => {
      listener.then((unlisten) => unlisteners.push(unlisten)).catch(() => undefined);
    };

    add(tauriBridge.onVolumeChanged(({ volume_pct }) => showVolume(volume_pct)));
    add(tauriBridge.onMicStatusChanged(({ muted }) => setMicMuted(muted)));
    add(tauriBridge.onDownloadUpdated((download: DownloadActivity) => {
      if (!download.active) {
        dismissDownload();
        return;
      }
      showDownload({
        filename: download.filename,
        downloadedBytes: download.downloaded_bytes,
        totalBytes: download.total_bytes,
        speedBps: download.speed_bps,
        paused: download.paused,
      });
    }));

    return () => unlisteners.forEach((unlisten) => unlisten());
  }, [dismissDownload, setMicMuted, showDownload, showVolume]);
}
