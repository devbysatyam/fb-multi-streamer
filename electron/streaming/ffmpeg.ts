import { HardwareDetector } from './hardware';

export const GpuType = {
    Nvidia: 'nvidia',
    Intel: 'intel',
    Amd: 'amd',
    None: 'none',
} as const;

export type GpuType = typeof GpuType[keyof typeof GpuType];

export interface ProfileData {
    crop?: { width: number; height: number; x: number; y: number };
    offset?: { x: number; y: number };
    rotate?: { angle: number };
    flip?: { horizontal: boolean; vertical: boolean };
    scale?: { width: number; height: number };
    aspectRatio?: '16:9' | '9:16' | '4:5' | '1:1' | 'Custom';
    trim?: { start?: string | number; end?: string | number };
    loop?: boolean;
    color?: {
        brightness: number;
        contrast: number;
        saturation: number;
        gamma: number;
        sharpness?: number;
    };
    zoom?: number;
    background?: {
        type: 'black' | 'blur' | 'mirror' | 'image';
        imagePath?: string;
    };
    overlays: Array<{
        type: 'text' | 'image';
        content?: string;
        x: number | string;
        y: number | string;
        opacity: number;
        size?: number;
        color?: string;
        bannerColor?: string;
        bannerOpacity?: number;
        bannerPadding?: number;
        shadow?: { x: number; y: number; color: string };
        outline?: { width: number; color: string };
        font?: string;
        animation?: 'none' | 'scroll_left' | 'scroll_right' | 'fade';
    }>;
    speed?: number;
    audio?: {
        volume: number;
        normalize?: boolean;
        pitch?: number;
    };
    protection?: {
        type: 'black' | 'white' | 'static' | 'grayscale' | 'blur' | 'image' | 'subtle_noise' | 'color_shift' | 'mirror_edge';
        mode?: 'time' | 'frame' | 'random';
        interval: number;
        duration: number; // For time mode: seconds
        strength?: number;
        injectionFrames?: number; // For frame/random mode: count/probability factor
        imagePath?: string;
    };
}

export class FfmpegCommandBuilder {
    private inputPath: string;
    private rtmpUrl?: string;
    private bitrate: number = 4500;
    private audioBitrate: number = 128;
    private videoFilters: string[] = [];
    private audioFilters: string[] = [];
    private logoInputs: Array<{ path: string; x: number | string; y: number | string; width?: number; height?: number; enable?: string }> = [];
    private backgroundInput?: string;
    private trimArgs: string[] = [];
    private loop: boolean = true;
    private targetW: number = 1920;
    private targetH: number = 1080;

    constructor(inputPath: string) {
        this.inputPath = inputPath;
    }

    public applyProfile(profile: ProfileData) {
        // 0. Looping
        if (profile.loop !== undefined) {
            this.loop = profile.loop;
        }

        // 1. Trimming (Input seeking is better for performance)
        if (profile.trim) {
            if (profile.trim.start !== undefined && profile.trim.start !== '') {
                this.trimArgs.push('-ss', String(profile.trim.start));
            }
            if (profile.trim.end !== undefined && profile.trim.end !== '') {
                this.trimArgs.push('-to', String(profile.trim.end));
            }
        }

        // 2. Crop
        if (profile.crop && profile.crop.width > 0 && profile.crop.height > 0) {
            this.videoFilters.push(`crop=${profile.crop.width}:${profile.crop.height}:${profile.crop.x}:${profile.crop.y}`);
        }

        // 3. Smart Layout (Aspect Ratio, Scale, Zoom, Background)
        // 3. Smart Layout (Aspect Ratio, Scale, Zoom, Background)
        this.targetW = 1920;
        this.targetH = 1080;

        if (profile.aspectRatio && profile.aspectRatio !== 'Custom') {
            const [w, h] = profile.aspectRatio.split(':').map(Number);
            if (w === 1 && h === 1) { this.targetW = 1080; this.targetH = 1080; }
            else if (w === 4 && h === 5) { this.targetW = 1080; this.targetH = 1350; }
            else if (w === 9 && h === 16) { this.targetW = 1080; this.targetH = 1920; }
        } else if (profile.scale) {
            this.targetW = profile.scale.width;
            this.targetH = profile.scale.height;
        }

        const zoom = profile.zoom || 1.0;
        const bgType = profile.background?.type || 'black';

        // Check if we need complex compositing
        const needsSmartLayout = zoom !== 1.0 || bgType !== 'black';

        if (!needsSmartLayout) {
            // Simple default scaling
            this.videoFilters.push(`scale=${this.targetW}:${this.targetH}:force_original_aspect_ratio=decrease,pad=${this.targetW}:${this.targetH}:(ow-iw)/2:(oh-ih)/2`);
        } else {
            // Complex Graph for Smart Backgrounds & Zoom
            // 1. Split stream: [bg_src] and [fg_src]
            // Comma will be added by join, so we start with split
            // Note: Since we are inside a filter chain, using semicolons requires care.
            // We will push a single "filter item" that is actually a graph chain constructed carefully.
            // FFmpeg filter syntax: "f1,f2;[s]f3,f4"
            // To embed this in our array, we must ensure it ends with an output implicit or labeled.

            // Actually, simplest way to inject graph is to break linear chain.
            // But 'applyProfile' builds linear entries.
            // Workaround: We'll construct the graph string.
            // [0] -> split -> [bg_in][fg_in]

            // FG Chain: [fg_in]scale=...[fg]
            const fgScaleW = `iw*${zoom}`;
            const fgScaleH = `ih*${zoom}`;
            const fgChain = `[fg_src]scale=${fgScaleW}:${fgScaleH},scale=w=${this.targetW}:h=${this.targetH}:force_original_aspect_ratio=decrease[fg]`;

            // BG Chain
            let bgChain = '';
            if (bgType === 'blur') {
                bgChain = `[bg_src]scale=${this.targetW}:${this.targetH}:force_original_aspect_ratio=increase,crop=${this.targetW}:${this.targetH},boxblur=luma_radius=min(h\\,w)/10:luma_power=1[bg]`;
            } else if (bgType === 'mirror') {
                bgChain = `[bg_src]scale=${this.targetW}:${this.targetH}:force_original_aspect_ratio=increase,crop=${this.targetW}:${this.targetH},hflip,boxblur=20[bg]`;
            } else if (bgType === 'image' && profile.background?.imagePath) {
                this.backgroundInput = profile.background.imagePath;
                // We need to know the index of this input. It depends on when build() is called.
                // We'll use a placeholder variable or special logic in build.
                // Update: Let's assume build() can handle a mapped input.
                // For now, simpler: Use 'black' fallback if image is tricky in this linear flow, 
                // OR assume image is input #1 if we handle it in build.
                // Let's rely on build() finding 'backgroundInput' and mapping it.
                // We'll label it [bg_img].
                bgChain = `[bg_img]scale=${this.targetW}:${this.targetH}:force_original_aspect_ratio=increase,crop=${this.targetW}:${this.targetH}[bg]`;
                // split not needed for bg if image, but needed for fg logic? 
                // Wait, if BG is image, we assume [0:v] is just FG.
            } else {
                // Black
                bgChain = `color=c=black:s=${this.targetW}x${this.targetH}[bg]`;
            }

            // Compositing
            // If BG is image/color, we don't need split for BG, but we might have consumed [0:v] already?
            // "this.videoFilters" are processed in-order.
            // We need to inject the split at this point.

            let graph = '';
            if (bgType === 'image' || bgType === 'black') {
                // No split of input video needed for BG generation
                // But we need to define [bg].
                // Wait, if we use 'color=' source, it's a source filter.
                // We can't just put `color=...` in middle of chain unless we use labeled interaction.

                // Chain Construction:
                // "split=1[fg_src];" -> Just pass through? No.
                // We simply terminate current chain, start new chains.

                // If image: we need to handle mapping in build.
                // If black: `color=...[bg];[0:v]...[fg];[bg][fg]overlay...`

                // To make this work with the array structure:
                // We will replace the default "scale" entry with this graph string.

                if (bgType === 'black') {
                    const offX = profile.offset?.x || 0;
                    const offY = profile.offset?.y || 0;
                    graph = `split=1[fg_src];color=c=black:s=${this.targetW}x${this.targetH}[bg];${fgChain};[bg][fg]overlay=(W-w)/2+(${offX}*W/100):(H-h)/2+(${offY}*H/100)`;
                } else if (bgType === 'image') {
                    const offX = profile.offset?.x || 0;
                    const offY = profile.offset?.y || 0;
                    // We will resolve [bg_img] in build.
                    graph = `split=1[fg_src];${bgChain};${fgChain};[bg][fg]overlay=(W-w)/2+(${offX}*W/100):(H-h)/2+(${offY}*H/100)`;
                }
            } else {
                // Blur/Mirror needs input video
                const offX = profile.offset?.x || 0;
                const offY = profile.offset?.y || 0;
                graph = `split=2[bg_src][fg_src];${bgChain};${fgChain};[bg][fg]overlay=(W-w)/2+(${offX}*W/100):(H-h)/2+(${offY}*H/100)`;
            }

            this.videoFilters.push(graph);
        }

        // 4. Rotate
        if (profile.rotate) {
            const angle = profile.rotate.angle;
            if (angle === 90) this.videoFilters.push('transpose=1');
            else if (angle === 180) this.videoFilters.push('transpose=2,transpose=2');
            else if (angle === 270) this.videoFilters.push('transpose=2');
        }

        // 5. Flip
        if (profile.flip) {
            if (profile.flip.horizontal) this.videoFilters.push('hflip');
            if (profile.flip.vertical) this.videoFilters.push('vflip');
        }

        // 6. Color Corrections & Sharpness
        if (profile.color) {
            const c = profile.color;
            const eqParams = [];
            if (c.brightness !== 0) eqParams.push(`brightness=${c.brightness}`);
            if (c.contrast !== 1) eqParams.push(`contrast=${c.contrast}`);
            if (c.saturation !== 1) eqParams.push(`saturation=${c.saturation}`);
            if (c.gamma !== 1) eqParams.push(`gamma=${c.gamma}`);

            if (eqParams.length > 0) {
                this.videoFilters.push(`eq=${eqParams.join(':')}`);
            }

            // FIXED: Stronger sharpness effect
            if (c.sharpness && c.sharpness > 0) {
                const lumaAmount = 1.0 + c.sharpness * 2.5;
                const chromaAmount = 0.5 + c.sharpness * 1.0;
                this.videoFilters.push(`unsharp=5:5:${lumaAmount}:5:5:${chromaAmount}`);
            }
        }

        // 7. Copyright Protection (Frame Injection - Enhanced)
        if (profile.protection && (profile.protection.interval > 0 || (profile.protection.mode !== 'time' && (profile.protection.injectionFrames || 0) > 0))) {
            const { type, mode, interval, duration, strength, imagePath, injectionFrames } = profile.protection;

            let enableExpr = '';

            if (mode === 'frame') {
                // Interval: e.g. every 30 frames. Injection: 1 frame.
                // mod(n, interval) < injection
                const iFrames = Math.max(2, Math.round(interval));
                const inj = Math.max(1, Math.round(injectionFrames || 1));
                enableExpr = `lt(mod(n,${iFrames}),${inj})`;
            } else if (mode === 'random') {
                // Random Probability. 
                // interval = Frequency factor?
                // frontend: "Every (Frames)" and "Inj Frames".
                // Prob = Inj / Interval.
                const denom = Math.max(1, interval);
                const num = Math.max(1, injectionFrames || 1);
                const prob = Math.min(1, num / denom);
                enableExpr = `lt(random(1),${prob})`;
            } else {
                // Time based
                enableExpr = `lt(mod(t,${Math.max(0.1, interval)}),${duration || 0.04})`;
            }

            const str = strength || 1.0;
            // ... (rest of filter generation matches previous, logic is fine)

            if (type === 'static') {
                this.videoFilters.push(`noise=alls=${Math.round(100 * str)}:allf=t+u:enable='${enableExpr}'`);
            } else if (type === 'grayscale') {
                this.videoFilters.push(`hue=s=0:enable='${enableExpr}'`);
            } else if (type === 'blur') {
                this.videoFilters.push(`boxblur=luma_radius=${Math.round(10 * str)}:luma_power=1:enable='${enableExpr}'`);
            } else if (type === 'subtle_noise') {
                this.videoFilters.push(`noise=alls=${Math.round(5 * str)}:allf=t`);
            } else if (type === 'color_shift') {
                this.videoFilters.push(`hue=h=sin(t*${str})*10:enable='${enableExpr}'`);
            } else if (type === 'mirror_edge') {
                this.videoFilters.push(`crop=iw-4:ih:2:0,hflip,pad=iw+4:ih:2:0:enable='${enableExpr}'`);
            } else if (type === 'image' && imagePath) {
                this.logoInputs.push({
                    path: imagePath,
                    x: '(W-w)/2',
                    y: '(H-h)/2',
                    enable: enableExpr
                });
            } else {
                let color = 'black';
                if (type === 'white') color = 'white';
                this.videoFilters.push(`drawbox=t=fill:color=${color}:enable='${enableExpr}'`);
            }
        }

        // 8. Overlays & Banners
        profile.overlays.forEach(overlay => {
            if (overlay.type === 'text' && overlay.content) {
                const fontSize = overlay.size || 24;
                const x = overlay.x || 0; // Use 0 as default for x, y
                const y = overlay.y || 0;
                const fontColor = overlay.color || 'white';
                const alpha = overlay.opacity;
                const fontPath = overlay.font || 'C:/Windows/Fonts/Arial.ttf'; // Assume full path for font

                // Build drawtext params
                const escapedContent = overlay.content
                    .replace(/'/g, "'\\\\''") // Handle single quotes for FFmpeg's weird escaping
                    .replace(/:/g, "\\:");   // Escape colons for filter parameters

                // Ensure font path uses forward slashes and is properly escaped for FFmpeg on Windows
                const escapedFontPath = fontPath.replace(/\\/g, '/').replace(/:/g, '\\:');

                const params: string[] = [
                    `text='${escapedContent}'`,

                    `x=w*${Number(x) / 100}`, // Scale x coordinate by percentage of width
                    `y=h*${Number(y) / 100}`, // Scale y coordinate by percentage of height
                    `fontsize=w*(${fontSize}/1000)`,
                    `fontcolor=${fontColor}`,
                    `alpha=${alpha}`,
                    `fontfile='${escapedFontPath}'`
                ];

                // Shadow effect
                if (overlay.shadow) {
                    params.push(`shadowcolor=${overlay.shadow.color}`);
                    params.push(`shadowx=${overlay.shadow.x}`);
                    params.push(`shadowy=${overlay.shadow.y}`);
                }

                // Outline/border effect
                if (overlay.outline && overlay.outline.width > 0) {
                    params.push(`borderw=${overlay.outline.width}`);
                    params.push(`bordercolor=${overlay.outline.color}`);
                }

                // Animation
                if (overlay.animation === 'scroll_left') {
                    params[1] = `x=w-mod(t*100\\,w+tw)`;
                } else if (overlay.animation === 'scroll_right') {
                    params[1] = `x=-tw+mod(t*100\\,w+tw)`;
                } else if (overlay.animation === 'fade') {
                    params[5] = `alpha=if(lt(mod(t\\,4)\\,2)\\,mod(t\\,2)\\,2-mod(t\\,2))`;
                }

                // Banner background
                if (overlay.bannerColor) {
                    const bc = overlay.bannerColor;
                    const bo = overlay.bannerOpacity || 0.5;
                    const bp = overlay.bannerPadding || 10;
                    this.videoFilters.push(
                        `drawbox=x=${params[1].split('=')[1]}-${bp}:y=${params[2].split('=')[1]}-${bp}:w=tw+${bp * 2}:h=th+${bp * 2}:color=${bc}@${bo}:t=fill`
                    );
                }

                this.videoFilters.push(`drawtext=${params.join(':')}`);
            } else if (overlay.type === 'image' && overlay.content) {
                this.logoInputs.push({
                    path: overlay.content,
                    x: overlay.x,
                    y: overlay.y,
                    width: overlay.size,
                    height: -1 // Maintain aspect ratio
                });
            }
        });

        // 9. Speed
        if (profile.speed && profile.speed !== 1.0) {
            this.videoFilters.push(`setpts=${1.0 / profile.speed}*PTS`);
            this.audioFilters.push(`atempo=${profile.speed}`);
        }

        // 10. Audio
        if (profile.audio) {
            if (profile.audio.volume !== 1.0) {
                this.audioFilters.push(`volume=${profile.audio.volume}`);
            }
            if (profile.audio.normalize) {
                this.audioFilters.push('loudnorm');
            }
            if (profile.audio.pitch && profile.audio.pitch !== 1.0) {
                // simple pitch shift using rubberband or similar is not always available
                // using asetrate+aresample as a fallback for pitch shift
                const rate = 44100;
                this.audioFilters.push(`asetrate=${rate * profile.audio.pitch},aresample=${rate}`);
            }
        }

        return this;
    }

    public async forStreaming(rtmpUrl: string, loopOverride?: boolean) {
        this.rtmpUrl = rtmpUrl;
        const finalLoop = loopOverride !== undefined ? loopOverride : this.loop;
        return await this.build(finalLoop);
    }

    private async build(loop: boolean): Promise<string[]> {
        const args: string[] = [];
        const hwInfo = await HardwareDetector.getHardwareInfo();
        const encoder = HardwareDetector.getBestEncoder(hwInfo);

        // Loop arg must be before input
        if (loop) args.push('-stream_loop', '-1');

        if (encoder === 'h264_nvenc') {
            args.push('-hwaccel', 'cuda');
        } else if (encoder === 'h264_qsv') {
            args.push('-hwaccel', 'qsv');
        }

        // Add trim args before input for fast seeking
        args.push(...this.trimArgs);

        // Real-time read
        args.push('-re');

        // Main input
        args.push('-i', this.inputPath);

        // Logo inputs
        this.logoInputs.forEach(logo => {
            args.push('-i', logo.path);
        });

        // Background Image Input (if used)
        let bgInputIdx = -1;
        if (this.backgroundInput) {
            args.push('-i', this.backgroundInput);
            bgInputIdx = 1 + this.logoInputs.length; // 0 is main, logos 1..N, bg is N+1
            // Use this index to map [bg_img] in filter complex
        }

        // Mapping and Filters
        if (this.logoInputs.length > 0) {
            // Complex filter
            // Complex filter
            let filterChain = '[0:v]';
            if (this.videoFilters.length > 0) {
                let chainStr = this.videoFilters.join(',');

                // If we have a background input, we need to replace [bg_img] with the correct input index
                if (bgInputIdx !== -1) {
                    chainStr = chainStr.replace('[bg_img]', `[${bgInputIdx}:v]`);
                }

                filterChain += chainStr;
            } else {
                filterChain += 'null';
            }
            filterChain += '[vbase];';

            let lastV = 'vbase';
            this.logoInputs.forEach((logo, i) => {
                const logoIdx = i + 1;
                let overlayInput = `[${logoIdx}:v]`;

                // Apply scaling if width/height is provided
                const scaledLabel = `sc${logoIdx}`;
                // -1 means preserve aspect ratio in FFmpeg, pass it directly
                // BUT scale filter typically does NOT imply W/H context of the *output*, it uses input
                // So W*... is invalid inside scale if W refers to the main video (which is separate stream)
                // We must use absolute values calculated from this.targetW/H

                const logoW = (logo.width && logo.width > 0) ? Math.round(this.targetW * (logo.width / 1000)) : -1;
                const logoH = (logo.height && logo.height > 0) ? Math.round(this.targetH * (logo.height / 1000)) : -1;
                filterChain += `${overlayInput}scale=${logoW}:${logoH}[${scaledLabel}];`;
                overlayInput = `[${scaledLabel}]`;

                const outV = `vov${logoIdx}`;


                const x = Number(logo.x || 0);
                const y = Number(logo.y || 0);
                const overlayFilter = `overlay=x=(W*${x / 100}):y=(H*${y / 100})`;
                const finalOverlay = logo.enable ? `${overlayFilter}:enable='${logo.enable}'` : overlayFilter;
                filterChain += `[${lastV}]${overlayInput}${finalOverlay}[${outV}];`;
                lastV = outV;
            });
            args.push('-filter_complex', filterChain.slice(0, -1), '-map', `[${lastV}]`, '-map', '0:a');
        } else if (this.videoFilters.length > 0) {
            args.push('-vf', this.videoFilters.join(','));
        }

        if (this.audioFilters.length > 0) {
            args.push('-af', this.audioFilters.join(','));
        }

        args.push('-c:v', encoder);
        args.push('-b:v', `${this.bitrate}k`);
        args.push('-pix_fmt', 'yuv420p');
        args.push('-c:a', 'aac', '-b:a', `${this.audioBitrate}k`, '-ar', '44100');
        args.push('-f', 'flv', this.rtmpUrl!);

        return args;
    }
}
