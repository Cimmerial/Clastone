import { EntryRowPerson, PersonItem } from '../components/EntryRowPerson';
import { RankedList } from '../components/RankedList';
import { actorClasses, actorsByClass } from '../mock/actors';

export function ActorsPage() {
  return (
    <section>
      <header className="page-heading">
        <div>
          <h1 className="page-title">Actors</h1>
          <p className="page-tagline">FAVORITES, NOT EXHAUSTIVE</p>
        </div>
        <p className="page-subtitle">Your favorites, ranked and classed.</p>
      </header>
      <RankedList<PersonItem>
        classOrder={actorClasses}
        itemsByClass={actorsByClass}
        renderRow={(item) => <EntryRowPerson item={item} />}
      />
    </section>
  );
}

