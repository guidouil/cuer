use std::env;
use std::path::PathBuf;
use std::process::Command;

use serde_json::Value;

#[tauri::command]
fn get_workspace_overview() -> Result<Value, String> {
    run_bridge("workspace-overview", Vec::new())
}

#[tauri::command]
fn run_planner(goal: String) -> Result<Value, String> {
    run_bridge("run-planner", vec![goal])
}

#[tauri::command]
fn create_provider_account(payload: Value) -> Result<Value, String> {
    run_bridge("create-provider-account", vec![payload.to_string()])
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

fn run_bridge(command_name: &str, extra_args: Vec<String>) -> Result<Value, String> {
    let root_path = workspace_root()?;
    let script_path = root_path.join("dist/desktop/bridgeCli.js");
    if !script_path.exists() {
        return Err(format!(
            "Desktop bridge not found at {}. Run `npm run build` and try again.",
            script_path.display()
        ));
    }

    let node_binary = env::var("npm_node_execpath").unwrap_or_else(|_| String::from("node"));
    let output = Command::new(node_binary)
        .current_dir(&root_path)
        .arg(&script_path)
        .arg(command_name)
        .arg(root_path.to_string_lossy().to_string())
        .args(extra_args)
        .output()
        .map_err(|error| format!("Failed to start desktop bridge: {error}"))?;

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
