import React from 'react';
import './MigrationOverlay.css';

export type MigrationStep = {
    id: string;
    label: string;
    status: 'pending' | 'running' | 'completed' | 'error';
    message?: string;
};

type Props = {
    steps: MigrationStep[];
    progress: number;
    isComplete: boolean;
    error?: string;
    onClose: () => void;
};

export function MigrationOverlay({ steps, progress, isComplete, error, onClose }: Props) {
    return (
        <div className="migration-overlay">
            <div className="migration-modal card-surface">
                <h2 className="migration-title">Data Migration in Progress</h2>
                <p className="migration-description">
                    Please stay on this page. We are transitioning your data to the new scalable structure.
                </p>

                <div className="migration-progress-container">
                    <div className="migration-progress-bar">
                        <div
                            className="migration-progress-fill"
                            style={{ width: `${progress}%` }}
                        ></div>
                    </div>
                    <span className="migration-progress-text">{Math.round(progress)}%</span>
                </div>

                <div className="migration-steps-log">
                    {steps.map((step) => (
                        <div key={step.id} className={`migration-step-item status-${step.status}`}>
                            <div className="step-indicator">
                                {step.status === 'completed' && <span className="step-icon">✓</span>}
                                {step.status === 'running' && <span className="step-spinner"></span>}
                                {step.status === 'error' && <span className="step-icon">!</span>}
                                {step.status === 'pending' && <span className="step-dot"></span>}
                            </div>
                            <div className="step-content">
                                <div className="step-label">{step.label}</div>
                                {step.message && <div className="step-message">{step.message}</div>}
                            </div>
                        </div>
                    ))}
                </div>

                {error && (
                    <div className="migration-error-box">
                        <p><strong>Migration Error:</strong> {error}</p>
                        {error.includes('BLOCKED_BY_CLIENT') && (
                            <p className="error-tip">
                                Tip: This error is often caused by ad-blockers blocking Firebase. Please try disabling your ad-blocker for this site and retry.
                            </p>
                        )}
                    </div>
                )}

                {isComplete && (
                    <div className="migration-success-footer">
                        <p className="success-msg">✓ Migration successful! Your data is now scalable.</p>
                        <button className="settings-btn settings-btn-primary" onClick={onClose}>
                            Close & Finish
                        </button>
                    </div>
                )}

                {error && (
                    <div className="migration-error-footer">
                        <button className="settings-btn" onClick={onClose}>
                            Close & Retry
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
