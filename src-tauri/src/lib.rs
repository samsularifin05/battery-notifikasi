use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;

// Global state untuk audio
static AUDIO_ENABLED: AtomicBool = AtomicBool::new(true);

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.unminimize();
        Ok(())
    } else {
        Err("Main window not found".to_string())
    }
}

#[tauri::command]
fn toggle_audio() -> bool {
    let current = AUDIO_ENABLED.load(Ordering::SeqCst);
    let new_state = !current;
    AUDIO_ENABLED.store(new_state, Ordering::SeqCst);
    new_state
}

#[tauri::command]
fn is_audio_enabled() -> bool {
    AUDIO_ENABLED.load(Ordering::SeqCst)
}

#[tauri::command]
fn send_native_notification(title: String, body: String) -> Result<(), String> {
    // Gunakan script yang lebih sederhana tanpa bundle identifier
    let script = format!(
        r#"display notification "{}" with title "{}""#,
        body.replace("\"", "\\\""), 
        title.replace("\"", "\\\"")
    );
    
    println!("Executing AppleScript: {}", script);
    
    let output = Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|e| format!("Failed to run osascript: {}", e))?;
    
    println!("AppleScript output: {:?}", output);
    
    if output.status.success() {
        println!("✅ Native notification sent successfully");
        Ok(())
    } else {
        let error_msg = String::from_utf8_lossy(&output.stderr);
        println!("❌ AppleScript failed: {}", error_msg);
        Err(format!("AppleScript failed: {}", error_msg))
    }
}

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
        .setup(|app| {
            use tauri::Manager;

            let window = app.get_webview_window("main").unwrap();
            let window_ = window.clone();
            let window_for_tray = window.clone();
            let app_handle = app.handle().clone();

            // Show window saat pertama kali install, hide setelah autostart aktif
            let is_first_run = !std::path::Path::new(&format!("{}/.battery-notif-configured", std::env::var("HOME").unwrap_or_default())).exists();
            
            if is_first_run {
                // Tampilkan window untuk konfigurasi pertama
                let _ = window.show();
                let _ = window.set_focus();
                
                // Buat file marker bahwa app sudah dikonfigurasi
                if let Ok(home) = std::env::var("HOME") {
                    let _ = std::fs::write(format!("{}/.battery-notif-configured", home), "configured");
                }
            } else {
                // Hide window jika bukan first run
                window.hide().unwrap();
            }

            window.on_window_event(move |event| {
                match event {
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        window_.hide().unwrap();
                    }
                    _ => {}
                }
            });

            // Handle tray icon click untuk show/hide window dan menu
            let tray = app.tray_by_id("main").unwrap();
            let window_for_menu = window_for_tray.clone();
            let app_handle_for_menu = app_handle.clone();
            let tray_for_menu = tray.clone();
            
            // Buat menu tray dengan audio toggle
            let show_hide = tauri::menu::MenuItemBuilder::with_id("show", "Show").build(app)?;
            let separator1 = tauri::menu::PredefinedMenuItem::separator(app)?;
            let audio_toggle = tauri::menu::MenuItemBuilder::with_id("toggle_audio", "🔊 Audio ON").build(app)?;
            let separator2 = tauri::menu::PredefinedMenuItem::separator(app)?;
            let quit = tauri::menu::MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = tauri::menu::MenuBuilder::new(app)
                .items(&[&show_hide, &separator1, &audio_toggle, &separator2, &quit])
                .build()?;
            let _ = tray.set_menu(Some(menu));

            tray.on_tray_icon_event(move |_tray, event| {
                match event {
                    tauri::tray::TrayIconEvent::Click { 
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } => {
                        let window = &window_for_tray;
                        if window.is_visible().unwrap_or(false) {
                            window.hide().unwrap();
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.unminimize();
                        }
                    }
                    _ => {}
                }
            });

            // Handle menu click events
            tray.on_menu_event(move |app, event| {
                match event.id().as_ref() {
                    "show" => {
                        let window = &window_for_menu;
                        if window.is_visible().unwrap_or(false) {
                            // Hide window dan ubah menu ke "Show"
                            let _ = window.hide();
                            let new_show_hide = tauri::menu::MenuItemBuilder::with_id("show", "Show").build(app).unwrap();
                            let separator = tauri::menu::PredefinedMenuItem::separator(app).unwrap();
                            let quit = tauri::menu::MenuItemBuilder::with_id("quit", "Quit").build(app).unwrap();
                            let new_menu = tauri::menu::MenuBuilder::new(app)
                                .items(&[&new_show_hide, &separator, &quit])
                                .build().unwrap();
                            let _ = tray_for_menu.set_menu(Some(new_menu));
                        } else {
                            // Show window dan ubah menu ke "Hide"
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.unminimize();
                            let new_show_hide = tauri::menu::MenuItemBuilder::with_id("show", "Hide").build(app).unwrap();
                            let separator = tauri::menu::PredefinedMenuItem::separator(app).unwrap();
                            let quit = tauri::menu::MenuItemBuilder::with_id("quit", "Quit").build(app).unwrap();
                            let new_menu = tauri::menu::MenuBuilder::new(app)
                                .items(&[&new_show_hide, &separator, &quit])
                                .build().unwrap();
                            let _ = tray_for_menu.set_menu(Some(new_menu));
                        }
                    }
                    "toggle_audio" => {
                        let new_state = toggle_audio();
                        let audio_text = if new_state { "🔊 Audio ON" } else { "🔇 Audio OFF" };
                        
                        // Rebuild menu dengan status audio yang baru
                        let window = &window_for_menu;
                        let show_text = if window.is_visible().unwrap_or(false) { "Hide" } else { "Show" };
                        let show_hide = tauri::menu::MenuItemBuilder::with_id("show", show_text).build(app).unwrap();
                        let separator1 = tauri::menu::PredefinedMenuItem::separator(app).unwrap();
                        let audio_toggle = tauri::menu::MenuItemBuilder::with_id("toggle_audio", audio_text).build(app).unwrap();
                        let separator2 = tauri::menu::PredefinedMenuItem::separator(app).unwrap();
                        let quit = tauri::menu::MenuItemBuilder::with_id("quit", "Quit").build(app).unwrap();
                        let new_menu = tauri::menu::MenuBuilder::new(app)
                            .items(&[&show_hide, &separator1, &audio_toggle, &separator2, &quit])
                            .build().unwrap();
                        let _ = tray_for_menu.set_menu(Some(new_menu));
                    }
                    "quit" => {
                        app_handle_for_menu.exit(0);
                    }
                    _ => {}
                }
            });

            // Prevent app from quitting when all windows are closed
            let _ = app_handle.set_activation_policy(tauri::ActivationPolicy::Accessory);

            Ok(())
        })
    .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![greet, get_battery_percentage, is_charging, get_battery_condition, send_native_notification, toggle_audio, is_audio_enabled, show_main_window])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
