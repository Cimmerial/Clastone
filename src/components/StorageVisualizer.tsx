import React, { useMemo } from 'react';
import type { ClassKey } from './RankedList';
import type { MovieShowItem } from './EntryRowMovieShow';
import './StorageVisualizer.css';

interface StorageVisualizerProps {
    label: string;
    byClass: Record<ClassKey, any[]>;
    classes: { key: ClassKey; label: string }[];
}

const FIRESTORE_LIMIT = 1048576; // 1MB

/** 
 * Rough estimation of Firestore document size for a list of items.
 * This counts characters in JSON string as a proxy for bytes.
 */
function estimateSize(items: any[]): number {
    if (!items || items.length === 0) return 0;
    try {
        // We stringify just the items since that's the bulk of the class-specific document
        return JSON.stringify({ items }).length;
    } catch (e) {
        return 0;
    }
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
}

export function StorageVisualizer({ label, byClass, classes }: StorageVisualizerProps) {
    const stats = useMemo(() => {
        return classes.map(cls => {
            const size = estimateSize(byClass[cls.key] || []);
            const percent = (size / FIRESTORE_LIMIT) * 100;
            return {
                key: cls.key,
                label: cls.label,
                size,
                percent
            };
        }).sort((a, b) => b.size - a.size);
    }, [byClass, classes]);

    return (
        <div className="storage-viz">
            <h3 className="storage-viz-title">{label} Storage breakdown</h3>
            <div className="storage-viz-list">
                {stats.map(stat => (
                    <div key={stat.key} className="storage-viz-item">
                        <div className="storage-viz-info">
                            <span className="storage-viz-label">{stat.label}</span>
                            <span className="storage-viz-size">{formatBytes(stat.size)}</span>
                        </div>
                        <div className="storage-viz-bar-bg">
                            <div
                                className={`storage-viz-bar-fill ${stat.percent > 90 ? 'critical' : stat.percent > 70 ? 'warning' : ''}`}
                                style={{ width: `${Math.min(100, Math.max(1, stat.percent))}%` }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
