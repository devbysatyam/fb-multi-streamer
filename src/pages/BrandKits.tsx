import { useState, useEffect } from 'react';
import { Plus, Trash2, Upload, Palette, LayoutTemplate, Monitor, Save } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Slider } from '../components/ui/slider';
import { cn } from '../lib/utils';

interface BrandKit {
    id: string;
    name: string;
    logo_path: string | null;
    logo_position: 'TR' | 'TL' | 'BR' | 'BL';
    logo_opacity: number;
    logo_scale: number;
    colors: string | null; // JSON string
    created_at: string;
}

export const BrandKits = () => {
    const [kits, setKits] = useState<BrandKit[]>([]);
    const [loading, setLoading] = useState(false);
    const [isCreating, setIsCreating] = useState(false);

    // Form State
    const [name, setName] = useState('');
    const [logoPath, setLogoPath] = useState<string | null>(null);
    const [position, setPosition] = useState<'TR' | 'TL' | 'BR' | 'BL'>('BR');
    const [opacity, setOpacity] = useState(1.0);
    const [scale, setScale] = useState(0.15);

    useEffect(() => {
        loadKits();
    }, []);

    const loadKits = async () => {
        try {
            setLoading(true);
            const data = await window.ipcRenderer.invoke('brand:list');
            setKits(data);
        } catch (e) {
            console.error('Failed to load brand kits:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleUploadLogo = async () => {
        const result = await window.ipcRenderer.invoke('dialog:open-image');
        if (result && !result.canceled && result.filePaths.length > 0) {
            setLogoPath(result.filePaths[0]);
        }
    };

    const handleSave = async () => {
        if (!name) return;
        try {
            await window.ipcRenderer.invoke('brand:save', {
                name,
                logo_path: logoPath,
                logo_position: position,
                logo_opacity: opacity,
                logo_scale: scale
            });
            setIsCreating(false);
            resetForm();
            loadKits();
        } catch (e) {
            console.error('Failed to save kit:', e);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this brand kit?')) return;
        try {
            await window.ipcRenderer.invoke('brand:delete', id);
            loadKits();
        } catch (e) {
            console.error('Failed to delete kit:', e);
        }
    };

    const resetForm = () => {
        setName('');
        setLogoPath(null);
        setPosition('BR');
        setOpacity(1.0);
        setScale(0.15);
    };

    return (
        <div className="p-8 space-y-8 max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Brand Kits</h1>
                    <p className="text-muted-foreground mt-1">Manage your visual identity assets for automated branding.</p>
                </div>
                <Button onClick={() => { setIsCreating(true); resetForm(); }} className="gap-2 bg-purple-600 hover:bg-purple-500">
                    <Plus className="w-4 h-4" />
                    Create New Kit
                </Button>
            </div>

            {isCreating && (
                <Card className="border-purple-500/30 bg-purple-500/5 animate-in fade-in slide-in-from-top-4">
                    <CardHeader>
                        <CardTitle>New Brand Kit</CardTitle>
                        <CardDescription>Configure your logo placement and style.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label>Kit Name</Label>
                                <Input placeholder="e.g. Main Channel Identity" value={name} onChange={e => setName(e.target.value)} />
                            </div>

                            <div className="space-y-2">
                                <Label>Logo / Watermark</Label>
                                <div className="flex gap-4 items-center">
                                    <div className="w-24 h-24 bg-black/40 rounded-lg border border-white/10 flex items-center justify-center overflow-hidden relative group">
                                        {logoPath ? (
                                            <img src={`media:///${logoPath.replace(/\\/g, '/')}`} className="w-full h-full object-contain" />
                                        ) : (
                                            <Upload className="w-8 h-8 opacity-20" />
                                        )}
                                    </div>
                                    <Button variant="outline" onClick={handleUploadLogo}>Upload PNG</Button>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            {/* Visual Position Selector */}
                            <div className="space-y-2">
                                <Label>Position</Label>
                                <div className="grid grid-cols-2 gap-2 w-32">
                                    {['TL', 'TR', 'BL', 'BR'].map((pos) => (
                                        <div
                                            key={pos}
                                            onClick={() => setPosition(pos as any)}
                                            className={cn(
                                                "h-10 rounded border cursor-pointer flex items-center justify-center text-xs font-bold transition-all",
                                                position === pos ? "bg-purple-500 text-white border-purple-500" : "bg-black/20 border-white/10 hover:bg-white/5"
                                            )}
                                        >
                                            {pos}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <div className="flex justify-between text-xs">
                                        <Label>Opacity</Label>
                                        <span className="text-muted-foreground">{Math.round(opacity * 100)}%</span>
                                    </div>
                                    <Slider value={[opacity]} min={0} max={1} step={0.1} onValueChange={([v]: number[]) => setOpacity(v)} />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-xs">
                                        <Label>Size (Scale)</Label>
                                        <span className="text-muted-foreground">{Math.round(scale * 100)}%</span>
                                    </div>
                                    <Slider value={[scale]} min={0.05} max={0.5} step={0.01} onValueChange={([v]: number[]) => setScale(v)} />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="justify-end gap-2 border-t border-purple-500/10 pt-4">
                        <Button variant="ghost" onClick={() => setIsCreating(false)}>Cancel</Button>
                        <Button onClick={handleSave} disabled={!name} className="gap-2 bg-purple-600 hover:bg-purple-500">
                            <Save className="w-4 h-4" />
                            Save Kit
                        </Button>
                    </CardFooter>
                </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {kits.map(kit => (
                    <Card key={kit.id} className="group hover:border-purple-500/50 transition-all bg-zinc-900/30">
                        <CardHeader className="pb-3">
                            <div className="flex justify-between items-start">
                                <CardTitle className="text-lg">{kit.name}</CardTitle>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-500" onClick={() => handleDelete(kit.id)}>
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="aspect-video bg-black/60 rounded-lg relative overflow-hidden border border-white/5">
                                <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                                    <LayoutTemplate className="w-12 h-12" />
                                </div>
                                {kit.logo_path && (
                                    <img
                                        src={`media:///${kit.logo_path.replace(/\\/g, '/')}`}
                                        className="absolute object-contain transition-all"
                                        style={{
                                            opacity: kit.logo_opacity,
                                            width: `${kit.logo_scale * 100}%`,
                                            top: kit.logo_position.includes('T') ? '5%' : 'auto',
                                            bottom: kit.logo_position.includes('B') ? '5%' : 'auto',
                                            left: kit.logo_position.includes('L') ? '5%' : 'auto',
                                            right: kit.logo_position.includes('R') ? '5%' : 'auto',
                                        }}
                                    />
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-4 text-xs text-muted-foreground">
                                <div className="flex items-center gap-2">
                                    <Monitor className="w-3 h-3" />
                                    <span>Pos: {kit.logo_position}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Palette className="w-3 h-3" />
                                    <span>Opacity: {Math.round(kit.logo_opacity * 100)}%</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {!isCreating && kits.length === 0 && !loading && (
                <div className="text-center py-20 border-2 border-dashed border-zinc-800 rounded-2xl">
                    <LayoutTemplate className="w-16 h-16 mx-auto opacity-10 mb-4" />
                    <h3 className="text-lg font-semibold">No Brand Kits Found</h3>
                    <p className="text-muted-foreground">Create your first kit to start branding your streams.</p>
                </div>
            )}
        </div>
    );
};
