use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SongInfo {
    pub id: String,
    pub name: String,
    pub artists: Vec<String>,
    pub album: String,
    pub duration: u64, // ms
    pub pic_url: String,
    pub file_hash: String, // file hash for the song
    /// 当前（匿名）状态下是否可播放，由 `fee` 推导。字段缺失时为 None，表示未知。
    #[serde(default)]
    pub playable: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlaylistInfo {
    pub id: String,
    pub name: String,
    pub cover_url: String,
    pub track_count: u32,
    pub play_count: u64,
    pub creator: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub update_frequency: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AlbumInfo {
    pub id: String,
    pub name: String,
    pub pic_url: String,
    pub size: u32,
    pub artist: String,
    pub publish_time: i64, // ms, 交由前端按 locale 格式化
    #[serde(default)]
    pub company: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PlaylistSearchResult {
    pub playlists: Vec<PlaylistInfo>,
    pub total: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AlbumSearchResult {
    pub albums: Vec<AlbumInfo>,
    pub total: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ArtistSearchResult {
    pub artists: Vec<ArtistInfo>,
    pub total: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PlaylistDetailResult {
    pub playlist: PlaylistInfo,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PlaylistTracksResult {
    pub songs: Vec<SongInfo>,
    /// 由歌单 `trackCount` 与已取条数推导，前端无需自行对齐。
    pub has_more: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ToplistResult {
    pub toplists: Vec<PlaylistInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AlbumDetailResult {
    pub album: AlbumInfo,
    pub songs: Vec<SongInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ArtistAlbumResult {
    pub albums: Vec<AlbumInfo>,
    pub has_more: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ArtistDetailResult {
    pub artist: ArtistInfo,
    pub description: String,
    pub album_count: u32,
    pub music_count: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ArtistSongsPage {
    pub songs: Vec<SongInfo>,
    pub total: u32,
    pub has_more: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct SearchRequest {
    pub keywords: String,
    pub page: u32,
    pub pagesize: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub songs: Vec<SongInfo>,
    pub total: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ArtistInfo {
    pub id: String,
    pub name: String,
    pub pic_url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchMixResult {
    pub artists: Vec<ArtistInfo>,
    pub songs: Vec<SongInfo>,
    pub total: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ArtistSongsResult {
    pub artist: ArtistInfo,
    pub songs: Vec<SongInfo>,
    pub total: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PlaySongResult {
    pub url: String,
    pub id: String,
    pub name: String,
    pub artist: String,
    pub pic_url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OnlineServiceStatus {
    pub available: bool,
    pub status_code: Option<u16>,
    pub message: String,
}

const LOCAL_API_BASE: &str = "http://localhost:3000";
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36";
const HTTP_CONNECT_TIMEOUT: Duration = Duration::from_secs(8);
const HTTP_RESPONSE_HEADERS_TIMEOUT: Duration = Duration::from_secs(15);
const JSON_RESPONSE_BODY_TIMEOUT: Duration = Duration::from_secs(15);
const TRANSIENT_REQUEST_RETRY_DELAYS: [Duration; 2] =
    [Duration::from_millis(250), Duration::from_millis(700)];

/// /cloudsearch 的 type 参数：同一端点按实体类型返回不同结果集。
const CLOUDSEARCH_TYPE_ALBUM: u32 = 10;
const CLOUDSEARCH_TYPE_ARTIST: u32 = 100;
const CLOUDSEARCH_TYPE_PLAYLIST: u32 = 1000;

/// 歌单曲目每页条数。实测 /playlist/detail 对 <=200 首的歌单会一次性返回全部
/// 曲目，因此前端首屏按此上限一次取满即可覆盖绝大多数歌单。
const PLAYLIST_TRACKS_PAGE_SIZE: u32 = 200;

static DEFAULT_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        // 这里的所有请求都发往内置 localhost 服务，不应被系统代理接管。
        .no_proxy()
        .connect_timeout(HTTP_CONNECT_TIMEOUT)
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))
}

fn build_cloudsearch_url(local_api: &str, keywords: &str, page: u32, pagesize: u32) -> String {
    // NetEase API uses offset as "skip count", not page number.
    let offset = page.saturating_sub(1) * pagesize;
    let encoded_keywords = urlencoding::encode(keywords);
    format!(
        "{}/cloudsearch?keywords={}&limit={}&offset={}",
        local_api, encoded_keywords, pagesize, offset
    )
}

/// return client
pub fn get_client() -> Result<reqwest::Client, String> {
    if let Some(client) = DEFAULT_CLIENT.get() {
        return Ok(client.clone());
    }

    let client = build_client()?;
    if DEFAULT_CLIENT.set(client).is_err() {
        return DEFAULT_CLIENT
            .get()
            .cloned()
            .ok_or_else(|| "Failed to initialize HTTP client".to_string());
    }

    DEFAULT_CLIENT
        .get()
        .cloned()
        .ok_or_else(|| "Failed to initialize HTTP client".to_string())
}

#[tauri::command]
pub async fn check_online_service_status() -> Result<OnlineServiceStatus, String> {
    let client = get_client()?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    let url = format!("{}/login/status?timestamp={}", LOCAL_API_BASE, timestamp);

    match client
        .get(&url)
        .timeout(Duration::from_secs(2))
        .send()
        .await
    {
        Ok(response) => {
            let status = response.status();
            if status.is_success() {
                Ok(OnlineServiceStatus {
                    available: true,
                    status_code: Some(status.as_u16()),
                    message: "ok".to_string(),
                })
            } else {
                Ok(OnlineServiceStatus {
                    available: false,
                    status_code: Some(status.as_u16()),
                    message: format!("HTTP {}", status),
                })
            }
        }
        Err(error) => Ok(OnlineServiceStatus {
            available: false,
            status_code: None,
            message: error.to_string(),
        }),
    }
}

/// get client response
pub async fn get_response(
    client: reqwest::Client,
    url: String,
) -> Result<reqwest::Response, String> {
    let response = tokio::time::timeout(HTTP_RESPONSE_HEADERS_TIMEOUT, client.get(&url).send())
        .await
        .map_err(|_| {
            format!(
                "API request timed out after {}s",
                HTTP_RESPONSE_HEADERS_TIMEOUT.as_secs()
            )
        })?
        .map_err(|e| format!("API request error: {}", e))?;
    if response.status().is_client_error() || response.status().is_server_error() {
        return Err(format!("API request error: HTTP {}", response.status()));
    }
    Ok(response)
}

/// get response text
async fn get_text(response: reqwest::Response) -> Result<String, String> {
    let text = tokio::time::timeout(JSON_RESPONSE_BODY_TIMEOUT, response.text())
        .await
        .map_err(|_| {
            format!(
                "Read response timed out after {}s",
                JSON_RESPONSE_BODY_TIMEOUT.as_secs()
            )
        })?
        .map_err(|e| format!("Read text error: {}", e))?;
    if text.is_empty() {
        return Err("Empty response".to_string());
    }
    Ok(text)
}

/// get response json
async fn get_response_json(
    client: reqwest::Client,
    url: String,
) -> Result<serde_json::Value, String> {
    let mut attempt = 0usize;
    loop {
        let result = get_response_json_once(client.clone(), url.clone()).await;
        match result {
            Ok(json) => return Ok(json),
            Err(error)
                if attempt < TRANSIENT_REQUEST_RETRY_DELAYS.len()
                    && is_transient_request_error(&error) =>
            {
                let delay = TRANSIENT_REQUEST_RETRY_DELAYS[attempt];
                attempt += 1;
                tokio::time::sleep(delay).await;
            }
            Err(error) => return Err(error),
        }
    }
}

/// 截取错误响应预览。
///
/// 必须按 UTF-8 字符边界回退：直接 `&text[..200]` 在多字节文本上会 panic，
/// 而 release 配置为 `panic = "abort"`，一次 panic 即终止整个进程。
/// 这里恰好是解析失败路径，而解析失败最常见的原因就是代理返回了中文错误页，
/// 因此用字节下标切片的崩溃概率很高。
fn error_preview(text: &str) -> &str {
    const MAX_PREVIEW_BYTES: usize = 200;
    if text.len() <= MAX_PREVIEW_BYTES {
        return text;
    }
    let mut end = MAX_PREVIEW_BYTES;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    &text[..end]
}

async fn get_response_json_once(
    client: reqwest::Client,
    url: String,
) -> Result<serde_json::Value, String> {
    let response = get_response(client, url).await?;
    let text = get_text(response).await?;
    serde_json::from_str(&text).map_err(|e| {
        format!(
            "Serialize json error: {}, content: {}",
            e,
            error_preview(&text)
        )
    })
}

fn is_transient_request_error(error: &str) -> bool {
    error.starts_with("API request timed out")
        || (error.starts_with("API request error:") && !error.contains("HTTP "))
        || error.starts_with("Read response timed out")
        || error.starts_with("Read text error:")
        || error == "Empty response"
        || error.starts_with("Serialize json error:")
}

/* ---------- 响应解析与 URL 构造的公共部分 ---------- */

/// 校验响应体中的 `code`。各接口原本各自重复这段判断。
fn require_code(json: &serde_json::Value) -> Result<(), String> {
    let code = json.get("code").and_then(|v| v.as_u64()).unwrap_or(500);
    if code != 200 {
        return Err(format!("API return error: code {}", code));
    }
    Ok(())
}

/// `get_response_json` + `require_code` 的组合，覆盖绝大多数调用点的实际需求。
async fn fetch_json_ok(client: reqwest::Client, url: String) -> Result<serde_json::Value, String> {
    let json = get_response_json(client, url).await?;
    require_code(&json)?;
    Ok(json)
}

/// 把 JSON 值转成 id 字符串。id 在不同接口里可能是数字或字符串。
fn value_as_id(value: &serde_json::Value) -> Option<String> {
    value
        .as_u64()
        .map(|v| v.to_string())
        .or_else(|| value.as_str().map(str::to_string))
        .filter(|s| !s.is_empty())
}

/// 匿名状态下的可播性判断。
///
/// 依据 `fee`：0 免费、1 会员、4 专辑付费、8 免费低音质。
/// 无登录态时 1/4 无法播放。
///
/// 注：`privileges` 数组更精确，但 `/artist/songs` 不返回该字段，
/// 而 `fee` 在各类歌曲响应中均存在，故统一以 `fee` 为准。
/// 字段缺失时返回 None（未知），不武断禁用。
fn song_playable(song: &serde_json::Value) -> Option<bool> {
    let fee = song["fee"].as_u64()?;
    Some(fee != 1 && fee != 4)
}

/// 统一解析歌曲对象。
///
/// NetEase 在不同接口返回两套字段命名，这里一并兼容：
/// - `/cloudsearch`、`/artist/*`、`/playlist/track/all`：`ar` / `al` / `dt`
/// - `/search` 及旧接口：`artists` / `album` / `duration`
///
/// album 缺失时返回空串而非占位文案：`TrackRow` 仅在 album 为真值时才渲染该列。
fn parse_song(song: &serde_json::Value) -> Option<SongInfo> {
    let id = value_as_id(&song["id"])?;

    let artists: Vec<String> = song["ar"]
        .as_array()
        .or_else(|| song["artists"].as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|a| a["name"].as_str().map(str::to_string))
                .collect()
        })
        .filter(|names: &Vec<String>| !names.is_empty())
        .unwrap_or_else(|| vec!["unknown artist".to_string()]);

    let album = song["al"]["name"]
        .as_str()
        .or_else(|| song["album"]["name"].as_str())
        .unwrap_or("")
        .to_string();

    let duration = song["dt"]
        .as_u64()
        .or_else(|| song["duration"].as_u64())
        .unwrap_or(0);

    let pic_url = song["al"]["picUrl"]
        .as_str()
        .or_else(|| song["album"]["picUrl"].as_str())
        .or_else(|| song["picUrl"].as_str())
        .unwrap_or("")
        .to_string();

    Some(SongInfo {
        id: id.clone(),
        name: song["name"].as_str().unwrap_or("unknown").to_string(),
        artists,
        album,
        duration,
        pic_url,
        file_hash: id,
        playable: song_playable(song),
    })
}

/// 解析歌曲数组，跳过无法解析的条目。
fn parse_songs_array(value: &serde_json::Value) -> Vec<SongInfo> {
    value
        .as_array()
        .map(|arr| arr.iter().filter_map(parse_song).collect())
        .unwrap_or_default()
}

/// 拼接艺术家名。`/album` 用 `artists[]`，`/artist/album` 用单个 `artist`。
fn join_artist_names(value: &serde_json::Value) -> String {
    if let Some(arr) = value.as_array() {
        let names: Vec<&str> = arr.iter().filter_map(|a| a["name"].as_str()).collect();
        if !names.is_empty() {
            return names.join(", ");
        }
    }
    value["name"].as_str().unwrap_or("").to_string()
}

/// 解析歌单对象（`/playlist/detail`、`/toplist`、`/cloudsearch?type=1000` 共用）。
fn parse_playlist(value: &serde_json::Value) -> Option<PlaylistInfo> {
    let id = value_as_id(&value["id"])?;

    let creator = value["creator"]["nickname"]
        .as_str()
        .or_else(|| value["creator"]["name"].as_str())
        .unwrap_or("")
        .to_string();

    Some(PlaylistInfo {
        id,
        name: value["name"].as_str().unwrap_or("unknown").to_string(),
        cover_url: value["coverImgUrl"]
            .as_str()
            .or_else(|| value["picUrl"].as_str())
            .unwrap_or("")
            .to_string(),
        track_count: value["trackCount"].as_u64().unwrap_or(0) as u32,
        play_count: value["playCount"].as_u64().unwrap_or(0),
        creator,
        description: value["description"].as_str().unwrap_or("").to_string(),
        update_frequency: value["updateFrequency"].as_str().unwrap_or("").to_string(),
    })
}

/// 解析专辑对象（`/album`、`/artist/album`、`/cloudsearch?type=10` 共用）。
fn parse_album(value: &serde_json::Value) -> Option<AlbumInfo> {
    let id = value_as_id(&value["id"])?;

    // `/album` 返回 artists[]，`/artist/album` 与搜索接口返回单个 artist 对象。
    let artist = match value.get("artists") {
        Some(artists) if artists.is_array() => join_artist_names(artists),
        _ => join_artist_names(&value["artist"]),
    };

    Some(AlbumInfo {
        id,
        name: value["name"].as_str().unwrap_or("unknown").to_string(),
        pic_url: value["picUrl"]
            .as_str()
            .or_else(|| value["blurPicUrl"].as_str())
            .unwrap_or("")
            .to_string(),
        size: value["size"].as_u64().unwrap_or(0) as u32,
        artist,
        publish_time: value["publishTime"].as_i64().unwrap_or(0),
        company: value["company"].as_str().unwrap_or("").to_string(),
    })
}

/// 解析歌手对象。
///
/// 头像优先取 `img1v1Url`：它是方形裁剪版，用作圆形头像不会变形；
/// `picUrl` 通常是原图。`/artist/detail` 则用 `avatar`。
fn parse_artist(value: &serde_json::Value) -> Option<ArtistInfo> {
    let id = value_as_id(&value["id"])?;

    Some(ArtistInfo {
        id,
        name: value["name"].as_str().unwrap_or("unknown").to_string(),
        pic_url: value["img1v1Url"]
            .as_str()
            .or_else(|| value["avatar"].as_str())
            .or_else(|| value["picUrl"].as_str())
            .unwrap_or("")
            .to_string(),
    })
}

/// 构造带类型的 `/cloudsearch` URL。
///
/// type: 1 单曲、10 专辑、100 歌手、1000 歌单。offset 是"跳过条数"而非页码。
fn build_cloudsearch_typed_url(
    local_api: &str,
    keywords: &str,
    search_type: u32,
    page: u32,
    pagesize: u32,
) -> String {
    let offset = page.saturating_sub(1) * pagesize;
    format!(
        "{}/cloudsearch?keywords={}&type={}&limit={}&offset={}",
        local_api,
        urlencoding::encode(keywords),
        search_type,
        pagesize,
        offset
    )
}

/// 构造带 limit/offset 的分页 URL（`/playlist/track/all`、`/artist/album` 等）。
fn build_paged_url(local_api: &str, path: &str, id: &str, offset: u32, limit: u32) -> String {
    format!(
        "{}{}?id={}&limit={}&offset={}",
        local_api, path, id, limit, offset
    )
}

/// 构造歌手全部歌曲 URL。`order` 为 `hot` 或 `time`。
fn build_artist_songs_url(
    local_api: &str,
    id: &str,
    offset: u32,
    limit: u32,
    order: &str,
) -> String {
    format!(
        "{}/artist/songs?id={}&limit={}&offset={}&order={}",
        local_api, id, limit, offset, order
    )
}

/// 由「已取条数」与「总数」推导是否还有下一页。
/// 总数未知（0）时不声称还有更多，避免无意义的翻页请求。
fn has_more_after(loaded: usize, total: u32) -> bool {
    total > 0 && (loaded as u32) < total
}

/// search online songs by keywords
#[tauri::command]
pub async fn search_songs(
    keywords: String,
    page: Option<u32>,
    pagesize: Option<u32>,
    local_api: Option<String>,
) -> Result<SearchResult, String> {
    let client = get_client()?;
    let search_request = SearchRequest {
        keywords: keywords.clone(),
        page: page.unwrap_or(1),
        pagesize: pagesize.unwrap_or(7),
    }; // use local_api if provided, otherwise use default
    let local_api = local_api.unwrap_or_else(|| LOCAL_API_BASE.to_string());

    // Use /cloudsearch so we can get album cover (al.picUrl) directly.
    let url = build_cloudsearch_url(
        &local_api,
        &search_request.keywords,
        search_request.page,
        search_request.pagesize,
    );

    let response_json = fetch_json_ok(client, url).await?;

    let result = response_json
        .get("result")
        .ok_or_else(|| "No result data".to_string())?;

    let songs = parse_songs_array(&result["songs"]);
    let total = result
        .get("songCount")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;

    Ok(SearchResult { songs, total })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cloudsearch_url_encodes_keywords_and_uses_offset() {
        assert_eq!(
            build_cloudsearch_url(LOCAL_API_BASE, "周杰伦 稻香", 3, 20),
            "http://localhost:3000/cloudsearch?keywords=%E5%91%A8%E6%9D%B0%E4%BC%A6%20%E7%A8%BB%E9%A6%99&limit=20&offset=40"
        );
    }

    #[test]
    fn cloudsearch_url_saturates_first_page_offset() {
        assert_eq!(
            build_cloudsearch_url(LOCAL_API_BASE, "a/b", 0, 7),
            "http://localhost:3000/cloudsearch?keywords=a%2Fb&limit=7&offset=0"
        );
    }

    #[test]
    fn typed_cloudsearch_url_carries_entity_type() {
        assert_eq!(
            build_cloudsearch_typed_url(LOCAL_API_BASE, "周杰伦", 1000, 2, 30),
            "http://localhost:3000/cloudsearch?keywords=%E5%91%A8%E6%9D%B0%E4%BC%A6&type=1000&limit=30&offset=30"
        );
    }

    #[test]
    fn paged_url_builds_offset_from_absolute_position() {
        assert_eq!(
            build_paged_url(LOCAL_API_BASE, "/playlist/track/all", "3778678", 200, 200),
            "http://localhost:3000/playlist/track/all?id=3778678&limit=200&offset=200"
        );
    }

    #[test]
    fn artist_album_url_uses_the_same_paging_contract() {
        assert_eq!(
            build_paged_url(LOCAL_API_BASE, "/artist/album", "6452", 30, 30),
            "http://localhost:3000/artist/album?id=6452&limit=30&offset=30"
        );
    }

    #[test]
    fn artist_songs_url_carries_the_sort_order() {
        assert_eq!(
            build_artist_songs_url(LOCAL_API_BASE, "6452", 0, 30, "hot"),
            "http://localhost:3000/artist/songs?id=6452&limit=30&offset=0&order=hot"
        );
        assert_eq!(
            build_artist_songs_url(LOCAL_API_BASE, "6452", 30, 30, "time"),
            "http://localhost:3000/artist/songs?id=6452&limit=30&offset=30&order=time"
        );
    }

    #[test]
    fn cloudsearch_type_constants_match_the_documented_values() {
        // 这三个值直接决定拿回的是哪种实体，写错会静默返回错误类型的数据。
        assert_eq!(CLOUDSEARCH_TYPE_ALBUM, 10);
        assert_eq!(CLOUDSEARCH_TYPE_ARTIST, 100);
        assert_eq!(CLOUDSEARCH_TYPE_PLAYLIST, 1000);
    }

    /// 回归测试：多字节文本按字节切片会 panic。
    /// release 配置为 panic = "abort"，这条一旦失败就是整个进程被杀。
    #[test]
    fn error_preview_never_splits_a_multibyte_char() {
        // 每个汉字 3 字节，200 不是 3 的倍数，正好落在字符中间。
        let text = "中".repeat(200);
        let preview = error_preview(&text);
        assert!(preview.len() <= 200);
        assert!(preview.len() < text.len());
        // 能取到合法的 &str 本身就是不 panic 的证明。
        assert!(preview.chars().all(|c| c == '中'));
    }

    #[test]
    fn error_preview_passes_short_text_through() {
        assert_eq!(error_preview("boom"), "boom");
    }

    #[test]
    fn require_code_accepts_only_200() {
        assert!(require_code(&serde_json::json!({ "code": 200 })).is_ok());
        assert!(require_code(&serde_json::json!({ "code": 301 })).is_err());
        // code 缺失时按 500 处理，而不是当成成功。
        assert!(require_code(&serde_json::json!({ "name": "x" })).is_err());
    }

    #[test]
    fn parse_song_handles_cloudsearch_shape() {
        let song = serde_json::json!({
            "id": 1973665667u64,
            "name": "海屿你",
            "ar": [{ "name": "马也_Crabbit" }],
            "al": { "name": "海屿你", "picUrl": "https://example.com/a.jpg" },
            "dt": 295940,
            "fee": 8
        });

        let parsed = parse_song(&song).expect("should parse");
        assert_eq!(parsed.id, "1973665667");
        assert_eq!(parsed.name, "海屿你");
        assert_eq!(parsed.artists, vec!["马也_Crabbit"]);
        assert_eq!(parsed.album, "海屿你");
        assert_eq!(parsed.duration, 295940);
        assert_eq!(parsed.pic_url, "https://example.com/a.jpg");
        assert_eq!(parsed.file_hash, "1973665667");
        assert_eq!(parsed.playable, Some(true));
    }

    #[test]
    fn parse_song_handles_legacy_search_shape() {
        let song = serde_json::json!({
            "id": 298317,
            "name": "屋顶",
            "artists": [{ "name": "温岚" }, { "name": "周杰伦" }],
            "album": { "name": "有点野", "picUrl": "https://example.com/b.jpg" },
            "duration": 319039,
            "fee": 0
        });

        let parsed = parse_song(&song).expect("should parse");
        assert_eq!(parsed.artists, vec!["温岚", "周杰伦"]);
        assert_eq!(parsed.album, "有点野");
        assert_eq!(parsed.duration, 319039);
    }

    #[test]
    fn parse_song_unifies_missing_album_to_empty_string() {
        // 两处旧实现一个填 "unknown album" 一个填 ""，统一为 ""，
        // 因为 TrackRow 只在 album 为真值时才渲染该列。
        let song = serde_json::json!({ "id": 1, "name": "x", "ar": [], "dt": 1000 });
        let parsed = parse_song(&song).expect("should parse");
        assert_eq!(parsed.album, "");
        // 空 ar 数组回落到占位歌手，而不是产生空列表。
        assert_eq!(parsed.artists, vec!["unknown artist"]);
    }

    #[test]
    fn parse_song_rejects_entries_without_id() {
        assert!(parse_song(&serde_json::json!({ "name": "x" })).is_none());
        assert!(parse_song(&serde_json::json!({ "id": "" })).is_none());
    }

    #[test]
    fn song_playable_maps_fee_to_anonymous_availability() {
        // 0 免费、8 免费低音质 -> 可播；1 会员、4 专辑付费 -> 匿名不可播。
        assert_eq!(song_playable(&serde_json::json!({ "fee": 0 })), Some(true));
        assert_eq!(song_playable(&serde_json::json!({ "fee": 8 })), Some(true));
        assert_eq!(song_playable(&serde_json::json!({ "fee": 1 })), Some(false));
        assert_eq!(song_playable(&serde_json::json!({ "fee": 4 })), Some(false));
        // fee 缺失时保持未知，不武断禁用。
        assert_eq!(song_playable(&serde_json::json!({})), None);
    }

    #[test]
    fn has_more_after_never_claims_more_when_total_unknown() {
        assert!(has_more_after(0, 100));
        assert!(has_more_after(99, 100));
        assert!(!has_more_after(100, 100));
        // total 为 0 表示"未知"，不能据此声称还有下一页。
        assert!(!has_more_after(0, 0));
    }

    #[test]
    fn parse_playlist_reads_toplist_shape() {
        let item = serde_json::json!({
            "id": 19723756u64,
            "name": "飙升榜",
            "coverImgUrl": "https://example.com/c.jpg",
            "trackCount": 100,
            "playCount": 6496891392u64,
            "updateFrequency": "刚刚更新"
        });

        let parsed = parse_playlist(&item).expect("should parse");
        assert_eq!(parsed.id, "19723756");
        assert_eq!(parsed.name, "飙升榜");
        assert_eq!(parsed.track_count, 100);
        assert_eq!(parsed.update_frequency, "刚刚更新");
    }

    #[test]
    fn parse_playlist_reads_creator_nickname() {
        let item = serde_json::json!({
            "id": 3778678u64,
            "name": "热歌榜",
            "creator": { "nickname": "网易云音乐" },
            "trackCount": 200
        });
        assert_eq!(parse_playlist(&item).unwrap().creator, "网易云音乐");
    }

    #[test]
    fn parse_album_reads_both_artist_shapes() {
        // /album 用 artists[] ...
        let from_album = serde_json::json!({
            "id": 32311u64, "name": "神的游戏", "size": 9, "publishTime": 1344528000000i64,
            "company": "索尼音乐",
            "artists": [{ "name": "张悬" }]
        });
        let a = parse_album(&from_album).expect("should parse");
        assert_eq!(a.artist, "张悬");
        assert_eq!(a.publish_time, 1344528000000);

        // ... /artist/album 用单个 artist 对象
        let from_artist_album = serde_json::json!({
            "id": 274336916u64, "name": "即兴曲", "size": 1,
            "artist": { "name": "周杰伦" }
        });
        assert_eq!(parse_album(&from_artist_album).unwrap().artist, "周杰伦");
    }

    #[test]
    fn parse_artist_prefers_square_avatar() {
        let artist = serde_json::json!({
            "id": 6452u64, "name": "周杰伦",
            "picUrl": "https://example.com/original.jpg",
            "img1v1Url": "https://example.com/square.jpg"
        });
        // 圆形头像取方形裁剪版，避免变形。
        assert_eq!(
            parse_artist(&artist).unwrap().pic_url,
            "https://example.com/square.jpg"
        );
    }

    #[test]
    fn parse_artist_falls_back_to_avatar_for_detail_endpoint() {
        let artist = serde_json::json!({
            "id": 6452u64, "name": "周杰伦",
            "avatar": "https://example.com/avatar.jpg"
        });
        assert_eq!(
            parse_artist(&artist).unwrap().pic_url,
            "https://example.com/avatar.jpg"
        );
    }

    #[test]
    fn parse_songs_array_skips_unparseable_entries() {
        let arr = serde_json::json!([
            { "id": 1, "name": "ok", "ar": [{ "name": "a" }], "dt": 1000 },
            { "name": "no id" },
            { "id": 2, "name": "ok2", "ar": [{ "name": "b" }], "dt": 2000 }
        ]);
        let songs = parse_songs_array(&arr);
        assert_eq!(songs.len(), 2);
        assert_eq!(songs[0].id, "1");
        assert_eq!(songs[1].id, "2");
    }
}

/// 综合在线搜索：返回“相关歌手 + 歌曲列表（可分页）”
///
/// - 歌曲：走 /cloudsearch (type=1) 以获得 songCount 便于分页
/// - 歌手：走 /search (type=1018) 直接拿 result.artist.artists 的头像/名称
#[tauri::command]
pub async fn search_online_mix(
    keywords: String,
    page: Option<u32>,
    pagesize: Option<u32>,
    artist_limit: Option<u32>,
) -> Result<SearchMixResult, String> {
    let client = get_client()?;
    let kw = keywords.clone();
    let page = page.unwrap_or(1);
    let pagesize = pagesize.unwrap_or(7);
    let artist_limit = artist_limit.unwrap_or(6);

    let songs_fut = search_songs(
        kw.clone(),
        Some(page),
        Some(pagesize),
        Some(LOCAL_API_BASE.into()),
    );
    let artists_fut = async {
        // /search: offset 为偏移量
        let encoded_kw = urlencoding::encode(&kw);
        let url = format!(
            "{}/search?keywords={}&type=1018&limit={}&offset=0",
            LOCAL_API_BASE, encoded_kw, artist_limit
        );
        let response_json = fetch_json_ok(client.clone(), url).await?;

        let artists = response_json["result"]["artist"]["artists"]
            .as_array()
            .map(|arr| arr.iter().filter_map(parse_artist).collect())
            .unwrap_or_default();
        Ok::<Vec<ArtistInfo>, String>(artists)
    };

    let (songs_res, artists_res) = tokio::join!(songs_fut, artists_fut);
    let (songs_res, artists) = match (songs_res, artists_res) {
        (Ok(songs), Ok(artists)) => (songs, artists),
        (Ok(songs), Err(error)) => {
            eprintln!("Artist search unavailable, returning song results: {error}");
            (songs, Vec::new())
        }
        (Err(error), Ok(artists)) => {
            eprintln!("Song search unavailable, returning artist results: {error}");
            (
                SearchResult {
                    songs: Vec::new(),
                    total: 0,
                },
                artists,
            )
        }
        (Err(song_error), Err(artist_error)) => {
            return Err(format!(
                "Song and artist search failed: songs: {song_error}; artists: {artist_error}"
            ));
        }
    };

    Ok(SearchMixResult {
        artists,
        songs: songs_res.songs,
        total: songs_res.total,
    })
}

/// 获取歌手热门歌曲（用于“只看该歌手歌曲”页面）
///
/// 兼容两类常见实现：
/// - /artist/top/song?id=...  -> songs[]
/// - /artists?id=...          -> hotSongs[]
#[tauri::command]
pub async fn get_artist_top_songs(
    id: String,
    limit: Option<u32>,
) -> Result<ArtistSongsResult, String> {
    let client = get_client()?;
    let limit = limit.unwrap_or(50);

    // name 为空时回落到 "Artist"：前端 artistStore 依赖该约定判断"后端没给名字"。
    fn artist_or_placeholder(value: &serde_json::Value, id: &str) -> ArtistInfo {
        match parse_artist(value) {
            Some(mut artist) => {
                artist.id = id.to_string();
                if artist.name.is_empty() {
                    artist.name = "Artist".into();
                }
                artist
            }
            None => ArtistInfo {
                id: id.to_string(),
                name: "Artist".into(),
                pic_url: String::new(),
            },
        }
    }

    // 先用 /artist/top/song
    let url_top = format!(
        "{}/artist/top/song?id={}&limit={}",
        LOCAL_API_BASE, id, limit
    );
    let json_top = get_response_json(client.clone(), url_top).await?;
    if require_code(&json_top).is_ok() {
        let artist = artist_or_placeholder(&json_top["artist"], &id);
        let songs = parse_songs_array(&json_top["songs"]);
        // 该接口只返回热门若干首，没有可用的总数，以实际条数作为 total。
        return Ok(ArtistSongsResult {
            artist,
            total: songs.len() as u32,
            songs,
        });
    }

    // 回退 /artists?id=
    let url_artists = format!("{}/artists?id={}", LOCAL_API_BASE, id);
    let json_artists = fetch_json_ok(client, url_artists).await?;
    let artist = artist_or_placeholder(&json_artists["artist"], &id);
    let songs = parse_songs_array(&json_artists["hotSongs"]);
    Ok(ArtistSongsResult {
        artist,
        total: songs.len() as u32,
        songs,
    })
}

/* ---------- 封面实体：歌单 / 专辑 / 排行榜 / 歌手 ---------- */

/// 搜索在线歌单。走 /cloudsearch type=1000，匿名可用。
#[tauri::command]
pub async fn search_online_playlists(
    keywords: String,
    page: Option<u32>,
    pagesize: Option<u32>,
) -> Result<PlaylistSearchResult, String> {
    let client = get_client()?;
    let url = build_cloudsearch_typed_url(
        LOCAL_API_BASE,
        &keywords,
        CLOUDSEARCH_TYPE_PLAYLIST,
        page.unwrap_or(1),
        pagesize.unwrap_or(30),
    );
    let json = fetch_json_ok(client, url).await?;
    let result = &json["result"];

    Ok(PlaylistSearchResult {
        playlists: result["playlists"]
            .as_array()
            .map(|arr| arr.iter().filter_map(parse_playlist).collect())
            .unwrap_or_default(),
        total: result["playlistCount"].as_u64().unwrap_or(0) as u32,
    })
}

/// 搜索在线专辑。走 /cloudsearch type=10。
#[tauri::command]
pub async fn search_online_albums(
    keywords: String,
    page: Option<u32>,
    pagesize: Option<u32>,
) -> Result<AlbumSearchResult, String> {
    let client = get_client()?;
    let url = build_cloudsearch_typed_url(
        LOCAL_API_BASE,
        &keywords,
        CLOUDSEARCH_TYPE_ALBUM,
        page.unwrap_or(1),
        pagesize.unwrap_or(30),
    );
    let json = fetch_json_ok(client, url).await?;
    let result = &json["result"];

    Ok(AlbumSearchResult {
        albums: result["albums"]
            .as_array()
            .map(|arr| arr.iter().filter_map(parse_album).collect())
            .unwrap_or_default(),
        total: result["albumCount"].as_u64().unwrap_or(0) as u32,
    })
}

/// 搜索在线歌手（分页）。
///
/// 走 /cloudsearch type=100 而非 /search type=1018：后者返回
/// `result.artist.artists[]`（单数 artist 包一层）且无分页计数，
/// 而 type=100 返回扁平的 `result.artists[]` 与 `artistCount`，
/// 与其余搜索接口形态一致。
///
/// 注：search_online_mix 仍使用 /search type=1018 提供歌手条，
/// 那条路径供 PlayerBar/ImmersiveView 做「点击歌手名跳转」的快速命中，
/// 不经此处。
#[tauri::command]
pub async fn search_online_artists(
    keywords: String,
    page: Option<u32>,
    pagesize: Option<u32>,
) -> Result<ArtistSearchResult, String> {
    let client = get_client()?;
    let url = build_cloudsearch_typed_url(
        LOCAL_API_BASE,
        &keywords,
        CLOUDSEARCH_TYPE_ARTIST,
        page.unwrap_or(1),
        pagesize.unwrap_or(30),
    );
    let json = fetch_json_ok(client, url).await?;
    let result = &json["result"];

    Ok(ArtistSearchResult {
        artists: result["artists"]
            .as_array()
            .map(|arr| arr.iter().filter_map(parse_artist).collect())
            .unwrap_or_default(),
        total: result["artistCount"].as_u64().unwrap_or(0) as u32,
    })
}

/// 获取歌单元信息。与曲目分开，避免翻页时重复拉取元数据。
#[tauri::command]
pub async fn get_playlist_detail(id: String) -> Result<PlaylistDetailResult, String> {
    let client = get_client()?;
    let url = format!("{}/playlist/detail?id={}", LOCAL_API_BASE, id);
    let json = fetch_json_ok(client, url).await?;

    let playlist = parse_playlist(&json["playlist"])
        .ok_or_else(|| "Playlist not found in response".to_string())?;
    Ok(PlaylistDetailResult { playlist })
}

/// 获取歌单曲目（分页）。
///
/// `/playlist/track/all` 不返回总数，因此 `has_more` 由调用方传入的
/// `track_count`（来自 get_playlist_detail）与本次已取条数推导，
/// 前端无需自行维护两者的同步。
#[tauri::command]
pub async fn get_playlist_tracks(
    id: String,
    offset: Option<u32>,
    limit: Option<u32>,
    track_count: Option<u32>,
) -> Result<PlaylistTracksResult, String> {
    let client = get_client()?;
    let offset = offset.unwrap_or(0);
    let limit = limit.unwrap_or(PLAYLIST_TRACKS_PAGE_SIZE);
    let url = build_paged_url(LOCAL_API_BASE, "/playlist/track/all", &id, offset, limit);
    let json = fetch_json_ok(client, url).await?;

    let songs = parse_songs_array(&json["songs"]);
    let has_more = match track_count {
        Some(total) => has_more_after(offset as usize + songs.len(), total),
        // 调用方没给总数时按「取满了就还有下一页」保守估计。
        None => songs.len() >= limit as usize,
    };

    Ok(PlaylistTracksResult { songs, has_more })
}

/// 获取榜单列表。/toplist 返回的实体与歌单同构，详情直接复用歌单详情。
#[tauri::command]
pub async fn get_toplist() -> Result<ToplistResult, String> {
    let client = get_client()?;
    let url = format!("{}/toplist", LOCAL_API_BASE);
    let json = fetch_json_ok(client, url).await?;

    Ok(ToplistResult {
        toplists: json["list"]
            .as_array()
            .map(|arr| arr.iter().filter_map(parse_playlist).collect())
            .unwrap_or_default(),
    })
}

/// 获取专辑详情与全部曲目。
///
/// `/album` 一次性返回完整 songs[]，且专辑曲目数有界（通常 <= 50），
/// 因此不做分页——分页在这里只是仪式感，只会引入 bug。
#[tauri::command]
pub async fn get_album_detail(id: String) -> Result<AlbumDetailResult, String> {
    let client = get_client()?;
    let url = format!("{}/album?id={}", LOCAL_API_BASE, id);
    let json = fetch_json_ok(client, url).await?;

    let album =
        parse_album(&json["album"]).ok_or_else(|| "Album not found in response".to_string())?;
    Ok(AlbumDetailResult {
        album,
        songs: parse_songs_array(&json["songs"]),
    })
}

/// 获取歌手专辑（分页）。响应字段是 `hotAlbums`，且不返回总数，
/// 只有 `more` 布尔值。
#[tauri::command]
pub async fn get_artist_albums(
    id: String,
    page: Option<u32>,
    pagesize: Option<u32>,
) -> Result<ArtistAlbumResult, String> {
    let client = get_client()?;
    let pagesize = pagesize.unwrap_or(30);
    let offset = page.unwrap_or(1).saturating_sub(1) * pagesize;
    let url = build_paged_url(LOCAL_API_BASE, "/artist/album", &id, offset, pagesize);
    let json = fetch_json_ok(client, url).await?;

    Ok(ArtistAlbumResult {
        albums: json["hotAlbums"]
            .as_array()
            .map(|arr| arr.iter().filter_map(parse_album).collect())
            .unwrap_or_default(),
        has_more: json["more"].as_bool().unwrap_or(false),
    })
}

/// 获取歌手简介与作品数。注意数据嵌在 `data.artist` 下（多一层 data）。
#[tauri::command]
pub async fn get_artist_detail(id: String) -> Result<ArtistDetailResult, String> {
    let client = get_client()?;
    let url = format!("{}/artist/detail?id={}", LOCAL_API_BASE, id);
    let json = fetch_json_ok(client, url).await?;

    let artist_value = &json["data"]["artist"];
    let artist =
        parse_artist(artist_value).ok_or_else(|| "Artist not found in response".to_string())?;

    Ok(ArtistDetailResult {
        artist,
        description: artist_value["briefDesc"]
            .as_str()
            .or_else(|| artist_value["description"].as_str())
            .unwrap_or("")
            .to_string(),
        album_count: artist_value["albumSize"].as_u64().unwrap_or(0) as u32,
        music_count: artist_value["musicSize"].as_u64().unwrap_or(0) as u32,
    })
}

/// 获取歌手全部歌曲（分页，可按热度或时间排序）。
///
/// 替代 /artist/top/song：后者只返回热门 50 首且无法翻页，
/// 是 artistStore.loadMoreArtistSongs 长期为空实现的根因。
///
/// 刻意不在此返回歌手信息：翻页时重复拉取是纯浪费，
/// 歌手信息由 get_artist_detail 单独取一次。
#[tauri::command]
pub async fn get_artist_songs(
    id: String,
    page: Option<u32>,
    pagesize: Option<u32>,
    order: Option<String>,
) -> Result<ArtistSongsPage, String> {
    let client = get_client()?;
    let pagesize = pagesize.unwrap_or(30);
    let offset = page.unwrap_or(1).saturating_sub(1) * pagesize;
    let order = match order.as_deref() {
        Some("time") => "time",
        _ => "hot",
    };

    let url = build_artist_songs_url(LOCAL_API_BASE, &id, offset, pagesize, order);
    let json = fetch_json_ok(client, url).await?;

    let songs = parse_songs_array(&json["songs"]);
    let total = json["total"].as_u64().unwrap_or(0) as u32;
    // `more` 是该接口给出的权威信号；缺失时回落到总数比较。
    let has_more = json["more"]
        .as_bool()
        .unwrap_or_else(|| has_more_after(offset as usize + songs.len(), total));

    Ok(ArtistSongsPage {
        songs,
        total,
        has_more,
    })
}

/// get song url by file_hash or song id
#[tauri::command]
pub async fn get_song_url(id: String) -> Result<String, String> {
    let client = get_client()?;

    // Check if the id is a hash (for Kugou API) or a numeric ID (for NetEase API)
    let url = format!("{}/song/url?id={}&level=exhigh", LOCAL_API_BASE, id);

    let response_json = fetch_json_ok(client, url.clone()).await?;

    let data = response_json
        .get("data")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "No data array in response".to_string())?;

    if data.is_empty() {
        return Err("Data array is empty".to_string());
    }

    let song_data = &data[0];

    // Check individual song status
    let song_code = song_data
        .get("code")
        .and_then(|v| v.as_u64())
        .unwrap_or(500);
    if song_code != 200 {
        return Err(format!("Song data error: code {}", song_code));
    }

    let play_url = song_data
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "No URL in song data".to_string())?;

    if play_url.is_empty() {
        return Err("Empty song URL".to_string());
    }

    Ok(play_url.to_string())
}

/// play online song by id
#[tauri::command]
pub async fn play_netease_song(
    app_handle: tauri::AppHandle,
    id: String,
    name: String,
    artist: String,
    pic_url: Option<String>,
) -> Result<PlaySongResult, String> {
    let cover_id = id.clone();
    let cover_name = name.clone();
    let cover_artist = artist.clone();
    let cover_future = async move {
        match pic_url.filter(|url| !url.trim().is_empty()) {
            Some(url) => Ok(url),
            None => get_song_cover(cover_id, cover_name, cover_artist).await,
        }
    };
    let url_future = async {
        if crate::music::is_online_audio_cached(&app_handle, &id) {
            Ok(String::new())
        } else {
            get_song_url(id.clone()).await
        }
    };
    let (url_result, cover_result) = tokio::join!(url_future, cover_future);
    let url = url_result?;
    let pic_url = cover_result.unwrap_or_default();
    // 组装结果
    let result = PlaySongResult {
        url,
        id,
        name,
        artist,
        pic_url,
    };

    Ok(result)
}

#[tauri::command]
pub async fn get_song_cover(_id: String, name: String, artist: String) -> Result<String, String> {
    // Backward-compatible signature: current frontend calls this with (id, name, artist),
    // but cover can be reliably fetched by id via NetEase /song/detail.
    // We keep name/artist only for logging/debugging.
    let id = _id;
    if id.trim().is_empty() {
        return Err("Empty song id".to_string());
    }

    let _ = (name, artist);
    let client = get_client()?;
    let url = format!("{}/song/detail?ids={}", LOCAL_API_BASE, id);
    let response_json = fetch_json_ok(client, url).await?;

    let songs_value = response_json
        .get("songs")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "No songs array in response".to_string())?;
    if songs_value.is_empty() {
        return Err("No songs in response".to_string());
    }

    let pic_url = songs_value[0]["al"]["picUrl"]
        .as_str()
        .unwrap_or("")
        .to_string();
    if pic_url.trim().is_empty() {
        return Err("Empty cover url".to_string());
    }

    Ok(pic_url)
}

/// Get song lyrics directly with a single function call
/// Instead of using search_lyric -> get_lyric -> get_lyric_decoded
#[tauri::command]
pub async fn get_song_lyric(id: String) -> Result<String, String> {
    let client = get_client()?;

    // We can directly get the lyrics with the song ID
    let url = format!("{}/lyric?id={}", LOCAL_API_BASE, id);

    let response_json: serde_json::Value = get_response_json(client, url).await?;

    // Check if the response contains the lrc field
    let lrc = response_json
        .get("lrc")
        .ok_or_else(|| "No lrc field in response".to_string())?;

    // Extract the lyric content from the lrc field
    let content = lrc
        .get("lyric")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "No lyric content".to_string())?
        .to_string();

    if content.trim().is_empty() {
        return Err("No lyrics available for this song".to_string());
    }

    Ok(content)
}

/// 针对本地运行中的 sidecar 的实测。
///
/// 默认忽略，因为它依赖 localhost:3000 上有一个正在运行的 sidecar，
/// 而 CI 没有。手动运行：
///
/// ```text
/// cd src-tauri && cargo test --lib live_sidecar -- --ignored --nocapture
/// ```
///
/// 这组测试的价值在于：单测里的 fixture 是手写的，只能证明解析器
/// 对「我以为的响应结构」正确；这里验证的是真实响应。
#[cfg(test)]
mod live_sidecar_tests {
    use super::*;

    /// 周杰伦，各接口通用的样本 id。
    const ARTIST_ID: &str = "6452";
    /// 热歌榜，200 首，匿名可访问。
    const PLAYLIST_ID: &str = "3778678";
    /// 张悬《神的游戏》，9 首。
    const ALBUM_ID: &str = "32311";

    #[tokio::test]
    #[ignore = "需要 localhost:3000 上有 sidecar 在运行"]
    async fn searches_return_parsed_entities() {
        let playlists = search_online_playlists("周杰伦".into(), Some(1), Some(5))
            .await
            .expect("playlist search");
        assert!(!playlists.playlists.is_empty());
        assert!(playlists.total > 0);
        // 解析出的实体必须带有可用字段，而不是空壳
        assert!(playlists.playlists.iter().all(|p| !p.id.is_empty()));
        assert!(playlists.playlists.iter().any(|p| !p.cover_url.is_empty()));

        let albums = search_online_albums("周杰伦".into(), Some(1), Some(5))
            .await
            .expect("album search");
        assert!(!albums.albums.is_empty());
        assert!(albums.albums.iter().any(|a| !a.artist.is_empty()));

        let artists = search_online_artists("周杰伦".into(), Some(1), Some(5))
            .await
            .expect("artist search");
        assert!(!artists.artists.is_empty());
        assert!(artists.artists.iter().any(|a| !a.pic_url.is_empty()));
    }

    #[tokio::test]
    #[ignore = "需要 localhost:3000 上有 sidecar 在运行"]
    async fn toplist_returns_playlist_shaped_entities() {
        let result = get_toplist().await.expect("toplist");
        assert!(result.toplists.len() > 10);
        let first = &result.toplists[0];
        assert!(!first.id.is_empty());
        assert!(!first.name.is_empty());
        assert!(first.track_count > 0);
    }

    #[tokio::test]
    #[ignore = "需要 localhost:3000 上有 sidecar 在运行"]
    async fn playlist_detail_and_tracks_agree_on_has_more() {
        let detail = get_playlist_detail(PLAYLIST_ID.into())
            .await
            .expect("playlist detail");
        assert_eq!(detail.playlist.name, "热歌榜");
        assert!(detail.playlist.track_count > 0);

        // 首屏按后端每页上限取满
        let first = get_playlist_tracks(
            PLAYLIST_ID.into(),
            Some(0),
            Some(PLAYLIST_TRACKS_PAGE_SIZE),
            Some(detail.playlist.track_count),
        )
        .await
        .expect("playlist tracks");
        assert!(!first.songs.is_empty());
        assert!(first.songs.iter().all(|s| !s.id.is_empty()));

        // has_more 必须与 trackCount 一致：取满 200 首的热歌榜不应声称还有更多
        let loaded = first.songs.len() as u32;
        assert_eq!(first.has_more, loaded < detail.playlist.track_count);

        // 再取一页必须是不同的曲目，证明 offset 生效
        let second = get_playlist_tracks(
            PLAYLIST_ID.into(),
            Some(loaded),
            Some(PLAYLIST_TRACKS_PAGE_SIZE),
            Some(detail.playlist.track_count),
        )
        .await
        .expect("playlist tracks page 2");
        if !second.songs.is_empty() {
            assert_ne!(first.songs[0].id, second.songs[0].id);
        }
    }

    #[tokio::test]
    #[ignore = "需要 localhost:3000 上有 sidecar 在运行"]
    async fn album_detail_returns_full_track_list() {
        let detail = get_album_detail(ALBUM_ID.into()).await.expect("album");
        assert_eq!(detail.album.name, "神的游戏");
        assert!(!detail.album.artist.is_empty());
        assert!(detail.album.publish_time > 0);
        // /album 一次性返回完整曲目，条数应与 size 一致
        assert_eq!(detail.songs.len() as u32, detail.album.size);
    }

    #[tokio::test]
    #[ignore = "需要 localhost:3000 上有 sidecar 在运行"]
    async fn artist_endpoints_support_pagination_and_detail() {
        let detail = get_artist_detail(ARTIST_ID.into())
            .await
            .expect("artist detail");
        assert_eq!(detail.artist.name, "周杰伦");
        assert!(!detail.artist.pic_url.is_empty());
        assert!(detail.album_count > 0);
        assert!(!detail.description.is_empty());

        let first = get_artist_songs(ARTIST_ID.into(), Some(1), Some(30), Some("hot".into()))
            .await
            .expect("artist songs");
        assert_eq!(first.songs.len(), 30);
        assert!(first.total > 30);
        assert!(first.has_more);

        // offset 随机访问必须真的换了一批歌
        let second = get_artist_songs(ARTIST_ID.into(), Some(2), Some(30), Some("hot".into()))
            .await
            .expect("artist songs page 2");
        assert_ne!(first.songs[0].id, second.songs[0].id);

        // order=time 应给出不同的首曲
        let by_time = get_artist_songs(ARTIST_ID.into(), Some(1), Some(30), Some("time".into()))
            .await
            .expect("artist songs by time");
        assert_ne!(first.songs[0].id, by_time.songs[0].id);

        let albums = get_artist_albums(ARTIST_ID.into(), Some(1), Some(30))
            .await
            .expect("artist albums");
        assert!(!albums.albums.is_empty());
        assert!(albums.albums.iter().any(|a| !a.artist.is_empty()));
    }

    /// 可播性标记必须在真实数据上产生区分度：
    /// 若全部为 true，说明 fee 字段没有被正确读到，置灰功能形同虚设。
    #[tokio::test]
    #[ignore = "需要 localhost:3000 上有 sidecar 在运行"]
    async fn playable_flag_discriminates_on_real_data() {
        let detail = get_playlist_detail(PLAYLIST_ID.into())
            .await
            .expect("playlist detail");
        let tracks = get_playlist_tracks(
            PLAYLIST_ID.into(),
            Some(0),
            Some(PLAYLIST_TRACKS_PAGE_SIZE),
            Some(detail.playlist.track_count),
        )
        .await
        .expect("playlist tracks");

        let with_fee = tracks.songs.iter().filter(|s| s.playable.is_some()).count();
        assert!(with_fee > 0, "fee 字段未被解析，playable 全为 None");
        assert!(
            tracks.songs.iter().any(|s| s.playable == Some(true)),
            "应存在可播放曲目"
        );
    }
}
