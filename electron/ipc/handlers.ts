import { ipcMain, dialog, BrowserWindow } from 'electron';
import { dbManager } from '../db';
import { extractMetadata } from '../video/metadata';
import { generateThumbnail } from '../video/thumbnail';
import { FacebookClient } from '../auth/facebook';
import { cryptoService } from '../auth/encryption';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import type { Video } from '../db/models';
import path from 'path';
import si from 'systeminformation';
import { HardwareDetector } from '../streaming/hardware';

export function registerHandlers() {
    logger.info('Initializing IPC handlers in handlers.ts...');
    // Log handler for renderer debugging
    ipcMain.handle('log:message', async (_event, level: 'info' | 'error' | 'warn', ...args: any[]) => {
        const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
        if (level === 'error') {
            logger.error(`[Renderer] ${message}`);
        } else if (level === 'warn') {
            logger.warn(`[Renderer] ${message}`);
        } else {
            logger.info(`[Renderer] ${message}`);
        }
    });

    // Video Handlers
    ipcMain.handle('video:add', async (_event, filePath: string) => {
        try {
            const metadata = await extractMetadata(filePath);
            const videoId = uuidv4();
            const thumbPath = await generateThumbnail(filePath, videoId);

            const video: Video = {
                id: videoId,
                filename: path.basename(filePath),
                path: filePath,
                duration: metadata.duration || 0,
                resolution: metadata.resolution,
                codec: metadata.codec,
                bitrate: metadata.bitrate,
                created_at: new Date().toISOString(),
                thumbnail_path: thumbPath
            };

            const db = dbManager.getDb();
            const stmt = db.prepare(`
        INSERT INTO videos (id, filename, path, duration, resolution, codec, bitrate, created_at, thumbnail_path)
        VALUES (@id, @filename, @path, @duration, @resolution, @codec, @bitrate, @created_at, @thumbnail_path)
      `);
            stmt.run(video);

            return video;
        } catch (e: any) {
            console.error('Failed to add video:', e);
            throw new Error(e.message);
        }
    });

    ipcMain.handle('video:list', async () => {
        const db = dbManager.getDb();
        return db.prepare('SELECT * FROM videos ORDER BY created_at DESC').all();
    });

    // Auth & Settings Handlers
    ipcMain.handle('settings:save', async (_event, settings: { appId: string; appSecret: string; userToken: string }) => {
        const db = dbManager.getDb();

        // Exchange for long-lived token automatically (lasts ~60 days instead of ~1 hour)
        let tokenToSave = settings.userToken;
        try {
            console.log('[Auth] Attempting to exchange for long-lived token...');
            const fbClient = new FacebookClient(settings.appId, settings.appSecret);
            const longLivedResult = await fbClient.exchangeForLongLivedToken(settings.userToken);
            tokenToSave = longLivedResult.access_token;
            console.log(`[Auth] Successfully exchanged for long-lived token (expires in ${Math.round(longLivedResult.expires_in / 86400)} days)`);
        } catch (e: any) {
            // If exchange fails, the token might already be long-lived, use as-is
            console.warn('[Auth] Token exchange failed (may already be long-lived):', e.message);
        }

        const encryptedToken = cryptoService.encrypt(tokenToSave);

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('app_id', settings.appId);
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('app_secret', settings.appSecret);
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('user_token_encrypted', encryptedToken.ciphertext);
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('user_token_nonce', encryptedToken.nonce);
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('user_token_tag', encryptedToken.authTag);

        return { success: true };
    });

    ipcMain.handle('settings:get-all', async () => {
        const db = dbManager.getDb();
        const settings = db.prepare('SELECT * FROM settings').all() as any[];
        const result: any = {
            appId: '',
            appSecret: '',
            userToken: ''
        };

        settings.forEach(s => {
            if (s.key === 'app_id') result.appId = s.value;
            if (s.key === 'app_secret') result.appSecret = s.value;
            if (s.key === 'user_token_encrypted') result.userTokenEncrypted = s.value;
        });

        // Try to decrypt token if we have all parts
        const nonce = settings.find(s => s.key === 'user_token_nonce')?.value;
        const tag = settings.find(s => s.key === 'user_token_tag')?.value;

        if (result.userTokenEncrypted && nonce && tag) {
            try {
                result.userToken = cryptoService.decrypt(result.userTokenEncrypted, nonce, tag);
            } catch (e) {
                console.error('Failed to decrypt user token:', e);
            }
        }

        return result;
    });

    ipcMain.handle('auth:check', async () => {
        const db = dbManager.getDb();
        const token = db.prepare('SELECT value FROM settings WHERE key = ?').get('user_token_encrypted');
        return !!token;
    });

    async function getFacebookClient() {
        const db = dbManager.getDb();
        const dbAppId = db.prepare('SELECT value FROM settings WHERE key = ?').get('app_id') as any;
        const dbAppSecret = db.prepare('SELECT value FROM settings WHERE key = ?').get('app_secret') as any;

        if (!dbAppId || !dbAppSecret) throw new Error('Facebook App Credentials not configured.');

        return new FacebookClient(dbAppId.value, dbAppSecret.value);
    }



    ipcMain.handle('fb:fetch-pages', async (_event, credentials?: { appId: string; appSecret: string; userToken: string }) => {
        const db = dbManager.getDb();

        let appId, appSecret, userToken;

        if (credentials) {
            appId = credentials.appId;
            appSecret = credentials.appSecret;
            userToken = credentials.userToken;
        } else {
            const dbAppId = db.prepare('SELECT value FROM settings WHERE key = ?').get('app_id') as any;
            const dbAppSecret = db.prepare('SELECT value FROM settings WHERE key = ?').get('app_secret') as any;
            const encryptedToken = db.prepare('SELECT value FROM settings WHERE key = ?').get('user_token_encrypted') as any;
            const nonce = db.prepare('SELECT value FROM settings WHERE key = ?').get('user_token_nonce') as any;
            const tag = db.prepare('SELECT value FROM settings WHERE key = ?').get('user_token_tag') as any;

            if (!dbAppId || !dbAppSecret || !encryptedToken) throw new Error('Missing credentials');

            appId = dbAppId.value;
            appSecret = dbAppSecret.value;
            userToken = cryptoService.decrypt(encryptedToken.value, nonce.value, tag.value);
        }

        if (!appId || !appSecret || !userToken) throw new Error('Incomplete credentials');

        const fbClient = new FacebookClient(appId, appSecret);

        try {
            // Try to use the token directly first (if already long-lived)
            let accessToken = userToken;
            try {
                // Attempt to get user ID with current token
                await fbClient.getUserId(userToken);
                console.log('[FB Sync] Token is already valid, using directly.');
            } catch (_) {
                // Token might be short-lived, try exchange
                console.log('[FB Sync] Attempting token exchange...');
                const longLived = await fbClient.exchangeForLongLivedToken(userToken);
                accessToken = longLived.access_token;
            }

            const userId = await fbClient.getUserId(accessToken);
            const basicPages = await fbClient.getPages(userId, accessToken);
            const detailedPages: any[] = [];

            // Store pages in DB with eligibility check
            const insertPage = db.prepare(`
                INSERT OR REPLACE INTO pages (id, name, access_token_encrypted, access_token_nonce, access_token_tag, category, fan_count, followers_count, created_time, is_eligible, last_checked, picture_url)
                VALUES (@id, @name, @access_token_encrypted, @access_token_nonce, @access_token_tag, @category, @fan_count, @followers_count, @created_time, @is_eligible, @last_checked, @picture_url)
            `);

            for (const page of basicPages) {
                try {
                    const details = await fbClient.getPageDetails(page.id, page.access_token);
                    const fanCount = details.fan_count || 0;
                    const followersCount = details.followers_count || 0;
                    const createdTime = details.created_time;

                    const pictureUrl = details.picture?.data?.url;

                    let isEligible = 1; // Removed eligibility checker: all pages are eligible now.


                    const encPageToken = cryptoService.encrypt(page.access_token);
                    const pageData = {
                        id: page.id,
                        name: page.name,
                        access_token_encrypted: encPageToken.ciphertext,
                        access_token_nonce: encPageToken.nonce,
                        access_token_tag: encPageToken.authTag,
                        category: page.category,
                        fan_count: fanCount,
                        followers_count: followersCount,
                        created_time: createdTime,
                        is_eligible: isEligible,
                        last_checked: new Date().toISOString(),
                        picture_url: pictureUrl
                    };

                    insertPage.run(pageData);
                    detailedPages.push({ ...page, ...details, is_eligible: isEligible });
                } catch (err) {
                    console.error(`Failed to fetch details for page ${page.id}:`, err);
                    // Fallback to basic info with 0 eligibility if details fetch fails
                    const encPageToken = cryptoService.encrypt(page.access_token);
                    insertPage.run({
                        id: page.id,
                        name: page.name,
                        access_token_encrypted: encPageToken.ciphertext,
                        access_token_nonce: encPageToken.nonce,
                        access_token_tag: encPageToken.authTag,
                        category: page.category,
                        fan_count: 0,
                        followers_count: 0,
                        created_time: null,
                        is_eligible: 1,
                        last_checked: new Date().toISOString(),
                        picture_url: null
                    });
                    detailedPages.push({ ...page, is_eligible: 1, fan_count: 0, followers_count: 0 });
                }
            }

            return detailedPages;
        } catch (e: any) {
            console.error('FB Sync Error:', e);
            throw new Error(FacebookClient.extractError(e));
        }
    });

    ipcMain.handle('page:recheck-eligibility', async (_, pageId: string) => {
        const db = dbManager.getDb();
        const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(pageId) as any;

        if (!page) throw new Error('Page not found');

        const decryptToken = cryptoService.decrypt(
            page.access_token_encrypted,
            page.access_token_nonce,
            page.access_token_tag
        );

        const fbClient = await getFacebookClient();

        try {
            const details = await fbClient.getPageDetails(pageId, decryptToken);
            const fanCount = details.fan_count || 0;
            const followersCount = details.followers_count || 0;
            const createdTime = details.created_time;

            await fbClient.checkInsights(pageId, decryptToken);

            let isEligible = 1; // Always eligible now
            const pictureUrl = details.picture?.data?.url;

            db.prepare(`
                UPDATE pages SET 
                    fan_count = ?, 
                    followers_count = ?, 
                    created_time = ?, 
                    is_eligible = ?, 
                    last_checked = ?,
                    picture_url = ?
                WHERE id = ?
            `).run(fanCount, followersCount, createdTime, isEligible, new Date().toISOString(), pictureUrl, pageId);

            return { success: true, is_eligible: isEligible, fan_count: fanCount, followers_count: followersCount, picture_url: pictureUrl };
        } catch (e: any) {
            console.error('Eligibility Recheck Error:', e);
            throw new Error(FacebookClient.extractError(e));
        }
    });

    ipcMain.handle('page:list', async () => {
        const db = dbManager.getDb();
        return db.prepare('SELECT * FROM pages').all();
    });

    // System/Dialog Handlers
    ipcMain.handle('dialog:open-directory', async () => {
        return dialog.showOpenDialog({
            properties: ['openDirectory']
        });
    });

    ipcMain.handle('dialog:open-image', async () => {
        return dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [
                { name: 'Images', extensions: ['jpg', 'png', 'jpeg', 'bmp', 'webp'] }
            ]
        });
    });

    async function getFilesRecursively(dir: string, extensions: string[]): Promise<string[]> {
        const fs = await import('fs-extra');
        const results: string[] = [];
        const list = await fs.readdir(dir, { withFileTypes: true });

        for (const dirent of list) {
            const res = path.resolve(dir, dirent.name);
            if (dirent.isDirectory()) {
                results.push(...(await getFilesRecursively(res, extensions)));
            } else {
                const ext = path.extname(dirent.name).toLowerCase();
                if (extensions.includes(ext)) {
                    results.push(res);
                }
            }
        }
        return results;
    }

    ipcMain.handle('video:scan-folder', async (_event, folderPath: string) => {
        const db = dbManager.getDb();
        const videoExts = ['.mp4', '.mkv', '.mov', '.avi', '.flv', '.webm', '.wmv', '.m4v'];

        try {
            const allFilePaths = await getFilesRecursively(folderPath, videoExts);
            const videos: Video[] = [];

            _event.sender.send('video:scan-progress', { current: 0, total: allFilePaths.length, status: 'starting' });

            // Process in batches to avoid overwhelming the system
            const BATCH_SIZE = 5;
            for (let i = 0; i < allFilePaths.length; i += BATCH_SIZE) {
                const batch = allFilePaths.slice(i, i + BATCH_SIZE);

                _event.sender.send('video:scan-progress', {
                    current: i,
                    total: allFilePaths.length,
                    status: `Processing files ${i + 1} to ${Math.min(i + BATCH_SIZE, allFilePaths.length)}`
                });

                const batchResults = await Promise.all(batch.map(async (filePath) => {
                    try {
                        // Check if already in DB
                        const existing = db.prepare('SELECT id FROM videos WHERE path = ?').get(filePath);
                        if (existing) return null;

                        const metadata = await extractMetadata(filePath);
                        const videoId = uuidv4();
                        const thumbPath = await generateThumbnail(filePath, videoId);

                        const video: Video = {
                            id: videoId,
                            filename: path.basename(filePath),
                            path: filePath,
                            duration: metadata.duration || 0,
                            resolution: metadata.resolution,
                            codec: metadata.codec,
                            bitrate: metadata.bitrate,
                            created_at: new Date().toISOString(),
                            thumbnail_path: thumbPath
                        };

                        db.prepare(`
                            INSERT INTO videos (id, filename, path, duration, resolution, codec, bitrate, created_at, thumbnail_path)
                            VALUES (@id, @filename, @path, @duration, @resolution, @codec, @bitrate, @created_at, @thumbnail_path)
                        `).run(video);

                        return video;
                    } catch (e) {
                        console.error(`Failed to process ${filePath}:`, e);
                        return null;
                    }
                }));

                videos.push(...batchResults.filter((v): v is Video => v !== null));
            }

            _event.sender.send('video:scan-progress', { current: allFilePaths.length, total: allFilePaths.length, status: 'completed' });

            return videos;
        } catch (e: any) {
            console.error('Scan error:', e);
            throw e;
        }
    });

    ipcMain.handle('video:delete', async (_event, videoId: string) => {
        const db = dbManager.getDb();
        const fs = await import('fs-extra');

        // Get thumbnail path before deleting from DB
        const video = db.prepare('SELECT thumbnail_path FROM videos WHERE id = ?').get(videoId) as { thumbnail_path: string } | undefined;

        if (video?.thumbnail_path) {
            try {
                if (await fs.pathExists(video.thumbnail_path)) {
                    await fs.remove(video.thumbnail_path);
                }
            } catch (e) {
                console.error('Failed to remove thumbnail:', video.thumbnail_path);
            }
        }

        db.transaction(() => {
            // Manually delete related records in order
            db.prepare('DELETE FROM stream_sessions WHERE job_id IN (SELECT id FROM stream_queue WHERE video_id = ?)').run(videoId);
            db.prepare('DELETE FROM stream_queue WHERE video_id = ?').run(videoId);
            db.prepare('DELETE FROM videos WHERE id = ?').run(videoId);
        })();

        return { success: true };
    });

    ipcMain.handle('video:clear-library', async () => {
        const db = dbManager.getDb();
        const videos = db.prepare('SELECT id, thumbnail_path FROM videos').all() as { id: string, thumbnail_path: string }[];

        const fs = await import('fs-extra');
        for (const video of videos) {
            if (video.thumbnail_path) {
                try {
                    const tPath = video.thumbnail_path;
                    if (await fs.pathExists(tPath)) {
                        await fs.remove(tPath);
                    }
                } catch (e) {
                    // Ignore missing files
                }
            }
        }

        db.transaction(() => {
            db.prepare('DELETE FROM stream_sessions').run();
            db.prepare('DELETE FROM stream_queue').run();
            db.prepare('DELETE FROM videos').run();
        })();

        return { success: true };
    });

    ipcMain.handle('stream:list', async () => {
        const db = dbManager.getDb();
        return db.prepare(`
            SELECT q.*, p.name as page_name, v.filename as video_name, s.status as session_status, s.peak_viewers, s.bitrate, s.fps, s.error_log
            FROM stream_queue q
            JOIN pages p ON q.page_id = p.id
            JOIN videos v ON q.video_id = v.id
            LEFT JOIN stream_sessions s ON q.id = s.job_id
            ORDER BY q.created_at DESC
            LIMIT 50
        `).all();
    });

    ipcMain.handle('stream:create', async (_event, { pageIds, videoIds, editingProfileId, titleTemplate, descriptionTemplate, firstComment, scheduledTime, loop }: { pageIds: string[], videoIds: string[], editingProfileId?: string, titleTemplate?: string, descriptionTemplate?: string, firstComment?: string, scheduledTime?: string, loop?: number }) => {
        const db = dbManager.getDb();
        const insertJob = db.prepare(`
            INSERT INTO stream_queue (id, page_id, video_id, editing_profile_id, title_template, description_template, first_comment, scheduled_time, status, priority, loop, playlist, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', 1, ?, ?, ?)
        `);

        db.transaction((pIds: string[], vIds: string[], eid?: string, tt?: string, dt?: string, fc?: string, st?: string, lp?: number) => {
            const now = new Date().toISOString();
            const loopVal = lp ?? 1; // Default to Loop All (1) if not provided
            const playlistJson = vIds.length > 1 ? JSON.stringify(vIds) : null;
            const primaryVideoId = vIds[0];

            for (const pageId of pIds) {
                insertJob.run(uuidv4(), pageId, primaryVideoId, eid || null, tt || null, dt || null, fc || null, st || null, loopVal, playlistJson, now);
            }
        })(pageIds, videoIds, editingProfileId, titleTemplate, descriptionTemplate, firstComment, scheduledTime, loop);

        return { success: true, count: pageIds.length };
    });

    ipcMain.handle('stream:stop', async (_event, jobId: string) => {
        const { streamOrchestrator } = await import('../streaming/orchestrator');
        streamOrchestrator.stopStream(jobId);
        return { success: true };
    });

    ipcMain.handle('stream:stop-all', async () => {
        const { streamOrchestrator } = await import('../streaming/orchestrator');
        streamOrchestrator.stopAllStreams();
        return { success: true };
    });

    ipcMain.handle('stream:restart', async (_event, jobId: string) => {
        const db = dbManager.getDb();
        db.prepare("UPDATE stream_queue SET status = 'queued', scheduled_time = CURRENT_TIMESTAMP WHERE id = ?").run(jobId);
        return { success: true };
    });

    ipcMain.handle('system:reset-db', async () => {
        const db = dbManager.getDb();
        db.transaction(() => {
            db.prepare('DELETE FROM stream_sessions').run();
            db.prepare('DELETE FROM stream_queue').run();
            db.prepare('DELETE FROM pages').run();
            db.prepare('DELETE FROM videos').run();
            db.prepare('DELETE FROM editing_profiles').run();
            db.prepare('DELETE FROM settings').run();
        })();
        return { success: true };
    });

    ipcMain.handle('stream:update-metadata', async (_event, { jobId, title, description }: { jobId: string, title?: string, description?: string }) => {
        const db = dbManager.getDb();
        const session = db.prepare("SELECT * FROM stream_sessions WHERE job_id = ? AND status = 'live'").get(jobId) as any;
        if (!session) throw new Error('No active session found for this job');

        const page = db.prepare("SELECT * FROM pages WHERE id = (SELECT page_id FROM stream_queue WHERE id = ?)").get(jobId) as any;
        const appId = db.prepare("SELECT value FROM settings WHERE key = 'app_id'").get() as any;
        const appSecret = db.prepare("SELECT value FROM settings WHERE key = 'app_secret'").get() as any;

        if (!page || !appId || !appSecret) throw new Error('Missing configuration components');

        const token = cryptoService.decrypt(page.access_token_encrypted, page.access_token_nonce, page.access_token_tag);
        const fb = new FacebookClient(appId.value, appSecret.value);

        await fb.updateLiveVideo(session.live_video_id, token, { title, description });

        // Update database templates for future restarts
        db.prepare("UPDATE stream_queue SET title_template = COALESCE(?, title_template), description_template = COALESCE(?, description_template) WHERE id = ?")
            .run(title || null, description || null, jobId);

        return { success: true };
    });

    // Editing Profile Handlers
    ipcMain.handle('profile:list', async () => {
        const db = dbManager.getDb();
        return db.prepare('SELECT * FROM editing_profiles ORDER BY created_at DESC').all();
    });

    ipcMain.handle('profile:save', async (_event, profile: { id?: string, name: string, data: any }) => {
        const db = dbManager.getDb();
        const id = profile.id || uuidv4();
        db.prepare('INSERT OR REPLACE INTO editing_profiles (id, name, data, created_at) VALUES (?, ?, ?, ?)')
            .run(id, profile.name, JSON.stringify(profile.data), new Date().toISOString());
        return { id };
    });

    ipcMain.handle('profile:delete', async (_event, id: string) => {
        const db = dbManager.getDb();
        db.prepare('DELETE FROM editing_profiles WHERE id = ?').run(id);
        return { success: true };
    });

    // Brand Kit Handlers
    ipcMain.handle('brand:list', async () => {
        const db = dbManager.getDb();
        return db.prepare('SELECT * FROM brand_kits ORDER BY created_at DESC').all();
    });

    // Window Control Handlers
    ipcMain.handle('window:minimize', async (event) => {
        logger.info('Window minimize requested');
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) win.minimize();
    });

    ipcMain.handle('window:maximize', async (event) => {
        logger.info('Window maximize/restore requested');
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
            if (win.isMaximized()) {
                win.unmaximize();
            } else {
                win.maximize();
            }
        }
    });

    ipcMain.handle('window:close', async (event) => {
        logger.info('Window close requested');
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) win.close();
    });

    ipcMain.handle('brand:save', async (_event, kit: any) => {
        const db = dbManager.getDb();
        const id = kit.id || uuidv4();
        // default values handled by DB if undefined, but good to sanitise
        const colors = kit.colors ? JSON.stringify(kit.colors) : null;

        db.prepare(`
            INSERT OR REPLACE INTO brand_kits (id, name, logo_path, logo_position, logo_opacity, logo_scale, colors, created_at)
            VALUES (@id, @name, @logo_path, @logo_position, @logo_opacity, @logo_scale, @colors, @created_at)
        `).run({
            id,
            name: kit.name,
            logo_path: kit.logo_path || null,
            logo_position: kit.logo_position || 'BR',
            logo_opacity: kit.logo_opacity ?? 1.0,
            logo_scale: kit.logo_scale ?? 0.15,
            colors,
            created_at: new Date().toISOString()
        });
        return { id };
    });

    ipcMain.handle('brand:delete', async (_event, id: string) => {
        const db = dbManager.getDb();
        db.prepare('DELETE FROM brand_kits WHERE id = ?').run(id);
        return { success: true };
    });

    // ==================== GRANULAR CLEANUP HANDLERS ====================

    ipcMain.handle('system:reset-streams', async () => {
        const db = dbManager.getDb();
        const { streamOrchestrator } = await import('../streaming/orchestrator');
        streamOrchestrator.stopAllStreams();
        db.exec("DELETE FROM stream_sessions");
        db.exec("DELETE FROM stream_queue");
        return { success: true, message: 'Stream history cleared' };
    });

    ipcMain.handle('system:reset-videos', async () => {
        const db = dbManager.getDb();
        db.exec("DELETE FROM videos");
        return { success: true, message: 'Video library cleared' };
    });

    ipcMain.handle('system:reset-pages', async () => {
        const db = dbManager.getDb();
        db.exec("DELETE FROM pages");
        return { success: true, message: 'Saved pages cleared' };
    });

    ipcMain.handle('system:reset-profiles', async () => {
        const db = dbManager.getDb();
        db.exec("DELETE FROM editing_profiles");
        return { success: true, message: 'Editing profiles cleared' };
    });

    ipcMain.handle('system:reset-all-keep-credentials', async () => {
        const db = dbManager.getDb();
        const { streamOrchestrator } = await import('../streaming/orchestrator');
        streamOrchestrator.stopAllStreams();
        db.exec("DELETE FROM stream_sessions");
        db.exec("DELETE FROM stream_queue");
        db.exec("DELETE FROM videos");
        db.exec("DELETE FROM pages");
        db.exec("DELETE FROM editing_profiles");
        // Keep settings table (app_id, app_secret, tokens)
        return { success: true, message: 'All data cleared except credentials' };
    });

    // NEW: Reset content only - keeps credentials AND pages
    ipcMain.handle('system:reset-content-only', async () => {
        const db = dbManager.getDb();
        const { streamOrchestrator } = await import('../streaming/orchestrator');
        streamOrchestrator.stopAllStreams();
        db.exec("DELETE FROM stream_sessions");
        db.exec("DELETE FROM stream_queue");
        db.exec("DELETE FROM videos");
        db.exec("DELETE FROM editing_profiles");
        // Keep settings AND pages
        return { success: true, message: 'Content cleared (credentials and pages kept)' };
    });

    ipcMain.handle('system:get-stats', async () => {
        const db = dbManager.getDb();
        const videoCount = (db.prepare("SELECT COUNT(*) as count FROM videos").get() as any).count;
        const pageCount = (db.prepare("SELECT COUNT(*) as count FROM pages").get() as any).count;
        const profileCount = (db.prepare("SELECT COUNT(*) as count FROM editing_profiles").get() as any).count;
        const streamCount = (db.prepare("SELECT COUNT(*) as count FROM stream_queue").get() as any).count;
        const activeStreams = (db.prepare("SELECT COUNT(*) as count FROM stream_queue WHERE status = 'live'").get() as any).count;
        return { videoCount, pageCount, profileCount, streamCount, activeStreams };
    });

    ipcMain.handle('resource:stats', async () => {
        try {
            const [cpu, mem, graphics] = await Promise.all([
                si.currentLoad(),
                si.mem(),
                si.graphics()
            ]);

            const hwInfo = await HardwareDetector.getHardwareInfo();

            return {
                cpu: {
                    load: cpu.currentLoad,
                    model: hwInfo.cpu
                },
                memory: {
                    used: mem.active,
                    total: mem.total,
                    percent: (mem.active / mem.total) * 100
                },
                gpus: graphics.controllers.map(g => ({
                    model: g.model,
                    vendor: g.vendor,
                    vram: g.vram,
                    vramUsed: g.vramDynamic ? g.vram : 0,
                    load: g.utilizationGpu || 0
                })),
                encoders: hwInfo.encoders
            };
        } catch (e) {
            console.error('Failed to fetch resource stats:', e);
            return null;
        }
    });
}
