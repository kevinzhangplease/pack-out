import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import {
  addMissing,
  dismissProposal,
  proposalsFrom,
  reviewCandidates,
  reviewProgress,
  setOutcome,
  undismissAll,
  type RuleProposal,
} from '../engine/review';
import { REVIEW_OUTCOMES, REVIEW_OUTCOME_LABELS, type ReviewOutcome } from '../data/types';

/**
 * The loop.
 *
 * Half of this screen records what happened. The other half is what makes the
 * app compound: because rules are data, the review can compute the specific
 * edit that would have prevented each regret, show it as a before-and-after in
 * plain English, and apply it to the library on one tap.
 */
export function ReviewView({ onEditItem }: { onEditItem: (itemId: string) => void }) {
  const { trip, trips, library, setLibrary, setTrips, updateTrip } = useStore();
  const [missingName, setMissingName] = useState('');
  const [applied, setApplied] = useState<string[]>([]);

  const candidates = useMemo(
    () => (trip ? reviewCandidates(trip, library) : []),
    [trip, library],
  );
  const proposals = useMemo(() => proposalsFrom(library, trips), [library, trips]);

  if (!trip) return <p className="empty">No trip selected.</p>;

  const progress = reviewProgress(candidates, trip);
  const missingEntries = trip.review.entries.filter((e) => e.missingName);

  const answer = (itemId: string, outcome: ReviewOutcome) => {
    const current = candidates.find((c) => c.itemId === itemId)?.outcome;
    updateTrip(setOutcome(trip, itemId, current === outcome ? null : outcome));
  };

  const finish = () =>
    updateTrip({
      ...trip,
      review: { ...trip.review, completedISO: new Date().toISOString() },
    });

  const accept = (proposal: RuleProposal) => {
    if (!proposal.apply) return;
    setLibrary(proposal.apply(library), proposal.title);
    setApplied((list) => [...list, proposal.id]);
  };

  const byContainer = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    byContainer.set(candidate.container, [...(byContainer.get(candidate.container) ?? []), candidate]);
  }

  return (
    <div className="review">
      <section className={proposals.length ? 'panel panel--proposals' : 'panel'}>
        <div className="panel__head">
          <h2 className="panel__title">What the reviews suggest</h2>
          <span className="panel__meta">
            {proposals.length} proposal{proposals.length === 1 ? '' : 's'}
          </span>
        </div>
        <p className="panel__lede">
          Computed from every completed review, across all trips. Rules are data, so these are real
          edits rather than reminders — each one names the evidence it came from.
        </p>

        {proposals.length === 0 ? (
          <p className="empty">
            Nothing to suggest yet. Complete a review below, and after two trips the patterns start
            showing up here.
          </p>
        ) : (
          <ul className="proposals">
            {proposals.map((proposal) => (
              <li key={proposal.id} className={`proposal proposal--${proposal.kind}`}>
                <h3 className="proposal__title">{proposal.title}</h3>
                <p className="proposal__rationale">{proposal.rationale}</p>

                {proposal.before && (
                  <div className="proposal__diff">
                    <p className="proposal__before">− {proposal.before}</p>
                    {proposal.after && <p className="proposal__after">+ {proposal.after}</p>}
                  </div>
                )}

                <div className="proposal__actions">
                  {proposal.apply ? (
                    <button
                      type="button"
                      className="btn btn--sm btn--primary"
                      disabled={applied.includes(proposal.id)}
                      onClick={() => accept(proposal)}
                    >
                      {applied.includes(proposal.id) ? 'Applied' : 'Apply this edit'}
                    </button>
                  ) : (
                    <span className="proposal__advisory">
                      No automatic edit — this one needs a decision.
                    </span>
                  )}
                  {proposal.itemId && (
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => onEditItem(proposal.itemId!)}
                    >
                      Open the rule
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => setLibrary(dismissProposal(library, proposal.id), 'dismiss a proposal')}
                  >
                    Not this
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {library.dismissedProposals.length > 0 && (
          <div className="editor__add">
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => setLibrary(undismissAll(library), 'restore dismissed proposals')}
            >
              Show {library.dismissedProposals.length} dismissed again
            </button>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">How did {trip.name} go?</h2>
          <span className="panel__meta">
            {progress.answered}/{progress.total}
          </span>
        </div>
        <p className="panel__lede">
          What went unused, what was missing, what broke. You do not have to answer everything —
          the unused ones are where the value is.
        </p>

        <div className="editor__add">
          <input
            type="text"
            className="input"
            placeholder="Something you wished you had"
            value={missingName}
            aria-label="Something that was missing"
            onChange={(e) => setMissingName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                updateTrip(addMissing(trip, missingName));
                setMissingName('');
              }
            }}
          />
          <button
            type="button"
            className="btn"
            onClick={() => {
              updateTrip(addMissing(trip, missingName));
              setMissingName('');
            }}
          >
            Add
          </button>
        </div>

        {missingEntries.length > 0 && (
          <ul className="chips">
            {missingEntries.map((entry, i) => (
              <li key={i} className="chips__item">
                <span className="chip chip--sm is-on">
                  <span className="chip__label">{entry.missingName}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {[...byContainer.entries()].map(([container, group]) => (
          <div key={container} className="review__group">
            <h3 className="shop-section__label">
              {library.containers.find((c) => c.id === container)?.name ?? container}
            </h3>
            <ul className="review__rows">
              {group.map((candidate) => (
                <li key={candidate.itemId} className="review__row">
                  <span className="review__name">{candidate.name}</span>
                  <div
                    className="segmented segmented--sm segmented--wrap"
                    role="group"
                    aria-label={`How did ${candidate.name} go`}
                  >
                    {REVIEW_OUTCOMES.filter(
                      (o) =>
                        candidate.kind === 'consumable' ||
                        (o !== 'too-much' && o !== 'not-enough'),
                    ).map((outcome) => (
                      <button
                        key={outcome}
                        type="button"
                        className={
                          candidate.outcome === outcome
                            ? 'segmented__btn is-active'
                            : 'segmented__btn'
                        }
                        aria-pressed={candidate.outcome === outcome}
                        onClick={() => answer(candidate.itemId, outcome)}
                      >
                        {REVIEW_OUTCOME_LABELS[outcome]}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="editor__add">
          {progress.complete ? (
            <>
              <span className="editor__impact">
                Review finished {new Date(trip.review.completedISO!).toLocaleDateString()}. It is
                feeding the proposals above.
              </span>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() =>
                  setTrips(
                    trips.map((t) =>
                      t.id === trip.id
                        ? { ...trip, review: { ...trip.review, completedISO: undefined } }
                        : t,
                    ),
                    'reopen a review',
                  )
                }
              >
                Reopen
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn--primary" onClick={finish}>
                Finish the review
              </button>
              <span className="editor__impact">
                Only finished reviews feed the proposals — a half-answered one would draw the wrong
                conclusions.
              </span>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
