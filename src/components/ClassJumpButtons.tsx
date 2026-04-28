import { useEffect, useMemo, useRef, useState } from 'react';
import './ClassJumpButtons.css';

type ClassInfo = {
    key: string;
    label: string;
};

type Props = {
    classes: ClassInfo[];
};

const isUnrankedClass = (classInfo: ClassInfo) =>
    classInfo.key.toUpperCase() === 'UNRANKED' || classInfo.label.trim().toUpperCase() === 'UNRANKED';

export function ClassJumpButtons({ classes }: Props) {
    const barRef = useRef<HTMLDivElement | null>(null);
    const measureRef = useRef<HTMLDivElement | null>(null);
    const [splitIndex, setSplitIndex] = useState(0);

    useEffect(() => {
        const checkStacked = () => {
            const measureEl = measureRef.current;
            const barEl = barRef.current;
            if (!measureEl || !barEl) return;

            const computed = window.getComputedStyle(barEl);
            const paddingLeft = parseFloat(computed.paddingLeft) || 0;
            const paddingRight = parseFloat(computed.paddingRight) || 0;
            const availableWidth = Math.max(0, barEl.clientWidth - paddingLeft - paddingRight - 1);
            const chips = Array.from(measureEl.querySelectorAll<HTMLElement>('.class-jump-measure-chip'));
            const widths = chips.map((chip) => chip.getBoundingClientRect().width);
            const gap = 5;

            const getRowWidth = (startIndex: number) => {
                const rowCount = widths.length - startIndex;
                if (rowCount <= 0) return 0;
                const total = widths.slice(startIndex).reduce((acc, width) => acc + width, 0);
                return total + gap * Math.max(0, rowCount - 1);
            };

            if (getRowWidth(0) <= availableWidth) {
                setSplitIndex(0);
                return;
            }

            let nextSplit = 1;
            while (nextSplit < classes.length && getRowWidth(nextSplit) > availableWidth) {
                nextSplit += 1;
            }
            setSplitIndex(nextSplit);
        };

        checkStacked();
        window.addEventListener('resize', checkStacked);
        return () => window.removeEventListener('resize', checkStacked);
    }, [classes]);

    const [topRowClasses, bottomRowClasses] = useMemo(
        () => [classes.slice(0, splitIndex), classes.slice(splitIndex)],
        [classes, splitIndex]
    );
    const stacked = topRowClasses.length > 0;

    const handleJump = (classKey: string) => {
        const el = document.getElementById(`class-section-${classKey}`);
        if (!el) return;
        const offset = 72; // px from top — leaves the class heading near the top of the viewport
        const top = el.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
    };

    if (classes.length === 0) return null;

    return (
        <>
            <div className="class-jump-measure" ref={measureRef} aria-hidden="true">
                {classes.map((c) => (
                    <span key={c.key} className="class-jump-measure-chip">
                        {c.label}
                    </span>
                ))}
            </div>
            <div ref={barRef} className={`class-jump-bar ${stacked ? 'class-jump-bar--stacked' : ''}`}>
                {stacked ? (
                    <>
                        <div className="class-jump-row class-jump-row--top">
                            {topRowClasses.map((c) => (
                                <button
                                    key={c.key}
                                    type="button"
                                    className={`class-jump-btn class-jump-btn--top ${isUnrankedClass(c) ? 'class-jump-btn--unranked' : ''}`}
                                    onClick={() => handleJump(c.key)}
                                    title={c.label}
                                >
                                    {c.label}
                                </button>
                            ))}
                        </div>
                        <div className="class-jump-row class-jump-row--bottom">
                            {bottomRowClasses.map((c) => (
                                <button
                                    key={c.key}
                                    type="button"
                                    className={`class-jump-btn ${isUnrankedClass(c) ? 'class-jump-btn--unranked' : ''}`}
                                    onClick={() => handleJump(c.key)}
                                    title={c.label}
                                >
                                    {c.label}
                                </button>
                            ))}
                        </div>
                    </>
                ) : (
                    <div className="class-jump-row">
                        {classes.map((c) => (
                            <button
                                key={c.key}
                                type="button"
                                className={`class-jump-btn ${isUnrankedClass(c) ? 'class-jump-btn--unranked' : ''}`}
                                onClick={() => handleJump(c.key)}
                                title={c.label}
                            >
                                {c.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}
