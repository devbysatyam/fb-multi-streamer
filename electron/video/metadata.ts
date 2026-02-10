import ffmpeg from 'fluent-ffmpeg';
// import fs from 'fs-extra';
import type { Video } from '../db/models';
import path from 'path';

// Ensure ffmpeg path is set (you might need to bundle ffmpeg-static or require user to have it in PATH)
// For now assuming PATH

export async function extractMetadata(filePath: string): Promise<Partial<Video>> {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err: any, metadata: any) => {
            if (err) return reject(err);

            const stream = metadata.streams.find((s: any) => s.codec_type === 'video');
            // const audioStream = metadata.streams.find((s: any) => s.codec_type === 'audio');
            const format = metadata.format;

            if (!stream) return reject(new Error('No video stream found'));

            const videoData: Partial<Video> = {
                filename: path.basename(filePath),
                path: filePath,
                duration: format.duration || 0,
                resolution: `${stream.width}x${stream.height}`,
                codec: stream.codec_name,
                bitrate: format.bit_rate,
                created_at: new Date().toISOString(),
            };

            resolve(videoData);
        });
    });
}
