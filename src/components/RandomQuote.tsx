import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import quotesData from '../data/quotes.json';
import { db } from '../lib/firebase';
import { loadGlobalQuotes, type FirebaseQuote } from '../lib/firestoreQuotes';
import './RandomQuote.css';

type Quote = { text: string; character: string; source: string };
type QuotesData = Record<string, Quote[]>;

const typedQuotesData = quotesData as QuotesData;

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
                character: item.character,
                source: item.source,
            });
        });
        return grouped;
    }, [firebaseQuotes]);

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
        // Determine the category based on the path
        const path = location.pathname.split('/')[1] || 'general';

        const quoteSource = groupedFirebaseQuotes ?? typedQuotesData;
        // Fallback to 'general' if the category doesn't exist in quote data
        const category = quoteSource[path] ? path : 'general';
        const categoryQuotes = quoteSource[category];

        if (categoryQuotes && categoryQuotes.length > 0) {
            const randomIndex = Math.floor(Math.random() * categoryQuotes.length);
            setQuote(categoryQuotes[randomIndex]);
        } else {
            setQuote(null);
        }
    }, [location.pathname, groupedFirebaseQuotes]);

    if (!quote) return null;

    return (
        <p className="page-tagline random-quote-text">"{quote.text}" - {quote.character}</p>
    );
}
