import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Play, RefreshCw, Layers, Check, ChevronRight, Video, Globe, Activity, Clock, Users, XCircle, Type, AlignLeft, Edit2, Repeat, MessageSquare, LayoutGrid, List, Cpu, Zap } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { cn } from '../lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ProcessingEditor } from '../components/ProcessingEditor';

interface Page {
    id: string;
    name: string;
    category?: string;
    is_eligible: number;
    picture_url?: string;
    fan_count?: number;
    followers_count?: number;
}

interface Profile {
    id: string;
    name: string;
    data: string;
}

interface Video {
    id: string;
    filename: string;
    path: string;
    thumbnail_path?: string;
}

export const StreamManager = () => {
    const [pages, setPages] = useState<Page[]>([]);
    const [videos, setVideos] = useState<Video[]>([]);
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [selectedPages, setSelectedPages] = useState<string[]>([]);
    const [selectedVideos, setSelectedVideos] = useState<string[]>([]);
    const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
    const [scheduledTime, setScheduledTime] = useState<string>('');
    const [loop, setLoop] = useState<number>(1); // 0: Off, 1: Loop All, 2: Loop One
    const [streamQueue, setStreamQueue] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [titleTemplate, setTitleTemplate] = useState('');
    const [descriptionTemplate, setDescriptionTemplate] = useState('');
    const [firstComment, setFirstComment] = useState('');
    const [step, setStep] = useState(1); // 1: Select Pages, 2: Select Video, 3: Select Profile, 4: Metadata, 5: Schedule, 6: Confirm
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState<any>(null);

    const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
    const [sysStats, setSysStats] = useState<any>(null);
    const location = useLocation();

    useEffect(() => {
        loadData();
        const pollInterval = setInterval(loadQueue, 5000);
        const statsInterval = setInterval(loadStats, 3000);

        // Handle pre-selection from Library
        const state = location.state as { selectedVideo?: string, selectedProfile?: string };
        if (state) {
            if (state.selectedVideo) {
                setSelectedVideos([state.selectedVideo]);
            }
            if (state.selectedProfile) {
                setSelectedProfile(state.selectedProfile);
            }
        }

        return () => {
            clearInterval(pollInterval);
            clearInterval(statsInterval);
        };
    }, [location.state]);

    const loadStats = async () => {
        const stats = await window.ipcRenderer.invoke('resource:stats');
        if (stats) setSysStats(stats);
    };

    const loadQueue = async () => {
        try {
            const queueData = await window.ipcRenderer.invoke('stream:list');
            setStreamQueue(queueData);
        } catch (e) {
            console.error('Failed to load stream queue:', e);
        }
    };

    const loadData = async () => {
        try {
            setLoading(true);
            const [pagesData, videosData, profilesData] = await Promise.all([
                window.ipcRenderer.invoke('page:list'),
                window.ipcRenderer.invoke('video:list'),
                window.ipcRenderer.invoke('profile:list')
            ]);
            setPages(pagesData);
            setVideos(videosData);
            setProfiles(profilesData);
        } catch (e: any) {
            console.error('Failed to load storage data:', e);
        } finally {
            setLoading(false);
        }
    };

    const togglePage = (page: Page) => {
        setSelectedPages(prev =>
            prev.includes(page.id) ? prev.filter(id => id !== page.id) : [...prev, page.id]
        );
    };

    const toggleVideo = (videoId: string) => {
        setSelectedVideos(prev =>
            prev.includes(videoId) ? prev.filter(id => id !== videoId) : [...prev, videoId]
        );
    };

    const handleCreate = async () => {
        if (selectedVideos.length === 0 || selectedPages.length === 0) return;
        try {
            setCreating(true);
            await window.ipcRenderer.invoke('stream:create', {
                pageIds: selectedPages,
                videoIds: selectedVideos,
                editingProfileId: selectedProfile || undefined,
                titleTemplate: titleTemplate || undefined,
                descriptionTemplate: descriptionTemplate || undefined,
                firstComment: firstComment || undefined,
                scheduledTime: scheduledTime || undefined,
                loop
            });
            // Reset flow
            setStep(1);
            setSelectedPages([]);
            setSelectedVideos([]);
            setSelectedProfile(null);
            setTitleTemplate('');
            setDescriptionTemplate('');
            setFirstComment('');
            setScheduledTime('');
        } catch (e: any) {
            console.error('Failed to create stream:', e);
        } finally {
            setCreating(false);
        }
    };

    const handleStopAll = async () => {
        if (!confirm('Are you sure you want to stop ALL active streams?')) return;
        try {
            await window.ipcRenderer.invoke('stream:stop-all');
            loadQueue();
        } catch (e) {
            console.error('Failed to stop all streams:', e);
        }
    };

    const handleStop = async (jobId: string) => {
        try {
            await window.ipcRenderer.invoke('stream:stop', jobId);
            loadQueue();
        } catch (e) {
            console.error('Failed to stop stream:', e);
        }
    };

    const handleRestart = async (jobId: string) => {
        try {
            await window.ipcRenderer.invoke('stream:restart', jobId);
            loadQueue();
        } catch (e) {
            console.error('Failed to restart stream:', e);
        }
    };

    const handleProfileSave = async (name: string, data: any) => {
        try {
            const profile = await window.ipcRenderer.invoke('profile:save', {
                id: editingProfile?.id,
                name,
                data
            });
            await loadData(); // Reload profiles
            setSelectedProfile(profile.id);
            setIsEditorOpen(false);
        } catch (e) {
            console.error('Failed to save profile:', e);
        }
    };

    const openEditor = (profile?: any) => {
        // Resolve path for preview if we have selected videos
        let videoPath = undefined;
        if (selectedVideos.length > 0) {
            const v = videos.find(vid => vid.id === selectedVideos[0]);
            videoPath = v?.path;
        }

        if (profile) {
            setEditingProfile({ ...profile, path: videoPath });
        } else {
            // New Profile template
            setEditingProfile({
                name: 'New Custom Profile',
                path: videoPath,
                data: {
                    aspectRatio: '16:9',
                    scale: { width: 1920, height: 1080 },
                    loop: 1, // Default to Loop All (1)
                    overlays: [],
                    color: { brightness: 0, contrast: 1, saturation: 1, gamma: 1, sharpness: 0 }
                }
            });
        }
        setIsEditorOpen(true);
    };

    return (
        <div className="p-8 space-y-8 max-w-6xl mx-auto">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Stream Manager</h1>
                        <p className="text-muted-foreground mt-1">Configure and launch bulk Facebook Live streams.</p>
                    </div>

                    {sysStats && (
                        <div className="flex items-center gap-3 px-3 py-1.5 bg-zinc-900/50 rounded-lg border border-white/5 backdrop-blur-md">
                            <div className="flex flex-col gap-0.5 min-w-[60px]">
                                <div className="flex items-center gap-1 text-[9px] text-zinc-500 font-medium">
                                    <Cpu className="w-2.5 h-2.5" /> CPU
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="h-0.5 flex-1 bg-white/10 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500" style={{ width: `${sysStats.cpu.load}%` }} />
                                    </div>
                                    <span className="text-[9px] text-zinc-300 font-bold">{Math.round(sysStats.cpu.load)}%</span>
                                </div>
                            </div>
                            <div className="w-[1px] h-6 bg-white/5" />
                            <div className="flex flex-col gap-0.5 min-w-[60px]">
                                <div className="flex items-center gap-1 text-[9px] text-zinc-500 font-medium">
                                    <Zap className="w-2.5 h-2.5" /> GPU
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="h-0.5 flex-1 bg-white/10 rounded-full overflow-hidden">
                                        <div className="h-full bg-emerald-500" style={{ width: `${sysStats.gpus?.[0]?.load || 0}%` }} />
                                    </div>
                                    <span className="text-[9px] text-zinc-300 font-bold">{Math.round(sysStats.gpus?.[0]?.load || 0)}%</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-4">
                    {/* Persistent View Toggle */}
                    <div className="flex items-center bg-zinc-900/50 rounded-lg p-1 border border-white/5 backdrop-blur-md">
                        <Button
                            variant={viewMode === 'card' ? 'secondary' : 'ghost'}
                            size="icon"
                            className="h-7 w-7 rounded-md"
                            onClick={() => setViewMode('card')}
                        >
                            <LayoutGrid className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                            size="icon"
                            className="h-7 w-7 rounded-md"
                            onClick={() => setViewMode('list')}
                        >
                            <List className="w-3.5 h-3.5" />
                        </Button>
                    </div>

                    <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5, 6].map((s) => (
                            <div key={s} className="flex items-center">
                                <div className={cn(
                                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all",
                                    step >= s ? "bg-primary border-primary text-primary-foreground shadow-[0_0_15px_rgba(var(--primary),0.3)]" : "border-muted text-muted"
                                )}>
                                    {step > s ? <Check className="w-4 h-4" /> : s}
                                </div>
                                {s < 6 && <div className={cn("w-8 h-0.5 mx-2", step > s ? "bg-primary" : "bg-muted")} />}
                            </div>
                        ))}
                    </div>
                </div>
            </div>


            <div className="grid grid-cols-1 gap-8">
                {step === 1 && (
                    <Card className="border-border/40 bg-card/50 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Select Pages</CardTitle>
                                    <CardDescription>Choose the pages where you want to go live.</CardDescription>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Badge variant="secondary" className="gap-1.5 px-3">
                                        <Layers className="w-3 h-3" />
                                        {selectedPages.length} Selected
                                    </Badge>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {loading && pages.length === 0 ? (
                                <div className="flex justify-center py-12">
                                    <RefreshCw className="w-8 h-8 animate-spin opacity-20" />
                                </div>
                            ) : pages.length === 0 ? (
                                <div className="text-center py-12 border border-dashed rounded-lg">
                                    <Globe className="w-12 h-12 mx-auto opacity-10 mb-4" />
                                    <p className="text-muted-foreground">No pages linked yet. Go to Settings to fetch pages.</p>
                                </div>
                            ) : (
                                <div className={cn(
                                    viewMode === 'card'
                                        ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                                        : "flex flex-col gap-2"
                                )}>
                                    {pages.map(page => (
                                        <div
                                            key={page.id}
                                            onClick={() => togglePage(page)}
                                            className={cn(
                                                "p-4 rounded-xl border transition-all flex items-center gap-4 group relative overflow-hidden",
                                                selectedPages.includes(page.id)
                                                    ? "bg-primary/10 border-primary shadow-[0_0_20px_rgba(var(--primary),0.1)] cursor-pointer"
                                                    : "bg-background/40 border-border/40 hover:border-border/80 cursor-pointer",
                                                viewMode === 'list' && "p-2 px-4 rounded-lg"
                                            )}
                                        >
                                            <div className={cn(
                                                "absolute top-3 right-3 w-5 h-5 rounded-full border flex items-center justify-center transition-all z-20",
                                                selectedPages.includes(page.id) ? "bg-primary border-primary scale-110" : "border-muted/50 group-hover:border-primary/50 opacity-0 group-hover:opacity-100",
                                                viewMode === 'list' && "top-0 bottom-0 my-auto right-4"
                                            )}>
                                                {selectedPages.includes(page.id) && <Check className="w-3 h-3 text-primary-foreground" />}
                                            </div>

                                            <div className={cn(
                                                "relative rounded-full overflow-hidden border-2 border-border/40 group-hover:border-primary/50 transition-colors shrink-0 bg-zinc-900",
                                                viewMode === 'card' ? "w-12 h-12" : "w-8 h-8"
                                            )}>
                                                {page.picture_url ? (
                                                    <img src={page.picture_url} alt={page.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <Globe className={cn("absolute inset-0 m-auto opacity-20", viewMode === 'card' ? "w-6 h-6" : "w-4 h-4")} />
                                                )}
                                            </div>


                                            <div className="min-w-0 flex-1">
                                                <div className={cn("flex flex-col", viewMode === 'list' && "flex-row items-center gap-4")}>
                                                    <p className="font-semibold text-sm truncate">{page.name}</p>
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest truncate max-w-[100px]">{page.category || 'Page'}</p>
                                                        {page.followers_count !== undefined && (
                                                            <span className="text-[10px] text-primary/70 font-medium whitespace-nowrap">
                                                                • {page.followers_count.toLocaleString()} followers
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                        <CardFooter className="justify-end border-t border-border/40 pt-6">
                            <Button
                                disabled={selectedPages.length === 0}
                                onClick={() => {
                                    if (selectedVideos.length > 0) {
                                        if (selectedProfile !== null) {
                                            setStep(4);
                                        } else {
                                            setStep(3);
                                        }
                                    } else {
                                        setStep(2);
                                    }
                                }}
                                className="gap-2 px-8"
                            >
                                {selectedVideos.length > 0 ? (selectedProfile !== null ? 'Next: Details' : 'Next: Processing') : 'Next: Select Video'}
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </CardFooter>
                    </Card>
                )}

                {step === 2 && (
                    <Card className="border-border/40 bg-card/50 backdrop-blur-sm animate-in fade-in slide-in-from-right-4 duration-500">
                        <CardHeader>
                            <CardTitle>Select Video</CardTitle>
                            <CardDescription>Pick the video file to stream to the selected pages.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {videos.length === 0 ? (
                                <div className="text-center py-12 border border-dashed rounded-lg">
                                    <Video className="w-12 h-12 mx-auto opacity-10 mb-4" />
                                    <p className="text-muted-foreground">No videos in library. Scan a folder in the Video Library first.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                    {videos.map(video => (
                                        <div
                                            key={video.id}
                                            onClick={() => toggleVideo(video.id)}
                                            className={cn(
                                                "group relative aspect-video bg-black/40 rounded-lg overflow-hidden border-2 transition-all cursor-pointer",
                                                selectedVideos.includes(video.id) ? "border-primary shadow-[0_0_20px_rgba(var(--primary),0.2)]" : "border-transparent"
                                            )}
                                        >
                                            {video.thumbnail_path ? (
                                                <img src={`media:///${video.thumbnail_path.replace(/\\/g, '/')}`} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center"><Video className="w-6 h-6 opacity-20" /></div>
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <p className="text-[10px] font-medium truncate text-white w-full">{video.filename}</p>
                                            </div>
                                            {selectedVideos.includes(video.id) && (
                                                <div className="absolute top-2 right-2 bg-primary text-primary-foreground p-1 rounded-full">
                                                    <Check className="w-3 h-3" />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {/* Quick Settings Panel */}
                            {selectedVideos.length > 0 && (
                                <div className="mt-6 p-4 bg-zinc-900/50 rounded-xl border border-white/5 grid grid-cols-2 md:grid-cols-3 gap-4">
                                    <div className="flex flex-col gap-1 p-3 bg-background/30 rounded-lg border border-white/5">
                                        <Label className="text-[10px] uppercase font-bold opacity-50">Loop Mode</Label>
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
                                                        "h-7 px-2 text-[10px] gap-1.5 transition-all",
                                                        loop === m.id ? "bg-primary text-primary-foreground shadow-lg" : "text-zinc-400 hover:text-white"
                                                    )}
                                                >
                                                    <m.icon className="w-3 h-3" />
                                                    {m.label}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between p-3 bg-background/30 rounded-lg border border-white/5">
                                        <div className="flex items-center gap-2">
                                            <Layers className="w-4 h-4 text-purple-500" />
                                            <span className="text-sm font-medium">Pipeline</span>
                                        </div>
                                        <Badge variant="outline" className={cn("text-[10px]", selectedVideos.length > 1 ? "bg-purple-500/20 text-purple-400" : "bg-zinc-500/20")}>
                                            {selectedVideos.length > 1 ? 'Sequential' : 'Single Video'}
                                        </Badge>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => openEditor()}
                                        className="h-auto py-3 justify-start gap-2 border-white/10 hover:bg-white/5"
                                    >
                                        <Edit2 className="w-4 h-4 text-blue-500" />
                                        <span>Edit Processing</span>
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                        <CardFooter className="justify-between border-t border-border/40 pt-6">
                            <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                            <Button
                                disabled={selectedVideos.length === 0}
                                onClick={() => {
                                    if (selectedProfile !== null) {
                                        setStep(4);
                                    } else {
                                        setStep(3);
                                    }
                                }}
                                className="gap-2 px-8"
                            >
                                {selectedProfile !== null ? 'Next: Details' : 'Next: Processing'}
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </CardFooter>
                    </Card>
                )}

                {step === 3 && (
                    <Card className="border-border/40 bg-card/50 backdrop-blur-sm animate-in fade-in slide-in-from-right-4 duration-500">
                        <CardHeader>
                            <CardTitle>Processing Profile</CardTitle>
                            <CardDescription>Select an optional editing/processing profile for this stream.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div
                                    className={cn(
                                        "p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between group",
                                        selectedProfile === null ? "bg-primary/10 border-primary" : "bg-background/40 border-border/40"
                                    )}
                                >
                                    <div className="flex items-center gap-4 flex-1" onClick={() => {
                                        setSelectedProfile(null);
                                        // No reset to true here, keep user's manual choice if they had one, 
                                        // or leave as default.
                                    }}>
                                        <div className={cn("w-5 h-5 rounded border flex items-center justify-center", selectedProfile === null ? "bg-primary border-primary" : "border-muted")}>
                                            {selectedProfile === null && <Check className="w-3 h-3 text-primary-foreground" />}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-semibold text-sm">No Processing</p>
                                            <p className="text-[10px] text-muted-foreground uppercase">Original Video</p>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={(e) => { e.stopPropagation(); openEditor(); }}
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </Button>
                                </div>
                                {profiles.map(profile => (
                                    <div
                                        key={profile.id}
                                        className={cn(
                                            "p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between group",
                                            selectedProfile === profile.id ? "bg-primary/10 border-primary" : "bg-background/40 border-border/40"
                                        )}
                                    >
                                        <div className="flex items-center gap-4 flex-1" onClick={() => {
                                            setSelectedProfile(profile.id);
                                            try {
                                                const data = JSON.parse(profile.data);
                                                if (data.loop !== undefined) setLoop(Number(data.loop));
                                            } catch (e) { console.error('Failed to sync loop state:', e); }
                                        }}>
                                            <div className={cn("w-5 h-5 rounded border flex items-center justify-center", selectedProfile === profile.id ? "bg-primary border-primary" : "border-muted")}>
                                                {selectedProfile === profile.id && <Check className="w-3 h-3 text-primary-foreground" />}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-semibold text-sm truncate">{profile.name}</p>
                                                <p className="text-[10px] text-muted-foreground uppercase">Custom Preset</p>
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={(e) => { e.stopPropagation(); openEditor(profile); }}
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                        <CardFooter className="justify-between border-t border-border/40 pt-6">
                            <Button variant="ghost" onClick={() => {
                                if (selectedVideos.length > 0 && (location.state as any)?.selectedVideo) {
                                    setStep(1);
                                } else {
                                    setStep(2);
                                }
                            }}>Back</Button>
                            <Button
                                onClick={() => setStep(4)}
                                className="gap-2 px-8"
                            >
                                Next: Details
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </CardFooter>
                    </Card>
                )}

                {step === 4 && (
                    <Card className="border-border/40 bg-card/50 backdrop-blur-sm animate-in fade-in slide-in-from-right-4 duration-500">
                        <CardHeader>
                            <CardTitle>Stream Details</CardTitle>
                            <CardDescription>Configure the title and description for your Facebook Live video.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="title" className="flex items-center gap-2">
                                    <Type className="w-4 h-4 text-primary" />
                                    Stream Title
                                </Label>
                                <Input
                                    id="title"
                                    placeholder="Enter stream title..."
                                    value={titleTemplate}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitleTemplate(e.target.value)}
                                    className="bg-background/50"
                                />
                                <p className="text-[10px] text-muted-foreground">Default: Live: {videos.find(v => selectedVideos.includes(v.id))?.filename || 'Video'}</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="description" className="flex items-center gap-2">
                                    <AlignLeft className="w-4 h-4 text-primary" />
                                    Stream Description
                                </Label>
                                <Textarea
                                    id="description"
                                    placeholder="Enter stream description..."
                                    rows={4}
                                    value={descriptionTemplate}
                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescriptionTemplate(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="comment" className="flex items-center gap-2">
                                    <MessageSquare className="w-4 h-4 text-primary" />
                                    First Comment (Auto-Post & Pin)
                                </Label>
                                <Textarea
                                    id="comment"
                                    placeholder="Enter message to auto-post as the first comment..."
                                    rows={2}
                                    value={firstComment}
                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFirstComment(e.target.value)}
                                    className="bg-background/50 min-h-[60px]"
                                />
                                <p className="text-[10px] text-muted-foreground">This comment will be posted and pinned automatically once live.</p>
                            </div>
                        </CardContent>
                        <CardFooter className="justify-between border-t border-border/40 pt-6">
                            <Button variant="ghost" onClick={() => {
                                if (selectedProfile !== null && (location.state as any)?.selectedProfile) {
                                    setStep(1);
                                } else if (selectedVideos.length > 0 && (location.state as any)?.selectedVideo) {
                                    setStep(1);
                                } else {
                                    setStep(3);
                                }
                            }}>Back</Button>
                            <Button
                                onClick={() => setStep(5)}
                                className="gap-2 px-8"
                            >
                                Next: Schedule
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </CardFooter>
                    </Card>
                )}

                {step === 5 && (
                    <Card className="border-border/40 bg-card/50 backdrop-blur-sm animate-in fade-in slide-in-from-right-4 duration-500">
                        <CardHeader>
                            <CardTitle>Schedule Stream</CardTitle>
                            <CardDescription>Optionally set a date and time for these streams to start automatically.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <Label htmlFor="schedule" className="flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-primary" />
                                        Scheduled Time
                                    </Label>
                                    <Input
                                        id="schedule"
                                        type="datetime-local"
                                        value={scheduledTime}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setScheduledTime(e.target.value)}
                                        className="bg-background/50"
                                    />
                                    <p className="text-[10px] text-muted-foreground font-medium uppercase opacity-50">Empty for immediate start</p>
                                </div>
                                <div className="space-y-4 bg-zinc-900/40 p-6 rounded-2xl border border-white/5 flex flex-col justify-center">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-1">
                                            <Label className="text-base font-bold flex items-center gap-2">
                                                <Repeat className="w-4 h-4 text-primary" />
                                                Looping Strategy
                                            </Label>
                                            <p className="text-xs text-muted-foreground">Choose how the stream should repeat.</p>
                                        </div>
                                        <div className="flex gap-2 p-1.5 bg-black/40 rounded-xl border border-white/5">
                                            {[
                                                { id: 0, label: 'No Loop', desc: 'Stop at end' },
                                                { id: 1, label: 'Loop All', desc: 'Repeat list' },
                                                { id: 2, label: 'Loop One', desc: 'Repeat current' }
                                            ].map(m => (
                                                <button
                                                    key={m.id}
                                                    onClick={() => setLoop(m.id)}
                                                    className={cn(
                                                        "flex-1 p-3 rounded-lg border transition-all text-left group",
                                                        loop === m.id
                                                            ? "bg-primary/20 border-primary text-primary"
                                                            : "bg-background/20 border-white/5 text-zinc-400 hover:border-white/10 hover:text-white"
                                                    )}
                                                >
                                                    <p className="text-xs font-bold uppercase tracking-tight">{m.label}</p>
                                                    <p className="text-[10px] opacity-60 leading-none mt-1">{m.desc}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="justify-between border-t border-border/40 pt-6">
                            <Button variant="ghost" onClick={() => setStep(4)}>Back</Button>
                            <Button
                                onClick={() => setStep(6)}
                                className="gap-2 px-8"
                            >
                                Next: Review
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </CardFooter>
                    </Card>
                )}

                {step === 6 && (
                    <Card className="border-border/40 bg-card/50 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-500">
                        <CardHeader>
                            <CardTitle>Confirm Multi-Stream</CardTitle>
                            <CardDescription>Launch streaming jobs for {selectedPages.length} pages.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex gap-8 items-center p-6 bg-primary/5 rounded-2xl border border-primary/20">
                                <div className="w-48 aspect-video bg-black rounded-lg overflow-hidden border border-border/40 shadow-2xl">
                                    {(() => {
                                        const v = videos.find(vid => selectedVideos.includes(vid.id));
                                        return v?.thumbnail_path ? (
                                            <img src={`media:///${v.thumbnail_path.replace(/\\/g, '/')}`} className="w-full h-full object-cover" />
                                        ) : <div className="w-full h-full flex items-center justify-center"><Video /></div>;
                                    })()}
                                </div>
                                <div className="space-y-2">
                                    <h4 className="text-xl font-bold">
                                        {selectedVideos.length === 1
                                            ? videos.find(v => v.id === selectedVideos[0])?.filename
                                            : `${selectedVideos.length} Videos selected`}
                                    </h4>
                                    <p className="text-sm text-muted-foreground">Streaming to:</p>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedPages.map(id => (
                                            <Badge key={id} variant="outline" className="bg-background/80 px-3 py-1 border-muted">
                                                {pages.find(p => p.id === id)?.name}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-4 gap-4">
                                <div className="p-4 rounded-xl border border-border/40 bg-zinc-900/30">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Pages</p>
                                    <p className="text-2xl font-bold mt-1 text-blue-500">{selectedPages.length}</p>
                                </div>
                                <div className="p-4 rounded-xl border border-border/40 bg-zinc-900/30">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Videos</p>
                                    <p className="text-2xl font-bold mt-1 text-purple-500">{selectedVideos.length}</p>
                                </div>
                                <div className="p-4 rounded-xl border border-border/40 bg-zinc-900/30">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Schedule</p>
                                    <p className="text-sm font-bold mt-2 text-orange-500 truncate">
                                        {scheduledTime ? new Date(scheduledTime).toLocaleString() : 'Immediate'}
                                    </p>
                                </div>
                                <div className="p-4 rounded-xl border border-border/40 bg-zinc-900/30">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Loop Status</p>
                                    <p className={cn("text-sm font-bold mt-2", loop ? "text-emerald-500" : "text-zinc-500")}>
                                        {loop ? 'Infinite Loop' : 'Play Once'}
                                    </p>
                                </div>
                                <div className="p-4 rounded-xl border border-border/40 bg-zinc-900/30">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Stream Mode</p>
                                    <p className="text-sm font-bold mt-2 text-green-500">
                                        {selectedVideos.length > 1 ? 'Pipeline (Sequential)' : 'Static (Single)'}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="justify-between border-t border-border/40 pt-6">
                            <Button variant="ghost" onClick={() => setStep(5)}>Back</Button>
                            <Button
                                disabled={creating}
                                onClick={handleCreate}
                                className="bg-blue-600 hover:bg-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.4)] px-12 gap-2"
                            >
                                {creating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                                Launch Jobs
                            </Button>
                        </CardFooter>
                    </Card>
                )}
            </div>

            {/* Stream Queue / Activity Section */}
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <Activity className="w-5 h-5 text-blue-500" />
                            Recent Activity
                        </h2>
                        <p className="text-xs text-zinc-500">Real-time status of your broadcasting jobs</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {streamQueue.some(j => j.status === 'live') && (
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleStopAll}
                            className="h-7 px-3 text-[10px] font-bold uppercase tracking-wider bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-500/20"
                        >
                            Stop All
                        </Button>
                    )}
                    {streamQueue.length > 0 && (
                        <Badge variant="outline" className="text-[10px] animate-pulse">
                            Live Monitoring Active
                        </Badge>
                    )}
                </div>

                <div className="grid grid-cols-1 gap-3">
                    {streamQueue.length === 0 ? (
                        <div className="py-12 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 opacity-20">
                            <Activity className="w-8 h-8" />
                            <p className="text-xs font-bold uppercase tracking-wider">No active streams</p>
                        </div>
                    ) : (
                        streamQueue.map((job) => (
                            <div key={job.id} className="bg-zinc-900/40 border border-white/5 rounded-xl p-4 flex items-center justify-between group hover:bg-zinc-900/60 transition-all">
                                <div className="flex items-center gap-4">
                                    <div className={cn(
                                        "w-10 h-10 rounded-full flex items-center justify-center",
                                        job.status === 'live' ? "bg-emerald-500/10 text-emerald-500" :
                                            job.status === 'failed' ? "bg-red-500/10 text-red-500" :
                                                job.status === 'queued' ? "bg-blue-500/10 text-blue-500" : "bg-zinc-500/10 text-zinc-500"
                                    )}>
                                        {job.status === 'live' ? <Activity className="w-5 h-5 animate-pulse" /> :
                                            job.status === 'failed' || job.status === 'failed_recovery' ? <XCircle className="w-5 h-5" /> :
                                                job.status === 'queued' ? <Clock className="w-5 h-5" /> : <RefreshCw className="w-5 h-5 animate-spin" />}
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-sm text-white">{job.page_name}</span>
                                            <Badge variant="outline" className={cn(
                                                "text-[9px] px-1.5 py-0 capitalize border-none",
                                                job.status === 'live' ? "bg-emerald-500/20 text-emerald-400" :
                                                    job.status === 'failed' || job.status === 'failed_recovery' ? "bg-red-500/20 text-red-400" :
                                                        job.status === 'queued' ? "bg-blue-500/20 text-blue-400" : "bg-zinc-500/20 text-zinc-400"
                                            )}>
                                                {job.status.replace('_', ' ')}
                                            </Badge>
                                        </div>
                                        <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                                            <span className="flex items-center gap-1"><Video className="w-3 h-3" /> {job.video_name}</span>
                                            <span>•</span>
                                            <span>{formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-6">
                                    {job.status === 'live' && (
                                        <div className="flex items-center gap-4 text-right">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleStop(job.id)}
                                                className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                                            >
                                                <XCircle className="w-5 h-5" />
                                            </Button>
                                            <div className="flex flex-col items-end">
                                                <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-tight">Stats</div>
                                                <div className="text-[10px] font-medium text-blue-400">
                                                    {job.bitrate || '0 kbps'} • {job.fps || 0} fps
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-tight">Viewers</div>
                                                <div className="text-lg font-bold text-emerald-500 flex items-center gap-1 justify-end">
                                                    <Users className="w-3 h-3" />
                                                    {job.peak_viewers || 0}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {(job.status === 'failed' || job.status === 'failed_recovery' || job.status === 'stopped') && (
                                        <div className="flex items-center gap-4 text-right">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleRestart(job.id)}
                                                className="text-blue-500 hover:text-blue-400 hover:bg-blue-500/10"
                                            >
                                                <Repeat className="w-5 h-5" />
                                            </Button>
                                            <div className="text-right max-w-[200px]">
                                                <div className="text-[10px] text-red-500 uppercase font-bold tracking-tight">Status</div>
                                                <div className="text-[10px] text-zinc-400 truncate" title={job.error_log}>
                                                    {job.status === 'stopped' ? 'Stopped by user' : (job.error_log || 'Unexpected disruption')}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
            {
                isEditorOpen && editingProfile && (
                    <ProcessingEditor
                        initialData={{
                            ...editingProfile,
                            data: (() => {
                                const d = editingProfile.data;
                                if (!d) return undefined;
                                if (typeof d === 'string') {
                                    try { return JSON.parse(d); } catch { return undefined; }
                                }
                                return d;
                            })(),
                            videoPath: editingProfile.path || videos.find(v => selectedVideos.includes(v.id))?.path
                        }}
                        onSave={handleProfileSave}
                        onClose={() => setIsEditorOpen(false)}
                    />
                )

            }
        </div>
    );
}
