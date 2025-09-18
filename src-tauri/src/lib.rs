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
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
    .invoke_handler(tauri::generate_handler![greet, get_battery_percentage, is_charging])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
