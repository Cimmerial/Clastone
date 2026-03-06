import { RandomQuote } from '../components/RandomQuote';

export function DirectorsPage() {
  return (
    <section>
      <header className="page-heading">
        <div>
          <h1 className="page-title">Directors</h1>
          <RandomQuote />
        </div>
      </header>
      <div className="coming-soon-block">
        <p className="coming-soon-text">Coming soon</p>
      </div>
    </section>
  );
}
