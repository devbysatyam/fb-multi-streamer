import { Minus, Square, X, Radio } from 'lucide-react';

export function TitleBar() {
    const handleMinimize = () => {
        (window as any).ipcRenderer.invoke('log:message', 'info', 'Renderer: Minimize clicked');
        (window as any).ipcRenderer.invoke('window:minimize');
    };

    const handleMaximize = () => {
        (window as any).ipcRenderer.invoke('log:message', 'info', 'Renderer: Maximize clicked');
        (window as any).ipcRenderer.invoke('window:maximize');
    };

    const handleClose = () => {
        (window as any).ipcRenderer.invoke('log:message', 'info', 'Renderer: Close clicked');
        (window as any).ipcRenderer.invoke('window:close');
    };

    return (
        <div className="h-8 bg-zinc-950 flex items-center justify-between border-b border-white/5 select-none relative z-[9999] w-full">
            {/* Draggable background overlay - must NOT have pointer-events-none */}
            <div
                className="absolute inset-0 z-0"
                style={{ WebkitAppRegion: 'drag' } as any}
            />

            {/* Foreground content - kept relative and higher than drag for visibility, but no-drag where needed */}
            <div className="flex items-center gap-2 px-3 relative z-10 pointer-events-none">
                <div className="w-5 h-5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded flex items-center justify-center shadow-lg shadow-blue-500/20">
                    <Radio className="w-3 h-3 text-white" />
                </div>
                <span className="text-[11px] font-bold tracking-wider text-zinc-400 uppercase">
                    FB Streamer <span className="text-zinc-100 font-black">v0.1.6-PRO</span>
                </span>
            </div>

            {/* Window Controls - Explicit no-drag zone with highest priority */}
            <div
                className="flex items-center h-full relative z-[100] bg-transparent"
                style={{ WebkitAppRegion: 'no-drag' } as any}
            >
                <button
                    onClick={handleMinimize}
                    title="Minimize"
                    className="w-12 h-8 flex items-center justify-center hover:bg-white/10 transition-colors text-zinc-400 hover:text-white cursor-pointer pointer-events-auto bg-transparent border-none outline-none focus:outline-none"
                >
                    <Minus size={14} />
                </button>
                <button
                    onClick={handleMaximize}
                    title="Maximize"
                    className="w-12 h-8 flex items-center justify-center hover:bg-white/10 transition-colors text-zinc-400 hover:text-white cursor-pointer pointer-events-auto bg-transparent border-none outline-none focus:outline-none"
                >
                    <Square size={12} />
                </button>
                <button
                    onClick={handleClose}
                    title="Close"
                    className="w-12 h-8 flex items-center justify-center hover:bg-red-500 transition-colors text-zinc-400 hover:text-white group cursor-pointer pointer-events-auto bg-transparent border-none outline-none focus:outline-none"
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    );
}
