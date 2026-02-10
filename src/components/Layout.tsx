import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Video, Settings, Radio, LayoutTemplate } from 'lucide-react';
import { cn } from '../lib/utils';
import { TitleBar } from './TitleBar';

export function Layout() {
    return (
        <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden">
            <TitleBar />

            <div className="flex flex-1 min-h-0">
                {/* Sidebar */}
                <aside className="w-60 border-r border-white/5 bg-zinc-900/50 flex flex-col">
                    <div className="p-6">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-1 h-4 bg-blue-500 rounded-full" />
                            <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Navigation</span>
                        </div>
                    </div>

                    <nav className="flex-1 px-4 space-y-2">
                        <NavItem to="/" icon={<LayoutDashboard size={20} />} label="Dashboard" />
                        <NavItem to="/library" icon={<Video size={20} />} label="Video Library" />
                        <NavItem to="/stream" icon={<Radio size={20} />} label="Stream Manager" />
                        <NavItem to="/brand-kits" icon={<LayoutTemplate size={20} />} label="Brand Kits" />
                        <NavItem to="/settings" icon={<Settings size={20} />} label="Settings" />
                    </nav>

                    <div className="mt-auto p-6 border-t border-white/5 bg-zinc-950/50">
                        <div className="space-y-1.5 flex flex-col">
                            <span className="text-[10px] text-blue-500 uppercase tracking-[0.2em] font-black">Lead Developer</span>
                            <div className="text-lg font-black tracking-tight text-white leading-tight">
                                Satyam Mishra
                            </div>
                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest opacity-80">
                                @devbysatyam
                            </div>
                        </div>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 overflow-auto bg-zinc-950">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
    return (
        <NavLink
            to={to}
            className={({ isActive }) =>
                cn(
                    "flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200",
                    "hover:bg-zinc-800/50 hover:text-white",
                    isActive
                        ? "bg-blue-600/10 text-blue-400 border border-blue-600/20"
                        : "text-zinc-400"
                )
            }
        >
            {icon}
            <span>{label}</span>
        </NavLink>
    );
}
