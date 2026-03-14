use rusqlite::{Connection, params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

pub struct DbState(pub Mutex<Option<Connection>>);

pub fn init_db(app_data_dir: PathBuf) -> Result<Connection, rusqlite::Error> {
    std::fs::create_dir_all(&app_data_dir).ok();
    let path = app_data_dir.join("wensi.db");
    let conn = Connection::open(&path)?;
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS articles (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            category TEXT NOT NULL,
            platform TEXT NOT NULL,
            publish_date TEXT NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE TABLE IF NOT EXISTS drafts (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            stage TEXT NOT NULL,
            last_updated TEXT NOT NULL,
            consensus TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE TABLE IF NOT EXISTS draft_messages (
            id TEXT PRIMARY KEY,
            draft_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            thought TEXT,
            type_ TEXT,
            options TEXT,
            consensus TEXT,
            sort_order INTEGER NOT NULL,
            FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_draft_messages_draft_id ON draft_messages(draft_id);
        CREATE TABLE IF NOT EXISTS user_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            active_model_id TEXT NOT NULL,
            writing_style TEXT NOT NULL
        );
        INSERT OR IGNORE INTO user_settings (id, active_model_id, writing_style) VALUES (1, 'bailian-default', '专业、简洁、富有启发性');
        CREATE TABLE IF NOT EXISTS model_configs (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            provider TEXT NOT NULL,
            api_key TEXT NOT NULL,
            base_url TEXT,
            model_name TEXT NOT NULL
        );
        INSERT OR IGNORE INTO model_configs (id, name, provider, api_key, base_url, model_name) VALUES ('bailian-default', '阿里百炼', 'custom', '', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen-plus');
        CREATE TABLE IF NOT EXISTS current_session (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            stage TEXT NOT NULL,
            consensus TEXT NOT NULL,
            draft TEXT NOT NULL,
            current_platform TEXT NOT NULL,
            messages_count INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS session_history (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            stage TEXT NOT NULL,
            consensus TEXT NOT NULL,
            draft TEXT NOT NULL,
            messages TEXT NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_session_history_created_at ON session_history(created_at DESC);
        CREATE TABLE IF NOT EXISTS writing_styles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            author_positioning TEXT NOT NULL DEFAULT '',
            style_positioning TEXT NOT NULL DEFAULT '',
            habitual_phrases TEXT NOT NULL DEFAULT '',
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        "#,
    )?;
    // 内置写作风格种子（仅当表为空时插入）
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM writing_styles", [], |r| r.get(0)).unwrap_or(0);
    if count == 0 {
        let defaults = [
            ("style-tutorial", "教程风格", "知识分享者、步骤清晰、面向新手", "条理分明、由浅入深、配示例与小结", "首先、其次、最后、总结一下、举个例子"),
            ("style-dry", "干货风格", "行业从业者、信息密度高", "简洁直接、少废话、多结论与数据", "核心是、本质上、直接说、结论先行、数据表明"),
            ("style-story", "故事风格", "会讲故事的人、有代入感", "叙事节奏、细节描写、情绪铺垫", "那时、没想到、后来、直到、终于"),
            ("style-analysis", "专业分析", "分析师/研究者、客观中立", "逻辑严密、引用可靠、观点有据", "从…来看、研究表明、值得注意的是、综合来看"),
            ("style-popular", "轻松科普", "朋友式讲解、降低门槛", "通俗易懂、适度幽默、类比生活", "说白了、打个比方、你可能会想、其实"),
        ];
        for (i, (id, name, author, style, phrases)) in defaults.iter().enumerate() {
            let _ = conn.execute(
                "INSERT INTO writing_styles (id, name, author_positioning, style_positioning, habitual_phrases, sort_order) VALUES (?1,?2,?3,?4,?5,?6)",
                params![id, name, author, style, phrases, i as i64],
            );
        }
    }
    // 兼容旧库：若已有列则忽略错误
    drop(conn.execute("ALTER TABLE drafts ADD COLUMN category TEXT DEFAULT ''", []));
    drop(conn.execute("ALTER TABLE current_session ADD COLUMN messages TEXT DEFAULT '[]'", []));
    // 新库无 current_session 行时插入默认行（ALTER 后表必有 messages 列）
    drop(conn.execute(
        "INSERT OR IGNORE INTO current_session (id, stage, consensus, draft, current_platform, messages_count, messages) VALUES (1, 'landing', '{}', '', 'wechat', 0, '[]')",
        [],
    ));
    Ok(conn)
}

fn get_conn<'a>(state: &'a State<DbState>) -> std::sync::MutexGuard<'a, Option<Connection>> {
    state.0.lock().unwrap()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArticleRow {
    pub id: String,
    pub title: String,
    pub content: String,
    pub category: String,
    pub platform: String,
    pub publish_date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DraftRow {
    pub id: String,
    pub title: String,
    pub stage: String,
    pub last_updated: String,
    pub consensus: String,
    pub content: String,
    pub created_at: i64,
    #[serde(default)]
    pub category: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DraftMessageRow {
    pub id: String,
    pub draft_id: String,
    pub role: String,
    pub content: String,
    pub thought: Option<String>,
    pub type_: Option<String>,
    pub options: Option<String>,
    pub consensus: Option<String>,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSettingsRow {
    pub active_model_id: String,
    pub writing_style: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfigRow {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub api_key: String,
    pub base_url: Option<String>,
    pub model_name: String,
}

#[tauri::command]
pub fn db_get_articles(state: State<DbState>) -> Result<Vec<ArticleRow>, String> {
    let guard = get_conn(&state);
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    let mut stmt = conn.prepare("SELECT id, title, content, category, platform, publish_date FROM articles ORDER BY created_at DESC").map_err(|e: rusqlite::Error| e.to_string())?;
    let rows = stmt
        .query_map([], |r: &rusqlite::Row| {
            Ok(ArticleRow {
                id: r.get(0)?,
                title: r.get(1)?,
                content: r.get(2)?,
                category: r.get(3)?,
                platform: r.get(4)?,
                publish_date: r.get(5)?,
            })
        })
        .map_err(|e: rusqlite::Error| e.to_string())?;
    let out: Vec<ArticleRow> = rows.filter_map(Result::ok).collect();
    Ok(out)
}

#[tauri::command]
pub fn db_add_article(
    state: State<DbState>,
    id: String,
    title: String,
    content: String,
    category: String,
    platform: String,
    publish_date: String,
) -> Result<(), String> {
    let guard = get_conn(&state);
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    conn.execute(
        "INSERT INTO articles (id, title, content, category, platform, publish_date) VALUES (?1,?2,?3,?4,?5,?6)",
        params![id, title, content, category, platform, publish_date],
    )
    .map_err(|e: rusqlite::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_delete_article(state: State<DbState>, id: String) -> Result<(), String> {
    let guard = get_conn(&state);
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    conn.execute("DELETE FROM articles WHERE id = ?1", params![id])
        .map_err(|e: rusqlite::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_get_drafts(state: State<DbState>) -> Result<Vec<DraftRow>, String> {
    let guard = get_conn(&state);
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    let mut stmt = conn.prepare("SELECT id, title, stage, last_updated, consensus, content, created_at, COALESCE(category, '') FROM drafts ORDER BY created_at DESC").map_err(|e: rusqlite::Error| e.to_string())?;
    let rows = stmt
        .query_map([], |r: &rusqlite::Row| {
            Ok(DraftRow {
                id: r.get(0)?,
                title: r.get(1)?,
                stage: r.get(2)?,
                last_updated: r.get(3)?,
                consensus: r.get(4)?,
                content: r.get(5)?,
                created_at: r.get(6)?,
                category: r.get::<_, String>(7).unwrap_or_default(),
            })
        })
        .map_err(|e: rusqlite::Error| e.to_string())?;
    let out: Vec<DraftRow> = rows.filter_map(Result::ok).collect();
    Ok(out)
}

#[tauri::command]
pub fn db_get_draft_with_messages(state: State<DbState>, draft_id: String) -> Result<Option<(DraftRow, Vec<DraftMessageRow>)>, String> {
    let guard = get_conn(&state);
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    let draft: Option<DraftRow> = conn
        .query_row(
            "SELECT id, title, stage, last_updated, consensus, content, created_at, COALESCE(category, '') FROM drafts WHERE id = ?1",
            params![draft_id],
            |r: &rusqlite::Row| {
                Ok(DraftRow {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    stage: r.get(2)?,
                    last_updated: r.get(3)?,
                    consensus: r.get(4)?,
                    content: r.get(5)?,
                    created_at: r.get(6)?,
                    category: r.get::<_, String>(7).unwrap_or_default(),
                })
            },
        )
        .optional()
        .map_err(|e: rusqlite::Error| e.to_string())?;
    let Some(draft) = draft else {
        return Ok(None);
    };
    let mut stmt = conn.prepare("SELECT id, draft_id, role, content, thought, type_, options, consensus, sort_order FROM draft_messages WHERE draft_id = ?1 ORDER BY sort_order").map_err(|e: rusqlite::Error| e.to_string())?;
    let rows = stmt
        .query_map(params![draft_id], |r: &rusqlite::Row| {
            Ok(DraftMessageRow {
                id: r.get(0)?,
                draft_id: r.get(1)?,
                role: r.get(2)?,
                content: r.get(3)?,
                thought: r.get(4)?,
                type_: r.get(5)?,
                options: r.get(6)?,
                consensus: r.get(7)?,
                sort_order: r.get(8)?,
            })
        })
        .map_err(|e: rusqlite::Error| e.to_string())?;
    let messages: Vec<DraftMessageRow> = rows.filter_map(Result::ok).collect();
    Ok(Some((draft, messages)))
}

#[tauri::command]
pub fn db_save_draft(
    state: State<DbState>,
    id: String,
    title: String,
    stage: String,
    last_updated: String,
    consensus: String,
    content: String,
    category: String,
    messages: Vec<(String, String, String, Option<String>, Option<String>, Option<String>, Option<String>, i64)>,
) -> Result<(), String> {
    let guard = get_conn(&state);
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    conn.execute(
        "INSERT INTO drafts (id, title, stage, last_updated, consensus, content, category) VALUES (?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(id) DO UPDATE SET title=excluded.title, stage=excluded.stage, last_updated=excluded.last_updated, consensus=excluded.consensus, content=excluded.content, category=excluded.category",
        params![id, title, stage, last_updated, consensus, content, category],
    )
    .map_err(|e: rusqlite::Error| e.to_string())?;
    conn.execute("DELETE FROM draft_messages WHERE draft_id = ?1", params![id])
        .map_err(|e: rusqlite::Error| e.to_string())?;
    for (i, (_, role, content, thought, type_, options, consensus_json, sort_order)) in messages.into_iter().enumerate() {
        let row_id = format!("{}-{}", id, i);
        conn.execute(
            "INSERT INTO draft_messages (id, draft_id, role, content, thought, type_, options, consensus, sort_order) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![row_id, id, role, content, thought, type_, options, consensus_json, sort_order],
        )
        .map_err(|e: rusqlite::Error| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn db_update_draft_title(state: State<DbState>, id: String, title: String, last_updated: String) -> Result<(), String> {
    let guard = get_conn(&state);
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    conn.execute(
        "UPDATE drafts SET title = ?1, last_updated = ?2 WHERE id = ?3",
        params![title, last_updated, id],
    )
    .map_err(|e: rusqlite::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_update_draft_category(state: State<DbState>, id: String, category: String) -> Result<(), String> {
    let guard = get_conn(&state);
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    conn.execute(
        "UPDATE drafts SET category = ?1 WHERE id = ?2",
        params![category, id],
    )
    .map_err(|e: rusqlite::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_delete_draft(state: State<DbState>, id: String) -> Result<(), String> {
    let guard = get_conn(&state);
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    conn.execute("DELETE FROM draft_messages WHERE draft_id = ?1", params![id])
        .map_err(|e: rusqlite::Error| e.to_string())?;
    conn.execute("DELETE FROM drafts WHERE id = ?1", params![id])
        .map_err(|e: rusqlite::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_get_user_settings(state: State<DbState>) -> Result<UserSettingsRow, String> {
    let guard = get_conn(&state);
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    conn.query_row(
        "SELECT active_model_id, writing_style FROM user_settings WHERE id = 1",
        [],
        |r: &rusqlite::Row| {
            Ok(UserSettingsRow {
                active_model_id: r.get(0)?,
                writing_style: r.get(1)?,
            })
        },
    )
    .map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
pub fn db_set_user_settings(
    state: State<DbState>,
    active_model_id: String,
    writing_style: String,
) -> Result<(), String> {
    let guard = get_conn(&state);
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    conn.execute(
        "UPDATE user_settings SET active_model_id = ?1, writing_style = ?2 WHERE id = 1",
        params![active_model_id, writing_style],
    )
    .map_err(|e: rusqlite::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_get_model_configs(state: State<DbState>) -> Result<Vec<ModelConfigRow>, String> {
    let guard = get_conn(&state);
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    let mut stmt = conn.prepare("SELECT id, name, provider, api_key, base_url, model_name FROM model_configs ORDER BY id").map_err(|e: rusqlite::Error| e.to_string())?;
    let rows = stmt
        .query_map([], |r: &rusqlite::Row| {
            Ok(ModelConfigRow {
                id: r.get(0)?,
                name: r.get(1)?,
                provider: r.get(2)?,
                api_key: r.get(3)?,
                base_url: r.get(4)?,
                model_name: r.get(5)?,
            })
        })
        .map_err(|e: rusqlite::Error| e.to_string())?;
    let out: Vec<ModelConfigRow> = rows.filter_map(Result::ok).collect();
    Ok(out)
}

#[tauri::command]
pub fn db_save_model_config(
    state: State<DbState>,
    id: String,
    name: String,
    provider: String,
    api_key: String,
    base_url: Option<String>,
    model_name: String,
) -> Result<(), String> {
    let guard = get_conn(&state);
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    conn.execute(
        "INSERT OR REPLACE INTO model_configs (id, name, provider, api_key, base_url, model_name) VALUES (?1,?2,?3,?4,?5,?6)",
        params![id, name, provider, api_key, base_url, model_name],
    )
    .map_err(|e: rusqlite::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_delete_model_config(state: State<DbState>, id: String) -> Result<(), String> {
    let guard = get_conn(&state);
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    conn.execute("DELETE FROM model_configs WHERE id = ?1", params![id])
        .map_err(|e: rusqlite::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_get_current_session(state: State<DbState>) -> Result<Option<(String, String, String, String, i64, String)>, String> {
    let guard = get_conn(&state);
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    conn.query_row(
        "SELECT stage, consensus, draft, current_platform, messages_count, COALESCE(messages, '[]') FROM current_session WHERE id = 1",
        [],
        |r: &rusqlite::Row| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
    )
    .optional()
    .map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
pub fn db_save_current_session(
    state: State<DbState>,
    stage: String,
    consensus: String,
    draft: String,
    current_platform: String,
    messages_count: i64,
    messages: String,
) -> Result<(), String> {
    let guard = get_conn(&state);
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    conn.execute(
        "INSERT OR REPLACE INTO current_session (id, stage, consensus, draft, current_platform, messages_count, messages) VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6)",
        params![stage, consensus, draft, current_platform, messages_count, messages],
    )
    .map_err(|e: rusqlite::Error| e.to_string())?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionHistoryRow {
    pub id: String,
    pub title: String,
    pub stage: String,
    pub consensus: String,
    pub draft: String,
    pub messages: String,
    pub created_at: i64,
}

const SESSION_HISTORY_CAP: i64 = 100;

#[tauri::command]
pub fn db_save_session_history(
    state: State<DbState>,
    id: String,
    title: String,
    stage: String,
    consensus: String,
    draft: String,
    messages: String,
) -> Result<(), String> {
    let guard = get_conn(&state);
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    conn.execute(
        "INSERT INTO session_history (id, title, stage, consensus, draft, messages, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![id, title, stage, consensus, draft, messages, now],
    )
    .map_err(|e: rusqlite::Error| e.to_string())?;
    conn.execute(
        "DELETE FROM session_history WHERE id NOT IN (SELECT id FROM session_history ORDER BY created_at DESC LIMIT ?1)",
        params![SESSION_HISTORY_CAP],
    )
    .map_err(|e: rusqlite::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_get_session_history(state: State<DbState>) -> Result<Vec<SessionHistoryRow>, String> {
    let guard = get_conn(&state);
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    let mut stmt = conn
        .prepare("SELECT id, title, stage, consensus, draft, messages, created_at FROM session_history ORDER BY created_at DESC LIMIT ?1")
        .map_err(|e: rusqlite::Error| e.to_string())?;
    let rows = stmt
        .query_map(params![SESSION_HISTORY_CAP], |r: &rusqlite::Row| {
            Ok(SessionHistoryRow {
                id: r.get(0)?,
                title: r.get(1)?,
                stage: r.get(2)?,
                consensus: r.get(3)?,
                draft: r.get(4)?,
                messages: r.get(5)?,
                created_at: r.get(6)?,
            })
        })
        .map_err(|e: rusqlite::Error| e.to_string())?;
    let out: Vec<SessionHistoryRow> = rows.filter_map(Result::ok).collect();
    Ok(out)
}

#[tauri::command]
pub fn db_update_session_history_title(state: State<DbState>, id: String, title: String) -> Result<(), String> {
    let guard = get_conn(&state);
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    conn.execute("UPDATE session_history SET title = ?1 WHERE id = ?2", params![title, id])
        .map_err(|e: rusqlite::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_delete_session_history(state: State<DbState>, id: String) -> Result<(), String> {
    let guard = get_conn(&state);
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    conn.execute("DELETE FROM session_history WHERE id = ?1", params![id])
        .map_err(|e: rusqlite::Error| e.to_string())?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WritingStyleRow {
    pub id: String,
    pub name: String,
    pub author_positioning: String,
    pub style_positioning: String,
    pub habitual_phrases: String,
    pub sort_order: i64,
}

#[tauri::command]
pub fn db_get_writing_styles(state: State<DbState>) -> Result<Vec<WritingStyleRow>, String> {
    let guard = get_conn(&state);
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    let mut stmt = conn
        .prepare("SELECT id, name, author_positioning, style_positioning, habitual_phrases, sort_order FROM writing_styles ORDER BY sort_order ASC, created_at ASC")
        .map_err(|e: rusqlite::Error| e.to_string())?;
    let rows = stmt
        .query_map([], |r: &rusqlite::Row| {
            Ok(WritingStyleRow {
                id: r.get(0)?,
                name: r.get(1)?,
                author_positioning: r.get(2)?,
                style_positioning: r.get(3)?,
                habitual_phrases: r.get(4)?,
                sort_order: r.get(5)?,
            })
        })
        .map_err(|e: rusqlite::Error| e.to_string())?;
    Ok(rows.filter_map(Result::ok).collect())
}

#[tauri::command]
pub fn db_save_writing_style(
    state: State<DbState>,
    id: String,
    name: String,
    author_positioning: String,
    style_positioning: String,
    habitual_phrases: String,
) -> Result<(), String> {
    let guard = get_conn(&state);
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    conn.execute(
        "INSERT INTO writing_styles (id, name, author_positioning, style_positioning, habitual_phrases, sort_order, created_at) VALUES (?1,?2,?3,?4,?5,0,?6) ON CONFLICT(id) DO UPDATE SET name=excluded.name, author_positioning=excluded.author_positioning, style_positioning=excluded.style_positioning, habitual_phrases=excluded.habitual_phrases",
        params![id, name, author_positioning, style_positioning, habitual_phrases, now],
    )
    .map_err(|e: rusqlite::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_delete_writing_style(state: State<DbState>, id: String) -> Result<(), String> {
    let guard = get_conn(&state);
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    conn.execute("DELETE FROM writing_styles WHERE id = ?1", params![id])
        .map_err(|e: rusqlite::Error| e.to_string())?;
    Ok(())
}
