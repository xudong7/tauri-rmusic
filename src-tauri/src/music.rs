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
                                match online_play(&path_clone, sink_for_http).await {
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

async fn online_play(url: &str, sink: Arc<Mutex<Sink>>) -> Result<(), String> {
    println!("Downloading online song: {}", url);
    
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(30)) 
        .build()
        .map_err(|e| format!("create client error: {}", e))?;
    
    let max_retries = 3;
    let mut retry_count = 0;
    let mut last_error = String::from("unknown error");
    
    while retry_count < max_retries {
        match try_online_play(&client, url, Arc::clone(&sink)).await {
            Ok(_) => {
                if retry_count > 0 {
                    println!("after {} retries, download online song successfully", retry_count + 1);
                }
                return Ok(());
            },
            Err(e) => {
                retry_count += 1;
                last_error = e.to_string();
                println!("download online song error: {}, retrying {}/{}", last_error, retry_count, max_retries);
                
                tokio::time::sleep(std::time::Duration::from_millis(1000 * retry_count)).await;
            }
        }
    }
    
    Err(format!("download online song error: {}, after {} retries", last_error, max_retries))
}

async fn try_online_play(client: &reqwest::Client, url: &str, sink: Arc<Mutex<Sink>>) -> Result<(), String> {
    let response = client.get(url)
        .send()
        .await
        .map_err(|e| format!("request error: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("response status fail: {}", response.status()));
    }
    
    let bytes = response.bytes()
        .await
        .map_err(|e| format!("read response data error: {}", e))?;
    
    println!("download online song successfully, size: {} bytes", bytes.len());
    
    let cursor = std::io::Cursor::new(bytes);
    
    let source = match Decoder::new(cursor) {
        Ok(s) => s,
        Err(e) => {
            return Err(format!("decode online song error: {}", e));
        }
    };
    
    let mut sink_lock = match sink.try_lock() {
        Ok(lock) => lock,
        Err(_) => {
            return Err("cannot get lock".to_string());
        }
    };
    
    sink_lock.append(source);
    if sink_lock.is_paused() {
        sink_lock.play();
    }
    
    Ok(())
}
