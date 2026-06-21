import { SearchBar } from './components/SearchBar';

function App() {
  return (
    <div className="min-h-screen flex flex-col justify-between py-12 px-4 sm:px-6 lg:px-8">
      {/* Top Main Section */}
      <div className="flex-grow flex flex-col justify-center items-center">
        <div className="text-center mb-8 max-w-2xl">
          {/* Logo Badge */}
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 mb-6">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
            System Architecture Demo
          </span>

          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4">
            Next-Gen <span className="text-glow-gradient">Search Typeahead</span>
          </h1>
          <p className="text-base text-gray-400">
            Real-time, personalized, and typo-tolerant prefix suggestion engine. 
            Powered by an in-memory Trie index, distributed cache-aside routing with consistent hashing, 
            and asynchronous batch decay workers.
          </p>
        </div>

        {/* Search Bar Container */}
        <div className="w-full relative z-50">
          <SearchBar />
        </div>

        {/* Architecture Specs Panel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full mt-16">
          <div className="glass-panel p-5 rounded-2xl">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 114 0v2m-4 0h4m-4 0h4m12 0a2 2 0 100-4 2 2 0 000 4z" />
                </svg>
              </div>
              <h3 className="font-semibold text-white">Consistent Hashing</h3>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Distributes cached autocomplete keys across 3 distinct Redis instances using a virtual-node (150 per node) ring layout.
            </p>
          </div>

          <div className="glass-panel p-5 rounded-2xl">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 113.536 0V21h2v-2.243a5 5 0 013.536 0z" />
                </svg>
              </div>
              <h3 className="font-semibold text-white">In-Memory Trie</h3>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Loads 105k product terms into a fast character-based tree for O(K) prefix resolution, falling back to Levenshtein fuzzy searches.
            </p>
          </div>

          <div className="glass-panel p-5 rounded-2xl">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-pink-500/10 flex items-center justify-center text-pink-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="font-semibold text-white">Asynchronous Write Queue</h3>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Accepts query logs instantaneously on Redis queue, while a background thread aggregates hits and decays scores periodically.
            </p>
          </div>
        </div>
      </div>

      {/* Footer System Specs */}
      <footer className="text-center text-xs text-gray-600 mt-12 border-t border-gray-900/60 pt-6">
        Search Typeahead Autocomplete System • Developed using React (TS) + Node/Express + MongoDB + 3 Redis nodes (WSL)
      </footer>
    </div>
  );
}

export default App;
