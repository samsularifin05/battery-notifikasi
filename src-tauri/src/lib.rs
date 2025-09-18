use std::process::Command;

#[tauri::command]
fn get_battery_condition() -> Result<String, String> {
    let output = Command::new("system_profiler")
        .arg("SPPowerDataType")
        .output()
        .map_err(|e| format!("Failed to run system_profiler: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if line.trim().starts_with("Condition:") {
            return Ok(line.trim().replace("Condition: ", ""));
        }
    }
    Err("Battery condition not found".to_string())
}
use tauri_plugin_autostart::MacosLauncher;
// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_battery_percentage() -> Result<f32, String> {
    match battery::Manager::new() {
        Ok(manager) => {
            match manager.batteries() {
                Ok(mut batteries) => {
                    if let Some(Ok(battery)) = batteries.next() {
                        Ok(battery.state_of_charge().value * 100.0)
                    } else {
                        Err("No battery found".to_string())
                    }
                }
                Err(e) => Err(format!("Failed to get batteries: {}", e)),
            }
        }
        Err(e) => Err(format!("Failed to create battery manager: {}", e)),
    }
}

#[tauri::command]
fn is_charging() -> Result<bool, String> {
    match battery::Manager::new() {
        Ok(manager) => {
            match manager.batteries() {
                Ok(mut batteries) => {
                    if let Some(Ok(battery)) = batteries.next() {
                        let state = battery.state();
                        Ok(state == battery::State::Charging || state == battery::State::Full)
                    } else {
                        Err("No battery found".to_string())
                    }
                }
                Err(e) => Err(format!("Failed to get batteries: {}", e)),
            }
        }
        Err(e) => Err(format!("Failed to create battery manager: {}", e)),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // System tray diatur lewat tauri.conf.json, tidak perlu .system_tray()
        .setup(|app| {
            use tauri::Manager;

            let window = app.get_webview_window("main").unwrap();
            let window_ = window.clone();

            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    window_.hide().unwrap();
                }
            });
            Ok(())
        })
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
    .invoke_handler(tauri::generate_handler![greet, get_battery_percentage, is_charging,  get_battery_condition])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
