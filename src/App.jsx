import { useState, useEffect } from "react";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification
} from '@tauri-apps/plugin-notification';
async function checkPermission() {
  if (!(await isPermissionGranted())) {
    return (await requestPermission()) === 'granted';
  }
  return true;
}

function speak(text) {
  if ('speechSynthesis' in window) {
    const utter = new window.SpeechSynthesisUtterance(text);
    // Cari suara bahasa Indonesia
    const voices = window.speechSynthesis.getVoices();
    const indoVoice = voices.find(v => v.lang === 'id-ID');
    if (indoVoice) {
      utter.voice = indoVoice;
      utter.lang = 'id-ID';
    } else {
      utter.lang = 'id-ID'; // fallback
    }
    window.speechSynthesis.speak(utter);
  }
}
async function enqueueNotification(title, body) {
  if (!(await checkPermission())) {
    return;
  }
  console.log(title,body)
  sendNotification({ title, body });
  speak(`${title}. ${body}`);
}
import { enable as enableAutostart, isEnabled as isAutostartEnabled } from '@tauri-apps/plugin-autostart';
import "./App.css";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");
  const [battery, setBattery] = useState(null);
  const [notified, setNotified] = useState(false);
  const [charging, setCharging] = useState(null);

  useEffect(() => {
    // Request permission saat aplikasi pertama kali dijalankan
    checkPermission();
    // Aktifkan autostart aplikasi
    (async () => {
      const enabled = await isAutostartEnabled();
      if (!enabled) {
        await enableAutostart();
      }
    })();
  }, []);

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke("greet", { name }));
  }

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const percent = await invoke("get_battery_percentage");
        setBattery(percent);
        const isCharging = await invoke("is_charging");
        console.log(isCharging)
        setCharging(isCharging);
        if (percent <= 39 && !notified) {
          enqueueNotification(
            "Baterai MacBook rendah",
            `Baterai tinggal ${Math.round(percent)}%. Segera cas laptop!`
          );
          setNotified(true);
        }
        // Notifikasi cabut charger jika baterai > 80% dan charger terpasang
        if (percent > 80 && isCharging && !notified) {
          enqueueNotification(
            "Boleh cabut charger",
            `Baterai sudah ${Math.round(percent)}% 🔋`
          );
          setNotified(true);
        }
        if ((percent <= 39 || (percent > 39 && percent <= 80) || !isCharging) && notified) {
          setNotified(false);
        }
      } catch (e) {
        setBattery(null);
        setCharging(null);
      }
  }, 60000); // cek setiap 1 menit
    return () => clearInterval(interval);
  }, [notified]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-100 to-indigo-200 font-sans">
      <div className="bg-white/80 shadow-xl rounded-2xl w-full flex flex-col items-center">
        <h1 className="text-3xl font-bold text-indigo-700 mb-2 tracking-tight">Battery Notifikasi</h1>
        <p className="text-gray-500 mb-6">Perawatan Baterai MacBook</p>

        <div className="w-full flex flex-col items-center mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg font-semibold text-gray-700">Status Baterai:</span>
            <span className={`text-xl font-bold px-3 py-1 rounded-full ${battery !== null && battery <= 39 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
              {battery !== null ? `${Math.round(battery)}%` : "Tidak terdeteksi"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-gray-700">Status Casan:</span>
            <span className={`text-xl font-bold px-3 py-1 rounded-full ${charging === null ? 'bg-gray-200 text-gray-500' : charging ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>
              {charging === null ? "Tidak terdeteksi" : charging ? "Dicolokkan" : "Tidak dicolokkan"}
            </span>
          </div>
        </div>

        
      </div>
    </main>
  );
}

export default App;
