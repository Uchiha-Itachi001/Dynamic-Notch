import "./styles/tokens.css";
import "./styles/island.css";
import { DynamicNotch } from "./components/DynamicNotch";

export default function App() {
  return (
    <div id="notch-app-root">
      <DynamicNotch />
    </div>
  );
}
