import { useRef, useState } from 'react';
import { useStore } from '../state/store';
import { makeBackup, parseBackup, serializeBackup } from '../data/schema';
import { libraryToText } from '../engine/textExport';
import { defaultLibrary } from '../data/library';

/**
 * Export and import, built in phase one on purpose. The rule library is the
 * only thing in this app with real value and the only thing that cannot be
 * regenerated, so it gets an escape hatch before it gets a nicer editor.
 */
export function DataView() {
  const { library, trips, setLibrary, setTrips, undo, undoLabel } = useStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const download = (contents: string, filename: string, type: string) => {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const today = new Date().toISOString().slice(0, 10);

  const exportJson = () => {
    const backup = makeBackup(library, trips, new Date().toISOString());
    download(serializeBackup(backup), `pack-out-${today}.json`, 'application/json');
    setMessage({ tone: 'ok', text: 'Exported library and trips as JSON.' });
  };

  const exportRules = () => {
    download(libraryToText(library), `pack-out-rules-${today}.txt`, 'text/plain');
    setMessage({ tone: 'ok', text: 'Exported the rule library as readable text.' });
  };

  const importJson = async (file: File) => {
    try {
      const result = parseBackup(await file.text());
      setLibrary(result.data.library, `import ${file.name}`);
      setTrips(result.data.trips, `import ${file.name}`);
      const migrated = result.applied.length
        ? ` Migrated from schema ${result.fromVersion}: ${result.applied.join('; ')}.`
        : '';
      setMessage({
        tone: 'ok',
        text: `Imported ${result.data.library.items.length} items and ${result.data.trips.length} trips.${migrated} Undo is available.`,
      });
    } catch (error) {
      setMessage({ tone: 'bad', text: (error as Error).message });
    }
  };

  return (
    <div className="data">
      <section className="panel">
        <h2 className="panel__title">Export</h2>
        <p className="panel__lede">
          The library is the valuable part. Keep a copy somewhere that is not this browser.
        </p>
        <div className="panel__actions">
          <button type="button" className="btn btn--primary" onClick={exportJson}>
            Export everything as JSON
          </button>
          <button type="button" className="btn" onClick={exportRules}>
            Export rules as readable text
          </button>
        </div>
      </section>

      <section className="panel">
        <h2 className="panel__title">Import</h2>
        <p className="panel__lede">
          Replaces the current library and trips. Undoable, and refused outright if the file was
          written by a newer version of the app.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="input"
          aria-label="Choose a backup file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importJson(file);
            e.target.value = '';
          }}
        />
      </section>

      <section className="panel">
        <h2 className="panel__title">Reset</h2>
        <p className="panel__lede">
          Replaces your library with the shipped default. Undoable — but export first.
        </p>
        <button
          type="button"
          className="btn btn--danger"
          onClick={() => {
            setLibrary(defaultLibrary(), 'reset library to defaults');
            setMessage({ tone: 'ok', text: 'Library reset to the shipped default. Undo is available.' });
          }}
        >
          Reset library to defaults
        </button>
      </section>

      {undoLabel && (
        <section className="panel panel--undo">
          <p className="panel__lede">Last change: {undoLabel}</p>
          <button type="button" className="btn" onClick={undo}>
            Undo
          </button>
        </section>
      )}

      {message && (
        <p className={message.tone === 'ok' ? 'notice notice--ok' : 'notice notice--bad'} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}
