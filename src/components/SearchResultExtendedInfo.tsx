import { useEffect, useState } from 'react';
import { tmdbMovieDetailsFull, tmdbTvDetailsFull } from '../lib/tmdb';

interface SearchResultExtendedInfoProps {
    id: number;
    mediaType: 'movie' | 'tv';
}

function formatRuntime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

export function SearchResultExtendedInfo({ id, mediaType }: SearchResultExtendedInfoProps) {
    const [runtime, setRuntime] = useState<number | null>(null);
    const [cast, setCast] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        setIsLoading(true);

        const fetchDetails = async () => {
            try {
                if (mediaType === 'movie') {
                    const details = await tmdbMovieDetailsFull(id);
                    if (isMounted && details) {
                        if (details.runtimeMinutes) setRuntime(details.runtimeMinutes);
                        if (details.cast) {
                            setCast(details.cast.slice(0, 5).map((c: any) => c.name));
                        }
                    }
                } else if (mediaType === 'tv') {
                    const details = await tmdbTvDetailsFull(id);
                    if (isMounted && details) {
                        // TV shows often don't have a single "runtimeMinutes" but an array of episode runtimes.
                        // Our cache stores it as runtimeMinutes (average or first episode).
                        if (details.runtimeMinutes) setRuntime(details.runtimeMinutes);
                        if (details.cast) {
                            setCast(details.cast.slice(0, 5).map((c: any) => c.name));
                        }
                    }
                }
            } catch (error) {
                // Silently fail, it's just supplementary info
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        fetchDetails();

        return () => {
            isMounted = false;
        };
    }, [id, mediaType]);

    if (isLoading) {
        return <div className="search-extended-skeleton" />;
    }

    if (!runtime && cast.length === 0) {
        return null; // Nothing to show
    }

    return (
        <>
            <span className="search-card-runtime">
                {runtime ? (
                    <>
                        <span className="search-card-dot">•</span> {formatRuntime(runtime)}
                    </>
                ) : null}
            </span>
            {cast.length > 0 && (
                <div className="search-card-cast">
                    {cast.join(', ')}
                </div>
            )}
        </>
    );
}
