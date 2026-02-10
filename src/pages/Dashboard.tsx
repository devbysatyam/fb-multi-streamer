import React, { useState, useEffect } from 'react';
import { Activity, Users, Clock, AlertTriangle, Play, Square, Edit3, X, ExternalLink, Video, Cpu, Zap, HardDrive } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';

export function Dashboard() {
    const [stats, setStats] = useState({
        activeStreams: 0,
        totalViewers: 0,
        queuedJobs: 0,
        healthStatus: 'Good'
    });
    const [activeJobs, setActiveJobs] = useState<any[]>([]);
    const [editingJob, setEditingJob] = useState<any>(null);
    const [editForm, setEditForm] = useState({ title: '', description: '' });
    const [saving, setSaving] = useState(false);
    const [sysStats, setSysStats] = useState<any>(null);

    const loadStats = async () => {
        const stats = await window.ipcRenderer.invoke('resource:stats');
        if (stats) setSysStats(stats);
    };

    const loadData = async () => {
        try {
            const streams = await window.ipcRenderer.invoke('stream:list');
            const live = streams.filter((s: any) => s.status === 'live');
            const queued = streams.filter((s: any) => s.status === 'queued');
            const viewers = live.reduce((sum: number, s: any) => sum + (s.peak_viewers || 0), 0);

            setStats({
                activeStreams: live.length,
                totalViewers: viewers,
                queuedJobs: queued.length,
                healthStatus: live.length > 5 ? 'High Load' : 'Good'
            });
            setActiveJobs(live);
        } catch (e) {
            console.error('Failed to load dashboard stats:', e);
        }
    };

    useEffect(() => {
        loadData();
        loadStats();
        const dataInterval = setInterval(loadData, 5000);
        const statsInterval = setInterval(loadStats, 2000);
        return () => {
            clearInterval(dataInterval);
            clearInterval(statsInterval);
        };
    }, []);

    const handleStop = async (jobId: string) => {
        try {
            await window.ipcRenderer.invoke('stream:stop', jobId);
            loadData();
        } catch (e) {
            console.error('Failed to stop stream:', e);
        }
    };

    const handleStopAll = async () => {
        if (!confirm('Are you sure you want to stop ALL active streams?')) return;
        try {
            await window.ipcRenderer.invoke('stream:stop-all');
            loadData();
        } catch (e) {
            console.error('Failed to stop all streams:', e);
        }
    };

    const openEdit = (job: any) => {
        setEditingJob(job);
        setEditForm({
            title: job.title_template || '',
            description: job.description_template || ''
        });
    };

    const handleSaveMetadata = async () => {
        if (!editingJob) return;
        setSaving(true);
        try {
            await window.ipcRenderer.invoke('stream:update-metadata', {
                jobId: editingJob.id,
                title: editForm.title,
                description: editForm.description
            });
            setEditingJob(null);
            loadData();
        } catch (e) {
            console.error('Failed to update metadata:', e);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="p-8 space-y-8 max-w-7xl mx-auto custom-scrollbar overflow-y-auto h-[calc(100vh-64px)]">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Infrastructure Overview</h1>
                    <p className="text-zinc-500 mt-1">Real-time health and performance monitoring.</p>
                </div>
                <div className="flex items-center gap-6">
                    {sysStats && (
                        <div className="hidden lg:flex items-center gap-6 pr-6 border-r border-white/10">
                            <div className="flex items-center gap-2">
                                <Cpu className="w-4 h-4 text-blue-400" />
                                <div className="space-y-0.5">
                                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-tight">CPU</p>
                                    <p className="text-xs font-bold text-white tabular-nums">{sysStats.cpu.load.toFixed(0)}%</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Zap className="w-4 h-4 text-amber-400" />
                                <div className="space-y-0.5">
                                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-tight">GPU</p>
                                    <p className="text-xs font-bold text-white tabular-nums">{sysStats.gpus?.[0]?.load || 0}%</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <HardDrive className="w-4 h-4 text-emerald-400" />
                                <div className="space-y-0.5">
                                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-tight">MEM</p>
                                    <p className="text-xs font-bold text-white tabular-nums">{(sysStats.memory.used / 1024).toFixed(1)}GB</p>
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="flex items-center gap-3 bg-zinc-900/50 border border-white/5 px-4 py-2 rounded-full text-xs font-medium">
                        <span className={cn("w-2 h-2 rounded-full animate-pulse", stats.healthStatus === 'Good' ? "bg-emerald-500" : "bg-amber-500")}></span>
                        <span className="text-zinc-300">System {stats.healthStatus}</span>
                    </div>
                </div>
                {activeJobs.length > 0 && (
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleStopAll}
                        className="rounded-full bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border-red-500/20 px-6 text-[10px] font-bold uppercase tracking-widest transition-all h-9"
                    >
                        <Square className="w-3 h-3 mr-2" />
                        Stop All Streams
                    </Button>
                )}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Active Streams" value={stats.activeStreams} icon={<Activity className="text-blue-500" />} />
                <StatCard title="Live Viewers" value={stats.totalViewers.toLocaleString()} icon={<Users className="text-emerald-500" />} />
                <StatCard title="Queue Depth" value={stats.queuedJobs} icon={<Clock className="text-amber-500" />} />
                <StatCard title="Health Status" value={stats.healthStatus} icon={<AlertTriangle className={stats.healthStatus === 'Good' ? "text-emerald-500" : "text-amber-500"} />} />
            </div>

            {/* Active Streams Section */}
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Play className="w-5 h-5 text-emerald-500" />
                        Live Channels
                    </h2>
                    <Button variant="ghost" className="text-xs text-zinc-500 hover:text-white" onClick={() => window.location.hash = '/stream'}>
                        Manage All <ExternalLink className="w-3 h-3 ml-2" />
                    </Button>
                </div>

                {activeJobs.length === 0 ? (
                    <div className="h-[300px] border-2 border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center text-zinc-500 gap-4 bg-zinc-900/20">
                        <Activity className="w-12 h-12 opacity-10" />
                        <div className="text-center">
                            <p className="font-bold text-zinc-400">No Active Streams</p>
                            <p className="text-xs opacity-50">Launch a job from the Stream Manager to see it here.</p>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {activeJobs.map(job => (
                            <ActiveStreamTile key={job.id} job={job} onStop={handleStop} onEdit={openEdit} />
                        ))}
                    </div>
                )}
            </div>

            {/* Editing Modal Overlay */}
            {editingJob && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
                    <Card className="w-full max-w-md bg-zinc-950 border-white/10 shadow-2xl">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-xl">Update Stream Metadata</CardTitle>
                                <CardDescription>Changes will reflect on Facebook live video immediately.</CardDescription>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setEditingJob(null)} disabled={saving}>
                                <X className="w-4 h-4" />
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-6 py-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest opacity-50">Title</Label>
                                <Input
                                    value={editForm.title}
                                    onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                                    className="bg-black/50 border-white/10 h-10"
                                    placeholder="Enter new title..."
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest opacity-50">Description</Label>
                                <Textarea
                                    value={editForm.description}
                                    onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                                    className="bg-black/50 border-white/10 min-h-[100px]"
                                    placeholder="Enter new description..."
                                />
                            </div>
                            <div className="flex gap-3 pt-4">
                                <Button variant="outline" className="flex-1" onClick={() => setEditingJob(null)} disabled={saving}>Cancel</Button>
                                <Button className="flex-1 bg-blue-600 hover:bg-blue-500" onClick={handleSaveMetadata} disabled={saving}>
                                    {saving ? 'Updating...' : 'Save Changes'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
            `}</style>
        </div>
    );
}

function ActiveStreamTile({ job, onStop, onEdit }: { job: any, onStop: (id: string) => void, onEdit: (job: any) => void }) {
    return (
        <Card className="overflow-hidden border-white/5 bg-zinc-900/40 hover:bg-zinc-900/60 transition-all group">
            <div className="aspect-video relative bg-black flex items-center justify-center border-b border-white/5">
                <div className="absolute top-3 left-3 z-10">
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-none shadow-sm backdrop-blur-md animate-pulse">
                        LIVE
                    </Badge>
                </div>
                <div className="absolute top-3 right-3 z-10 flex gap-1">
                    <Button variant="secondary" size="icon" className="h-8 w-8 bg-black/60 hover:bg-blue-600 backdrop-blur-md border-white/10" onClick={() => onEdit(job)}>
                        <Edit3 className="w-4 h-4 text-white" />
                    </Button>
                    <Button variant="secondary" size="icon" className="h-8 w-8 bg-black/60 hover:bg-red-600 backdrop-blur-md border-white/10" onClick={() => onStop(job.id)}>
                        <Square className="w-4 h-4 text-white" />
                    </Button>
                </div>

                {/* Visual Representation of Stream */}
                <div className="absolute inset-0 opacity-40 group-hover:opacity-60 transition-opacity">
                    <div className="w-full h-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
                        <Activity className="w-12 h-12 text-white/10 animate-pulse" />
                    </div>
                </div>

                <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black to-transparent">
                    <p className="text-xs text-zinc-400 font-medium">Streaming to:</p>
                    <p className="text-sm font-bold text-white truncate">{job.page_name}</p>
                </div>
            </div>

            <CardContent className="p-4 bg-zinc-950/40">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-tight">Bitrate</p>
                        <p className="text-xs font-bold text-blue-400">{job.bitrate || 'Initializing...'}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-tight">Performance</p>
                        <p className="text-xs font-bold text-purple-400">{job.fps || 0} FPS</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-tight">Viewers</p>
                        <p className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {job.peak_viewers || 0}
                        </p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-tight">Started</p>
                        <p className="text-[10px] font-medium text-zinc-400">
                            {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                        </p>
                    </div>
                </div>

                <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-2">
                    <Video className="w-3 h-3 text-zinc-500" />
                    <span className="text-[10px] text-zinc-500 truncate" title={job.video_name}>{job.video_name}</span>
                </div>
            </CardContent>
        </Card>
    );
}

function StatCard({ title, value, icon }: { title: string; value: string | number; icon: React.ReactNode }) {
    return (
        <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 flex flex-col gap-3 transition-all hover:bg-zinc-900 hover:border-white/10 group">
            <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">{title}</span>
                <div className="p-2 bg-zinc-950 rounded-xl group-hover:scale-110 transition-transform">{icon}</div>
            </div>
            <div className="text-3xl font-bold text-white tracking-tight">
                {value}
            </div>
        </div>
    );
}

function cn(...inputs: any[]) {
    return inputs.filter(Boolean).join(' ');
}
