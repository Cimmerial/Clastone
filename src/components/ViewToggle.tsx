import { LayoutGrid, Rows3 } from 'lucide-react';
import { useSettingsStore } from '../state/settingsStore';
import './ViewToggle.css';

export function ViewToggle() {
    const { settings, updateSettings } = useSettingsStore();

    const cycleMode = () => {
        const modes: Array<'tile' | 'compact'> = ['tile', 'compact'];
        const currentMode = settings.viewMode === 'compact' ? 'compact' : 'tile';
        const currentIdx = modes.indexOf(currentMode);
        const nextMode = modes[(currentIdx + 1) % modes.length];
        updateSettings({ viewMode: nextMode });
    };

    const Icon = settings.viewMode === 'compact'
                ? Rows3
                : LayoutGrid;

    const getLabel = (mode: string) => {
        switch (mode) {
            case 'tile': return 'Tile';
            case 'compact': return 'Compact';
            default: return mode.charAt(0).toUpperCase() + mode.slice(1);
        }
    };

    const normalizedMode = settings.viewMode === 'compact' ? 'compact' : 'tile';
    const label = getLabel(normalizedMode);

    return (
        <button
            className="view-toggle-btn"
            onClick={cycleMode}
            title={`Current View: ${label}. Click to cycle.`}
        >
            <Icon size={18} />
            <span className="view-toggle-label">{label}</span>
        </button>
    );
}
