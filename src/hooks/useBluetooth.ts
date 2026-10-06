import { useState, useEffect } from "react";
import { BluetoothDevice } from "../types";
import { tauriBridge } from "../services/tauriBridge";

export const useBluetooth = () => {
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [activeDevice, setActiveDevice] = useState<BluetoothDevice | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchBluetooth = async () => {
      try {
        const list = await tauriBridge.getBluetoothDevices();
        if (isMounted) {
          if (list && list.length > 0) {
            setDevices(list);
            const connected = list.find((d) => d.connected) || null;
            setActiveDevice(connected);
          } else {
            setDevices([]);
            setActiveDevice(null);
          }
        }
      } catch (err) {
        console.error("Error fetching bluetooth devices:", err);
        if (isMounted) {
          setDevices([]);
          setActiveDevice(null);
        }
      }
    };

    fetchBluetooth();
    const interval = setInterval(fetchBluetooth, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return {
    devices,
    activeDevice,
    isConnected: Boolean(activeDevice?.connected),
  };
};
