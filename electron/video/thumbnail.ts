import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import { app } from 'electron';
import fs from 'fs-extra';

export async function generateThumbnail(videoPath: string, videoId: string): Promise<string> {
    const userDataPath = app.getPath('userData');
    const thumbDir = path.join(userDataPath, 'thumbnails');
    const filename = `${videoId}.png`;
    const thumbPath = path.join(thumbDir, filename);

    fs.ensureDirSync(thumbDir);

    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .screenshots({
                timestamps: ['10%'], // Capture at 10% of duration
                filename: filename,
                folder: thumbDir,
                size: '320x180',
            })
            .on('end', () => {
                resolve(thumbPath);
            })
            .on('error', (err: any) => {
                reject(err);
            });
    });
}
