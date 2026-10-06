import { Check, Keyboard, MousePointer2, Palette } from "lucide-react";
import { useState } from "react";

type SettingsSection = "interaction" | "appearance" | "peek";
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
  { id: "peek", label: "Peek key", icon: Keyboard },
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
  const activeSection = sections.find((item) => item.id === section) ?? sections[0];
  const ActiveIcon = activeSection.icon;

  return (
    <div className="settings-console">
      <div className="settings-console-topline">
        <div className="settings-console-brand">
          <span className="settings-console-mark"><img src="/app-icon.png" alt="" /></span>
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
        <div className={`settings-console-stage-icon settings-console-stage-icon--${section}`}><ActiveIcon size={18} strokeWidth={2} /></div>
        {section === "interaction" && (
          <div className="settings-console-detail">
            <div><span className="settings-console-kicker">BEHAVIOR</span><strong>Expand on hover</strong><small>Open the notch when the pointer arrives.</small></div>
            <button type="button" className={`settings-console-switch ${expandOnHover ? "settings-console-switch--on" : ""}`} onClick={onExpandOnHoverChange} aria-pressed={expandOnHover} aria-label="Toggle expand on hover"><span /></button>
          </div>
        )}
        {section === "appearance" && (
          <div className="settings-console-detail settings-console-detail--wide">
            <div><span className="settings-console-kicker">SURFACE</span><strong>Media background</strong><small>Choose the active media finish.</small></div>
            <div className="settings-console-choice-row" role="group" aria-label="Media background">
              <button type="button" className={mediaBgMode === "black" ? "settings-console-choice--active" : ""} onClick={() => onMediaBgModeChange("black")} aria-pressed={mediaBgMode === "black"}><span className="settings-console-choice-swatch settings-console-choice-swatch--black" />Black{mediaBgMode === "black" && <Check size={10} />}</button>
              <button type="button" className={mediaBgMode === "cover" ? "settings-console-choice--active" : ""} onClick={() => onMediaBgModeChange("cover")} aria-pressed={mediaBgMode === "cover"}><span className="settings-console-choice-swatch settings-console-choice-swatch--art" />Artwork{mediaBgMode === "cover" && <Check size={10} />}</button>
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
      </section>
    </div>
  );
}