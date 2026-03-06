import './ClassJumpButtons.css';

type ClassInfo = {
    key: string;
    label: string;
};

type Props = {
    classes: ClassInfo[];
};

export function ClassJumpButtons({ classes }: Props) {
    const handleJump = (classKey: string) => {
        const el = document.getElementById(`class-section-${classKey}`);
        if (!el) return;
        const offset = 72; // px from top — leaves the class heading near the top of the viewport
        const top = el.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
    };

    if (classes.length === 0) return null;

    return (
        <div className="class-jump-bar">
            {classes.map((c) => (
                <button
                    key={c.key}
                    type="button"
                    className="class-jump-btn"
                    onClick={() => handleJump(c.key)}
                    title={c.label}
                >
                    {c.label}
                </button>
            ))}
        </div>
    );
}
