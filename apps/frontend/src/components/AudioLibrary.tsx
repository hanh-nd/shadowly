import { useEffect, useMemo, useState } from 'react';

import type { LibraryItem } from '../types';

interface Props {
  onFileSelect: (item: LibraryItem) => void;
  onBack?: () => void;
}

export function AudioLibrary({ onFileSelect }: Props) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/audio-library/manifest.json')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load library manifest');
        return res.json();
      })
      .then((data) => {
        setItems(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load audio library manifest', err);
        setError('Could not load the audio library. Please try again later.');
        setLoading(false);
      });
  }, []);

  const allTags = useMemo(
    () => ['All', ...new Set(items.flatMap((item) => item.tags))],
    [items],
  );

  const filteredItems = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return items.filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(query);
      const matchesTag =
        selectedTag === 'All' || item.tags.includes(selectedTag);
      return matchesSearch && matchesTag;
    });
  }, [items, searchQuery, selectedTag]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined animate-spin text-primary text-4xl">
          progress_activity
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant gap-4">
        <span className="material-symbols-outlined text-6xl text-error">
          error
        </span>
        <p className="text-body-lg font-medium">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-primary text-on-primary rounded-full font-label-md hover:bg-primary/90 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Search & Filter */}
      <section className="flex flex-col gap-3">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-4 top-1/2 transform -translate-y-1/2 text-secondary text-[20px]">
            search
          </span>
          <input
            className="w-full pl-11 pr-4 py-3 rounded-xl border border-surface-container-highest bg-surface-container-lowest text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-body-md text-sm transition-all shadow-sm"
            placeholder="Search your library..."
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap transition-colors ${
                selectedTag === tag
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-low border border-surface-container-highest text-secondary hover:bg-surface-container'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </section>

      {/* Library Grid */}
      <section>
        <h3 className="font-label-sm text-[10px] font-bold text-outline uppercase tracking-[0.2em] mb-3">
          Your Library
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              onClick={() => onFileSelect(item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onFileSelect(item);
                }
              }}
              role="button"
              tabIndex={0}
              className="bg-surface-container-lowest border border-surface-container-highest rounded-xl p-4 hover:border-primary/30 transition-all flex flex-col justify-between h-36 relative overflow-hidden group shadow-sm hover:shadow-md cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent active:scale-[0.98]"
            >
              <div
                className={`absolute left-0 top-0 bottom-0 w-0.5 transition-colors ${
                  item.tags.includes('chiep-class')
                    ? 'bg-primary'
                    : 'bg-surface-container-highest'
                }`}
              />

              <div>
                <div className="flex justify-between items-start mb-2">
                  <div className="flex gap-1 overflow-hidden">
                    {item.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 bg-surface text-secondary font-label-sm text-[9px] rounded uppercase tracking-wider whitespace-nowrap"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <h4 className="font-label-sm text-on-surface text-sm mb-0.5 truncate font-semibold">
                  {item.name}
                </h4>
                <p className="font-body-md text-secondary text-[11px]">
                  {item.duration}
                </p>
              </div>

              <div className="flex items-center justify-between mt-auto">
                <div className="flex items-center gap-1 opacity-20 group-hover:opacity-40 transition-opacity">
                  <span
                    className="material-symbols-outlined text-secondary text-[18px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    graphic_eq
                  </span>
                </div>
                <div className="w-9 h-9 flex items-center justify-center bg-surface-container group-hover:bg-primary-container group-hover:text-on-primary transition-all text-primary rounded-full shadow-sm">
                  <span className="material-symbols-outlined text-[22px]">
                    play_arrow
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant opacity-60">
            <span className="material-symbols-outlined text-6xl mb-2">
              search_off
            </span>
            <p>No audio tracks found matching your search.</p>
          </div>
        )}
      </section>
    </div>
  );
}
