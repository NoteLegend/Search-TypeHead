import React, { useState, useEffect, useRef } from 'react';
import { useDebounce } from '../hooks/useDebounce';

interface Suggestion {
  query: string;
  frequency: number;
  trending_score: number;
  timestamp: string;
}

export const SearchBar: React.FC = () => {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [latency, setLatency] = useState<string | null>(null);
  const [cacheStatus, setCacheStatus] = useState<string | null>(null);
  const [redisNode, setRedisNode] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [trending, setTrending] = useState<Suggestion[]>([]);

  const debouncedInput = useDebounce(input, 300);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch top trending searches on mount
  useEffect(() => {
    fetchTrending();
  }, []);

  // Fetch suggestions when debounced input changes
  useEffect(() => {
    if (debouncedInput.trim() === '') {
      setSuggestions([]);
      setLatency(null);
      setCacheStatus(null);
      setRedisNode(null);
      return;
    }
    fetchSuggestions(debouncedInput);
    fetchCacheDebug(debouncedInput);
  }, [debouncedInput]);

  // Handle clicking outside of dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchTrending = async () => {
    try {
      const response = await fetch('http://localhost:5000/trending');
      const data = await response.json();
      setTrending(data.slice(0, 5));
    } catch (error) {
      console.error('Error fetching trending searches:', error);
    }
  };

  const fetchSuggestions = async (query: string) => {
    try {
      const startTime = performance.now();
      const response = await fetch(`http://localhost:5000/suggestions?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      
      const endTime = performance.now();
      const clientLatency = `${(endTime - startTime).toFixed(1)}ms`;
      
      setSuggestions(data);
      setLatency(response.headers.get('X-Response-Time') || clientLatency);
      setCacheStatus(response.headers.get('X-Cache') || 'MISS');
      setShowDropdown(true);
      setActiveIndex(-1);
    } catch (error) {
      console.error('Error fetching suggestions:', error);
    }
  };

  const fetchCacheDebug = async (query: string) => {
    try {
      const response = await fetch(`http://localhost:5000/cache/debug?prefix=${encodeURIComponent(query)}`);
      const data = await response.json();
      setRedisNode(data.assignedNode);
    } catch (error) {
      console.error('Error fetching cache debug information:', error);
    }
  };

  const handleSearchSubmit = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    try {
      // 1. Log the search submission asynchronously to backend queue
      await fetch('http://localhost:5000/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery })
      });

      // 2. Add to local recent searches
      setRecentSearches(prev => {
        const filtered = prev.filter(s => s !== searchQuery);
        return [searchQuery, ...filtered].slice(0, 5);
      });

      setInput(searchQuery);
      setShowDropdown(false);
      
      // Refresh trending searches after submission (allow worker time to aggregate)
      setTimeout(fetchTrending, 1000);
      alert(`Searched for: "${searchQuery}"\nLogged to background queue.`);
    } catch (error) {
      console.error('Error registering search:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        handleSearchSubmit(suggestions[activeIndex].query);
      } else {
        handleSearchSubmit(input);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  // Bold the matched prefix helper
  const highlightMatch = (text: string, queryStr: string) => {
    if (!queryStr) return <span className="text-gray-300">{text}</span>;
    const normalizedText = text.toLowerCase();
    const normalizedQuery = queryStr.toLowerCase();

    if (normalizedText.startsWith(normalizedQuery)) {
      const len = normalizedQuery.length;
      return (
        <span className="text-gray-300">
          <strong className="text-white font-extrabold">{text.slice(0, len)}</strong>
          {text.slice(len)}
        </span>
      );
    }

    const index = normalizedText.indexOf(normalizedQuery);
    if (index !== -1) {
      return (
        <span className="text-gray-300">
          {text.slice(0, index)}
          <strong className="text-white font-extrabold">{text.slice(index, index + normalizedQuery.length)}</strong>
          {text.slice(index + normalizedQuery.length)}
        </span>
      );
    }

    return <span className="text-gray-300">{text}</span>;
  };

  return (
    <div className="w-full max-w-2xl mx-auto" ref={dropdownRef}>
      {/* Search Header Info Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 text-sm">
        <div className="text-xs text-gray-400">
          Stateless Prefix Database Query Engine
        </div>

        {/* Real-time metrics */}
        <div className="flex items-center gap-3">
          {latency && (
            <span className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full bg-gray-900 border border-gray-800 text-gray-300">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              Latency: {latency}
            </span>
          )}
          {cacheStatus && (
            <span className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full border ${
              cacheStatus === 'HIT' 
                ? 'bg-indigo-950/40 border-indigo-500/30 text-indigo-300' 
                : 'bg-amber-950/40 border-amber-500/30 text-amber-300'
            }`}>
              Cache: {cacheStatus}
            </span>
          )}
          {redisNode && (
            <span className="text-xs text-gray-500">
              Route: <span className="font-mono text-indigo-400">{redisNode}</span>
            </span>
          )}
        </div>
      </div>

      {/* Main Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowDropdown(true);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowDropdown(true)}
          placeholder="Search millions of products..."
          className="w-full pl-12 pr-4 py-4 rounded-xl glass-input text-white text-lg placeholder-gray-500"
        />
        {input && (
          <button
            onClick={() => { setInput(''); setSuggestions([]); }}
            className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-400 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Autocomplete Dropdown */}
      {showDropdown && (input.trim() !== '' || trending.length > 0) && (
        <div className="absolute w-full mt-2 rounded-xl glass-panel shadow-2xl z-50 overflow-hidden">
          {/* Active Autocomplete Suggestions */}
          {input.trim() !== '' && (
            <div className="py-2">
              {suggestions.length > 0 ? (
                suggestions.map((suggestion, index) => {
                  const isTrending = suggestion.trending_score > 35;

                  return (
                    <div
                      key={suggestion.query}
                      onClick={() => handleSearchSubmit(suggestion.query)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={`flex items-center justify-between px-6 py-3.5 cursor-pointer suggestion-item ${
                        index === activeIndex ? 'bg-indigo-600/25 text-white' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {isTrending ? (
                          <span className="flex items-center justify-center w-5 h-5 rounded bg-red-500/20 text-red-400 trending-glow">
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.317.766-.599 1.63-.893 2.486a43.764 43.764 0 00-.85 2.635c-.05.195-.1.387-.152.574-.082.296-.282.725-.699 1.05-.159.124-.367.223-.685.278a5.503 5.503 0 01-.657.012 4.055 4.055 0 00-.511-.035c-.9-.051-1.3-.614-1.32-1.247a1 1 0 00-1.6.8c.006.28.029.567.069.857.086.623.279 1.258.642 1.83.658 1.041 1.767 1.885 3.226 2.02a6.315 6.315 0 00.771-.002c.901-.085 1.73-.431 2.354-1.002a1 1 0 00.321-.458c.248-.815.589-2.226.856-3.47.071-.33.138-.653.201-.959.083-.402.188-.802.304-1.189a6.031 6.031 0 01.3-.804c.166-.36.364-.69.567-.967a1 1 0 00-.184-1.398c-.12-.09-.23-.177-.328-.265-.249-.227-.45-.479-.593-.787a4.585 4.585 0 01-.22-.616c-.09-.335-.145-.69-.158-1.077-.008-.282.006-.576.046-.882z" clipRule="evenodd" />
                            </svg>
                          </span>
                        ) : (
                          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                        {highlightMatch(suggestion.query, input)}
                      </div>

                      {/* Score Meta Labels */}
                      <div className="flex items-center gap-2">
                        {isTrending && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-500/20 text-red-400">
                            Trending
                          </span>
                        )}
                        <span className="text-xs text-gray-500">
                          {suggestion.frequency.toLocaleString()} searches
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="px-6 py-4 text-gray-500 text-sm">No matching suggestions found. Try another query.</div>
              )}
            </div>
          )}

          {/* Trending Searches Section */}
          {(input.trim() === '' && trending.length > 0) && (
            <div className="border-t border-gray-800/80">
              <div className="px-6 pt-4 pb-2 text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.317.766-.599 1.63-.893 2.486a43.764 43.764 0 00-.85 2.635c-.05.195-.1.387-.152.574-.082.296-.282.725-.699 1.05-.159.124-.367.223-.685.278a5.503 5.503 0 01-.657.012 4.055 4.055 0 00-.511-.035c-.9-.051-1.3-.614-1.32-1.247a1 1 0 00-1.6.8c.006.28.029.567.069.857.086.623.279 1.258.642 1.83.658 1.041 1.767 1.885 3.226 2.02a6.315 6.315 0 00.771-.002c.901-.085 1.73-.431 2.354-1.002a1 1 0 00.321-.458c.248-.815.589-2.226.856-3.47.071-.33.138-.653.201-.959.083-.402.188-.802.304-1.189a6.031 6.031 0 01.3-.804c.166-.36.364-.69.567-.967a1 1 0 00-.184-1.398c-.12-.09-.23-.177-.328-.265-.249-.227-.45-.479-.593-.787a4.585 4.585 0 01-.22-.616c-.09-.335-.145-.69-.158-1.077-.008-.282.006-.576.046-.882z" clipRule="evenodd" />
                </svg>
                Trending Searches Now
              </div>
              <div className="pb-2">
                {trending.map((item) => (
                  <div
                    key={item.query}
                    onClick={() => handleSearchSubmit(item.query)}
                    className="flex items-center justify-between px-6 py-3 cursor-pointer hover:bg-gray-800/50"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-red-400 font-semibold font-mono text-sm">#</span>
                      <span className="text-gray-200 font-medium">{item.query}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500 font-mono">
                        🔥 Score: {item.trending_score.toFixed(1)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Searches Section */}
          {input.trim() === '' && recentSearches.length > 0 && (
            <div className="border-t border-gray-800/80">
              <div className="px-6 pt-3 pb-1 text-xs font-bold uppercase tracking-wider text-gray-500">
                Recent Searches
              </div>
              <div className="pb-2">
                {recentSearches.map((item) => (
                  <div
                    key={item}
                    onClick={() => handleSearchSubmit(item)}
                    className="flex items-center justify-between px-6 py-2.5 cursor-pointer hover:bg-gray-800/50 text-gray-300"
                  >
                    <div className="flex items-center gap-3">
                      <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>{item}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
