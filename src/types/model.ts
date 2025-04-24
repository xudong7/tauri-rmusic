export interface MusicFile {
    id: string;
    file_name: string;
    // online song need these fields
    artists?: string[];
    album?: String,
    duration?: number, // duration in seconds
    pic_url?: String,
    file_hash?: String, // file hash for the song
}