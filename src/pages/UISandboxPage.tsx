import { useState } from 'react';
import { RecordWatchModal } from '../components/RecordWatchModal';
import { useMoviesStore } from '../state/moviesStore';
import { usePeopleStore } from '../state/peopleStore';
import { useDirectorsStore } from '../state/directorsStore';
import './UISandboxPage.css';

const MOCK_MOVIE_TARGET = {
    id: 550,
    title: 'Fight Club',
    media_type: 'movie' as const,
    poster_path: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
    releaseDate: '1999-10-15',
    runtimeMinutes: 139
};

const MOCK_TV_TARGET = {
    id: 1396,
    title: 'Breaking Bad',
    media_type: 'tv' as const,
    poster_path: '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
    releaseDate: '2008-01-20',
    totalEpisodes: 62
};

const MOCK_PERSON_TARGET = {
    id: 54693,
    title: 'Emma Stone',
    media_type: 'person' as const,
};

type ActiveModal = 'first-watch' | 'edit-watch' | 'person-actor' | 'person-director' | null;

export function UISandboxPage() {
    const [activeModal, setActiveModal] = useState<ActiveModal>(null);
    const { classes: movieClasses, isRankedClass } = useMoviesStore();
    const { classes: peopleClasses } = usePeopleStore();
    const { classes: directorClasses } = useDirectorsStore();

    const rankedMovieClasses = movieClasses
        .filter(c => isRankedClass(c.key))
        .map(c => ({ key: c.key, label: c.label, tagline: c.tagline }));

    const rankedPeopleClasses = peopleClasses
        .filter(c => c.key !== 'UNRANKED')
        .map(c => ({ key: c.key, label: c.label, tagline: c.tagline }));

    const rankedDirectorClasses = directorClasses
        .filter(c => c.key !== 'UNRANKED')
        .map(c => ({ key: c.key, label: c.label, tagline: c.tagline }));

    return (
        <section className="sandbox-page">
            <header className="page-heading">
                <div>
                    <h1 className="page-title">UI Sandbox</h1>
                    <p className="page-subtitle" style={{ color: 'var(--text-muted)' }}>
                        Preview modal UI variants. No data is saved.
                    </p>
                </div>
            </header>

            <div className="sandbox-grid">

                {/* ── Variant A: First Watch (Movie) ── */}
                <div className="sandbox-card card-surface">
                    <div className="sandbox-card-badge sandbox-badge-blue">mode: first-watch</div>
                    <h2 className="sandbox-card-title">Record First Watch</h2>
                    <p className="sandbox-card-desc">
                        For an unranked movie or TV show. Requires at least one watch entry and a class selection.
                        Footer shows <strong>Save and close</strong> + <strong>Save and go to movie</strong>.
                    </p>
                    <ul className="sandbox-card-features">
                        <li>✓ Left col: watch type + date dropdowns</li>
                        <li>✓ "P" preset button (Today / Yesterday / This Year / Reset)</li>
                        <li>✓ Right col: ranked class list + ↑ • ↓ placement</li>
                        <li>✓ Validation: class + year required</li>
                    </ul>
                    <button
                        type="button"
                        className="sandbox-launch-btn"
                        onClick={() => setActiveModal('first-watch')}
                    >
                        Open — First Watch (Movie)
                    </button>
                </div>

                {/* ── Variant B: Edit Watch (already ranked) ── */}
                <div className="sandbox-card card-surface">
                    <div className="sandbox-card-badge sandbox-badge-amber">mode: edit-watch</div>
                    <h2 className="sandbox-card-title">Edit Watch History</h2>
                    <p className="sandbox-card-desc">
                        For an item already in a ranked class. Edits existing watches. Class stays unchanged
                        unless user explicitly opens the override panel.
                        Footer shows <strong>Save and close</strong> only.
                    </p>
                    <ul className="sandbox-card-features">
                        <li>✓ Left col: existing watches editable</li>
                        <li>✓ Right col: "Keep current rank" row with class name</li>
                        <li>✓ "Override class →" toggle reveals full class picker</li>
                        <li>✓ No "Save and go to" button</li>
                    </ul>
                    <button
                        type="button"
                        className="sandbox-launch-btn sandbox-launch-btn--amber"
                        onClick={() => setActiveModal('edit-watch')}
                    >
                        Open — Edit Watch (TV Show)
                    </button>
                </div>

                {/* ── Variant C: Person / Actor ── */}
                <div className="sandbox-card card-surface">
                    <div className="sandbox-card-badge sandbox-badge-purple">mode: person</div>
                    <h2 className="sandbox-card-title">Add Actor</h2>
                    <p className="sandbox-card-desc">
                        For actors. No watch history — just class ranking with placement buttons.
                        Footer shows <strong>Save and close</strong> + <strong>Add to list and go</strong>.
                    </p>
                    <ul className="sandbox-card-features">
                        <li>✓ No left watch column</li>
                        <li>✓ Right col only: class list + ↑ • ↓</li>
                        <li>✓ Add to Unranked shortcut</li>
                    </ul>
                    <button
                        type="button"
                        className="sandbox-launch-btn sandbox-launch-btn--purple"
                        onClick={() => setActiveModal('person-actor')}
                    >
                        Open — Add Actor
                    </button>
                </div>

                {/* ── Variant D: Person / Director ── */}
                <div className="sandbox-card card-surface">
                    <div className="sandbox-card-badge sandbox-badge-purple">mode: person</div>
                    <h2 className="sandbox-card-title">Add Director</h2>
                    <p className="sandbox-card-desc">
                        Same as actor but uses director classes.
                    </p>
                    <ul className="sandbox-card-features">
                        <li>✓ Director class list</li>
                        <li>✓ "Add to Directors" primary button</li>
                    </ul>
                    <button
                        type="button"
                        className="sandbox-launch-btn sandbox-launch-btn--purple"
                        onClick={() => setActiveModal('person-director')}
                    >
                        Open — Add Director
                    </button>
                </div>

            </div>

            {/* ── Modals ── */}
            {activeModal === 'first-watch' && (
                <RecordWatchModal
                    target={MOCK_MOVIE_TARGET}
                    mode="first-watch"
                    rankedClasses={rankedMovieClasses}
                    isSaving={false}
                    onClose={() => setActiveModal(null)}
                    onSave={(_params, _go) => { setActiveModal(null); }}
                />
            )}

            {activeModal === 'edit-watch' && (
                <RecordWatchModal
                    target={MOCK_TV_TARGET}
                    mode="edit-watch"
                    currentClassKey="S_TIER"
                    currentClassLabel={rankedMovieClasses[0]?.label ?? 'S Tier'}
                    rankedClasses={rankedMovieClasses}
                    initialRecords={[
                        { id: 'mock-1', type: 'DATE', year: 2022, month: 3, day: 15 },
                        { id: 'mock-2', type: 'DATE', year: 2024, month: 8 }
                    ]}
                    isSaving={false}
                    onClose={() => setActiveModal(null)}
                    onRemoveEntry={() => { setActiveModal(null); }}
                    onSave={(_params, _go) => { setActiveModal(null); }}
                />
            )}

            {activeModal === 'person-actor' && (
                <RecordWatchModal
                    target={MOCK_PERSON_TARGET}
                    mode="person"
                    rankedClasses={rankedPeopleClasses}
                    isSaving={false}
                    primaryButtonLabel="Add to Actors"
                    onClose={() => setActiveModal(null)}
                    onSave={(_params, _go) => { setActiveModal(null); }}
                    onAddToUnranked={() => { setActiveModal(null); }}
                />
            )}

            {activeModal === 'person-director' && (
                <RecordWatchModal
                    target={{ ...MOCK_PERSON_TARGET, title: 'Christopher Nolan' }}
                    mode="person"
                    rankedClasses={rankedDirectorClasses}
                    isSaving={false}
                    primaryButtonLabel="Add to Directors"
                    onClose={() => setActiveModal(null)}
                    onSave={(_params, _go) => { setActiveModal(null); }}
                    onAddToUnranked={() => { setActiveModal(null); }}
                />
            )}
        </section>
    );
}
