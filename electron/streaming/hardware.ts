import { exec } from 'child_process';
import si from 'systeminformation';

export interface HardwareInfo {
    cpu: string;
    gpus: { vendor: string; model: string; bus: string }[];
    encoders: {
        nvenc: boolean;
        qsv: boolean;
        amf: boolean;
        vaapi: boolean;
    };
}

export class HardwareDetector {
    private static cachedInfo: HardwareInfo | null = null;

    public static async getHardwareInfo(): Promise<HardwareInfo> {
        if (this.cachedInfo) return this.cachedInfo;

        const [cpuData, gpuData] = await Promise.all([
            si.cpu(),
            si.graphics()
        ]);

        const encoders = await this.detectFFmpegEncoders();

        this.cachedInfo = {
            cpu: `${cpuData.manufacturer} ${cpuData.brand}`,
            gpus: gpuData.controllers.map(gpu => ({
                vendor: gpu.vendor,
                model: gpu.model,
                bus: gpu.bus
            })),
            encoders
        };

        return this.cachedInfo;
    }

    private static detectFFmpegEncoders(): Promise<HardwareInfo['encoders']> {
        return new Promise((resolve) => {
            const result = {
                nvenc: false,
                qsv: false,
                amf: false,
                vaapi: false
            };

            // Assuming ffmpeg is in PATH or configured
            exec('ffmpeg -encoders', (error, stdout) => {
                if (error) {
                    console.error('[Hardware] Failed to probe ffmpeg encoders:', error);
                    resolve(result);
                    return;
                }

                result.nvenc = stdout.includes('h264_nvenc');
                result.qsv = stdout.includes('h264_qsv');
                result.amf = stdout.includes('h264_amf');
                result.vaapi = stdout.includes('h264_vaapi');

                console.log('[Hardware] Detected Encoders:', result);
                resolve(result);
            });
        });
    }

    public static getBestEncoder(info: HardwareInfo): string {
        if (info.encoders.nvenc) return 'h264_nvenc';
        if (info.encoders.qsv) return 'h264_qsv';
        if (info.encoders.amf) return 'h264_amf';
        if (info.encoders.vaapi) return 'h264_vaapi';
        return 'libx264'; // Fallback to CPU
    }
}
