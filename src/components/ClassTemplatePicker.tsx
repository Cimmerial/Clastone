import './ClassTemplatePicker.css';
import {
  directorTemplates,
  movieShowTemplates,
  personTemplates,
  templateRankedAndUnrankedLists,
  type MovieShowTemplateId,
  type PersonTemplateId
} from '../lib/classTemplates';

type MovieTvProps = {
  variant: 'movies' | 'tv';
  onApply: (templateId: MovieShowTemplateId) => void;
  anchorId?: string;
};

type PersonProps = {
  variant: 'actors' | 'directors';
  onApply: (templateId: PersonTemplateId) => void;
  anchorId?: string;
};

function TierBulletLists({ classes }: { classes: { label: string; tagline?: string; isRanked?: boolean }[] }) {
  const { ranked, unranked } = templateRankedAndUnrankedLists(classes);
  return (
    <div className="class-template-card-tiers">
      {ranked.length > 0 ? (
        <div className="class-template-tier-block">
          <div className="class-template-tier-label">Ranked</div>
          <ul className="class-template-tier-ul">
            {ranked.map((text, i) => (
              <li key={`r-${i}`} className="class-template-tier-li">
                {text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {unranked.length > 0 ? (
        <div className="class-template-tier-block">
          <div className="class-template-tier-label">Unranked</div>
          <ul className="class-template-tier-ul">
            {unranked.map((text, i) => (
              <li key={`u-${i}`} className="class-template-tier-li">
                {text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function ClassTemplatePicker(props: MovieTvProps | PersonProps) {
  if (props.variant === 'movies' || props.variant === 'tv') {
    const ids = Object.keys(movieShowTemplates) as MovieShowTemplateId[];
    return (
      <div id={props.anchorId} className="class-template-panel">
        <h2 className="class-template-panel-title">Pick a starting class template</h2>
        <p className="class-template-panel-lede">
          You can add {props.variant === 'movies' ? 'movies' : 'shows'} to <strong>UNRANKED</strong> before choosing.
          Compare the tiers below, then tap a preset. Switch presets until something lives outside the{' '}
          <strong>UNRANKED</strong> bucket (other unranked buckets still count). Rename, reorder, add, or remove classes
          anytime in <strong>Settings</strong>.
        </p>
        <div className="class-template-grid">
          {ids.map((id) => {
            const t = movieShowTemplates[id];
            return (
              <button key={id} type="button" className="class-template-card" onClick={() => props.onApply(id)}>
                <div className="class-template-card-title">{t.title}</div>
                <div className="class-template-card-desc">{t.description}</div>
                <TierBulletLists classes={t.classes} />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const { onApply, anchorId, variant } = props as PersonProps;
  const templates = variant === 'directors' ? directorTemplates : personTemplates;
  const ids = Object.keys(templates) as PersonTemplateId[];
  const label = variant === 'directors' ? 'directors' : 'actors';
  return (
    <div id={anchorId} className="class-template-panel">
      <h2 className="class-template-panel-title">Pick a starting class template</h2>
      <p className="class-template-panel-lede">
        You can add {label} to <strong>UNRANKED</strong> first. Compare tiers below, then tap a preset. Switch freely
        until something sits outside the <strong>UNRANKED</strong> bucket (other unranked buckets still count). Rename,
        reorder, add, or remove classes anytime in <strong>Settings</strong>.
      </p>
      <div className="class-template-grid class-template-grid--two">
        {ids.map((id) => {
          const t = templates[id];
          return (
            <button key={id} type="button" className="class-template-card" onClick={() => onApply(id)}>
              <div className="class-template-card-title">{t.title}</div>
              <div className="class-template-card-desc">{t.description}</div>
              <TierBulletLists classes={t.classes} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
