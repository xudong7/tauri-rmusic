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
        .map_err(|e| format!("API请求失败: {}", e))?;
    if response.status().is_client_error() {
        return Err(format!("API请求失败: HTTP {}", response.status()));
    }
    Ok(response)
}

/// get response text
async fn get_text(response: reqwest::Response) -> Result<String, String> {
    let text = response
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {}", e))?;
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
        .map_err(|e| format!("解析JSON失败: {}，内容: {}", e, &text[..200]))?;
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
            .unwrap_or("未知错误");
        return Err(format!("API返回错误: {}", error_msg));
    }

    let data = response_json
        .get("data")
        .ok_or_else(|| "响应中没有data字段".to_string())?;

    let songs_value = data
        .get("lists")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "没有找到歌曲数据".to_string())?;

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
        let song_name = song["OriSongName"].as_str().unwrap_or("未知").to_string();

        let artists = if let Some(singers_array) = song["Singers"].as_array() {
            singers_array
                .iter()
                .filter_map(|singer| singer["name"].as_str().map(|s| s.to_string()))
                .collect()
        } else {
            let singer_name = song["SingerName"].as_str().unwrap_or("未知歌手");
            vec![singer_name.to_string()]
        };

        let album = song["AlbumName"].as_str().unwrap_or("未知专辑").to_string();

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

// 获取歌曲URL和详细信息
#[tauri::command]
pub async fn get_song_url(id: String) -> Result<String, String> {
    let client = get_client()?;

    // 构建请求URL - 使用file_hash获取歌曲URL
    let url = format!("{}/song/url/new?hash={}", LOCAL_API_BASE, id);

    println!("获取歌曲URL: {}", url);

    let response_json: serde_json::Value = get_response_json(client, url).await?;

    // 检查API错误码
    let error_code = response_json
        .get("error_code")
        .and_then(|v| v.as_u64())
        .unwrap_or(1);
    if error_code != 0 {
        let error_msg = response_json
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("未知错误");
        return Err(format!("API返回错误: {}", error_msg));
    }

    // 获取歌曲数据
    let data = response_json
        .get("data")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "响应中没有data数组字段".to_string())?;

    if data.is_empty() {
        return Err("歌曲数据为空".to_string());
    }

    // 获取第一个数据项
    let song_data = &data[0];

    // 检查歌曲错误信息
    let errno = song_data
        .get("_errno")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    if errno != 0 {
        let msg = song_data
            .get("_msg")
            .and_then(|v| v.as_str())
            .unwrap_or("获取歌曲失败");
        return Err(format!("歌曲获取错误: {}", msg));
    }

    // 获取歌曲信息
    let info = song_data
        .get("info")
        .ok_or_else(|| "歌曲数据中没有info字段".to_string())?;

    // 优先获取tracker_url (完整歌曲URL)
    if let Some(tracker_urls) = info.get("tracker_url").and_then(|u| u.as_array()) {
        if !tracker_urls.is_empty() {
            if let Some(play_url) = tracker_urls[0].as_str() {
                if !play_url.is_empty() {
                    println!("使用tracker_url获取完整歌曲");
                    return Ok(play_url.to_string());
                }
            }
        }
    }

    // 如果没有tracker_url或为空，尝试获取climax_info.url
    let climax_info = info
        .get("climax_info")
        .ok_or_else(|| "歌曲数据中没有climax_info字段".to_string())?;

    // 获取URL数组
    let urls = climax_info
        .get("url")
        .and_then(|u| u.as_array())
        .ok_or_else(|| "歌曲数据中没有url数组".to_string())?;

    if urls.is_empty() {
        return Err("歌曲URL列表为空".to_string());
    }

    // 获取第一个URL
    let play_url = urls[0]
        .as_str()
        .ok_or_else(|| "URL不是有效的字符串".to_string())?;

    if play_url.is_empty() {
        return Err("歌曲播放地址为空".to_string());
    }

    println!("使用climax_info.url获取歌曲片段");
    Ok(play_url.to_string())
}

// 获取歌曲详情
#[tauri::command]
pub async fn get_song_detail(id: String) -> Result<SongInfo, String> {
    let client = get_client()?;

    let url = format!("{}/song/detail?ids={}", LOCAL_API_BASE, id);

    println!("获取歌曲详情: {}", url);

    // 解析JSON
    let response_json: serde_json::Value = get_response_json(client, url).await?;

    // 解析歌曲详情
    let songs = response_json
        .get("songs")
        .and_then(|s| s.as_array())
        .ok_or_else(|| "响应中没有songs字段".to_string())?;

    if songs.is_empty() {
        return Err("歌曲详情为空".to_string());
    }

    let song = &songs[0];

    let song_id = song["id"]
        .as_u64()
        .map(|id| id.to_string())
        .unwrap_or_else(|| "未知ID".to_string());

    let song_name = song["name"].as_str().unwrap_or("未知").to_string();

    // 解析歌手信息
    let artists = if let Some(artist_array) = song["ar"].as_array() {
        artist_array
            .iter()
            .filter_map(|artist| artist["name"].as_str().map(|s| s.to_string()))
            .collect()
    } else {
        vec!["未知歌手".to_string()]
    };

    // 专辑信息
    let album = song["al"]["name"]
        .as_str()
        .unwrap_or("未知专辑")
        .to_string();

    // 时长
    let duration = song["dt"].as_u64().unwrap_or(0);

    // 图片链接
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

// 播放歌曲
#[tauri::command]
pub async fn play_netease_song(id: String) -> Result<String, String> {
    get_song_url(id).await
}
