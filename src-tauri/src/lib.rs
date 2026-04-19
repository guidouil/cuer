use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::Value;
use tauri::path::BaseDirectory;

#[tauri::command]
fn get_workspace_overview(app: tauri::AppHandle) -> Result<Value, String> {
    run_bridge(&app, "workspace-overview", Vec::new())
}

#[tauri::command]
fn run_planner(app: tauri::AppHandle, goal: String) -> Result<Value, String> {
    run_bridge(&app, "run-planner", vec![goal])
}

#[tauri::command]
fn create_provider_account(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_bridge(&app, "create-provider-account", vec![payload.to_string()])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_workspace_overview,
            run_planner,
            create_provider_account
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn run_bridge(app: &tauri::AppHandle, command_name: &str, extra_args: Vec<String>) -> Result<Value, String> {
    let root_path = workspace_root()?;
    let bridge_path = resolve_bridge_path(app, &root_path)?;
    if !bridge_path.exists() {
        return Err(format!(
            "Desktop bridge not found at {}. Run `npm run desktop:bridge` and try again.",
            bridge_path.display()
        ));
    }

    let output = Command::new(&bridge_path)
        .current_dir(&root_path)
        .arg(command_name)
        .arg(root_path.to_string_lossy().to_string())
        .args(extra_args)
        .output()
        .map_err(|error| format!("Failed to start desktop bridge at {}: {error}", bridge_path.display()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let message = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("Desktop bridge exited with status {}", output.status)
        };

        return Err(message);
    }

    serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Desktop bridge returned invalid JSON: {error}"))
}

fn workspace_root() -> Result<PathBuf, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let Some(parent) = manifest_dir.parent() else {
        return Err(String::from("Failed to resolve workspace root."));
    };

    parent
        .canonicalize()
        .map_err(|error| format!("Failed to resolve workspace root: {error}"))
}

fn resolve_bridge_path(app: &tauri::AppHandle, workspace_root: &Path) -> Result<PathBuf, String> {
    let packaged_bridge = app
        .path()
        .resolve("backend/cuer-bridge", BaseDirectory::Resource)
        .map_err(|error| format!("Failed to resolve packaged desktop bridge: {error}"))?;

    if packaged_bridge.exists() {
        return Ok(packaged_bridge);
    }

    Ok(workspace_root.join("dist-desktop-resources/backend/cuer-bridge"))
}
