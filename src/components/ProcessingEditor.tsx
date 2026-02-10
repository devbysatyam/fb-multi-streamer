import { useState, useRef, useEffect } from 'react';
import { cn } from '../lib/utils';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Slider } from './ui/slider';
import {
    Save, Trash2, RotateCw, FlipHorizontal, FlipVertical,
    Type, Image as ImageIcon, Scissors, Settings2,
    ShieldCheck, Volume2, Maximize, Sparkles, Repeat, FolderOpen, Palette,
    Play, Pause, RefreshCw, Activity, XCircle, Clock
} from 'lucide-react';
import { Switch } from './ui/switch';


interface ProcessingEditorProps {
    onSave: (name: string, data: any) => void;
    onClose: () => void;
    initialData?: any;
}

// Helper to log to terminal via IPC (disabled by default)
const DEBUG = false;
const log = (level: string, ...args: any[]) => {
    if (!DEBUG) return;
    try {
        (window as any).ipcRenderer.invoke('log:message', level, ...args);
    } catch (e) { /* ignore */ }
};

export const ProcessingEditor = ({ onSave, onClose, initialData }: ProcessingEditorProps) => {
    log('info', '[ProcessingEditor] Component mounting...', { initialData });

    // Safe parse initial data if it's double stringified
    const safeParse = (input: any): any => {
        if (typeof input !== 'string') return input || {};
        try {
            const parsed = JSON.parse(input);
            return typeof parsed === 'string' ? safeParse(parsed) : (parsed || {});
        } catch { return {}; }
    };
    const rawData = safeParse(initialData?.data);
    log('info', '[ProcessingEditor] Parsed rawData:', rawData);

    const [name, setName] = useState(initialData?.name || 'New Profile');
    const [aspectRatio, setAspectRatio] = useState(rawData.aspectRatio || '16:9');
    const [scale, setScale] = useState(rawData.scale || { width: 1920, height: 1080 });
    const [color, setColor] = useState(rawData.color || { brightness: 0, contrast: 1, saturation: 1, gamma: 1, sharpness: 0 });
    const [rotate, setRotate] = useState<{ angle: number }>(rawData.rotate || { angle: 0 });
    const [flip, setFlip] = useState(rawData.flip || { horizontal: false, vertical: false });
    const [speed, setSpeed] = useState(rawData.speed || 1.0);
    const [trimRange, setTrimRange] = useState(rawData.trim || rawData.trimRange || { start: '', end: '' });
    const [audio, setAudio] = useState(rawData.audio || { volume: 1.0, normalize: false, pitch: 1.0 });
    const [protection, setProtection] = useState(rawData.protection || { type: 'black', mode: 'time', interval: 0, duration: 0.04, strength: 1.0, injectionFrames: 1 });
    const [crop, setCrop] = useState(rawData.crop || { x: 0, y: 0, width: 0, height: 0 });
    const [zoom, setZoom] = useState(rawData.zoom || 1.0);
    const [offset, setOffset] = useState(rawData.offset || { x: 0, y: 0 });
    const [background, setBackground] = useState(rawData.background || { type: 'black' });
    const [overlays, setOverlays] = useState<any[]>(rawData.overlays || []);
    const [loop, setLoop] = useState<number>(rawData.loop ?? 1);

    log('info', '[ProcessingEditor] State initialized');

    const [previewWidth, setPreviewWidth] = useState(1000);

    useEffect(() => {
        log('info', '[ProcessingEditor] ResizeObserver useEffect running');
        if (!previewRef.current) {
            log('warn', '[ProcessingEditor] previewRef is null, skipping observer');
            return;
        }
        const observer = new ResizeObserver(entries => {
            for (let entry of entries) {
                setPreviewWidth(entry.contentRect.width);
            }
        });
        observer.observe(previewRef.current);
        return () => observer.disconnect();
    }, []);

    const scaleFactor = previewWidth / 1000;

    const [isPlaying, setIsPlaying] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
    const previewRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const videoPath = initialData?.path || initialData?.videoPath;
    log('info', '[ProcessingEditor] videoPath resolved:', videoPath);
    const [savedProfiles, setSavedProfiles] = useState<any[]>([]);
    const [showTemplateMenu, setShowTemplateMenu] = useState(false);
    const [brandKits, setBrandKits] = useState<any[]>([]);

    useEffect(() => {
        log('info', '[ProcessingEditor] Loading profiles and brand kits...');
        loadProfiles();
        loadBrandKits();
    }, []);

    const loadBrandKits = async () => {
        try {
            log('info', '[ProcessingEditor] Invoking brand:list...');
            const kits = await (window as any).ipcRenderer.invoke('brand:list');
            log('info', '[ProcessingEditor] brand:list returned', kits?.length || 0, 'kits');
            setBrandKits(kits || []);
        } catch (e) { log('error', '[ProcessingEditor] Failed to load brand kits:', e); }
    };

    const applyBrandKit = (kit: any) => {
        // 1. Add Logo Overlay
        if (kit.logo_path) {
            const newOverlay = {
                type: 'image',
                content: kit.logo_path,
                // Map position to generic x/y
                x: kit.logo_position.includes('L') ? 5 : 85,
                y: kit.logo_position.includes('T') ? 5 : 85,
                opacity: kit.logo_opacity,
                size: 150 * kit.logo_scale * 5 // Rough scaling
            };
            // Remove existing logo overlays? optional. For now appends.
            setOverlays(prev => [...prev, newOverlay]);
        }
    };

    const loadProfiles = async () => {
        try {
            const profiles = await (window as any).ipcRenderer.invoke('profile:list');
            setSavedProfiles(profiles || []);
        } catch (e) { console.error('Failed to load profiles:', e); }
    };

    const loadTemplate = (profile: any) => {
        // Safe check for double stringified data in existing DB records
        const data = safeParse(profile.data);
        setName(profile.name);
        setAspectRatio(data.aspectRatio || '16:9');
        setScale(data.scale || { width: 1920, height: 1080 });
        setColor(data.color || { brightness: 0, contrast: 1, saturation: 1, gamma: 1, sharpness: 0 });
        setRotate(data.rotate || { angle: 0 });
        setFlip(data.flip || { horizontal: false, vertical: false });
        setSpeed(data.speed || 1.0);
        setTrimRange(data.trim || data.trimRange || { start: '', end: '' });
        setAudio(data.audio || { volume: 1.0, normalize: false, pitch: 1.0 });
        setProtection(data.protection || { type: 'black', mode: 'time', interval: 0, duration: 0.04, strength: 1.0, injectionFrames: 1 });
        setCrop(data.crop || { x: 0, y: 0, width: 0, height: 0 });
        setZoom(data.zoom || 1.0);
        setOffset(data.offset || { x: 0, y: 0 });
        setBackground(data.background || { type: 'black' });
        setOverlays(data.overlays || []);
        setLoop(data.loop ?? 1);
        setShowTemplateMenu(false);
    };

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.playbackRate = speed;
            videoRef.current.volume = Math.max(0, Math.min(1, audio.volume));
        }
    }, [speed, audio.volume]);

    const handleSaveTemplate = async () => {
        if (!name) return;
        const profileData = {
            aspectRatio, scale, crop, zoom, offset, background, color,
            rotate, flip, speed, trimRange, audio, protection, overlays, loop
        };
        try {
            // FIX: Don't stringify here, ipc handler does it.
            await (window as any).ipcRenderer.invoke('profile:save', { name, data: profileData });
            console.log('Template saved');
        } catch (e) { console.error(e); }
    };

    const handleSave = () => {
        const profileData = {
            aspectRatio,
            scale,
            crop,
            zoom,
            offset,
            background,
            color,
            rotate,
            flip,
            speed,
            trimRange,
            audio,
            protection,
            overlays,
            loop
        };
        onSave(name, profileData);
    };

    const addTextOverlay = () => {
        const newOverlay = {
            type: 'text',
            content: 'New Text',
            x: 10,
            y: 10,
            opacity: 1,
            size: 40,
            color: '#ffffff',
            bannerColor: '',
            bannerOpacity: 0.5,
            bannerPadding: 10
        };
        setOverlays([...overlays, newOverlay]);
        setSelectedIdx(overlays.length);
    };

    const addLogoOverlay = async () => {
        try {
            const result = await (window as any).ipcRenderer.invoke('dialog:open-image');
            if (result && !result.canceled && result.filePaths.length > 0) {
                const logoPath = result.filePaths[0];
                const newOverlay = {
                    type: 'image',
                    content: logoPath,
                    x: 10,
                    y: 10,
                    opacity: 1,
                    size: 100
                };
                setOverlays([...overlays, newOverlay]);
                setSelectedIdx(overlays.length);
            }
        } catch (e) {
            console.error('Failed to select logo:', e);
        }
    };

    const updateOverlay = (idx: number, updates: any) => {
        const newOverlays = [...overlays];
        newOverlays[idx] = { ...newOverlays[idx], ...updates };
        setOverlays(newOverlays);
    };

    const handleDrag = (_e: React.MouseEvent, idx: number) => {
        if (!previewRef.current) return;
        const rect = previewRef.current.getBoundingClientRect();

        const onMouseMove = (moveEvent: MouseEvent) => {
            const x = ((moveEvent.clientX - rect.left) / rect.width) * 100;
            const y = ((moveEvent.clientY - rect.top) / rect.height) * 100;
            updateOverlay(idx, {
                x: Math.max(0, Math.min(100, x)).toFixed(1),
                y: Math.max(0, Math.min(100, y)).toFixed(1)
            });
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    const handleReframingDrag = (e: React.MouseEvent) => {
        if (zoom <= 1) return;
        const startX = e.clientX;
        const startY = e.clientY;
        const startOffset = { ...offset };

        const onMouseMove = (moveEvent: MouseEvent) => {
            const dx = ((moveEvent.clientX - startX) / (previewRef.current?.offsetWidth || 1)) * 100;
            const dy = ((moveEvent.clientY - startY) / (previewRef.current?.offsetHeight || 1)) * 100;

            // Limit panning so they don't lose the video
            setOffset({
                x: Math.max(-100, Math.min(100, startOffset.x + dx)),
                y: Math.max(-100, Math.min(100, startOffset.y + dy))
            });
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    const togglePlayback = () => {
        if (!videoRef.current) return;
        if (isPlaying) {
            videoRef.current.pause();
        } else {
            videoRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const seek = (time: number) => {
        if (!videoRef.current) return;
        videoRef.current.currentTime = time;
        setCurrentTime(time);
    };

    const stopPlayback = () => {
        if (!videoRef.current) return;
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
        setIsPlaying(false);
        setCurrentTime(0);
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in duration-300">
            <Card className="w-full max-w-[1440px] h-[90vh] flex flex-col border-white/10 bg-zinc-950/50 shadow-2xl overflow-hidden">
                <CardHeader className="border-b border-white/5 flex flex-row items-center justify-between py-4 px-6 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-blue-500/10 rounded-lg">
                            <Settings2 className="w-5 h-5 text-blue-400" />
                        </div>
                        <div className="space-y-0.5">
                            <Input
                                value={name}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                                className="bg-transparent border-none text-xl font-bold p-0 h-auto focus-visible:ring-0 w-80 text-white"
                            />
                            <div className="text-[10px] text-white/30 uppercase tracking-tighter">Production Profile</div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {savedProfiles.length > 0 && (
                            <div className="relative">
                                <Button
                                    variant="outline"
                                    onClick={() => setShowTemplateMenu(!showTemplateMenu)}
                                    className="hover:bg-white/5 text-white border-white/10"
                                >
                                    <FolderOpen className="w-4 h-4 mr-2" /> Load Template
                                </Button>
                                {showTemplateMenu && (
                                    <div className="absolute right-0 top-full mt-2 w-64 bg-zinc-900 border border-white/10 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
                                        {savedProfiles.map(p => (
                                            <button
                                                key={p.id}
                                                onClick={() => loadTemplate(p)}
                                                className="w-full text-left px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors"
                                            >
                                                {p.name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="flex items-center gap-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-1">
                            <Input
                                placeholder="Template Name..."
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-48 h-8 bg-black/40 border-white/10 text-xs text-white focus-visible:ring-emerald-500/50"
                            />
                            <Button onClick={handleSaveTemplate} variant="secondary" className="h-8 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border-none">
                                <Save className="w-3 h-3 mr-2" /> Save Template
                            </Button>
                        </div>
                        <Button variant="ghost" onClick={onClose} className="hover:bg-white/5 text-white">Cancel</Button>
                        <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/20 px-8 text-white">
                            <Save className="w-4 h-4 mr-2" /> Save & Apply
                        </Button>
                    </div>
                </CardHeader>

                <CardContent className="flex-1 overflow-hidden p-0 flex">
                    {/* Left Sidebar */}
                    <div className="w-80 border-r border-white/5 p-6 space-y-8 bg-zinc-900/30 overflow-y-auto custom-scrollbar">
                        <div className="space-y-4">
                            <Label className="text-[10px] uppercase tracking-widest opacity-50 font-bold flex items-center gap-2">
                                <Maximize className="w-3 h-3" /> Layout & Loop
                            </Label>
                            <div className="space-y-3">
                                <div className="space-y-2">
                                    <div className="flex gap-1 p-1 bg-black/40 rounded-lg border border-white/5">
                                        {[
                                            { id: 0, label: 'Off', icon: XCircle },
                                            { id: 1, label: 'All', icon: Repeat },
                                            { id: 2, label: 'One', icon: Clock }
                                        ].map(m => (
                                            <Button
                                                key={m.id}
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setLoop(m.id)}
                                                className={cn(
                                                    "h-6 px-1.5 flex-1 text-[9px] gap-1 transition-all",
                                                    loop === m.id ? "bg-blue-600 text-white shadow-lg" : "text-zinc-400 hover:text-white"
                                                )}
                                            >
                                                <m.icon className="w-2.5 h-2.5" />
                                                {m.label}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {['16:9', '9:16', '4:5', '1:1'].map((ratio) => (
                                        <Button
                                            key={ratio} variant="outline" size="sm"
                                            onClick={() => {
                                                setAspectRatio(ratio);
                                                if (ratio === '16:9') setScale({ width: 1920, height: 1080 });
                                                else if (ratio === '9:16') setScale({ width: 1080, height: 1920 });
                                                else if (ratio === '4:5') setScale({ width: 1080, height: 1350 });
                                                else if (ratio === '1:1') setScale({ width: 1080, height: 1080 });
                                            }}
                                            className={`text-[10px] h-7 ${aspectRatio === ratio ? 'bg-blue-500/10 border-blue-500/50 text-blue-400' : 'text-white border-white/10'}`}
                                        >
                                            {ratio}
                                        </Button>
                                    ))}
                                </div>
                                <div className="grid grid-cols-2 gap-2 pt-2">
                                    <div className="space-y-1">
                                        <span className="text-[9px] opacity-40 text-white uppercase font-bold">Res Width</span>
                                        <Input type="number" value={scale.width} onChange={(e) => setScale({ ...scale, width: parseInt(e.target.value) })} className="h-7 bg-black/40 border-white/10 text-white text-[10px]" />
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[9px] opacity-40 text-white uppercase font-bold">Res Height</span>
                                        <Input type="number" value={scale.height} onChange={(e) => setScale({ ...scale, height: parseInt(e.target.value) })} className="h-7 bg-black/40 border-white/10 text-white text-[10px]" />
                                    </div>
                                </div>
                                <div className="space-y-2 pt-2 border-t border-white/5">
                                    <Label className="text-[9px] uppercase tracking-widest opacity-50 font-bold">Manual Crop</Label>
                                    <div className="grid grid-cols-4 gap-1">
                                        <Input type="number" placeholder="X" value={crop.x} onChange={(e) => setCrop({ ...crop, x: parseInt(e.target.value) || 0 })} className="h-6 text-[9px] bg-black/40 border-white/10 text-white" />
                                        <Input type="number" placeholder="Y" value={crop.y} onChange={(e) => setCrop({ ...crop, y: parseInt(e.target.value) || 0 })} className="h-6 text-[9px] bg-black/40 border-white/10 text-white" />
                                        <Input type="number" placeholder="W" value={crop.width} onChange={(e) => setCrop({ ...crop, width: parseInt(e.target.value) || 0 })} className="h-6 text-[9px] bg-black/40 border-white/10 text-white" />
                                        <Input type="number" placeholder="H" value={crop.height} onChange={(e) => setCrop({ ...crop, height: parseInt(e.target.value) || 0 })} className="h-6 text-[9px] bg-black/40 border-white/10 text-white" />
                                    </div>
                                </div>
                                <div className="space-y-4 pt-2 border-t border-white/5">
                                    <Label className="text-[9px] uppercase tracking-widest opacity-50 font-bold">Smart Layout</Label>
                                    <div className="space-y-3">
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-[10px]">
                                                <span className="opacity-40 text-white">Content Zoom</span>
                                                <span className="text-blue-400 font-bold">{Math.round(zoom * 100)}%</span>
                                            </div>
                                            <Slider min={0.1} max={3.0} step={0.1} value={[zoom]} onValueChange={([v]: number[]) => setZoom(v)} />
                                        </div>
                                        <div className="space-y-2">
                                            <span className="text-[10px] opacity-40 text-white">Background Style</span>
                                            <div className="grid grid-cols-4 gap-1">
                                                {['black', 'blur', 'mirror', 'image'].map(t => (
                                                    <Button
                                                        key={t} variant="outline" size="sm"
                                                        onClick={async () => {
                                                            if (t === 'image') {
                                                                const result = await (window as any).ipcRenderer.invoke('dialog:open-image');
                                                                if (result && !result.canceled && result.filePaths.length > 0) {
                                                                    setBackground({ type: t, imagePath: result.filePaths[0] });
                                                                }
                                                            } else {
                                                                setBackground({ type: t });
                                                            }
                                                        }}
                                                        className={`text-[8px] h-6 capitalize ${background.type === t ? 'bg-blue-500/10 border-blue-500/50 text-blue-400' : 'text-zinc-500 border-white/5'}`}
                                                    >
                                                        {t}
                                                    </Button>
                                                ))}
                                            </div>
                                            {background.type === 'image' && background.imagePath && (
                                                <div className="flex items-center gap-2 p-2 bg-white/5 rounded border border-white/5">
                                                    <ImageIcon className="w-3 h-3 text-blue-400" />
                                                    <span className="text-[9px] truncate max-w-[150px] opacity-60 text-white">{background.imagePath.split(/[\\/]/).pop()}</span>
                                                    <Button variant="ghost" size="icon" className="h-4 w-4 ml-auto" onClick={() => setBackground({ type: 'black' })}><Trash2 className="w-2 h-2" /></Button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>


                            <div className="space-y-6">
                                <Label className="text-[10px] uppercase tracking-widest opacity-50 font-bold flex items-center gap-2">
                                    <Palette className="w-3 h-3" /> Brand Kit
                                </Label>
                                <select
                                    className="w-full h-8 bg-black/40 border border-white/10 rounded text-xs text-white px-2 focus:outline-none focus:border-blue-500/50 transition-colors"
                                    onChange={(e) => {
                                        const kit = brandKits.find(k => k.id === e.target.value);
                                        if (kit) applyBrandKit(kit);
                                    }}
                                >
                                    <option value="">Select a Brand Kit...</option>
                                    {brandKits.map(kit => (
                                        <option key={kit.id} value={kit.id}>{kit.name}</option>
                                    ))}
                                </select>
                            </div>


                            <div className="space-y-6">
                                <Label className="text-[10px] uppercase tracking-widest opacity-50 font-bold flex items-center gap-2">
                                    <Sparkles className="w-3 h-3" /> Visual Filters
                                </Label>
                                {[
                                    { label: 'Brightness', key: 'brightness', min: -1, max: 1 },
                                    { label: 'Contrast', key: 'contrast', min: 0, max: 2 },
                                    { label: 'Saturation', key: 'saturation', min: 0, max: 3 },
                                    { label: 'Gamma', key: 'gamma', min: 0.1, max: 3 },
                                    { label: 'Sharpness', key: 'sharpness', min: 0, max: 1 }
                                ].map((c) => (
                                    <div key={c.key} className="space-y-3">
                                        <div className="flex justify-between text-xs">
                                            <span className="opacity-70 text-white">{c.label}</span>
                                            <span className="text-blue-400">{(color as any)[c.key]}</span>
                                        </div>
                                        <Slider
                                            min={c.min} max={c.max} step={0.1}
                                            value={[(color as any)[c.key]]}
                                            onValueChange={([v]: number[]) => setColor({ ...color, [c.key]: v })}
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="space-y-6">
                                <Label className="text-[10px] uppercase tracking-widest opacity-50 font-bold flex items-center gap-2">
                                    <Volume2 className="w-3 h-3" /> Audio & Speed
                                </Label>
                                <div className="space-y-4 pt-2">
                                    <div className="space-y-3 font-semibold">
                                        <div className="flex justify-between text-xs">
                                            <span className="opacity-70 text-white">Volume</span>
                                            <span className="text-blue-400">{Math.round(audio.volume * 100)}%</span>
                                        </div>
                                        <Slider
                                            min={0} max={2.0} step={0.1}
                                            value={[audio.volume]}
                                            onValueChange={([v]: number[]) => setAudio({ ...audio, volume: v })}
                                        />
                                    </div>
                                    <div className="space-y-3 font-semibold">
                                        <div className="flex justify-between text-xs">
                                            <span className="opacity-70 text-white">Playback Speed</span>
                                            <span className="text-blue-400">{speed}x</span>
                                        </div>
                                        <Slider
                                            min={0.5} max={2.0} step={0.1}
                                            value={[speed]}
                                            onValueChange={([v]: number[]) => setSpeed(v)}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                        <div className="text-xs font-medium text-white">Audio Normalization</div>
                                        <Switch
                                            checked={audio.normalize}
                                            onCheckedChange={(v: boolean) => setAudio({ ...audio, normalize: v })}
                                        />
                                    </div>
                                    <div className="space-y-3 font-semibold">
                                        <div className="flex justify-between text-xs">
                                            <span className="opacity-70 text-white">Audio Pitch</span>
                                            <span className="text-blue-400">{audio.pitch}x</span>
                                        </div>
                                        <Slider
                                            min={0.5} max={2.0} step={0.1}
                                            value={[audio.pitch]}
                                            onValueChange={([v]: number[]) => setAudio({ ...audio, pitch: v })}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>


                        <div className="space-y-6">
                            <Label className="text-[10px] uppercase tracking-widest opacity-50 font-bold flex items-center gap-2">
                                <Scissors className="w-3 h-3" /> Precise Trimming
                            </Label>
                            <div className="grid grid-cols-2 gap-3 pb-2">
                                <div className="space-y-1">
                                    <span className="text-[10px] opacity-40 text-blue-400">Start Position</span>
                                    <Input value={trimRange.start} onChange={(e) => setTrimRange({ ...trimRange, start: e.target.value })} className="h-8 bg-black/40 border-white/10 text-xs text-white" placeholder="00:00:00" />
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[10px] opacity-40 text-pink-400">End Position</span>
                                    <Input value={trimRange.end} onChange={(e) => setTrimRange({ ...trimRange, end: e.target.value })} className="h-8 bg-black/40 border-white/10 text-xs text-white" placeholder="00:00:00" />
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => setRotate({ angle: (rotate.angle + 90) % 360 })} className="h-7 text-[10px] flex-1 text-white border-white/10"><RotateCw className="w-3 h-3 mr-1" /> Rotate</Button>
                                <Button variant="outline" size="sm" onClick={() => setFlip({ ...flip, horizontal: !flip.horizontal })} className="h-7 text-[10px] flex-1 text-white border-white/10"><FlipHorizontal className="w-3 h-3 mr-1" /> H-Flip</Button>
                                <Button variant="outline" size="sm" onClick={() => setFlip({ ...flip, vertical: !flip.vertical })} className="h-7 text-[10px] flex-1 text-white border-white/10"><FlipVertical className="w-3 h-3 mr-1" /> V-Flip</Button>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <Label className="text-[10px] uppercase tracking-widest opacity-50 font-bold flex items-center gap-2">
                                <ShieldCheck className="w-3 h-3" /> Copyright Masking
                            </Label>
                            <div className="space-y-3">
                                {/* Mode Toggle */}
                                <div className="flex gap-1 p-1 bg-black/30 rounded-lg">
                                    {['time', 'frame', 'random'].map(m => (
                                        <Button
                                            key={m} variant="ghost" size="sm"
                                            onClick={() => setProtection({ ...protection, mode: m as any })}
                                            className={`flex-1 text-[9px] h-6 capitalize ${protection.mode === m ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-500'}`}
                                        >
                                            {m === 'time' ? 'Time' : m === 'frame' ? 'Frame' : 'Rand'}
                                        </Button>
                                    ))}
                                </div>
                                {/* Protection Types */}
                                <div className="grid grid-cols-3 gap-2">
                                    {['black', 'white', 'static', 'grayscale', 'blur', 'subtle_noise', 'color_shift', 'mirror_edge', 'image'].map(t => (
                                        <Button
                                            key={t} variant="outline" size="sm"
                                            onClick={async () => {
                                                if (t === 'image') {
                                                    const result = await (window as any).ipcRenderer.invoke('dialog:open-image');
                                                    if (result && !result.canceled && result.filePaths.length > 0) {
                                                        setProtection({ ...protection, type: t, imagePath: result.filePaths[0] });
                                                    }
                                                } else {
                                                    setProtection({ ...protection, type: t as any });
                                                }
                                            }}
                                            className={`text-[8px] h-6 capitalize ${protection.type === t ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : 'text-zinc-500 border-white/5'}`}
                                        >
                                            {t.replace('_', ' ')}
                                        </Button>
                                    ))}
                                </div>
                                {protection.type === 'image' && protection.imagePath && (
                                    <div className="flex items-center gap-2 p-2 bg-white/5 rounded border border-white/5">
                                        <ImageIcon className="w-3 h-3 text-emerald-400" />
                                        <span className="text-[9px] truncate max-w-[150px] opacity-60 text-white">{protection.imagePath.split(/[\\/]/).pop()}</span>
                                        <Button variant="ghost" size="icon" className="h-4 w-4 ml-auto" onClick={() => setProtection({ ...protection, imagePath: undefined })}><Trash2 className="w-2 h-2" /></Button>
                                    </div>
                                )}
                                <div className="space-y-4 pt-2">
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-[10px]">
                                            <span className="opacity-40 text-white">Every {protection.mode === 'time' ? '(Time)' : '(Frames)'}</span>
                                            <span className="text-emerald-400 font-bold">{protection.interval}{protection.mode === 'time' ? 's' : ''}</span>
                                        </div>
                                        <Slider min={0} max={protection.mode === 'time' ? 60 : 600} step={protection.mode === 'time' ? 0.1 : 5} value={[protection.interval]} onValueChange={([v]: number[]) => setProtection({ ...protection, interval: v })} />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-[10px]">
                                            <span className="opacity-40 text-white">Inject {protection.mode === 'time' ? 'Duration' : 'Count'}</span>
                                            <span className="text-emerald-400 font-bold">
                                                {protection.mode === 'time' ?
                                                    `${protection.duration}s` :
                                                    `${protection.injectionFrames || 1}`}
                                            </span>
                                        </div>
                                        {protection.mode === 'time' ? (
                                            <Slider min={0.01} max={1.0} step={0.01} value={[protection.duration || 0.04]} onValueChange={([v]: number[]) => setProtection({ ...protection, duration: v })} />
                                        ) : (
                                            <Slider min={1} max={30} step={1} value={[protection.injectionFrames || 1]} onValueChange={([v]: number[]) => setProtection({ ...protection, injectionFrames: v })} />
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-[10px]">
                                            <span className="opacity-40 text-white">Strength</span>
                                            <span className="text-blue-400 font-bold">{Math.round((protection.strength || 1) * 100)}%</span>
                                        </div>
                                        <Slider min={0.1} max={2} step={0.1} value={[protection.strength || 1]} onValueChange={([v]: number[]) => setProtection({ ...protection, strength: v })} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Preview Area */}
                    <div className="flex-1 bg-black/60 p-12 flex flex-col items-center justify-center relative overflow-hidden min-h-0">
                        <div
                            ref={previewRef}
                            className="bg-zinc-900 shadow-2xl border border-white/10 relative overflow-hidden transition-all duration-500 rounded-lg group"
                            style={{
                                aspectRatio: aspectRatio.replace(':', ' / '),
                                height: 'auto',
                                width: 'auto',
                                maxHeight: 'calc(100% - 200px)', // Leave space for bottom controls
                                maxWidth: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            {/* Ratio Label Fade-in */}
                            <div className="absolute top-4 left-4 z-20 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full border border-white/10 text-[9px] font-bold uppercase tracking-widest text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                Aspect Ratio: {aspectRatio}
                            </div>

                            <div
                                className={cn("w-full h-full flex items-center justify-center transition-all duration-300", zoom > 1 && "cursor-move")}
                                onMouseDown={handleReframingDrag}
                                style={{
                                    transform: `rotate(${rotate.angle}deg) scaleX(${flip.horizontal ? -1 : 1}) scaleY(${flip.vertical ? -1 : 1}) scale(${zoom}) translate(${offset.x / Math.max(1, zoom)}%, ${offset.y / Math.max(1, zoom)}%)`,
                                    filter: `brightness(${1 + color.brightness}) contrast(${color.contrast + (color.sharpness * 0.5)}) saturate(${color.saturation})`
                                }}
                            >
                                {/* Background Layer for Preview */}
                                {(aspectRatio !== '16:9' || zoom < 1) && (
                                    <div className="absolute inset-0 -z-10 w-full h-full overflow-hidden">
                                        {background.type === 'blur' && videoPath && (
                                            <video src={`media:///${videoPath.replace(/\\/g, '/')}`} className="w-full h-full object-cover blur-xl opacity-50 scale-110" autoPlay muted loop />
                                        )}
                                        {background.type === 'mirror' && videoPath && (
                                            <video src={`media:///${videoPath.replace(/\\/g, '/')}`} className="w-full h-full object-cover opacity-30 scale-x-[-1] blur-sm" autoPlay muted loop />
                                        )}
                                        {background.type === 'image' && background.imagePath && (
                                            <img src={`media:///${background.imagePath.replace(/\\/g, '/')}`} className="w-full h-full object-cover opacity-50" />
                                        )}
                                        {background.type === 'black' && <div className="w-full h-full bg-black" />}
                                    </div>
                                )}
                                {videoPath ? (
                                    <video
                                        ref={videoRef}
                                        src={`media:///${videoPath.replace(/\\/g, '/')}`}
                                        className="w-full h-full object-contain pointer-events-none"
                                        autoPlay loop={loop !== 0}
                                        onTimeUpdate={(e: any) => setCurrentTime(e.target.currentTime)}
                                        onLoadedMetadata={(e: any) => setDuration(e.target.duration)}
                                        onEnded={() => { if (loop === 0) setIsPlaying(false); }}
                                    />
                                ) : (
                                    <div className="flex flex-col items-center gap-4 opacity-10">
                                        <ImageIcon className="w-24 h-24" />
                                        <span className="text-sm font-medium">No Video Selected</span>
                                    </div>
                                )}

                                {/* Protection Simulation Layer */}
                                {protection.interval > 0 && (
                                    <div
                                        className="absolute inset-0 pointer-events-none transition-all duration-75"
                                        style={{
                                            animation: `protection-flash ${protection.mode === 'frame' ? (protection.interval / 30) : protection.interval}s infinite`,
                                            zIndex: 5
                                        }}
                                    />
                                )}

                                {overlays.map((ov, idx) => (
                                    <div
                                        key={idx}
                                        onMouseDown={(e) => { e.stopPropagation(); setSelectedIdx(idx); handleDrag(e, idx); }}
                                        className={cn(
                                            "absolute cursor-pointer select-none transition-all",
                                            selectedIdx === idx ? "ring-2 ring-primary ring-offset-2 ring-offset-zinc-900 rounded-lg p-1" : "hover:scale-105"
                                        )}
                                        style={{
                                            left: `${ov.x}%`,
                                            top: `${ov.y}%`,
                                            opacity: ov.opacity,
                                            transform: `translate(-50%, -50%)`,
                                            zIndex: 10 + idx
                                        }}
                                    >

                                        {ov.type === 'text' ? (
                                            <div style={{ color: ov.color, fontSize: `${ov.size * scaleFactor}px`, backgroundColor: ov.bannerColor }} className="px-2 font-bold whitespace-nowrap shadow-lg rounded">
                                                {ov.content}
                                            </div>
                                        ) : (
                                            <img draggable={false} src={`media:///${ov.content.replace(/\\/g, '/')}`} style={{ width: `${ov.size * scaleFactor}px` }} className="shadow-2xl rounded" />
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Timeline & Playback Bar */}
                            <div className="absolute bottom-6 left-6 right-6 z-20 flex flex-col gap-3">
                                <div className="flex items-center gap-4 bg-black/60 backdrop-blur-xl border border-white/10 p-2 px-4 rounded-2xl shadow-2xl">
                                    <div className="flex items-center gap-1">
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10" onClick={togglePlayback}>
                                            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10" onClick={stopPlayback}>
                                            <RefreshCw className="w-4 h-4" />
                                        </Button>
                                    </div>


                                    <div className="flex-1 flex gap-3 items-center">
                                        <span className="text-[10px] tabular-nums opacity-60 w-10 text-white">
                                            {(!isNaN(currentTime) && currentTime >= 0) ? new Date(currentTime * 1000).toISOString().substr(14, 5) : '00:00'}
                                        </span>
                                        <Slider
                                            value={[currentTime || 0]}
                                            max={duration || 100}
                                            step={0.1}
                                            onValueChange={([v]: number[]) => seek(v)}
                                            className="flex-1"
                                        />
                                        <span className="text-[10px] tabular-nums opacity-60 w-10 text-white">
                                            {(!isNaN(duration) && duration >= 0) ? new Date(duration * 1000).toISOString().substr(14, 5) : '00:00'}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2 border-l border-white/10 pl-4 ml-2">
                                        <Badge className="text-[8px] bg-purple-500/10 text-purple-400 border-none px-2 h-5">
                                            {zoom.toFixed(1)}x ZOOM
                                        </Badge>
                                        {zoom > 1 && (
                                            <Badge className="text-[8px] bg-blue-500/10 text-blue-400 border-none px-2 h-5 flex items-center gap-1">
                                                <Activity className="w-2 h-2" /> PANNED
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>



                    {/* Right Sidebar */}
                    <div className="w-80 border-l border-white/5 p-6 bg-zinc-900/30 overflow-y-auto custom-scrollbar">
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <Label className="text-[10px] uppercase tracking-widest opacity-50 font-bold">Overlays</Label>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="icon" className="h-7 w-7 border-blue-500/50 text-blue-400 bg-blue-500/5 hover:bg-blue-500/10" onClick={addTextOverlay}><Type className="w-3 h-3" /></Button>
                                    <Button variant="outline" size="icon" className="h-7 w-7 border-emerald-500/50 text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10" onClick={addLogoOverlay}><ImageIcon className="w-3 h-3" /></Button>
                                </div>
                            </div>

                            {overlays.length === 0 ? (
                                <div className="py-20 border-2 border-dashed border-white/5 rounded-2xl flex flex-col items-center gap-3 opacity-20">
                                    <Maximize className="w-8 h-8" />
                                    <span className="text-[10px] uppercase font-bold tracking-widest">No Active Layers</span>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {overlays.map((ov, idx) => (
                                        <div
                                            key={idx}
                                            onClick={() => setSelectedIdx(idx)}
                                            className={`p-4 rounded-xl border transition-all cursor-pointer group ${selectedIdx === idx ? 'bg-blue-500/10 border-blue-500/50' : 'bg-white/5 border-white/5 hover:border-white/10'}`}
                                        >
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="flex items-center gap-2">
                                                    {ov.type === 'text' ? <Type className="w-3 h-3 text-blue-400" /> : <ImageIcon className="w-3 h-3 text-emerald-400" />}
                                                    <span className="text-[10px] font-bold uppercase text-white/70">{ov.type} layer</span>
                                                </div>
                                                <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); setOverlays(overlays.filter((_, i) => i !== idx)); setSelectedIdx(null); }}><Trash2 className="w-3 h-3 text-red-400" /></Button>
                                            </div>

                                            {selectedIdx === idx && (
                                                <div className="space-y-4 animate-in slide-in-from-top-1">
                                                    {ov.type === 'text' && (
                                                        <Input value={ov.content} onChange={(e) => updateOverlay(idx, { content: e.target.value })} className="h-7 text-xs bg-black/40 border-white/10 text-white" />
                                                    )}
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="space-y-1">
                                                            <div className="text-[9px] opacity-40 text-white uppercase font-bold">Size</div>
                                                            <Input type="number" value={ov.size} onChange={(e) => updateOverlay(idx, { size: parseInt(e.target.value) })} className="h-7 bg-black/40 border-white/10 text-white" />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <div className="text-[9px] opacity-40 text-white uppercase font-bold">Alpha</div>
                                                            <Input type="number" step="0.1" value={ov.opacity} onChange={(e) => updateOverlay(idx, { opacity: parseFloat(e.target.value) })} className="h-7 bg-black/40 border-white/10 text-white" />
                                                        </div>
                                                    </div>
                                                    {ov.type === 'text' && (
                                                        <div className="space-y-3 pt-2 border-t border-white/5">
                                                            {/* Colors Row */}
                                                            <div className="grid grid-cols-2 gap-3">
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-[9px] opacity-40 text-white uppercase font-bold">Text</span>
                                                                    <input type="color" value={ov.color || '#ffffff'} onChange={(e) => updateOverlay(idx, { color: e.target.value })} className="h-4 w-10 bg-transparent border-none cursor-pointer" />
                                                                </div>
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-[9px] opacity-40 text-white uppercase font-bold">Banner</span>
                                                                    <div className="flex items-center gap-1">
                                                                        <input type="color" value={ov.bannerColor || '#000000'} onChange={(e) => updateOverlay(idx, { bannerColor: e.target.value })} className="h-4 w-8 bg-transparent border-none cursor-pointer" />
                                                                        {ov.bannerColor && (
                                                                            <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => updateOverlay(idx, { bannerColor: '' })}><Trash2 className="w-2 h-2 text-red-400" /></Button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            {/* Banner Opacity */}
                                                            {ov.bannerColor && (
                                                                <div className="space-y-1">
                                                                    <div className="flex justify-between text-[9px]">
                                                                        <span className="opacity-40 text-white">Banner Opacity</span>
                                                                        <span className="text-blue-400">{Math.round((ov.bannerOpacity || 0.5) * 100)}%</span>
                                                                    </div>
                                                                    <Slider min={0.1} max={1} step={0.1} value={[ov.bannerOpacity || 0.5]} onValueChange={([v]: number[]) => updateOverlay(idx, { bannerOpacity: v })} />
                                                                </div>
                                                            )}
                                                            {/* Shadow Toggle */}
                                                            <div className="space-y-2">
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-[9px] opacity-40 text-white uppercase font-bold">Shadow</span>
                                                                    <div className="flex items-center gap-2">
                                                                        {ov.shadow ? (
                                                                            <>
                                                                                <input type="color" value={ov.shadow.color || '#000000'} onChange={(e) => updateOverlay(idx, { shadow: { ...ov.shadow, color: e.target.value } })} className="h-4 w-8" />
                                                                                <Input type="number" value={ov.shadow.x} onChange={(e) => updateOverlay(idx, { shadow: { ...ov.shadow, x: parseInt(e.target.value) } })} className="h-5 w-10 text-[10px] bg-black/40 border-white/10" placeholder="X" />
                                                                                <Input type="number" value={ov.shadow.y} onChange={(e) => updateOverlay(idx, { shadow: { ...ov.shadow, y: parseInt(e.target.value) } })} className="h-5 w-10 text-[10px] bg-black/40 border-white/10" placeholder="Y" />
                                                                                <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => updateOverlay(idx, { shadow: undefined })}><Trash2 className="w-2 h-2 text-red-400" /></Button>
                                                                            </>
                                                                        ) : (
                                                                            <Button variant="outline" size="sm" className="h-5 text-[8px]" onClick={() => updateOverlay(idx, { shadow: { x: 2, y: 2, color: '#000000' } })}>Add</Button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            {/* Outline Toggle */}
                                                            <div className="space-y-2">
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-[9px] opacity-40 text-white uppercase font-bold">Outline</span>
                                                                    <div className="flex items-center gap-2">
                                                                        {ov.outline ? (
                                                                            <>
                                                                                <input type="color" value={ov.outline.color || '#000000'} onChange={(e) => updateOverlay(idx, { outline: { ...ov.outline, color: e.target.value } })} className="h-4 w-8" />
                                                                                <Input type="number" value={ov.outline.width} onChange={(e) => updateOverlay(idx, { outline: { ...ov.outline, width: parseInt(e.target.value) } })} className="h-5 w-12 text-[10px] bg-black/40 border-white/10" placeholder="Width" />
                                                                                <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => updateOverlay(idx, { outline: undefined })}><Trash2 className="w-2 h-2 text-red-400" /></Button>
                                                                            </>
                                                                        ) : (
                                                                            <Button variant="outline" size="sm" className="h-5 text-[8px]" onClick={() => updateOverlay(idx, { outline: { width: 2, color: '#000000' } })}>Add</Button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            {/* Animation Dropdown */}
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-[9px] opacity-40 text-white uppercase font-bold">Animation</span>
                                                                <select
                                                                    value={ov.animation || 'none'}
                                                                    onChange={(e) => updateOverlay(idx, { animation: e.target.value })}
                                                                    className="h-5 text-[9px] bg-black/60 border border-white/10 rounded px-2 text-white"
                                                                >
                                                                    <option value="none">None</option>
                                                                    <option value="scroll_left">Scroll Left</option>
                                                                    <option value="scroll_right">Scroll Right</option>
                                                                    <option value="fade">Fade In/Out</option>
                                                                </select>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
                
                @keyframes protection-flash {
                    0%, ${(protection.mode === 'frame' ? (protection.injectionFrames / Math.max(1, protection.interval)) : (protection.duration / Math.max(0.1, protection.interval))) * 100}% {
                        ${protection.type === 'black' ? 'background: black;' : ''}
                        ${protection.type === 'white' ? 'background: white;' : ''}
                        ${protection.type === 'grayscale' ? 'backdrop-filter: grayscale(1);' : ''}
                        ${protection.type === 'blur' ? 'backdrop-filter: blur(10px);' : ''}
                        ${protection.type === 'color_shift' ? 'backdrop-filter: hue-rotate(90deg);' : ''}
                        ${protection.type === 'subtle_noise' ? 'backdrop-filter: sepia(0.5) contrast(1.5);' : ''}
                        ${protection.type === 'mirror_edge' ? 'backdrop-filter: invert(1);' : ''}
                        ${protection.type === 'static' ? 'background: repeating-radial-gradient(circle, #888, #000 1px); opacity: 0.5;' : ''}
                        ${protection.type === 'image' && protection.imagePath ? `background-image: url("media:///${protection.imagePath.replace(/\\/g, '/')}"); background-size: contain; background-repeat: no-repeat; background-position: center;` : ''}
                        opacity: ${protection.strength};
                    }
                    ${((protection.mode === 'frame' ? (protection.injectionFrames / Math.max(1, protection.interval)) : (protection.duration / Math.max(0.1, protection.interval))) * 100 + 0.1).toFixed(2)}%, 100% {
                        background: transparent;
                        backdrop-filter: none;
                        opacity: 0;
                    }
                }
            `}</style>
        </div >
    );
};
