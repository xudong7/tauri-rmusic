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
                let sink = sink_clone.lock().await;
                match event {
                    MusicState::Play(path) => {
                        let file = BufReader::new(File::open(path).unwrap());
                        let source = Decoder::new(file).unwrap();
                        sink.clear();
                        if sink.is_paused() {
                            sink.append(source);
                            sink.play();
                        }
                    }
                    MusicState::Recovery => {
                        sink.play();
                    }
                    MusicState::Pause => {
                        sink.pause();
                    }
                    MusicState::Volume(volume) => {
                        sink.set_volume(volume / 50.0);
                    }
                    MusicState::Quit => {
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
