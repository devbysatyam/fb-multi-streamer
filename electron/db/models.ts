export interface Video {
    id: string;
    filename: string;
    path: string;
    title?: string;
    duration: number;
    resolution?: string;
    codec?: string;
    bitrate?: number;
    created_at: string;
    tags?: string; // JSON array
    thumbnail_path?: string;
}

export interface Page {
    id: string; // Facebook Page ID
    name: string;
    access_token_encrypted: string;
    access_token_nonce: string;
    category?: string;
    fan_count?: number;
    created_time?: string;
    is_eligible: number; // 0 or 1
    last_checked?: string;
}

export interface StreamJob {
    id: string;
    page_id: string;
    video_id: string;
    editing_profile_id?: string;
    title_template?: string;
    description_template?: string;
    scheduled_time?: string;
    status: 'queued' | 'starting' | 'live' | 'stopping' | 'stopped' | 'failed' | 'failed_recovery';
    priority: number;
    loop: number; // 0 or 1
    playlist?: string; // JSON array of video IDs
    first_comment?: string;
    recovery_attempts?: number;
    created_at: string;
}

export interface EditingProfile {
    id: string;
    name: string;
    data: string; // JSON string of ProfileData
    created_at: string;
}

export interface StreamSession {
    id: string;
    job_id: string;
    live_video_id?: string;
    stream_url?: string;
    stream_key?: string;
    started_at?: string;
    ended_at?: string;
    status: string;
    peak_viewers?: number;
    bitrate?: string;
    fps?: number;
    current_video_index?: number;
    comment_posted?: number; // 0 or 1
    error_log?: string;
}

export interface AppConfig {
    key: string;
    value: string;
}
