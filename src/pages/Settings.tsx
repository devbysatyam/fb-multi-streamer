import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Shield, Save, RefreshCw, CheckCircle2, AlertTriangle, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';

interface AppSettings {
    appId: string;
    appSecret: string;
    userToken: string;
}

export const Settings = () => {
    const [settings, setSettings] = useState<AppSettings>({
        appId: '',
        appSecret: '',
        userToken: ''
    });
    const [saving, setSaving] = useState(false);
    const [fetchedPages, setFetchedPages] = useState<any[]>([]);
    const [fetching, setFetching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const saved = await window.ipcRenderer.invoke('settings:get-all');
            if (saved) {
                setSettings({
                    appId: saved.appId || '',
                    appSecret: saved.appSecret || '',
                    userToken: saved.userToken || ''
                });
            }
        } catch (e: any) {
            console.error('Failed to load settings:', e);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            await window.ipcRenderer.invoke('settings:save', settings);
            setSuccess('Settings saved successfully.');
            setError(null);
        } catch (e: any) {
            console.error('Failed to save settings:', e);
            setError('Failed to save settings.');
        } finally {
            setSaving(false);
        }
    };

    const fetchPages = async () => {
        if (!settings.appId || !settings.appSecret || !settings.userToken) return;
        try {
            setFetching(true);
            setError(null);
            setSuccess(null);
            const pages = await window.ipcRenderer.invoke('fb:fetch-pages', settings);
            setFetchedPages(pages);
            setSuccess(`Successfully synced ${pages.length} pages.`);
        } catch (e: any) {
            console.error('Failed to fetch pages:', e);
            setError(e.message || 'Failed to sync pages. Please check your credentials.');
        } finally {
            setFetching(false);
        }
    };

    const handleReset = async () => {
        if (!confirm('CRITICAL: This will delete ALL pages, videos, profiles, and stream history. This action cannot be undone. Are you sure?')) return;
        try {
            await window.ipcRenderer.invoke('system:reset-db');
            setSuccess('Application data has been reset. Please restart the app or re-sync your data.');
            setFetchedPages([]);
            setSettings({ appId: '', appSecret: '', userToken: '' });
        } catch (e: any) {
            console.error('Failed to reset data:', e);
            setError('Failed to reset data.');
        }
    };

    return (
        <div className="p-8 space-y-8 max-w-4xl mx-auto">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-xl">
                    <Shield className="w-8 h-8 text-primary" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                    <p className="text-muted-foreground mt-1">Manage your Facebook App credentials and tokens.</p>
                </div>
            </div>

            {error && (
                <Alert variant="destructive" className="bg-red-500/10 border-red-500/50 text-red-500 animate-in fade-in slide-in-from-top-4 duration-300">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {success && (
                <Alert className="bg-emerald-500/10 border-emerald-500/50 text-emerald-500 animate-in fade-in slide-in-from-top-4 duration-300">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>Success</AlertTitle>
                    <AlertDescription>{success}</AlertDescription>
                </Alert>
            )}

            <div className="grid gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Facebook App Credentials</CardTitle>
                        <CardDescription>Enter your developers.facebook.com app details.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="appId">App ID</Label>
                            <Input
                                id="appId"
                                value={settings.appId}
                                onChange={e => setSettings({ ...settings, appId: e.target.value })}
                                placeholder="e.g. 1234567890"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="appSecret">App Secret</Label>
                            <Input
                                id="appSecret"
                                type="password"
                                value={settings.appSecret}
                                onChange={e => setSettings({ ...settings, appSecret: e.target.value })}
                                placeholder="••••••••••••••••"
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Authentication Token</CardTitle>
                        <CardDescription>Use a User Access Token with page management permissions.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="userToken">User Access Token</Label>
                            <Input
                                id="userToken"
                                type="password"
                                value={settings.userToken}
                                onChange={e => setSettings({ ...settings, userToken: e.target.value })}
                                placeholder="Paste your Facebook token here"
                            />
                        </div>
                    </CardContent>
                    <CardFooter className="flex justify-between border-t border-border/40 pt-6">
                        <Button variant="outline" onClick={fetchPages} disabled={fetching || !settings.userToken}>
                            {fetching ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Sync Pages
                        </Button>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Save All Settings
                        </Button>
                    </CardFooter>
                </Card>

                {fetchedPages.length > 0 && (
                    <Card className="border-green-500/30 bg-green-500/5">
                        <CardHeader>
                            <CardTitle className="text-green-500 flex items-center gap-2">
                                <CheckCircle2 className="w-5 h-5" />
                                Pages Synced Successfully
                            </CardTitle>
                            <CardDescription>Found {fetchedPages.length} pages associated with this token.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-2">
                                {fetchedPages.map(page => (
                                    <div key={page.id} className="p-2 rounded bg-background/50 border border-border/40 text-xs">
                                        <p className="font-semibold">{page.name}</p>
                                        <p className="opacity-50 text-[10px]">{page.category}</p>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                <Card className="border-red-500/20 bg-red-500/5">
                    <CardHeader>
                        <CardTitle className="text-red-500 flex items-center gap-2">
                            <Trash2 className="w-5 h-5" />
                            Data Management & Cleanup
                        </CardTitle>
                        <CardDescription>Selectively clear application data. Actions are permanent.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => { if (confirm('Clear all stream history and queue?')) window.ipcRenderer.invoke('system:reset-streams').then(() => setSuccess('Stream history cleared.')); }}
                                className="justify-start text-left border-red-500/10 hover:bg-red-500/10 hover:text-red-400"
                            >
                                Clear Stream History
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => { if (confirm('Clear all videos from library?')) window.ipcRenderer.invoke('system:reset-videos').then(() => setSuccess('Video library cleared.')); }}
                                className="justify-start text-left border-red-500/10 hover:bg-red-500/10 hover:text-red-400"
                            >
                                Clear Video Library
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => { if (confirm('Clear all saved Facebook pages?')) window.ipcRenderer.invoke('system:reset-pages').then(() => { setSuccess('Pages cleared.'); setFetchedPages([]); }); }}
                                className="justify-start text-left border-red-500/10 hover:bg-red-500/10 hover:text-red-400"
                            >
                                Clear Saved Pages
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => { if (confirm('Clear all editing profiles/templates?')) window.ipcRenderer.invoke('system:reset-profiles').then(() => setSuccess('Profiles cleared.')); }}
                                className="justify-start text-left border-red-500/10 hover:bg-red-500/10 hover:text-red-400"
                            >
                                Clear Editing Profiles
                            </Button>
                        </div>
                        <div className="border-t border-red-500/10 pt-4 mt-4 space-y-3">
                            <div className="flex items-center justify-between p-4 rounded-lg bg-background/50 border border-yellow-500/10">
                                <div>
                                    <p className="text-sm font-bold">Reset Content Only</p>
                                    <p className="text-xs text-muted-foreground mt-1 text-zinc-500">Clear videos, streams, profiles but keep credentials AND pages.</p>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => { if (confirm('Clear content? (Credentials and pages will be kept)')) window.ipcRenderer.invoke('system:reset-content-only').then(() => setSuccess('Content cleared (credentials and pages kept).')); }}
                                    className="bg-yellow-500/10 hover:bg-yellow-500 text-yellow-500 hover:text-black border-yellow-500/20 transition-all"
                                >
                                    Reset Content
                                </Button>
                            </div>
                            <div className="flex items-center justify-between p-4 rounded-lg bg-background/50 border border-red-500/10">
                                <div>
                                    <p className="text-sm font-bold">Factory Reset (Keep Credentials)</p>
                                    <p className="text-xs text-muted-foreground mt-1 text-zinc-500">Clear everything except App ID, App Secret, and tokens.</p>
                                </div>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => { if (confirm('Clear all data EXCEPT credentials?')) window.ipcRenderer.invoke('system:reset-all-keep-credentials').then(() => { setSuccess('Data cleared (credentials kept).'); setFetchedPages([]); }); }}
                                    className="bg-orange-500/10 hover:bg-orange-500 text-orange-500 hover:text-white border-orange-500/20 transition-all"
                                >
                                    Reset Data
                                </Button>
                            </div>
                            <div className="flex items-center justify-between p-4 rounded-lg bg-background/50 border border-red-500/20">
                                <div>
                                    <p className="text-sm font-bold text-red-500">Full Factory Reset</p>
                                    <p className="text-xs text-muted-foreground mt-1 text-zinc-500">Delete ALL local data including credentials.</p>
                                </div>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={handleReset}
                                    className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border-red-500/20 transition-all"
                                >
                                    Nuclear Reset
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};
