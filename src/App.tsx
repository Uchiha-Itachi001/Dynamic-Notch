import { useState, useEffect } from "react";
import "./styles/tokens.css";
import "./styles/island.css";
import { DynamicNotch } from "./components/DynamicNotch";
import { SettingsWindow } from "./components/SettingsWindow";

export default function App() {
  const [isSettings, setIsSettings] = useState<boolean>(() => {
    return window.location.hash === "#settings" || window.location.search.includes("window=settings");
  });

  useEffect(() => {
    const handleHash = () => {
      setIsSettings(window.location.hash === "#settings" || window.location.search.includes("window=settings"));
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  if (isSettings) {
    return <SettingsWindow />;
  }

  return (
    <div id="notch-app-root">
      <DynamicNotch />
    </div>
  );
}
