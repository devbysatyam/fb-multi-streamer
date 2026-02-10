import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import crypto from 'crypto';
import axios from 'axios';
import { dbManager } from '../db';
import type { StreamJob } from '../db/models';
import { FfmpegCommandBuilder } from './ffmpeg';
import { FacebookClient } from '../auth/facebook';
import { cryptoService } from '../auth/encryption';

export class StreamOrchestrator {
    private activeStreams: Map<string, ChildProcess> = new Map();
    private maxConcurrent: number = 5;
    private readonly MAX_API_FAILURES = 5;
    private readonly MAX_RECOVERY_ATTEMPTS = 3;

    constructor() {
        this.startLoop();
    }

    private startLoop() {
        setInterval(() => this.processQueue(), 5000);
        setInterval(() => this.pollViewerStats(), 30000); // Poll viewer counts every 30s
    }

    private async pollViewerStats() {
        const db = dbManager.getDb();
        const activeSessions = db.prepare(`
            SELECT s.*, q.page_id, q.first_comment 
            FROM stream_sessions s 
            JOIN stream_queue q ON s.job_id = q.id 

            WHERE s.status = 'live' AND s.started_at <= datetime('now', '-30 seconds')
        `).all() as any[];

        const appId = db.prepare("SELECT value FROM settings WHERE key = 'app_id'").get() as any;
        const appSecret = db.prepare("SELECT value FROM settings WHERE key = 'app_secret'").get() as any;

        if (!appId || !appSecret) return;
        const fb = new FacebookClient(appId.value, appSecret.value);

        for (const session of activeSessions) {
            try {
                const page = db.prepare("SELECT * FROM pages WHERE id = ?").get(session.page_id) as any;
                if (!page) continue;

                // 1. Viewer Count & Liveness Check
                const response = await this.withTokenRecovery(session.page_id, async (t) => {
                    const url = `https://graph.facebook.com/v24.0/${session.live_video_id}`;
                    return await axios.get(url, {
                        params: {
                            fields: 'live_views,status',
                            access_token: t
                        }
                    });
                }).catch(e => {
                    console.error(`FB Status Check failed for ${session.job_id}:`, e.message);
                    return null;
                });

                if (response) {
                    const viewers = response.data.live_views || 0;
                    const fbStatus = response.data.status;

                    // Reset failure count on success
                    db.prepare("UPDATE stream_sessions SET api_fail_count = 0 WHERE id = ?").run(session.id);

                    if (fbStatus !== 'LIVE' && fbStatus !== 'LIVE_NOW') {
                        console.log(`Stream ${session.job_id} on FB is ${fbStatus}. Terminating local orchestrator.`);
                        this.stopStream(session.job_id);
                        continue;
                    }

                    db.prepare("UPDATE stream_sessions SET peak_viewers = MAX(peak_viewers, ?) WHERE id = ?")
                        .run(viewers, session.id);
                } else {
                    // API call failed - increment failure counter
                    const currentFailCount = (session.api_fail_count || 0) + 1;
                    db.prepare("UPDATE stream_sessions SET api_fail_count = ? WHERE id = ?").run(currentFailCount, session.id);

                    if (currentFailCount >= this.MAX_API_FAILURES) {
                        console.warn(`Circuit breaker triggered for ${session.job_id} after ${currentFailCount} API failures.`);
                        db.prepare("UPDATE stream_queue SET status = 'circuit_breaker' WHERE id = ?").run(session.job_id);
                        this.stopStream(session.job_id);
                        continue;
                    }
                }

                // 2. Auto-Comment Logic (Wait 15s for FB propagation)
                if (session.first_comment && session.comment_posted === 0) {
                    const startedAt = new Date(session.started_at).getTime();
                    const now = Date.now();
                    const diffSeconds = (now - startedAt) / 1000;

                    if (diffSeconds > 15) {
                        try {
                            // Use VOD ID if available, otherwise fallback to Live ID (which might fail for comments)
                            const targetId = session.vod_video_id || session.live_video_id;
                            console.log(`Posting auto-comment for ${session.job_id} on target ${targetId}`);

                            const commentId = await this.withTokenRecovery(session.page_id, (t) => fb.postComment(targetId, t, session.first_comment));
                            console.log(`[Orchestrator] Posted auto-comment ${commentId} for stream ${session.job_id}`);

                            db.prepare("UPDATE stream_sessions SET comment_posted = 1 WHERE id = ?").run(session.id);
                        } catch (commentError: any) {
                            // If it's a 400, it might still be too early or permissions issue.
                            // We don't want to spam logs if it fails repeatedly.
                            // We can use api_fail_count or just log warning.
                            if (commentError.response?.status === 400) {
                                console.warn(`Auto-comment failed (400) for ${session.live_video_id}. Will retry later.`);
                                // Log the actual error data for debugging permissions/issues
                                console.warn('FB Error Response:', JSON.stringify(commentError.response.data || {}, null, 2));
                            } else {
                                console.error(`Failed to post comment for ${session.job_id}:`, commentError.message);
                            }
                        }
                    }
                }

            } catch (e: any) {
                console.error(`Error in pollViewerStats for ${session.id}:`, e.message);
            }
        }
    }

    /**
     * Executes an FB action with automatic token recovery.
     * If the action fails due to an expired token, it refreshes ALL page tokens 
     * using the user's long-lived token from settings and retries once.
     */
    private async withTokenRecovery<T>(pageId: string, action: (token: string) => Promise<T>): Promise<T> {
        const db = dbManager.getDb();
        const getPage = () => db.prepare("SELECT * FROM pages WHERE id = ?").get(pageId) as any;

        let page = getPage();
        if (!page) throw new Error(`Page ${pageId} not found in database`);

        let token = cryptoService.decrypt(page.access_token_encrypted, page.access_token_nonce, page.access_token_tag);

        try {
            return await action(token);
        } catch (e: any) {
            const errorMsg = e.response?.data?.error?.message || e.message;
            const isExpired = errorMsg?.includes('Session has expired') || errorMsg?.includes('Error validating access token');

            if (isExpired) {
                console.warn(`[Orchestrator] Token expired for page ${pageId}. Attempting recovery...`);

                // 1. Get User Token
                const dbAppId = db.prepare('SELECT value FROM settings WHERE key = ?').get('app_id') as any;
                const dbAppSecret = db.prepare('SELECT value FROM settings WHERE key = ?').get('app_secret') as any;
                const encToken = db.prepare('SELECT value FROM settings WHERE key = ?').get('user_token_encrypted') as any;
                const nonce = db.prepare('SELECT value FROM settings WHERE key = ?').get('user_token_nonce') as any;
                const tag = db.prepare('SELECT value FROM settings WHERE key = ?').get('user_token_tag') as any;

                if (!dbAppId || !dbAppSecret || !encToken) {
                    console.error('[Orchestrator] Recovery failed: No user credentials found in settings.');
                    throw e;
                }

                const userToken = cryptoService.decrypt(encToken.value, nonce.value, tag.value);
                const fb = new FacebookClient(dbAppId.value, dbAppSecret.value);

                try {
                    // 2. Refresh all page tokens
                    const freshPages = await fb.syncPageTokens(userToken);
                    console.log(`[Orchestrator] Refreshed ${freshPages.length} page tokens.`);

                    // 3. Update DB
                    const updateStmt = db.prepare(`
                        UPDATE pages SET 
                            access_token_encrypted = @enc, 
                            access_token_nonce = @nonce, 
                            access_token_tag = @tag 
                        WHERE id = @id
                    `);

                    let newToken = '';
                    for (const p of freshPages) {
                        const encrypted = cryptoService.encrypt(p.access_token);
                        updateStmt.run({
                            id: p.id,
                            enc: encrypted.ciphertext,
                            nonce: encrypted.nonce,
                            tag: encrypted.authTag
                        });
                        if (p.id === pageId) newToken = p.access_token;
                    }

                    if (!newToken) {
                        console.error(`[Orchestrator] Recovery failed: Page ${pageId} not found in user's fresh page list.`);
                        throw e;
                    }

                    // 4. Retry
                    console.log(`[Orchestrator] Retrying action for page ${pageId} with fresh token...`);
                    return await action(newToken);

                } catch (recoveryErr: any) {
                    console.error('[Orchestrator] Recovery process failed:', recoveryErr.message);
                    throw e; // Throw original error
                }
            }

            throw e;
        }
    }

    private async processQueue() {
        if (this.activeStreams.size >= this.maxConcurrent) return;

        const db = dbManager.getDb();
        const availableSlots = this.maxConcurrent - this.activeStreams.size;

        // Fetch jobs that are queued and scheduled_time is now or in the past
        const jobs = db.prepare(`
            SELECT * FROM stream_queue 
            WHERE status IN ('queued', 'failed_recovery') 
            AND (scheduled_time IS NULL OR scheduled_time <= CURRENT_TIMESTAMP)
            AND COALESCE(recovery_attempts, 0) < ?
            ORDER BY priority DESC, created_at ASC 
            LIMIT ?
        `).all(this.MAX_RECOVERY_ATTEMPTS, availableSlots) as StreamJob[];

        for (const job of jobs) {
            this.startStream(job);
        }
    }


    private async startStream(job: StreamJob, videoIndex: number = 0) {
        const db = dbManager.getDb();
        db.prepare("UPDATE stream_queue SET status = 'starting' WHERE id = ?").run(job.id);

        try {
            // 1. Get Data
            const page = db.prepare("SELECT * FROM pages WHERE id = ?").get(job.page_id) as any;
            const appId = db.prepare("SELECT value FROM settings WHERE key = 'app_id'").get() as any;
            const appSecret = db.prepare("SELECT value FROM settings WHERE key = 'app_secret'").get() as any;

            // Resolve current video from playlist if exists
            let videoId = job.video_id;
            const playlist = job.playlist ? JSON.parse(job.playlist) : null;
            if (playlist && Array.isArray(playlist)) {
                videoId = playlist[videoIndex % playlist.length];
            }

            const video = db.prepare("SELECT * FROM videos WHERE id = ?").get(videoId) as any;

            if (!page || !video || !appId || !appSecret) throw new Error('Missing stream components');

            const fb = new FacebookClient(appId.value, appSecret.value);

            // 2. Resolve Live Video (Reuse or Create) - we usually re-use the same stream_url for a single job sessions
            let liveVideoId: string;
            let vodVideoId: string | undefined;
            let stream_url: string;

            const existingSession = db.prepare("SELECT id, live_video_id, stream_url FROM stream_sessions WHERE job_id = ? AND (status IN ('live', 'failed', 'stopped')) ORDER BY started_at DESC LIMIT 1").get(job.id) as any;

            if (existingSession && (videoIndex > 0 || (job.recovery_attempts || 0) > 0)) {
                // We are in a pipeline OR recovering, reuse the existing broadcast object
                console.log(`[Orchestrator] Reusing existing live video ${existingSession.live_video_id} for job ${job.id}`);
                liveVideoId = existingSession.live_video_id;
                stream_url = existingSession.stream_url;
            } else {
                // New broadcast or starting over
                console.log(`[Orchestrator] Creating fresh live video for job ${job.id}`);
                const fbResult = await this.withTokenRecovery(page.id, (t) => fb.createLiveVideo(page.id, t, {
                    title: job.title_template || `Live: ${video.filename}`,
                    description: job.description_template || "Bulk Streamer Live"
                }));
                liveVideoId = fbResult.id;
                vodVideoId = fbResult.video_id; // Store the VOD ID specific for comments
                stream_url = fbResult.stream_url;
            }

            // 3. Build Command
            const builder = new FfmpegCommandBuilder(video.path);

            if (job.editing_profile_id) {
                const profile = db.prepare("SELECT * FROM editing_profiles WHERE id = ?").get(job.editing_profile_id) as any;
                if (profile) {
                    try {
                        const profileData = JSON.parse(profile.data);
                        builder.applyProfile(profileData);
                    } catch (e) {
                        console.error('Failed to parse editing profile data:', e);
                    }
                }
            }

            // ONLY loop if it's a single video AND loop is enabled
            // Pipelines (playlists) handle their own "looping" by restarting at 0
            const shouldLoopFfmpeg = (!playlist || playlist.length === 1) && job.loop === 1;
            const args = await builder.forStreaming(stream_url, shouldLoopFfmpeg);

            // 4. Spawn FFmpeg
            console.log(`[Orchestrator] Spawning FFmpeg for job ${job.id} with args:`, args.join(' '));
            const child = spawn('ffmpeg', args);
            this.activeStreams.set(job.id, child);

            // 5. Update/Create Session Record
            if (videoIndex === 0) {
                const sessionId = crypto.randomUUID();
                db.prepare(`
                    INSERT INTO stream_sessions (id, job_id, live_video_id, vod_video_id, stream_url, status, current_video_index, comment_posted)
                    VALUES (?, ?, ?, ?, ?, 'live', ?, 0)
                `).run(sessionId, job.id, liveVideoId, vodVideoId || null, stream_url, videoIndex);
            } else {
                db.prepare("UPDATE stream_sessions SET status = 'live', current_video_index = ? WHERE job_id = ?")
                    .run(videoIndex, job.id);
            }

            child.stderr.on('data', (data) => {
                const output = data.toString();
                const fpsMatch = output.match(/fps=\s*([\d.]+)/);
                const bitrateMatch = output.match(/bitrate=\s*([\d.kmb]+bits\/s)/);

                if (fpsMatch || bitrateMatch) {
                    const fps = fpsMatch ? parseFloat(fpsMatch[1]) : null;
                    const bitrate = bitrateMatch ? bitrateMatch[1] : null;

                    db.prepare("UPDATE stream_sessions SET fps = COALESCE(?, fps), bitrate = COALESCE(?, bitrate) WHERE job_id = ?")
                        .run(fps, bitrate, job.id);
                }
            });

            child.on('close', (code) => {
                this.activeStreams.delete(job.id);
                const currentJob = db.prepare("SELECT status, loop, playlist, recovery_attempts FROM stream_queue WHERE id = ?").get(job.id) as any;

                if (currentJob?.status === 'stopping') {
                    const finalStatus = 'stopped';
                    db.prepare("UPDATE stream_queue SET status = ? WHERE id = ?").run(finalStatus, job.id);
                    db.prepare("UPDATE stream_sessions SET status = ?, ended_at = CURRENT_TIMESTAMP WHERE job_id = ?")
                        .run(finalStatus, job.id);
                } else if (code === 0) {
                    // Success exit - check for next video in pipeline
                    const playlist = currentJob.playlist ? JSON.parse(currentJob.playlist) : null;
                    const hasPlaylist = Array.isArray(playlist) && playlist.length > 1;

                    if (hasPlaylist) {
                        const nextIndex = videoIndex + 1;
                        if (currentJob.loop === 2) {
                            // Loop One - restart the same video index
                            console.log(`Looping current video for job ${job.id} (Index: ${videoIndex})`);
                            this.startStream(job, videoIndex);
                        } else if (nextIndex < playlist.length) {
                            console.log(`Advancing to next video in playlist for job ${job.id} (Index: ${nextIndex})`);
                            this.startStream(job, nextIndex);
                        } else if (currentJob.loop === 1) {
                            console.log(`Playlist finished for job ${job.id}. Looping back to start.`);
                            this.startStream(job, 0);
                        } else {
                            // Pipeline done
                            db.prepare("UPDATE stream_queue SET status = 'stopped' WHERE id = ?").run(job.id);
                            db.prepare("UPDATE stream_sessions SET status = 'stopped', ended_at = CURRENT_TIMESTAMP WHERE job_id = ?")
                                .run(job.id);
                        }
                    } else if (currentJob.loop >= 1) {
                        // Single video loop (either 1 or 2)
                        this.startStream(job, 0);
                    } else {
                        // Single video done
                        db.prepare("UPDATE stream_queue SET status = 'stopped' WHERE id = ?").run(job.id);
                        db.prepare("UPDATE stream_sessions SET status = 'stopped', ended_at = CURRENT_TIMESTAMP WHERE job_id = ?")
                            .run(job.id);
                    }
                } else {
                    // Failure exit - increment recovery attempts
                    const currentAttempts = (currentJob.recovery_attempts || 0) + 1;
                    console.log(`Stream ${job.id} failed with code ${code}. Recovery attempt ${currentAttempts}/${this.MAX_RECOVERY_ATTEMPTS}.`);

                    if (currentAttempts >= this.MAX_RECOVERY_ATTEMPTS) {
                        db.prepare("UPDATE stream_queue SET status = 'failed', recovery_attempts = ? WHERE id = ?").run(currentAttempts, job.id);
                    } else {
                        db.prepare("UPDATE stream_queue SET status = 'failed_recovery', recovery_attempts = ? WHERE id = ?").run(currentAttempts, job.id);
                    }
                    db.prepare("UPDATE stream_sessions SET status = 'failed', error_log = ? WHERE job_id = ?")
                        .run(`Process exited with code ${code}`, job.id);
                }
            });

            db.prepare("UPDATE stream_queue SET status = 'live' WHERE id = ?").run(job.id);

        } catch (e: any) {
            console.error(`Stream failure ${job.id}:`, e);
            db.prepare("UPDATE stream_queue SET status = 'failed' WHERE id = ?").run(job.id);
            db.prepare("INSERT OR REPLACE INTO stream_sessions (id, job_id, status, error_log, ended_at) VALUES (?, ?, 'failed', ?, CURRENT_TIMESTAMP)")
                .run(job.id, job.id, e.message || String(e));
        }
    }

    public stopStream(jobId: string) {
        const db = dbManager.getDb();
        db.prepare("UPDATE stream_queue SET status = 'stopping' WHERE id = ?").run(jobId);

        const child = this.activeStreams.get(jobId);
        if (child) {
            child.kill('SIGTERM');
            // Status update happens in 'close' event
        } else {
            console.log(`[Orchestrator] Force stopping stream ${jobId} (no active process found)`);
            db.prepare("UPDATE stream_queue SET status = 'stopped' WHERE id = ?").run(jobId);
            db.prepare("UPDATE stream_sessions SET status = 'stopped', ended_at = CURRENT_TIMESTAMP WHERE job_id = ? AND status = 'live'")
                .run(jobId);
        }
    }

    public stopAllStreams() {
        console.log('[Orchestrator] Stopping ALL streams...');

        // 1. Stop all known active processes
        for (const jobId of this.activeStreams.keys()) {
            this.stopStream(jobId);
        }

        // 2. Clean up any 'live' or 'stopping' jobs in DB that aren't in memory
        // This handles "zombie" states where the app was restarted but DB says live
        const db = dbManager.getDb();
        const stuckJobs = db.prepare("SELECT id FROM stream_queue WHERE status IN ('live', 'stopping')").all() as { id: string }[];

        for (const job of stuckJobs) {
            if (!this.activeStreams.has(job.id)) {
                this.stopStream(job.id);
            }
        }
    }
}

export const streamOrchestrator = new StreamOrchestrator();
