#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod llm;

use db::{
    db_add_article, db_delete_article, db_delete_draft, db_get_articles, db_get_current_session, db_get_draft_with_messages,
    db_get_drafts, db_get_model_configs, db_get_user_settings, db_get_session_history,
    db_save_current_session, db_save_draft, db_save_session_history,
    db_update_session_history_title, db_delete_session_history,
    db_get_writing_styles, db_save_writing_style, db_delete_writing_style,
    db_save_model_config, db_set_user_settings, db_delete_model_config, db_update_draft_title,
    db_update_draft_category, init_db, DbState,
};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ModelConfigPayload {
    id: String,
    name: String,
    provider: String,
    api_key: String,
    base_url: Option<String>,
    model_name: String,
}

#[tauri::command]
async fn llm_generate_stream(
    app: tauri::AppHandle,
    config: ModelConfigPayload,
    system_instruction: String,
    messages: Vec<serde_json::Value>,
    event_name: String,
) -> Result<serde_json::Value, String> {
    let cfg = llm::ModelConfig {
        id: config.id,
        name: config.name,
        provider: config.provider,
        api_key: config.api_key,
        base_url: config.base_url,
        model_name: config.model_name,
    };
    llm::generate_response_stream(app, event_name, cfg, system_instruction, messages).await
}

#[tauri::command]
async fn llm_generate_one(
    config: ModelConfigPayload,
    system_instruction: String,
    messages: Vec<serde_json::Value>,
    user_content: String,
) -> Result<String, String> {
    let cfg = llm::ModelConfig {
        id: config.id,
        name: config.name,
        provider: config.provider,
        api_key: config.api_key,
        base_url: config.base_url,
        model_name: config.model_name,
    };
    llm::generate_response_non_stream(cfg, system_instruction, messages, user_content).await
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let path = app.path().app_data_dir().map_err(|e| e.to_string())?;
            let conn = init_db(path).map_err(|e| e.to_string())?;
            app.manage(DbState(Mutex::new(Some(conn))));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db_get_articles,
            db_add_article,
            db_delete_article,
            db_get_drafts,
            db_get_draft_with_messages,
            db_save_draft,
            db_update_draft_title,
            db_update_draft_category,
            db_delete_draft,
            db_get_user_settings,
            db_set_user_settings,
            db_get_model_configs,
            db_save_model_config,
            db_delete_model_config,
            db_get_current_session,
            db_save_current_session,
            db_save_session_history,
            db_get_session_history,
            db_update_session_history_title,
            db_delete_session_history,
            db_get_writing_styles,
            db_save_writing_style,
            db_delete_writing_style,
            llm_generate_stream,
            llm_generate_one,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
