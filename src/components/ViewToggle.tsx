import { LayoutList, StretchHorizontal, LayoutGrid } from 'lucide-react';
import { useSettingsStore } from '../state/settingsStore';
import './ViewToggle.css';

export function ViewToggle() {
    const { settings, updateSettings } = useSettingsStore();

    const cycleMode = () => {
        const modes: Array<'minimized' | 'detailed' | 'tile'> = ['minimized', 'detailed', 'tile'];
        const currentIdx = modes.indexOf(settings.viewMode);
        const nextMode = modes[(currentIdx + 1) % modes.length];
        updateSettings({ viewMode: nextMode });
    };

    const Icon = settings.viewMode === 'minimized'
        ? LayoutList
        : settings.viewMode === 'detailed'
            ? StretchHorizontal
            : LayoutGrid;

    const label = settings.viewMode.charAt(0).toUpperCase() + settings.viewMode.slice(1);

    return (
        <button
            className="view-toggle-btn"
            onClick={cycleMode}
            title={`Current View: ${label}. Click to cycle.`}
        >
            <Icon size={18} />
        </button>
    );
}
