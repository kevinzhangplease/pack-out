import { useMemo, useState } from 'react';
import { Modal } from './Modal';
import { infoPanelsFor, type InfoField } from '../engine/infoPanel';
import type { Library } from '../data/types';

/**
 * The info button every trip section carries.
 *
 * What it shows is computed from the library at the moment you open it: every
 * rule that reads this section's variables, grouped by value, with whether each
 * item is currently packing. Where nothing reads a value, it says so — "nothing
 * depends on this yet" is useful information, not an empty state.
 */
export function InfoButton({
  section,
  fields,
  library,
  packingIds,
  onEditItem,
}: {
  section: string;
  fields: InfoField[];
  library: Library;
  packingIds: Set<string>;
  onEditItem: (itemId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const panels = useMemo(
    () => (open ? infoPanelsFor(fields, library, packingIds) : []),
    [open, fields, library, packingIds],
  );

  return (
    <>
      <button
        type="button"
        className="info-btn"
        aria-label={`What reads ${section}?`}
        title={`What reads ${section}?`}
        onClick={() => setOpen(true)}
      >
        i
      </button>

      {open && (
        <Modal title={`What reads ${section}`} onClose={() => setOpen(false)}>
          {panels.map((panel) => (
            <section key={panel.label} className="info">
              <h3 className="info__field">{panel.label}</h3>

              {panel.groups.length === 0 ? (
                <p className="info__empty">
                  Nothing depends on this yet. No rule in your library reads it, so changing it
                  will not change the list.
                </p>
              ) : (
                <>
                  <p className="info__count">
                    {panel.itemCount} item{panel.itemCount === 1 ? '' : 's'} read this.
                  </p>
                  {panel.groups.map((group) => (
                    <div key={group.key} className="info__group">
                      <h4 className="info__value">{group.label}</h4>
                      <ul className="info__items">
                        {group.entries.map((entry) => (
                          <li key={entry.item.id} className="info__item">
                            <button
                              type="button"
                              className="info__link"
                              onClick={() => {
                                setOpen(false);
                                onEditItem(entry.item.id);
                              }}
                            >
                              {entry.item.name}
                            </button>
                            <span className={entry.packing ? 'pill pill--on' : 'pill'}>
                              {entry.packing ? 'packing' : 'not packing'}
                            </span>
                            <span className="info__because">{entry.because}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </>
              )}
            </section>
          ))}
        </Modal>
      )}
    </>
  );
}
