import { EntryRowPerson, PersonItem } from '../components/EntryRowPerson';
import { RankedList } from '../components/RankedList';
import { directorClasses, directorsByClass } from '../mock/directors';

export function DirectorsPage() {
  return (
    <section>
      <header className="page-heading">
        <div>
          <h1 className="page-title">Directors</h1>
          <p className="page-tagline">FAVORITES, NOT EXHAUSTIVE</p>
        </div>
        <p className="page-subtitle">The minds behind your favorite films.</p>
      </header>
      <RankedList<PersonItem>
        classOrder={directorClasses}
        itemsByClass={directorsByClass}
        renderRow={(item) => <EntryRowPerson item={item} />}
      />
    </section>
  );
}

