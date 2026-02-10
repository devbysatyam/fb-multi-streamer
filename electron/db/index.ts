import type { Database as SqliteDatabase } from 'better-sqlite3';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const DatabaseConstructor = require('better-sqlite3');
import path from 'path';
import { app } from 'electron';
import fs from 'fs-extra';

const DB_NAME = 'database.db';

export class DatabaseManager {
  private db: SqliteDatabase;

  constructor() {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, DB_NAME);

    // Ensure directory exists
    fs.ensureDirSync(userDataPath);

    this.db = new DatabaseConstructor(dbPath);
    this.db.pragma('foreign_keys = ON'); // Enable FK support
    this.initSchema();
  }

  private initSchema() {
    // Videos Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS videos (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        path TEXT NOT NULL,
        title TEXT,
        duration INTEGER,
        resolution TEXT,
        codec TEXT,
        bitrate INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        tags TEXT,
        thumbnail_path TEXT
      );
    `);

    // Pages Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pages (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        access_token_encrypted TEXT NOT NULL,
        access_token_nonce TEXT NOT NULL,
        access_token_tag TEXT NOT NULL,
        category TEXT,
        fan_count INTEGER,
        followers_count INTEGER,
        created_time TIMESTAMP,
        last_checked TIMESTAMP,
        picture_url TEXT
      );
    `);

    // Basic Migration check for pages table
    const tableInfo = this.db.prepare("PRAGMA table_info(pages)").all() as any[];
    const columns = tableInfo.map(c => c.name);

    if (!columns.includes('access_token_tag')) {
      this.db.exec("ALTER TABLE pages ADD COLUMN access_token_tag TEXT NOT NULL DEFAULT ''");
    }

    if (!columns.includes('followers_count')) {
      this.db.exec("ALTER TABLE pages ADD COLUMN followers_count INTEGER DEFAULT 0");
    }

    if (!columns.includes('picture_url')) {
      this.db.exec("ALTER TABLE pages ADD COLUMN picture_url TEXT");
    }

    // NEW: Editing Profiles
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS editing_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        data TEXT NOT NULL, -- JSON string of ProfileData
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // NEW: Brand Kits
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS brand_kits (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        logo_path TEXT,
        logo_position TEXT DEFAULT 'BR', -- TR, TL, BR, BL
        logo_opacity REAL DEFAULT 1.0,
        logo_scale REAL DEFAULT 0.15,
        colors TEXT, -- JSON { primary, secondary }
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Stream Queue
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS stream_queue (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL,
        video_id TEXT NOT NULL,
        editing_profile_id TEXT,
        title_template TEXT,
        description_template TEXT,
        scheduled_time TIMESTAMP,
        status TEXT DEFAULT 'queued',
        priority INTEGER DEFAULT 1,
        loop INTEGER DEFAULT 1, -- 1 for true, 0 for false
        playlist TEXT,         -- JSON array of video IDs
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(page_id) REFERENCES pages(id) ON DELETE CASCADE,
        FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE,
        FOREIGN KEY(editing_profile_id) REFERENCES editing_profiles(id) ON DELETE SET NULL
      );
    `);

    // Migration for stream_queue to add editing_profile_id if missing
    const queueInfo = this.db.prepare("PRAGMA table_info(stream_queue)").all() as any[];
    const queueCols = queueInfo.map(c => c.name);
    if (!queueCols.includes('editing_profile_id')) {
      this.db.exec("ALTER TABLE stream_queue ADD COLUMN editing_profile_id TEXT");
    }
    if (!queueCols.includes('loop')) {
      this.db.exec("ALTER TABLE stream_queue ADD COLUMN loop INTEGER DEFAULT 1");
    }
    if (!queueCols.includes('playlist')) {
      this.db.exec("ALTER TABLE stream_queue ADD COLUMN playlist TEXT");
    }
    if (!queueCols.includes('first_comment')) {
      this.db.exec("ALTER TABLE stream_queue ADD COLUMN first_comment TEXT");
    }
    if (!queueCols.includes('recovery_attempts')) {
      this.db.exec("ALTER TABLE stream_queue ADD COLUMN recovery_attempts INTEGER DEFAULT 0");
    }

    // Stream Sessions
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS stream_sessions (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        live_video_id TEXT,
        stream_url TEXT,
        stream_key TEXT,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP,
        status TEXT,
        peak_viewers INTEGER,
        bitrate TEXT,
        fps REAL,
        error_log TEXT,
        FOREIGN KEY(job_id) REFERENCES stream_queue(id) ON DELETE CASCADE
      );
    `);

    // Migration for stream_sessions
    const sessionInfo = this.db.prepare("PRAGMA table_info(stream_sessions)").all() as any[];
    const sessionCols = sessionInfo.map(c => c.name);
    if (!sessionCols.includes('bitrate')) {
      this.db.exec("ALTER TABLE stream_sessions ADD COLUMN bitrate TEXT");
    }
    if (!sessionCols.includes('fps')) {
      this.db.exec("ALTER TABLE stream_sessions ADD COLUMN fps REAL");
    }
    if (!sessionCols.includes('current_video_index')) {
      this.db.exec("ALTER TABLE stream_sessions ADD COLUMN current_video_index INTEGER DEFAULT 0");
    }
    if (!sessionCols.includes('comment_posted')) {
      this.db.exec("ALTER TABLE stream_sessions ADD COLUMN comment_posted INTEGER DEFAULT 0");
    }
    if (!sessionCols.includes('api_fail_count')) {
      this.db.exec("ALTER TABLE stream_sessions ADD COLUMN api_fail_count INTEGER DEFAULT 0");
    }
    if (!sessionCols.includes('vod_video_id')) {
      this.db.exec("ALTER TABLE stream_sessions ADD COLUMN vod_video_id TEXT");
    }

    // Config Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
  }

  public getDb(): SqliteDatabase {
    return this.db;
  }
}

export const dbManager = new DatabaseManager();
