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

/// search online songs by keywords
#[tauri::command]
pub async fn search_songs(
    keywords: String,
    page: Option<u32>,
    pagesize: Option<u32>,
) -> Result<SearchResult, String> {
    let client = get_client()?;
    let search_request = SearchRequest {
        keywords: keywords.clone(),
        page: page.unwrap_or(1),
        pagesize: pagesize.unwrap_or(7),
    };

    let url = format!(
        "{}/search?keywords={}&page={}&pagesize={}",
        LOCAL_API_BASE, search_request.keywords, search_request.page, search_request.pagesize
    );

    let response_json: serde_json::Value = get_response_json(client, url).await?;

    let error_code = response_json
        .get("error_code")
        .and_then(|v| v.as_u64())
        .unwrap_or(1);
    if error_code != 0 {
        let error_msg = response_json
            .get("error_msg")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown error");
        return Err(format!("API return error: {}", error_msg));
    }

    let data = response_json
        .get("data")
        .ok_or_else(|| "No data".to_string())?;

    let songs_value = data
        .get("lists")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "No lists".to_string())?;

    let total = data.get("total").and_then(|v| v.as_u64()).unwrap_or(0) as u32;

    let mut songs = Vec::new();
    for song in songs_value {
        let file_hash = song["FileHash"].as_str().unwrap_or("").to_string();
        if file_hash.is_empty() {
            continue;
        }

        let id = song["Audioid"]
            .as_u64()
            .map(|id| id.to_string())
            .unwrap_or_default();
        let song_name = song["OriSongName"].as_str().unwrap_or("unknown").to_string();

        let artists = if let Some(singers_array) = song["Singers"].as_array() {
            singers_array
                .iter()
                .filter_map(|singer| singer["name"].as_str().map(|s| s.to_string()))
                .collect()
        } else {
            let singer_name = song["SingerName"].as_str().unwrap_or("unknown singer");
            vec![singer_name.to_string()]
        };

        let album = song["AlbumName"].as_str().unwrap_or("unknown album").to_string();

        let duration = song["Duration"].as_u64().unwrap_or(0) * 1000;

        let mut pic_url = song["Image"].as_str().unwrap_or("").to_string();
        pic_url = pic_url.replace("{size}", "400");

        songs.push(SongInfo {
            id,
            name: song_name,
            artists,
            album,
            duration,
            pic_url,
            file_hash,
        });
    }

    Ok(SearchResult { songs, total })
}

/// get song url by file_hash
#[tauri::command]
pub async fn get_song_url(id: String) -> Result<String, String> {
    let client = get_client()?;

    let url = format!("{}/song/url/new?hash={}", LOCAL_API_BASE, id);

    let response_json: serde_json::Value = get_response_json(client, url).await?;

    let error_code = response_json
        .get("error_code")
        .and_then(|v| v.as_u64())
        .unwrap_or(1);
    if error_code != 0 {
        let error_msg = response_json
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown error");
        return Err(format!("API return error: {}", error_msg));
    }

    let data = response_json
        .get("data")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "No data".to_string())?;

    if data.is_empty() {
        return Err("data empty".to_string());
    }

    let song_data = &data[0];

    let errno = song_data
        .get("_errno")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    if errno != 0 {
        let msg = song_data
            .get("_msg")
            .and_then(|v| v.as_str())
            .unwrap_or("get song url error");
        return Err(format!("get song error: {}", msg));
    }

    let info = song_data
        .get("info")
        .ok_or_else(|| "no info in data".to_string())?;

    // get tracker_url for first
    if let Some(tracker_urls) = info.get("tracker_url").and_then(|u| u.as_array()) {
        if !tracker_urls.is_empty() {
            if let Some(play_url) = tracker_urls[0].as_str() {
                if !play_url.is_empty() {
                    println!("use tracker_url to get whole song");
                    return Ok(play_url.to_string());
                }
            }
        }
    }

    // if tracker_url is empty, get url from climax_info
    let climax_info = info
        .get("climax_info")
        .ok_or_else(|| "no climax_info".to_string())?;

    let urls = climax_info
        .get("url")
        .and_then(|u| u.as_array())
        .ok_or_else(|| "no url array".to_string())?;

    if urls.is_empty() {
        return Err("song urls empty".to_string());
    }

    let play_url = urls[0]
        .as_str()
        .ok_or_else(|| "url not valid".to_string())?;

    if play_url.is_empty() {
        return Err("play_url empty".to_string());
    }

    println!("use climax_info to get song fragment");
    Ok(play_url.to_string())
}


/// get song detail by id
#[tauri::command]
pub async fn get_song_detail(id: String) -> Result<SongInfo, String> {
    let client = get_client()?;

    let url = format!("{}/song/detail?ids={}", LOCAL_API_BASE, id);

    let response_json: serde_json::Value = get_response_json(client, url).await?;

    let songs = response_json
        .get("songs")
        .and_then(|s| s.as_array())
        .ok_or_else(|| "no songs attribute".to_string())?;

    if songs.is_empty() {
        return Err("songs empty".to_string());
    }

    let song = &songs[0];

    let song_id = song["id"]
        .as_u64()
        .map(|id| id.to_string())
        .unwrap_or_else(|| "unknown id".to_string());

    let song_name = song["name"].as_str().unwrap_or("unknown").to_string();

    let artists = if let Some(artist_array) = song["ar"].as_array() {
        artist_array
            .iter()
            .filter_map(|artist| artist["name"].as_str().map(|s| s.to_string()))
            .collect()
    } else {
        vec!["unknown singer".to_string()]
    };

    let album = song["al"]["name"]
        .as_str()
        .unwrap_or("unknown album")
        .to_string();

    let duration = song["dt"].as_u64().unwrap_or(0);

    let pic_url = song["al"]["picUrl"].as_str().unwrap_or("").to_string();

    Ok(SongInfo {
        id: song_id.clone(),
        name: song_name,
        artists,
        album,
        duration,
        pic_url,
        file_hash: song_id,
    })
}

/// play online song by id
#[tauri::command]
pub async fn play_netease_song(id: String) -> Result<String, String> {
    get_song_url(id).await
}
