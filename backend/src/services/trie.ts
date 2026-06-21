export interface TrieNodeData {
  query: string;
  frequency: number;
  trendingScore: number;
  userLocation: string;
  timestamp: Date;
}

class TrieNode {
  children: Map<string, TrieNode> = new Map();
  isEndOfWord: boolean = false;
  data?: TrieNodeData;
}

export class Trie {
  root: TrieNode = new TrieNode();

  // Insert a query with its metadata
  insert(query: string, frequency: number, trendingScore: number, userLocation: string, timestamp: Date) {
    let current = this.root;
    for (const char of query) {
      if (!current.children.has(char)) {
        current.children.set(char, new TrieNode());
      }
      current = current.children.get(char)!;
    }
    current.isEndOfWord = true;
    current.data = {
      query,
      frequency,
      trendingScore,
      userLocation,
      timestamp
    };
  }

  // Calculate combined ranking score
  private getScore(data: TrieNodeData, userLoc?: string): number {
    const freqWeight = 1.0;
    const trendingWeight = 1.5;
    const geoBoost = 1.3;

    // Logarithmic scale for frequency to prevent huge values from overwhelming trending scores
    const logFreq = Math.log(data.frequency + 1);
    let score = freqWeight * logFreq + trendingWeight * data.trendingScore;

    // Personalization boost if user location matches query location
    if (userLoc && data.userLocation.toUpperCase() === userLoc.toUpperCase()) {
      score *= geoBoost;
    }

    return score;
  }

  // Get all leaf nodes under a given subtree root
  private collectAllWords(node: TrieNode, results: TrieNodeData[]) {
    if (node.isEndOfWord && node.data) {
      results.push(node.data);
    }
    for (const child of node.children.values()) {
      this.collectAllWords(child, results);
    }
  }

  // Exact Prefix Matching: O(L) to walk prefix, then collect descendants
  searchPrefix(prefix: string, userLoc?: string, limit: number = 10): TrieNodeData[] {
    let current = this.root;
    for (const char of prefix) {
      if (!current.children.has(char)) {
        return []; // No exact prefix match
      }
      current = current.children.get(char)!;
    }

    const matches: TrieNodeData[] = [];
    this.collectAllWords(current, matches);

    // Sort by combined score descending
    return matches
      .sort((a, b) => this.getScore(b, userLoc) - this.getScore(a, userLoc))
      .slice(0, limit);
  }

  // Fuzzy Search using Levenshtein distance on Trie
  // Finds words in Trie with edit distance <= maxDistance
  searchFuzzy(query: string, maxDistance: number = 2, userLoc?: string, limit: number = 10): TrieNodeData[] {
    const results: Array<{ data: TrieNodeData; distance: number }> = [];

    // First row of the Levenshtein matrix: [0, 1, 2, ..., query.length]
    const currentRow: number[] = [];
    for (let i = 0; i <= query.length; i++) {
      currentRow.push(i);
    }

    // DFS search on Trie nodes
    const searchRecursive = (node: TrieNode, letter: string, prevRow: number[]) => {
      const size = query.length;
      const nextRow: number[] = [prevRow[0] + 1];

      for (let i = 1; i <= size; i++) {
        const insertCost = nextRow[i - 1] + 1;
        const deleteCost = prevRow[i] + 1;
        let substituteCost: number;

        if (query[i - 1] === letter) {
          substituteCost = prevRow[i - 1];
        } else {
          substituteCost = prevRow[i - 1] + 1;
        }

        nextRow.push(Math.min(insertCost, deleteCost, substituteCost));
      }

      // If the last element is <= maxDistance and it is a word, add to results
      if (nextRow[size] <= maxDistance && node.isEndOfWord && node.data) {
        results.push({ data: node.data, distance: nextRow[size] });
      }

      // If any element in the row is <= maxDistance, continue searching children
      if (Math.min(...nextRow) <= maxDistance) {
        for (const [char, childNode] of node.children.entries()) {
          searchRecursive(childNode, char, nextRow);
        }
      }
    };

    // Begin recursion from the root node children
    for (const [char, childNode] of this.root.children.entries()) {
      searchRecursive(childNode, char, currentRow);
    }

    // Sort first by edit distance (closer is better), then by combined score descending
    return results
      .sort((a, b) => {
        if (a.distance !== b.distance) {
          return a.distance - b.distance;
        }
        return this.getScore(b.data, userLoc) - this.getScore(a.data, userLoc);
      })
      .map(r => r.data)
      .slice(0, limit);
  }

  // Combined search: exact prefix first, fall back to fuzzy if fewer results found
  suggest(prefix: string, userLoc?: string, limit: number = 10): TrieNodeData[] {
    const normalized = prefix.trim().toLowerCase();
    if (!normalized) return [];

    let suggestions = this.searchPrefix(normalized, userLoc, limit);

    // If we have fewer than limit suggestions, search fuzzy
    if (suggestions.length < limit) {
      const fuzzySuggestions = this.searchFuzzy(normalized, 1, userLoc, limit * 2);
      
      // Combine suggestions, avoiding duplicates
      const seen = new Set(suggestions.map(s => s.query));
      for (const fs of fuzzySuggestions) {
        if (!seen.has(fs.query)) {
          suggestions.push(fs);
          seen.add(fs.query);
        }
        if (suggestions.length >= limit) break;
      }
    }

    return suggestions;
  }
}
