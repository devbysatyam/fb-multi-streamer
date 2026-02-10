import { app } from 'electron';
import path from 'path';
import fs from 'fs';

class Logger {
    private logPath: string;

    constructor() {
        // Log to userData folder (hidden by default, perfect for logs)
        const userDataPath = app.getPath('userData');
        this.logPath = path.join(userDataPath, 'app.log');

        // Ensure log file exists or header added
        if (!fs.existsSync(this.logPath)) {
            this.writeLine(`--- APP LOG STARTED: ${new Date().toISOString()} ---`);
        }
    }

    private writeLine(message: string) {
        const timestamp = new Date().toISOString();
        const line = `[${timestamp}] ${message}\n`;
        try {
            fs.appendFileSync(this.logPath, line);
            // Also log to console in development
            if (!app.isPackaged) {
                console.log(line.trim());
            }
        } catch (err) {
            console.error('Failed to write to log file:', err);
        }
    }

    info(message: string, ...args: any[]) {
        this.writeLine(`INFO: ${message} ${args.length ? JSON.stringify(args) : ''}`);
    }

    error(message: string, error?: any) {
        let errorMsg = message;
        if (error) {
            if (error instanceof Error) {
                errorMsg += ` | ${error.message}\n${error.stack}`;
            } else {
                errorMsg += ` | ${JSON.stringify(error)}`;
            }
        }
        this.writeLine(`ERROR: ${errorMsg}`);
    }

    warn(message: string, ...args: any[]) {
        this.writeLine(`WARN: ${message} ${args.length ? JSON.stringify(args) : ''}`);
    }

    getLogPath() {
        return this.logPath;
    }
}

export const logger = new Logger();
