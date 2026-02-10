import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { FolderPlus, Trash2, Info, Search, RefreshCw, Film, Edit3, Play } from 'lucide-react';
import { Input } from '../components/ui/input';
import { ProcessingEditor } from '../components/ProcessingEditor';

interface Video {
    id: string;
    filename: string;
    path: string;
    thumbnail_path?: string;
    duration?: number;
    resolution?: string;
    created_at: string;
}

export const Library = () => {
    const navigate = useNavigate();
    const [videos, setVideos] = useState<Video[]>([]);
    const [loading, setLoading] = useState(false);
    const [scanProgress, setScanProgress] = useState<{ current: number, total: number, status: string } | null>(null);

    useEffect(() => {
        const cleanup = window.ipcRenderer.on('video:scan-progress', (_event, progress) => {
            setScanProgress(progress);
        });
        return () => {
            if (typeof cleanup === 'function') cleanup();
        };
    }, []);
    const [searchQuery, setSearchQuery] = useState('');
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [selectedVideoData, setSelectedVideoData] = useState<Video | null>(null);

    useEffect(() => {
        loadVideos();
    }, []);

    const loadVideos = async () => {
        try {
            setLoading(true);
            const data = await window.ipcRenderer.invoke('video:list');
            setVideos(data);
        } catch (e: any) {
            console.error('Failed to load videos:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleScanFolder = async () => {
        try {
            const result = await window.ipcRenderer.invoke('dialog:open-directory');
            if (!result || result.canceled || !result.filePaths || result.filePaths.length === 0) return;

            setLoading(true);
            const path = result.filePaths[0];
            const newVideos = await window.ipcRenderer.invoke('video:scan-folder', path);
            setVideos(prev => [...prev, ...newVideos]);
        } catch (e: any) {
            console.error('Folder scan failed:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleClearLibrary = async () => {
        if (!confirm('Are you sure you want to clear the entire library? This will remove all videos and thumbnails from the database.')) return;
        try {
            setLoading(true);
            await window.ipcRenderer.invoke('video:clear-library');
            setVideos([]);
        } catch (e: any) {
            console.error('Failed to clear library:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await window.ipcRenderer.invoke('video:delete', id);
            setVideos(videos.filter(v => v.id !== id));
        } catch (e: any) {
            console.error('Delete failed:', e);
        }
    };

    const handleSaveProfile = async (name: string, data: any) => {
        try {
            const profile = await window.ipcRenderer.invoke('profile:save', { name, data });
            setIsEditorOpen(false);
            // Navigate to Stream Manager with this video and profile selected
            if (selectedVideoData) {
                navigate('/stream', {
                    state: {
                        selectedVideo: selectedVideoData.id,
                        selectedProfile: profile.id
                    }
                });
            }
        } catch (e: any) {
            console.error('Failed to save profile:', e);
        }
    };

    const handleStreamDirect = (videoId: string) => {
        navigate('/stream', { state: { selectedVideo: videoId } });
    };

    const filteredVideos = videos.filter(v =>
        v.filename.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="p-8 space-y-8 max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Video Library</h1>
                    <p className="text-muted-foreground mt-1">Manage your video content for bulk streaming.</p>
                </div>
                <div className="flex gap-3">
                    <Button
                        variant="outline"
                        onClick={handleClearLibrary}
                        className="gap-2 border-red-500/20 text-red-500 hover:bg-red-500/10 hover:border-red-500/40"
                    >
                        <Trash2 className="w-4 h-4" />
                        Clear Library
                    </Button>
                    <Button onClick={handleScanFolder} className="gap-2 bg-blue-600 hover:bg-blue-500 shadow-[0_0_15px_rgba(37,99,235,0.3)]">
                        <FolderPlus className="w-4 h-4" />
                        Scan Folder
                    </Button>
                </div>
            </div>

            {scanProgress && scanProgress.status !== 'completed' && (
                <div className="bg-blue-600/10 border border-blue-500/20 rounded-xl p-4 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                            <span className="text-sm font-medium text-blue-400">{scanProgress.status}</span>
                        </div>
                        <span className="text-xs text-blue-500/60 font-mono">
                            {scanProgress.current} / {scanProgress.total}
                        </span>
                    </div>
                    <div className="h-1.5 w-full bg-blue-500/10 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-blue-500 transition-all duration-300 ease-out"
                            style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }}
                        />
                    </div>
                </div>
            )}

            <div className="flex items-center gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
                    <Input
                        placeholder="Search video files..."
                        className="pl-10 h-11 bg-background/50 border-border/40 focus:border-blue-500/50"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
                <Button variant="outline" size="icon" className="h-11 w-11" onClick={loadVideos}>
                    <RefreshCw className={loading ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
                </Button>
            </div>

            {loading && videos.length === 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="aspect-video rounded-xl bg-zinc-900/50 animate-pulse border border-border/20" />
                    ))}
                </div>
            ) : filteredVideos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-32 border-2 border-dashed border-border/20 rounded-2xl bg-zinc-900/10">
                    <Film className="w-16 h-16 opacity-5 mb-4" />
                    <p className="text-muted-foreground">No videos found. Try scanning a folder or changing your search.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {filteredVideos.map(video => (
                        <Card key={video.id} className="group overflow-hidden border-border/40 hover:border-blue-500/30 transition-all hover:shadow-[0_0_30px_rgba(37,99,235,0.1)] bg-zinc-900/30">
                            <CardContent className="p-0">
                                <div className="aspect-video relative bg-black flex items-center justify-center">
                                    {video.thumbnail_path ? (
                                        <img
                                            src={`media:///${video.thumbnail_path.replace(/\\/g, '/')}`}
                                            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                            onError={(e) => {
                                                console.error('Failed to load thumbnail:', video.thumbnail_path);
                                                (e.target as HTMLImageElement).src = ''; // Fallback
                                            }}
                                        />
                                    ) : (
                                        <Film className="w-12 h-12 opacity-10" />
                                    )}
                                    <div className="absolute inset-0 bg-black/40 group-hover:opacity-0 transition-opacity" />
                                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                        <Button size="icon" variant="secondary" className="h-8 w-8 bg-black/60 backdrop-blur-md border-white/10 hover:bg-black/80" onClick={() => handleStreamDirect(video.id)}>
                                            <Play className="w-4 h-4 text-green-400" />
                                        </Button>
                                        <Button size="icon" variant="secondary" className="h-8 w-8 bg-black/60 backdrop-blur-md border-white/10 hover:bg-black/80" onClick={() => {
                                            setSelectedVideoData(video);
                                            setIsEditorOpen(true);
                                        }}>
                                            <Edit3 className="w-4 h-4" />
                                        </Button>
                                        <Button size="icon" variant="destructive" className="h-8 w-8" onClick={() => handleDelete(video.id)}>
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                    <div className="absolute bottom-3 left-3 px-2 py-1 bg-black/60 backdrop-blur-md rounded text-[10px] font-bold text-white uppercase tracking-wider">
                                        {video.resolution || 'N/A'}
                                    </div>
                                </div>
                                <div className="p-4 space-y-1">
                                    <h3 className="font-semibold text-sm truncate pr-8" title={video.filename}>{video.filename}</h3>
                                    <div className="flex items-center justify-between text-[11px] opacity-50">
                                        <span className="flex items-center gap-1">
                                            <Info className="w-3 h-3" />
                                            {video.duration ? `${Math.round(video.duration / 60)}m` : 'N/A'}
                                        </span>
                                        <span>{new Date(video.created_at).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {isEditorOpen && selectedVideoData && (
                <ProcessingEditor
                    onClose={() => setIsEditorOpen(false)}
                    onSave={handleSaveProfile}
                    initialData={selectedVideoData}
                />
            )}
        </div>
    );
};
