use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread::sleep;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::path::BaseDirectory;
use tauri::Manager;

const OPENAI_OAUTH_CALLBACK_HOST: &str = "127.0.0.1";
const OPENAI_OAUTH_CALLBACK_PORT: u16 = 1455;
const OPENAI_OAUTH_CALLBACK_PATH: &str = "/auth/callback";
const OPENAI_OAUTH_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConnectOpenAiOauthRequest {
    base_url: Option<String>,
    default_model: Option<String>,
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenAiOauthSession {
    authorize_url: String,
    code_verifier: String,
    redirect_uri: String,
    state: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenAiOauthSessionRequest<'a> {
    redirect_uri: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompleteOpenAiOauthBridgePayload<'a> {
    authorization_code: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    base_url: Option<&'a str>,
    code_verifier: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    default_model: Option<&'a str>,
    name: &'a str,
    redirect_uri: &'a str,
}

struct PendingOpenAiOauthCallback {
    authorization_code: String,
    stream: TcpStream,
}

struct HttpRequest {
    path: String,
    query: HashMap<String, String>,
}

#[tauri::command]
fn get_workspace_overview(app: tauri::AppHandle) -> Result<Value, String> {
    run_bridge(&app, "workspace-overview", Vec::new())
}

#[tauri::command]
fn run_planner(
    app: tauri::AppHandle,
    goal: String,
    clarification_answers: Option<Value>,
    planner_name: Option<String>,
    planner_response_json: Option<String>,
) -> Result<Value, String> {
    let answers_json = clarification_answers
        .unwrap_or_else(|| Value::Array(Vec::new()))
        .to_string();
    run_bridge(
        &app,
        "run-planner",
        vec![
            goal,
            answers_json,
            planner_name.unwrap_or_default(),
            planner_response_json.unwrap_or_default(),
        ],
    )
}

#[tauri::command]
fn create_provider_account(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_bridge(&app, "create-provider-account", vec![payload.to_string()])
}

#[tauri::command]
fn delete_provider_account(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_bridge(&app, "delete-provider-account", vec![payload.to_string()])
}

#[tauri::command]
fn connect_openai_oauth(
    app: tauri::AppHandle,
    payload: ConnectOpenAiOauthRequest,
) -> Result<Value, String> {
    let account_name = payload.name.trim();
    if account_name.is_empty() {
        return Err(String::from("Account name is required."));
    }

    let redirect_uri = format!(
        "http://localhost:{}{}",
        OPENAI_OAUTH_CALLBACK_PORT, OPENAI_OAUTH_CALLBACK_PATH
    );
    let session_payload = serde_json::to_string(&OpenAiOauthSessionRequest {
        redirect_uri: &redirect_uri,
    })
    .map_err(|error| format!("Failed to serialize OpenAI OAuth session request: {error}"))?;
    let session_value = run_bridge(
        &app,
        "create-openai-oauth-session",
        vec![session_payload],
    )?;
    let session: OpenAiOauthSession = serde_json::from_value(session_value)
        .map_err(|error| format!("Desktop bridge returned an invalid OpenAI OAuth session: {error}"))?;

    if session.redirect_uri != redirect_uri {
        return Err(String::from(
            "OpenAI OAuth session returned an unexpected redirect URI.",
        ));
    }

    let listener = TcpListener::bind((OPENAI_OAUTH_CALLBACK_HOST, OPENAI_OAUTH_CALLBACK_PORT))
        .map_err(|error| {
            format!(
                "Failed to start the OpenAI OAuth callback listener on http://localhost:{}: {error}",
                OPENAI_OAUTH_CALLBACK_PORT
            )
        })?;
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("Failed to configure the OpenAI OAuth callback listener: {error}"))?;

    open_in_default_browser(&session.authorize_url)?;

    let callback = wait_for_openai_oauth_callback(&listener, &session.state);
    let result = match callback {
        Ok(mut callback) => {
            let bridge_payload = serde_json::to_string(&CompleteOpenAiOauthBridgePayload {
                authorization_code: &callback.authorization_code,
                base_url: normalize_optional_text(payload.base_url.as_deref()),
                code_verifier: &session.code_verifier,
                default_model: normalize_optional_text(payload.default_model.as_deref()),
                name: account_name,
                redirect_uri: &session.redirect_uri,
            })
            .map_err(|error| {
                format!(
                    "Failed to serialize the completed OpenAI OAuth payload for the desktop bridge: {error}"
                )
            })?;
            let bridge_result = run_bridge(&app, "connect-openai-oauth", vec![bridge_payload]);

            match &bridge_result {
                Ok(_) => {
                    write_html_response(
                        &mut callback.stream,
                        200,
                        render_oauth_page(
                            "Connected to Cuer",
                            "You can return to the app. Your OpenAI OAuth tokens were stored locally in the OS keychain.",
                        ),
                    );
                }
                Err(message) => {
                    write_html_response(
                        &mut callback.stream,
                        500,
                        render_oauth_page("Connection failed", message),
                    );
                }
            }

            bridge_result
        }
        Err(message) => Err(message),
    };

    focus_main_window(&app);
    result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_workspace_overview,
            run_planner,
            create_provider_account,
            delete_provider_account,
            connect_openai_oauth
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn run_bridge(
    app: &tauri::AppHandle,
    command_name: &str,
    extra_args: Vec<String>,
) -> Result<Value, String> {
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
        .map_err(|error| {
            format!(
                "Failed to start desktop bridge at {}: {error}",
                bridge_path.display()
            )
        })?;

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

fn wait_for_openai_oauth_callback(
    listener: &TcpListener,
    expected_state: &str,
) -> Result<PendingOpenAiOauthCallback, String> {
    let deadline = Instant::now() + OPENAI_OAUTH_TIMEOUT;

    loop {
        match listener.accept() {
            Ok((mut stream, _)) => {
                match read_http_request(&mut stream) {
                    Ok(Some(request)) => {
                        if request.path != OPENAI_OAUTH_CALLBACK_PATH {
                            write_html_response(
                                &mut stream,
                                404,
                                render_oauth_page(
                                    "Unknown callback",
                                    "Cuer only accepts the OpenAI OAuth callback on the expected path.",
                                ),
                            );
                            continue;
                        }

                        if let Some(error) = request.query.get("error") {
                            let description = request
                                .query
                                .get("error_description")
                                .cloned()
                                .unwrap_or_else(|| error.clone());
                            write_html_response(
                                &mut stream,
                                400,
                                render_oauth_page("Authentication cancelled", &description),
                            );
                            return Err(format!("OpenAI OAuth failed: {description}"));
                        }

                        let Some(state) = request.query.get("state") else {
                            write_html_response(
                                &mut stream,
                                400,
                                render_oauth_page(
                                    "Invalid callback",
                                    "OpenAI OAuth did not include the expected state parameter.",
                                ),
                            );
                            return Err(String::from(
                                "OpenAI OAuth callback is missing the state parameter.",
                            ));
                        };

                        if state != expected_state {
                            write_html_response(
                                &mut stream,
                                400,
                                render_oauth_page(
                                    "Security check failed",
                                    "OpenAI OAuth returned an unexpected state token.",
                                ),
                            );
                            return Err(String::from("OpenAI OAuth state validation failed."));
                        }

                        let Some(code) = request.query.get("code") else {
                            write_html_response(
                                &mut stream,
                                400,
                                render_oauth_page(
                                    "Invalid callback",
                                    "OpenAI OAuth did not return an authorization code.",
                                ),
                            );
                            return Err(String::from(
                                "OpenAI OAuth callback is missing the authorization code.",
                            ));
                        };

                        return Ok(PendingOpenAiOauthCallback {
                            authorization_code: code.clone(),
                            stream,
                        });
                    }
                    Ok(None) => continue,
                    Err(message) => {
                        write_html_response(
                            &mut stream,
                            400,
                            render_oauth_page("Invalid callback", &message),
                        );
                        return Err(message);
                    }
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() >= deadline {
                    return Err(String::from(
                        "Timed out while waiting for the OpenAI OAuth callback in the browser.",
                    ));
                }

                sleep(Duration::from_millis(100));
            }
            Err(error) => {
                return Err(format!(
                    "Failed while waiting for the OpenAI OAuth callback: {error}"
                ))
            }
        }
    }
}

fn read_http_request(stream: &mut TcpStream) -> Result<Option<HttpRequest>, String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(10)))
        .map_err(|error| format!("Failed to configure the OpenAI OAuth callback socket: {error}"))?;

    let mut buffer = Vec::with_capacity(2048);
    let mut chunk = [0_u8; 1024];
    while buffer.len() < 16 * 1024 {
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(size) => {
                buffer.extend_from_slice(&chunk[..size]);
                if buffer.windows(4).any(|window| window == b"\r\n\r\n") {
                    break;
                }
            }
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) =>
            {
                continue;
            }
            Err(error) => {
                return Err(format!("Failed to read the OpenAI OAuth callback request: {error}"))
            }
        }
    }

    if buffer.is_empty() {
        return Ok(None);
    }

    let request = String::from_utf8_lossy(&buffer);
    let Some(request_line) = request.lines().next() else {
        return Ok(None);
    };

    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let target = parts.next().unwrap_or_default();
    if method != "GET" {
        return Err(format!(
            "OpenAI OAuth callback used the unsupported HTTP method {method}."
        ));
    }
    if target.is_empty() {
        return Err(String::from(
            "OpenAI OAuth callback request did not include a path.",
        ));
    }

    let (path, query) = split_request_target(target)?;
    Ok(Some(HttpRequest { path, query }))
}

fn split_request_target(target: &str) -> Result<(String, HashMap<String, String>), String> {
    let mut parts = target.splitn(2, '?');
    let path = parts.next().unwrap_or_default().to_string();
    let query = parts
        .next()
        .map(parse_query_string)
        .transpose()?
        .unwrap_or_default();
    Ok((path, query))
}

fn parse_query_string(value: &str) -> Result<HashMap<String, String>, String> {
    let mut pairs = HashMap::new();

    for pair in value.split('&') {
        if pair.is_empty() {
            continue;
        }

        let mut entry = pair.splitn(2, '=');
        let key = decode_url_component(entry.next().unwrap_or_default())?;
        let parsed_value = decode_url_component(entry.next().unwrap_or_default())?;
        pairs.insert(key, parsed_value);
    }

    Ok(pairs)
}

fn decode_url_component(value: &str) -> Result<String, String> {
    let bytes = value.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        match bytes[index] {
            b'+' => {
                output.push(b' ');
                index += 1;
            }
            b'%' => {
                if index + 2 >= bytes.len() {
                    return Err(String::from(
                        "OpenAI OAuth callback contains an invalid percent-encoded value.",
                    ));
                }

                let hex = std::str::from_utf8(&bytes[index + 1..index + 3]).map_err(|error| {
                    format!("OpenAI OAuth callback contains invalid UTF-8 in a URL escape: {error}")
                })?;
                let value = u8::from_str_radix(hex, 16).map_err(|error| {
                    format!("OpenAI OAuth callback contains an invalid URL escape: {error}")
                })?;
                output.push(value);
                index += 3;
            }
            byte => {
                output.push(byte);
                index += 1;
            }
        }
    }

    String::from_utf8(output)
        .map_err(|error| format!("OpenAI OAuth callback is not valid UTF-8 after decoding: {error}"))
}

fn write_html_response(stream: &mut TcpStream, status_code: u16, body: String) {
    let status_text = match status_code {
        200 => "OK",
        400 => "Bad Request",
        404 => "Not Found",
        500 => "Internal Server Error",
        _ => "OK",
    };
    let response = format!(
        "HTTP/1.1 {status_code} {status_text}\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.as_bytes().len(),
        body,
    );

    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

fn render_oauth_page(title: &str, message: &str) -> String {
    format!(
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\" /><title>{}</title><style>body{{font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;background:#0f172a;color:#e2e8f0;margin:0;display:grid;place-items:center;min-height:100vh;padding:24px}}main{{max-width:520px;background:#111827;border:1px solid #1f2937;border-radius:16px;padding:24px;box-shadow:0 20px 60px rgba(15,23,42,.45)}}h1{{font-size:1.4rem;margin:0 0 12px}}p{{margin:0;line-height:1.5;color:#cbd5e1}}</style></head><body><main><h1>{}</h1><p>{}</p></main></body></html>",
        escape_html(title),
        escape_html(title),
        escape_html(message),
    )
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn open_in_default_browser(url: &str) -> Result<(), String> {
    let command = if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    };

    Command::new(command)
        .arg(url)
        .spawn()
        .map_err(|error| format!("Failed to open the default browser with {command}: {error}"))?;

    Ok(())
}

fn focus_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn normalize_optional_text(value: Option<&str>) -> Option<&str> {
    match value.map(str::trim) {
        Some("") | None => None,
        Some(text) => Some(text),
    }
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
