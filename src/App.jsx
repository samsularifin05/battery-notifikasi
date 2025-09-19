import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { 
  sendNotification,
  isPermissionGranted, 
  requestPermission 
} from '@tauri-apps/plugin-notification';
// import { addActionListener } from '@tauri-apps/plugin-notification';
import {
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import "./App.css";

function App() {
  console.log("🚀 App component rendering...");
  
  const [audioEnabled, setAudioEnabled] = useState(true);
  
  function speak(text) {
    if (!audioEnabled) {
      console.log("Audio disabled, skipping TTS");
      return;
    }
    
    if ("speechSynthesis" in window) {
      // Stop any ongoing speech first
      window.speechSynthesis.cancel();
      
      const utter = new window.SpeechSynthesisUtterance(text);
      // Cari suara bahasa Indonesia
      const voices = window.speechSynthesis.getVoices();
      const indoVoice = voices.find((v) => v.lang === "id-ID");
      if (indoVoice) {
        utter.voice = indoVoice;
        utter.lang = "id-ID";
      } else {
        utter.lang = "id-ID"; // fallback
      }
      window.speechSynthesis.speak(utter);
    }
  }
  
  function stopSpeech() {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      console.log("Speech stopped");
    }
  }
  async function enqueueNotification(title, body) {
    console.log("Sending notification:", title, body);

    // Langsung gunakan native macOS notification sebagai primary method
    try {
      await invoke("send_native_notification", { title, body });
      console.log("✅ Native notification sent successfully");
    } catch (error) {
      console.error("❌ Native notification failed:", error);
      
      // Fallback ke Tauri plugin notification
      try {
        await sendNotification({
          title: title,
          body: body,
          icon: null
        });
        console.log("✅ Tauri plugin notification sent successfully");
      } catch (fallbackError) {
        console.error("❌ All notification methods failed:", fallbackError);
      }
    }

    // Cek status audio dari backend dan frontend
    try {
      const backendAudioEnabled = await invoke("is_audio_enabled");
      if (backendAudioEnabled && audioEnabled) {
        // Suara TTS hanya jika audio enabled di kedua tempat
        setTimeout(() => {
          speak(`${title}. ${body}`);
        }, 200);
      }
    } catch (error) {
      // Fallback ke frontend audio state saja
      if (audioEnabled) {
        setTimeout(() => {
          speak(`${title}. ${body}`);
        }, 200);
      }
    }
  }

  // const [batteryHealth, setBatteryHealth] = useState(null);
  const [batteryCondition, setBatteryCondition] = useState(null);
  // Polling status kesehatan baterai (battery health) tiap 10 menit
  useEffect(() => {
    // Polling battery condition (Normal/Service Recommended) tiap 10 menit
    const conditionInterval = setInterval(async () => {
      try {
        const condition = await invoke("get_battery_condition");
        setBatteryCondition(condition);
      } catch (e) {
        setBatteryCondition(null);
      }
    }, 600000);
    (async () => {
      try {
        const condition = await invoke("get_battery_condition");
        setBatteryCondition(condition);
      } catch (e) {
        setBatteryCondition(null);
      }
    })();
    return () => {
      clearInterval(conditionInterval);
    };
  }, []);
  // Fungsi untuk menilai status baterai

  const [battery, setBattery] = useState(null);
  const [lowBatteryNotified, setLowBatteryNotified] = useState(false);
  const [highBatteryNotified, setHighBatteryNotified] = useState(false);
  const [charging, setCharging] = useState(null);

  useEffect(() => {
    // Sinkronisasi audio state dengan backend
    const syncAudioState = async () => {
      try {
        const backendAudioState = await invoke("is_audio_enabled");
        setAudioEnabled(backendAudioState);
      } catch (error) {
        console.log("Could not sync audio state with backend:", error);
      }
    };
    
    syncAudioState();

    // Setup notification click listener - DISABLED FOR NOW
    // const setupNotificationListener = async () => {
    //   try {
    //     await addActionListener((action) => {
    //       console.log("Notification action received:", action);
    //       // Show window ketika notifikasi diklik
    //       invoke("show_main_window").catch(console.error);
    //     });
    //     console.log("Notification click listener setup successfully");
    //   } catch (error) {
    //     console.log("Could not setup notification listener:", error);
    //   }
    // };
    
    // setupNotificationListener();

    // Aktifkan autostart aplikasi
    (async () => {
      const enabled = await isAutostartEnabled();
      const percent = await invoke("get_battery_percentage");
      setBattery(percent);

      if (!enabled) {
        await enableAutostart();
        // Tampilkan notifikasi bahwa autostart telah diaktifkan
        enqueueNotification(
          "Battery Notifikasi Aktif",
          "Aplikasi akan berjalan otomatis saat laptop restart. Aplikasi sekarang berjalan di background."
        );
      }
    })();
  }, []);

  // Polling status baterai dan charging realtime
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const percent = await invoke("get_battery_percentage");
        const isCharging = await invoke("is_charging");

        setBattery(percent);
        setCharging(isCharging);

        console.log(
          `Battery: ${percent}% | Charging: ${
            isCharging ? "Yes" : "No"
          } | Low Notif: ${lowBatteryNotified} | High Notif: ${highBatteryNotified}`
        );

        let batasan = 39;

        // Notifikasi baterai rendah
        if (percent <= batasan && !isCharging && !lowBatteryNotified) {
          enqueueNotification(
            "Baterai MacBook rendah",
            `Baterai tinggal ${Math.round(percent)}%. Segera cas laptop!`
          );
          setLowBatteryNotified(true);
        }

        // Reset notifikasi baterai rendah saat charger dicolok
        if (percent <= batasan && isCharging && lowBatteryNotified) {
          setLowBatteryNotified(false);
        }

        // Reset notifikasi baterai rendah saat baterai naik tanpa charger
        if (percent > batasan && !isCharging && lowBatteryNotified) {
          setLowBatteryNotified(false);
        }

        // Notifikasi baterai penuh/tinggi
        if (percent > 80 && isCharging && !highBatteryNotified) {
          enqueueNotification(
            "Boleh cabut charger",
            `Baterai sudah ${Math.round(percent)}% 🔋`
          );
          setHighBatteryNotified(true);
        }

        // Reset notifikasi baterai penuh saat charger dicabut
        if (percent > 80 && !isCharging && highBatteryNotified) {
          setHighBatteryNotified(false);
        }

        // Reset notifikasi baterai penuh saat baterai turun
        if (percent <= 80 && isCharging && highBatteryNotified) {
          setHighBatteryNotified(false);
        }
      } catch (e) {
        setBattery(null);
        setCharging(null);
      }
    }, 500); // cek setiap 500ms untuk realtime charging status
    return () => clearInterval(interval);
  }, [lowBatteryNotified, highBatteryNotified]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-100 to-indigo-200 font-sans">
      <div className="bg-white/80 shadow-xl w-full flex flex-col items-center p-6">
        <h1 className="text-3xl font-bold text-indigo-700 mb-2 tracking-tight">
          Battery Notifikasi
        </h1>
        <p className="text-gray-500 mb-6">Perawatan Baterai MacBook</p>
        
        {/* Debug Info */}
        {/* <div className="bg-gray-100 p-2 rounded mb-4 text-sm">
          Debug: Battery={battery}%, Charging={charging ? 'Yes' : 'No'}, Audio={audioEnabled ? 'ON' : 'OFF'}
        </div> */}

        <div className="w-full flex flex-col items-center mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg font-semibold text-gray-700">
              Status Baterai:
            </span>
            <span
              className={`text-xl font-bold px-3 py-1 rounded-full ${
                battery !== null && battery <= 39
                  ? "bg-red-100 text-red-600"
                  : "bg-green-100 text-green-700"
              }`}
            >
              {battery !== null
                ? `${Math.round(battery)}%`
                : "Tidak terdeteksi"}
            </span>

            <span
              className={`ml-3 text-xs font-medium px-2 py-1 rounded ${
                batteryCondition === "Normal"
                  ? "bg-green-100 text-green-700"
                  : batteryCondition
                  ? "bg-red-100 text-red-700"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {batteryCondition
                ? `Condition: ${batteryCondition}`
                : "Condition: Tidak terdeteksi"}
            </span>
          </div>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg font-semibold text-gray-700">
              Status Casan:
            </span>
            <span
              className={`text-xl font-bold px-3 py-1 rounded-full ${
                charging === null
                  ? "bg-gray-200 text-gray-500"
                  : charging
                  ? "bg-blue-100 text-blue-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {charging === null
                ? "Tidak terdeteksi"
                : charging
                ? "Dicolokkan"
                : "Tidak dicolokkan"}
            </span>
          </div>

          {/* Controls untuk audio dan test */}
          <div className="flex gap-3 items-center">
            <button 
              onClick={async () => {
                if (audioEnabled) {
                  stopSpeech(); 
                }
                try {
                  const newState = await invoke("toggle_audio");
                  setAudioEnabled(newState);
                } catch (error) {
                  setAudioEnabled(!audioEnabled);
                }
              }}
              className={`px-4 py-2 rounded-lg transition-colors ${
                audioEnabled 
                  ? "bg-green-500 hover:bg-green-600 text-white" 
                  : "bg-gray-500 hover:bg-gray-600 text-white"
              }`}
            >
              {audioEnabled ? "🔊 Audio ON" : "🔇 Audio OFF"}
            </button>

            {/* Test Notification Button */}
            <button 
              onClick={() => enqueueNotification("Test Manual", "Sistem notifikasi bekerja dengan baik! 🔋")}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Test Notifikasi
            </button>

            {/* Stop Speech Button */}
            <button 
              onClick={stopSpeech}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors"
            >
              🛑 Stop Audio
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

export default App;
