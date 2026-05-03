import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import quotesData from '../data/quotes.json';
import { db } from '../lib/firebase';
import { loadGlobalQuotes, type FirebaseQuote } from '../lib/firestoreQuotes';
import './RandomQuote.css';

type Quote = { text: string; character: string; source: string };
type QuotesData = Record<string, Quote[]>;

const typedQuotesData = quotesData as QuotesData;

function flattenQuoteBuckets(source: QuotesData): Quote[] {
  return Object.values(source).flat();
}

function movieAndTvQuotes(source: QuotesData): Quote[] {
  return [...(source.movies ?? []), ...(source.tv ?? [])];
}
const DIRK_DIGGLER_TEXT = 'Dirk Diggler';

function renderHighlightedDirk(text: string) {
    if (!text.includes(DIRK_DIGGLER_TEXT)) return text;
    return text.split(DIRK_DIGGLER_TEXT).flatMap((part, index, parts) => {
        if (index === parts.length - 1) return [part];
        return [
            part,
            <span key={`dirk-diggler-${index}`} className="random-quote-dirk-diggler">
                {DIRK_DIGGLER_TEXT}
            </span>,
        ];
    });
}

export function RandomQuote() {
    const location = useLocation();
    const [quote, setQuote] = useState<Quote | null>(null);
    const [firebaseQuotes, setFirebaseQuotes] = useState<FirebaseQuote[] | null>(null);

    const groupedFirebaseQuotes = useMemo(() => {
        if (!firebaseQuotes) return null;
        const grouped: Record<string, Quote[]> = {};
        firebaseQuotes.forEach((item) => {
            if (!grouped[item.category]) grouped[item.category] = [];
            grouped[item.category].push({
                text: item.text,
                character: item.speakerFirstName || item.character,
                source: item.source,
            });
        });
        return grouped;
    }, [firebaseQuotes]);

    const activeCategoryQuotes = useMemo(() => {
        const segments = location.pathname.split('/').filter(Boolean);
        const path = segments[0] || 'profile';
        const quoteSource = groupedFirebaseQuotes ?? typedQuotesData;

        if (path === 'quotes' || path === 'lists' || path === 'settings') {
            return flattenQuoteBuckets(quoteSource);
        }
        if (path === 'watchlist' || path === 'reviews') {
            return movieAndTvQuotes(quoteSource);
        }

        const category = quoteSource[path] ? path : 'profile';
        return quoteSource[category] ?? [];
    }, [location.pathname, groupedFirebaseQuotes]);

    const pickRandomQuote = (quotes: Quote[], excludeText?: string | null): Quote | null => {
        if (!quotes.length) return null;
        if (quotes.length === 1) return quotes[0];
        const candidates = excludeText ? quotes.filter((q) => q.text !== excludeText) : quotes;
        const pool = candidates.length ? candidates : quotes;
        const randomIndex = Math.floor(Math.random() * pool.length);
        return pool[randomIndex] ?? null;
    };

    useEffect(() => {
        let isCancelled = false;
        if (!db) {
            setFirebaseQuotes(null);
            return;
        }
        loadGlobalQuotes(db)
            .then((quotes) => {
                if (isCancelled) return;
                setFirebaseQuotes(quotes);
            })
            .catch(() => {
                if (isCancelled) return;
                setFirebaseQuotes(null);
            });
        return () => {
            isCancelled = true;
        };
    }, []);

    useEffect(() => {
        setQuote(pickRandomQuote(activeCategoryQuotes, null));
    }, [activeCategoryQuotes]);

    const handleCycleQuote = () => {
        setQuote((current) => pickRandomQuote(activeCategoryQuotes, current?.text ?? null));
    };

    if (!quote) return null;

    return (
        <p
            className="page-tagline random-quote-text"
            onClick={handleCycleQuote}
            role="button"
            tabIndex={0}
            aria-label="Show another quote"
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleCycleQuote();
                }
            }}
        >
            "{renderHighlightedDirk(quote.text)}" - {quote.character}
        </p>
    );
}
