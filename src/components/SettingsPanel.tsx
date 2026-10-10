import { Check, Image, Keyboard, Moon, MousePointer2, Palette, Power } from "lucide-react";
import { useEffect, useState } from "react";
import { tauriBridge } from "../services/tauriBridge";

type SettingsSection = "interaction" | "appearance" | "peek" | "startup";
type MediaBackgroundMode = "black" | "cover";
type PeekKey = "Shift" | "Control" | " " | "Tab";

interface SettingsPanelProps {
  expandOnHover: boolean;
  onExpandOnHoverChange: () => void;
  mediaBgMode: MediaBackgroundMode;
  onMediaBgModeChange: (mode: MediaBackgroundMode) => void;
  peekKey: PeekKey;
  onPeekKeyChange: (key: PeekKey) => void;
}

const sections: Array<{ id: SettingsSection; label: string; icon: typeof MousePointer2 }> = [
  { id: "interaction", label: "Behavior", icon: MousePointer2 },
  { id: "appearance", label: "Surface", icon: Palette },
  { id: "peek", label: "Peek", icon: Keyboard },
  { id: "startup", label: "Startup", icon: Power },
];

const peekKeys: Array<{ value: PeekKey; label: string }> = [
  { value: "Shift", label: "Shift" },
  { value: "Control", label: "Ctrl" },
  { value: " ", label: "Space" },
  { value: "Tab", label: "Tab" },
];

export function SettingsPanel({
  expandOnHover,
  onExpandOnHoverChange,
  mediaBgMode,
  onMediaBgModeChange,
  peekKey,
  onPeekKeyChange,
}: SettingsPanelProps) {
  const [section, setSection] = useState<SettingsSection>("interaction");
  const [autoStart, setAutoStart] = useState<boolean>(false);
  const [autoStartLoading, setAutoStartLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    tauriBridge.getAutoStartStatus().then((status) => {
      if (isMounted) {
        setAutoStart(status);
        setAutoStartLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleToggleAutoStart = async () => {
    if (autoStartLoading) return;
    const next = !autoStart;
    setAutoStart(next);
    const success = await tauriBridge.setAutoStart(next);
    if (!success) {
      setAutoStart(!next);
    }
  };

  const activeSection = sections.find((item) => item.id === section) ?? sections[0];
  const ActiveIcon = activeSection.icon;

  return (
    <div className="settings-console">
      <div className="settings-console-topline">
        <div className="settings-console-brand">
          <span className="settings-console-mark"><img src="/icon.png" alt="Notch" /></span>
          <div><strong>Notch settings</strong><span>CONTROL SURFACE</span></div>
        </div>
        <span className="settings-console-live"><i /> LIVE</span>
      </div>

      <nav className="settings-console-tabs" aria-label="Settings sections">
        {sections.map(({ id, label, icon: Icon }) => (
          <button type="button" key={id} className={`settings-console-tab ${section === id ? "settings-console-tab--active" : ""}`} onClick={() => setSection(id)} aria-pressed={section === id}>
            <Icon size={11} strokeWidth={2.2} /><span>{label}</span>
          </button>
        ))}
      </nav>

      <section className="settings-console-stage">
        <div className={`settings-console-stage-icon settings-console-stage-icon--${section}`}>
          {section === "startup" ? (
            <img src="/icon.png" alt="Notch" className="settings-console-stage-logo" />
          ) : (
            <ActiveIcon size={18} strokeWidth={2} />
          )}
        </div>
        {section === "interaction" && (
          <div className="settings-console-detail">
            <div><span className="settings-console-kicker">BEHAVIOR</span><strong>Expand on hover</strong><small>Open the notch when the pointer arrives.</small></div>
            <button type="button" className={`settings-console-switch ${expandOnHover ? "settings-console-switch--on" : ""}`} onClick={onExpandOnHoverChange} aria-pressed={expandOnHover} aria-label="Toggle expand on hover"><span /></button>
          </div>
        )}
        {section === "appearance" && (
          <div className="settings-console-detail">
            <div>
              <span className="settings-console-kicker">SURFACE</span>
              <strong>Media background</strong>
              <small>Choose the active media finish.</small>
            </div>
            <div className="settings-console-choice-column" role="group" aria-label="Media background">
              <button
                type="button"
                className={`settings-console-choice-item ${mediaBgMode === "black" ? "settings-console-choice-item--active" : ""}`}
                onClick={() => onMediaBgModeChange("black")}
                aria-pressed={mediaBgMode === "black"}
              >
                <Moon size={11} strokeWidth={2.2} />
                <span>Pitch Black</span>
                {mediaBgMode === "black" && <Check size={10} strokeWidth={2.5} className="choice-check" />}
              </button>
              <button
                type="button"
                className={`settings-console-choice-item ${mediaBgMode === "cover" ? "settings-console-choice-item--active" : ""}`}
                onClick={() => onMediaBgModeChange("cover")}
                aria-pressed={mediaBgMode === "cover"}
              >
                <Image size={11} strokeWidth={2.2} />
                <span>Artwork</span>
                {mediaBgMode === "cover" && <Check size={10} strokeWidth={2.5} className="choice-check" />}
              </button>
            </div>
          </div>
        )}
        {section === "peek" && (
          <div className="settings-console-detail settings-console-detail--wide">
            <div><span className="settings-console-kicker">PEEK THROUGH</span><strong>Hold a key to peek</strong><small>Hover the notch, then hold your chosen key.</small></div>
            <div className="settings-console-key-row" role="group" aria-label="Peek-through key">
              {peekKeys.map(({ value, label }) => <button type="button" key={label} className={peekKey === value ? "settings-console-key--active" : ""} onClick={() => onPeekKeyChange(value)} aria-pressed={peekKey === value}>{label}</button>)}
            </div>
          </div>
        )}
        {section === "startup" && (
          <div className="settings-console-detail">
            <div>
              <span className="settings-console-kicker">WINDOWS AUTOSTART</span>
              <strong>Run Notch on startup</strong>
              <small>{autoStartLoading ? "Checking registry..." : autoStart ? "Runs automatically at Windows boot." : "Disabled — manual launch only."}</small>
            </div>
            <button
              type="button"
              className={`settings-console-switch ${autoStart ? "settings-console-switch--on" : ""}`}
              onClick={handleToggleAutoStart}
              disabled={autoStartLoading}
              aria-pressed={autoStart}
              aria-label="Toggle Windows startup"
            >
              <span />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}