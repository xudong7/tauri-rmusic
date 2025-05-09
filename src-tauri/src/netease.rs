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
}

const LOCAL_API_BASE: &str = "http://localhost:3000";

/// return client
fn get_client() -> Result<reqwest::Client, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;
    Ok(client)
}

/// get client response
async fn get_response(client: reqwest::Client, url: String) -> Result<reqwest::Response, String> {
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

/// Search for a cover image for a song using the Kugou API
async fn search_cover_image(
    keywords: String,
    page: Option<u32>,
    pagesize: Option<u32>,
    api_url: String,
) -> Result<String, String> {
    let client = get_client()?;

    // Search for the song on Kugou API to get the cover image
    let url = format!(
        "{}/search?keywords={}&limit={}&offset={}",
        api_url,
        keywords,
        pagesize.unwrap_or(7),
        page.unwrap_or(1)
    );

    println!("Searching cover image: {}", url);
    let response_json = get_response_json(client, url).await?;

    // Parse Kugou API response to get the cover image URL
    let error_code = response_json
        .get("error_code")
        .and_then(|v| v.as_u64())
        .unwrap_or(1);
    if error_code != 0 {
        return Err(format!("Cover image API error"));
    }

    let data = response_json
        .get("data")
        .ok_or_else(|| "No data in cover image response".to_string())?;

    let songs_value = data
        .get("lists")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "No song lists in cover image response".to_string())?;

    if songs_value.is_empty() {
        return Err("No songs found for cover image".to_string());
    }

    // Get the image URL from the first song result
    let mut pic_url = songs_value[0]["Image"].as_str().unwrap_or("").to_string();
    if !pic_url.is_empty() {
        pic_url = pic_url.replace("{size}", "400");
    }

    Ok(pic_url)
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

    let url = format!(
        "{}/search?keywords={}&limit={}&offset={}",
        local_api, search_request.keywords, search_request.pagesize, search_request.page
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

        let artists = if let Some(artists_array) = song["artists"].as_array() {
            artists_array
                .iter()
                .filter_map(|artist| artist["name"].as_str().map(|s| s.to_string()))
                .collect()
        } else {
            vec!["unknown artist".to_string()]
        };
        let album_name = song["album"]["name"]
            .as_str()
            .unwrap_or("unknown album")
            .to_string();
        let duration = song["duration"].as_u64().unwrap_or(0);

        // 不在搜索时获取图片，而是设置为空字符串
        let pic_url = "";

        songs.push(SongInfo {
            id: id.clone(),
            name: song_name,
            artists,
            album: album_name,
            duration,
            pic_url: pic_url.to_string(),
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

    println!("Using NetEase API for song URL");
    Ok(play_url.to_string())
}

/// play online song by id
#[tauri::command]
pub async fn play_netease_song(
    id: String,
    name: String,
    artist: String,
) -> Result<PlaySongResult, String> {
    // 获取歌曲URL
    let url = get_song_url(id.clone()).await?;

    // 组装结果
    let result = PlaySongResult {
        url,
        id,
        name,
        artist,
    };

    Ok(result)
}

#[tauri::command]
pub async fn get_song_cover(id: String, name: String, artist: String) -> Result<String, String> {
    // Use Kugou API to search for the song's cover image
    let kugou_url = "http://localhost:3001";
    let search_term = format!("{} {}", name, artist);

    println!("Getting cover image for song: {} by {}", name, artist);
    search_cover_image(search_term, Some(1), Some(1), kugou_url.to_string()).await
}

/// get lyric info (id and accesskey) by song hash
#[tauri::command]
pub async fn search_lyric(hash: String) -> Result<LyricInfo, String> {
    let client = get_client()?;

    let url = format!("{}/search/lyric?hash={}", LOCAL_API_BASE, hash);

    println!("Fetching lyric info from: {}", url);
    let response_json: serde_json::Value = get_response_json(client, url).await?;

    let status = response_json
        .get("status")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    if status != 200 {
        let errmsg = response_json
            .get("errmsg")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown error");
        return Err(format!("API return error: {}", errmsg));
    }

    let candidates = response_json
        .get("candidates")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "No candidates found".to_string())?;

    if candidates.is_empty() {
        return Err("No lyric candidates available".to_string());
    }

    let candidate = &candidates[0];

    let id = candidate
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "No lyric id".to_string())?
        .to_string();

    let accesskey = candidate
        .get("accesskey")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "No accesskey".to_string())?
        .to_string();

    println!(
        "Successfully got lyric info: id={}, accesskey={}",
        id, accesskey
    );
    Ok(LyricInfo { id, accesskey })
}

/// get lyric content by id and accesskey
#[tauri::command]
pub async fn get_lyric(id: String, accesskey: String) -> Result<Lyric, String> {
    let client = get_client()?;

    let url = format!(
        "{}/lyric?id={}&accesskey={}&decode=true&fmt=lrc",
        LOCAL_API_BASE, id, accesskey
    );

    let response_json: serde_json::Value = get_response_json(client, url).await?;

    let status = response_json
        .get("status")
        .and_then(|v| v.as_u64())
        .unwrap_or(500);
    if status != 200 {
        let error = response_json
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown error");
        return Err(format!("API return error: {}", error));
    }

    let content = response_json
        .get("content")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "No lyric content".to_string())?
        .to_string();

    let fmt = response_json
        .get("fmt")
        .and_then(|v| v.as_str())
        .unwrap_or("lrc")
        .to_string();

    let contenttype = response_json
        .get("contenttype")
        .and_then(|v| v.as_u64())
        .unwrap_or(1) as u32;

    let charset = response_json
        .get("charset")
        .and_then(|v| v.as_str())
        .unwrap_or("utf8")
        .to_string();

    Ok(Lyric {
        content,
        fmt,
        contenttype,
        charset,
    })
}

/// get decoded lyric content by id and accesskey
#[tauri::command]
pub async fn get_lyric_decoded(id: String, accesskey: String) -> Result<String, String> {
    let client = get_client()?;

    let url = format!(
        "{}/lyric?id={}&accesskey={}&decode=true&fmt=lrc",
        LOCAL_API_BASE, id, accesskey
    );

    let response_json: serde_json::Value = get_response_json(client, url).await?;

    let decoded_content = response_json
        .get("decodeContent")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "No decoded lyric content".to_string())?
        .to_string();

    Ok(decoded_content)
}
