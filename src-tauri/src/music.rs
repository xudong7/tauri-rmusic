use reqwest;
use rodio::Decoder;
use rodio::OutputStream;
use rodio::Sink;
use serde::Serialize;
use std::fs::File;
use std::io::BufReader;
use std::sync::Arc;
use tokio::sync::broadcast::Sender;
use tokio::sync::{broadcast, Mutex};

pub struct Music {
    pub event_sender: Sender<MusicState>,
    _stream: OutputStream,
    pub sink: Arc<Mutex<Sink>>,
}

#[derive(Serialize, Debug)]
pub struct MusicFile {
    pub id: i32,
    pub file_name: String,
}

#[derive(Debug, Clone)]
pub enum MusicState {
    Play(String),
    Recovery,
    Pause,
    Volume(f32),
    Quit,
}

impl Music {
    pub fn new() -> Self {
        let (event_sender, mut event_receiver) = broadcast::channel(100);

        let (_stream, stream_handle) = OutputStream::try_default().unwrap();
        let sink = Arc::new(Mutex::new(Sink::try_new(&stream_handle).unwrap()));
        let sink_clone = Arc::clone(&sink);

        // spawn a thread to handle the music events
        tokio::spawn(async move {
            // receive events from the channel
            while let Ok(event) = event_receiver.recv().await {
                match event {
                    MusicState::Play(path) => {
                        // unlock the sink
                        {
                            let sink = sink_clone.lock().await;
                            sink.clear();
                        } 

                        // check if the path is a URL
                        if path.starts_with("http://") || path.starts_with("https://") {
                            let sink_for_http = Arc::clone(&sink_clone);
                            let path_clone = path.clone();

                            tokio::spawn(async move {
                                match download_and_play(&path_clone, sink_for_http).await {
                                    Ok(_) => println!("Begin play online song: {}", path_clone),
                                    Err(e) => eprintln!("Play online song error: {}", e),
                                }
                            });
                        } else {
                            // local file
                            match File::open(&path) {
                                Ok(file) => {
                                    let file = BufReader::new(file);
                                    match Decoder::new(file) {
                                        Ok(source) => {
                                            let mut sink = sink_clone.lock().await;
                                            sink.append(source);
                                            if sink.is_paused() {
                                                sink.play();
                                            }
                                        }
                                        Err(e) => eprintln!("Error: {}", e),
                                    }
                                }
                                Err(e) => eprintln!("Open file error: {} - {}", path, e),
                            }
                        }
                    }
                    MusicState::Recovery => {
                        let sink = sink_clone.lock().await;
                        sink.play();
                    }
                    MusicState::Pause => {
                        let sink = sink_clone.lock().await;
                        sink.pause();
                    }
                    MusicState::Volume(volume) => {
                        let sink = sink_clone.lock().await;
                        sink.set_volume(volume / 50.0);
                    }
                    MusicState::Quit => {
                        let sink = sink_clone.lock().await;
                        sink.stop();
                    }
                }
            }
        });

        Self {
            event_sender,
            _stream,
            sink,
        }
    }
}

// 下载并播放在线音频
async fn download_and_play(url: &str, sink: Arc<Mutex<Sink>>) -> Result<(), String> {
    println!("开始下载在线音频: {}", url);

    // 创建HTTP客户端
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("创建HTTP客户端失败: {}", e))?;

    // 发送HTTP请求获取音频数据
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("请求在线音频失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("获取在线音频失败，状态码: {}", response.status()));
    }

    // 获取响应体字节
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("读取响应数据失败: {}", e))?;

    // 将字节转换为游标
    let cursor = std::io::Cursor::new(bytes);

    // 解码音频
    let source = Decoder::new(cursor).map_err(|e| format!("解码在线音频失败: {}", e))?;

    // 获取sink并播放
    let mut sink_lock = sink.lock().await;
    sink_lock.append(source);
    if sink_lock.is_paused() {
        sink_lock.play();
    }

    Ok(())
}
