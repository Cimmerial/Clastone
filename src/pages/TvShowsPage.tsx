import { RankedList } from '../components/RankedList';
import { EntryRowMovieShow, MovieShowItem } from '../components/EntryRowMovieShow';
import { tvClasses, tvByClass } from '../mock/tvShows';

export function TvShowsPage() {
  return (
    <section>
      <header className="page-heading">
        <div>
          <h1 className="page-title">TV Shows</h1>
          <p className="page-tagline">SEASONS AS THEIR OWN ENTRIES</p>
        </div>
        <p className="page-subtitle">Each season ranked on its own merits.</p>
      </header>
      <RankedList<MovieShowItem>
        classOrder={tvClasses}
        itemsByClass={tvByClass}
        renderRow={(item) => <EntryRowMovieShow item={item} />}
      />
    </section>
  );
}

