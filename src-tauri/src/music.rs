use rodio::Decoder;
use rodio::OutputStream;
use rodio::Sink;
use serde::Serialize;
use std::fs::File;
use std::io::BufReader;
use std::sync::Arc;
use tokio::sync::broadcast::Sender;
use tokio::sync::{broadcast, Mutex};

use crate::netease;

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

                            // 直接在当前任务中处理在线播放，避免竞态条件
                            match online_play(&path_clone, sink_for_http).await {
                                Ok(_) => println!("Begin play online song: {}", path_clone),
                                Err(e) => eprintln!("Play online song error: {}", e),
                            }
                        } else {
                            // local file
                            match File::open(&path) {
                                Ok(file) => {
                                    let file = BufReader::new(file);
                                    match Decoder::new(file) {
                                        Ok(source) => {
                                            let sink = sink_clone.lock().await;
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

async fn online_play(url: &str, sink: Arc<Mutex<Sink>>) -> Result<(), String> {
    let client = netease::get_client()?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("request error: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("response status fail: {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("read response data error: {}", e))?;

    let cursor = std::io::Cursor::new(bytes);

    let source = match Decoder::new(cursor) {
        Ok(s) => s,
        Err(e) => {
            return Err(format!("decode online song error: {}", e));
        }
    };
    // 使用异步锁而不是 try_lock，确保一致性
    let sink_lock = sink.lock().await;
    sink_lock.append(source);
    if sink_lock.is_paused() {
        sink_lock.play();
    }

    Ok(())
}
