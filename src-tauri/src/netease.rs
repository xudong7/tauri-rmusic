use reqwest;
use serde::{Deserialize, Serialize};

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

#[derive(Debug, Serialize, Deserialize)]
pub struct LyricInfo {
    pub id: String,
    pub accesskey: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Lyric {
    pub content: String,
    pub fmt: String,
    pub contenttype: u32,
    pub charset: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PlaySongResult {
    pub url: String,
    pub id: String,
    pub name: String,
    pub artist: String,
    pub pic_url: String,
}

const LOCAL_API_BASE: &str = "http://localhost:3000";

/// return client
pub fn get_client() -> Result<reqwest::Client, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;
    Ok(client)
}

/// get client response
pub async fn get_response(
    client: reqwest::Client,
    url: String,
) -> Result<reqwest::Response, String> {
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("API request error: {}", e))?;
    if response.status().is_client_error() {
        return Err(format!("API request error: HTTP {}", response.status()));
    }
    Ok(response)
}

/// get response text
async fn get_text(response: reqwest::Response) -> Result<String, String> {
    let text = response
        .text()
        .await
        .map_err(|e| format!("Read text error: {}", e))?;
    Ok(text)
}

/// get response json
async fn get_response_json(
    client: reqwest::Client,
    url: String,
) -> Result<serde_json::Value, String> {
    let response = get_response(client, url).await?;
    let text = get_text(response).await?;
    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Serialize json error: {}, content: {}", e, &text[..200]))?;
    Ok(json)
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
    // Note: NetEase API uses offset as "skip count", not page number.
    let offset = (search_request.page.saturating_sub(1)) * search_request.pagesize;
    let url = format!(
        "{}/cloudsearch?keywords={}&limit={}&offset={}",
        local_api, search_request.keywords, search_request.pagesize, offset
    );

    println!("search url: {}", url);

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

/// get song url by file_hash or song id
#[tauri::command]
pub async fn get_song_url(id: String) -> Result<String, String> {
    let client = get_client()?;

    // Check if the id is a hash (for Kugou API) or a numeric ID (for NetEase API)
    let url = format!("{}/song/url?id={}&level=exhigh", LOCAL_API_BASE, id);

    println!("Getting song URL: {}", url);
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
    id: String,
    name: String,
    artist: String,
) -> Result<PlaySongResult, String> {
    let pic_url = get_song_cover(id.clone(), name.clone(), artist.clone()).await?;
    // 获取歌曲URL
    let url = get_song_url(id.clone()).await?;
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

    println!(
        "Getting cover image for song: {} by {}, id={}",
        name, artist, id
    );
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

    println!("Fetching lyrics from: {}", url);
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
