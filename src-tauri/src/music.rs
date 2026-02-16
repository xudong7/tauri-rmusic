use rodio::{Decoder, OutputStream, Sink, Source};
use serde::Serialize;
use std::fs::File;
use std::io::BufReader;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast::Sender;
use tokio::sync::{broadcast, Mutex};

use crate::netease;

#[derive(Serialize, Debug)]
pub struct PlaybackProgress {
    pub position_ms: u64,
    pub duration_ms: u64,
    pub is_ended: bool,
}

pub struct Music {
    pub event_sender: Sender<MusicState>,
    _stream: OutputStream,
    pub sink: Arc<Mutex<Sink>>,
    pub current_duration_ms: Arc<Mutex<u64>>,
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
        let duration_clone = Arc::new(Mutex::new(0u64));
        let duration_for_spawn = Arc::clone(&duration_clone);

        // spawn a thread to handle the music events
        tokio::spawn(async move {
            // receive events from the channel
            while let Ok(event) = event_receiver.recv().await {
                match event {
                    MusicState::Play(path) => {
                        {
                            let sink = sink_clone.lock().await;
                            sink.clear();
                        }
                        let duration_for_state = Arc::clone(&duration_for_spawn);
                        if path.starts_with("http://") || path.starts_with("https://") {
                            let sink_for_http = Arc::clone(&sink_clone);
                            let path_clone = path.clone();

                            match online_play(&path_clone, sink_for_http, duration_for_state).await {
                                Ok(_) => println!("Begin play online song: {}", path_clone),
                                Err(e) => eprintln!("Play online song error: {}", e),
                            }
                        } else {
                            match File::open(&path) {
                                Ok(file) => {
                                    let file = BufReader::new(file);
                                    match Decoder::new(file) {
                                        Ok(source) => {
                                            let total_dur = source.total_duration();
                                            let dur_ms = total_dur.map(|d: Duration| d.as_millis() as u64).unwrap_or(0);
                                            {
                                                let mut dur = duration_for_state.lock().await;
                                                *dur = dur_ms;
                                            }
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
                        // 使用平方曲线：人耳对响度接近对数感知，线性滑块在两端变化不明显。
                        // normalized^2 使低端更静、高端保持最大，滑块两端变化更明显。
                        let normalized = (volume / 100.0).clamp(0.0, 1.0);
                        let curved = normalized * normalized;
                        sink.set_volume(curved * 2.0);
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
            current_duration_ms: duration_clone,
        }
    }
}

async fn online_play(url: &str, sink: Arc<Mutex<Sink>>, duration: Arc<Mutex<u64>>) -> Result<(), String> {
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
    
    let total_dur = source.total_duration();
    let dur_ms = total_dur.map(|d: Duration| d.as_millis() as u64).unwrap_or(0);
    {
        let mut dur = duration.lock().await;
        *dur = dur_ms;
    }
    
    let sink_lock = sink.lock().await;
    sink_lock.append(source);
    if sink_lock.is_paused() {
        sink_lock.play();
    }

    Ok(())
}

#[tauri::command]
pub async fn get_progress(
    sink: tauri::State<'_, Arc<Mutex<Sink>>>,
    duration: tauri::State<'_, Arc<Mutex<u64>>>,
) -> Result<PlaybackProgress, String> {
    let sink = sink.lock().await;
    let position = sink.get_pos();
    let position_ms = position.as_millis() as u64;
    
    let duration_ms = *duration.lock().await;
    let is_ended = sink.empty() && position_ms > 0;
    
    Ok(PlaybackProgress {
        position_ms,
        duration_ms,
        is_ended,
    })
}

#[derive(Serialize, Debug)]
pub struct SeekResult {
    pub success: bool,
    pub should_play_next: bool,
}

#[tauri::command]
pub async fn seek_to(
    sink: tauri::State<'_, Arc<Mutex<Sink>>>,
    duration: tauri::State<'_, Arc<Mutex<u64>>>,
    position_ms: u64,
) -> Result<SeekResult, String> {
    let actual_duration = *duration.lock().await;
    if position_ms > actual_duration && actual_duration > 0 {
        return Ok(SeekResult {
            success: false,
            should_play_next: true,
        });
    }
    let sink = sink.lock().await;
    let duration = Duration::from_millis(position_ms);
    sink.try_seek(duration)
        .map_err(|e| format!("seek error: {:?}", e))?;
    Ok(SeekResult {
        success: true,
        should_play_next: false,
    })
}
