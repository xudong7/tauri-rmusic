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

async fn get_response_json_once(
    client: reqwest::Client,
    url: String,
) -> Result<serde_json::Value, String> {
    let response = get_response(client, url).await?;
    let text = get_text(response).await?;
    serde_json::from_str(&text).map_err(|e| {
        let preview = if text.len() > 200 {
            &text[..200]
        } else {
            &text
        };
        format!("Serialize json error: {}, content: {}", e, preview)
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

    let response_json: serde_json::Value = get_response_json(client, url).await?;

    let code = response_json
        .get("code")
        .and_then(|v| v.as_u64())
        .unwrap_or(500);
    if code != 200 {
        return Err(format!("API return error: code {}", code));
    }

    let result = response_json
        .get("result")
        .ok_or_else(|| "No result data".to_string())?;

    let songs_value = result
        .get("songs")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "No songs array".to_string())?;

    let total = result
        .get("songCount")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;

    let mut songs = Vec::new();
    for song in songs_value {
        let id = song["id"]
            .as_u64()
            .map(|id| id.to_string())
            .unwrap_or_default();
        if id.is_empty() {
            continue;
        }

        let song_name = song["name"].as_str().unwrap_or("unknown").to_string();

        // /cloudsearch returns artists in "ar"
        let artists = if let Some(artists_array) = song["ar"].as_array() {
            artists_array
                .iter()
                .filter_map(|artist| artist["name"].as_str().map(|s| s.to_string()))
                .collect()
        } else {
            vec!["unknown artist".to_string()]
        };
        // /cloudsearch returns album in "al"
        let album_name = song["al"]["name"]
            .as_str()
            .unwrap_or("unknown album")
            .to_string();
        // /cloudsearch uses "dt" as duration in ms
        let duration = song["dt"]
            .as_u64()
            .or_else(|| song["duration"].as_u64())
            .unwrap_or(0);

        // /cloudsearch provides cover directly: al.picUrl
        let pic_url = song["al"]["picUrl"].as_str().unwrap_or("").to_string();

        songs.push(SongInfo {
            id: id.clone(),
            name: song_name,
            artists,
            album: album_name,
            duration,
            pic_url,
            file_hash: id,
        });
    }

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
        let response_json: serde_json::Value = get_response_json(client.clone(), url).await?;
        let code = response_json
            .get("code")
            .and_then(|v| v.as_u64())
            .unwrap_or(500);
        if code != 200 {
            return Err(format!("API return error: code {}", code));
        }

        let artists_value = response_json["result"]["artist"]["artists"]
            .as_array()
            .unwrap_or(&Vec::new())
            .to_owned();

        let mut artists = Vec::new();
        for a in artists_value {
            let id = a["id"].as_u64().map(|v| v.to_string()).unwrap_or_default();
            if id.is_empty() {
                continue;
            }
            let name = a["name"].as_str().unwrap_or("unknown").to_string();
            let pic_url = a["img1v1Url"]
                .as_str()
                .or_else(|| a["picUrl"].as_str())
                .unwrap_or("")
                .to_string();
            artists.push(ArtistInfo { id, name, pic_url });
        }
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

    async fn parse_songs(arr: Option<&Vec<serde_json::Value>>) -> Vec<SongInfo> {
        let mut songs = Vec::new();
        let Some(arr) = arr else { return songs };
        for song in arr {
            let id = song["id"]
                .as_u64()
                .map(|v| v.to_string())
                .unwrap_or_default();
            if id.is_empty() {
                continue;
            }
            let song_name = song["name"].as_str().unwrap_or("unknown").to_string();
            let artists = if let Some(ar) = song["ar"].as_array() {
                ar.iter()
                    .filter_map(|a| a["name"].as_str().map(|s| s.to_string()))
                    .collect()
            } else if let Some(artists_array) = song["artists"].as_array() {
                artists_array
                    .iter()
                    .filter_map(|a| a["name"].as_str().map(|s| s.to_string()))
                    .collect()
            } else {
                vec!["unknown artist".to_string()]
            };
            let album_name = song["al"]["name"]
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
                .unwrap_or("")
                .to_string();

            songs.push(SongInfo {
                id: id.clone(),
                name: song_name,
                artists,
                album: album_name,
                duration,
                pic_url,
                file_hash: id,
            });
        }
        songs
    }

    // 先用 /artist/top/song
    let url_top = format!(
        "{}/artist/top/song?id={}&limit={}",
        LOCAL_API_BASE, id, limit
    );
    let json_top = get_response_json(client.clone(), url_top).await?;
    if json_top.get("code").and_then(|v| v.as_u64()).unwrap_or(500) == 200 {
        let artist_name = json_top["artist"]["name"]
            .as_str()
            .unwrap_or("")
            .to_string();
        let artist_pic = json_top["artist"]["picUrl"]
            .as_str()
            .or_else(|| json_top["artist"]["img1v1Url"].as_str())
            .unwrap_or("")
            .to_string();
        let songs = parse_songs(json_top.get("songs").and_then(|v| v.as_array())).await;
        return Ok(ArtistSongsResult {
            artist: ArtistInfo {
                id,
                name: if artist_name.is_empty() {
                    "Artist".into()
                } else {
                    artist_name
                },
                pic_url: artist_pic,
            },
            total: songs.len() as u32,
            songs,
        });
    }

    // 回退 /artists?id=
    let url_artists = format!("{}/artists?id={}", LOCAL_API_BASE, id);
    let json_artists = get_response_json(client, url_artists).await?;
    let code = json_artists
        .get("code")
        .and_then(|v| v.as_u64())
        .unwrap_or(500);
    if code != 200 {
        return Err(format!("API return error: code {}", code));
    }
    let artist_name = json_artists["artist"]["name"]
        .as_str()
        .unwrap_or("Artist")
        .to_string();
    let artist_pic = json_artists["artist"]["picUrl"]
        .as_str()
        .or_else(|| json_artists["artist"]["img1v1Url"].as_str())
        .unwrap_or("")
        .to_string();
    let songs = parse_songs(json_artists.get("hotSongs").and_then(|v| v.as_array())).await;
    Ok(ArtistSongsResult {
        artist: ArtistInfo {
            id,
            name: artist_name,
            pic_url: artist_pic,
        },
        total: songs.len() as u32,
        songs,
    })
}

/// get song url by file_hash or song id
#[tauri::command]
pub async fn get_song_url(id: String) -> Result<String, String> {
    let client = get_client()?;

    // Check if the id is a hash (for Kugou API) or a numeric ID (for NetEase API)
    let url = format!("{}/song/url?id={}&level=exhigh", LOCAL_API_BASE, id);

    let response_json: serde_json::Value = get_response_json(client, url.clone()).await?;

    let code = response_json
        .get("code")
        .and_then(|v| v.as_u64())
        .unwrap_or(500);
    if code != 200 {
        return Err(format!("API return error: code {}", code));
    }

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
    let response_json: serde_json::Value = get_response_json(client, url).await?;

    let code = response_json
        .get("code")
        .and_then(|v| v.as_u64())
        .unwrap_or(500);
    if code != 200 {
        return Err(format!("API return error: code {}", code));
    }

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
