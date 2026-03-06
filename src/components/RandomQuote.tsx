import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import quotesData from '../data/quotes.json';
import './RandomQuote.css';

type Quote = { text: string; character: string; source: string };
type QuotesData = Record<string, Quote[]>;

const typedQuotesData = quotesData as QuotesData;

export function RandomQuote() {
    const location = useLocation();
    const [quote, setQuote] = useState<Quote | null>(null);

    useEffect(() => {
        // Determine the category based on the path
        const path = location.pathname.split('/')[1] || 'general';

        // Fallback to 'general' if the category doesn't exist in our quotes.json
        const category = typedQuotesData[path] ? path : 'general';
        const categoryQuotes = typedQuotesData[category];

        if (categoryQuotes && categoryQuotes.length > 0) {
            const randomIndex = Math.floor(Math.random() * categoryQuotes.length);
            setQuote(categoryQuotes[randomIndex]);
        } else {
            setQuote(null);
        }
    }, [location.pathname]);

    if (!quote) return null;

    return (
        <p className="page-tagline random-quote-text">"{quote.text}" - {quote.character}</p>
    );
}
