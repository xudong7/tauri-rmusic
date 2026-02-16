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
    if response.status().is_client_error() || response.status().is_server_error() {
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
    let response = get_response(client, url).await?;
    let text = get_text(response).await?;
    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| {
            let preview = if text.len() > 200 { &text[..200] } else { &text };
            format!("Serialize json error: {}, content: {}", e, preview)
        })?;
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
        let url = format!(
            "{}/search?keywords={}&type=1018&limit={}&offset=0",
            LOCAL_API_BASE, kw, artist_limit
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
    let songs_res = songs_res?;
    let artists = artists_res?;

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
