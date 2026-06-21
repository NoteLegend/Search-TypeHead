import { Request, Response } from 'express';
import { CacheService } from '../services/cache';
import { trie } from '../services/trie-instance';

export const getSuggestions = async (req: Request, res: Response): Promise<void> => {
  const startTime = performance.now();
  try {
    const queryParam = req.query.q as string;
    const location = (req.query.location as string) || 'US';

    if (!queryParam || queryParam.trim() === '') {
      res.json([]);
      return;
    }

    const prefix = queryParam.trim().toLowerCase();

    // 1. Try fetching from the Consistent Hash Ring Redis Cache
    const cached = await CacheService.getSuggestions(prefix, location);
    
    if (cached) {
      const endTime = performance.now();
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Response-Time', `${(endTime - startTime).toFixed(2)}ms`);
      res.json(cached);
      return;
    }

    // 2. Cache Miss: Perform in-memory Trie matching
    const suggestions = trie.suggest(prefix, location, 10);

    // 3. Write back to Redis asynchronously
    await CacheService.setSuggestions(prefix, location, suggestions);

    const endTime = performance.now();
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('X-Response-Time', `${(endTime - startTime).toFixed(2)}ms`);
    res.json(suggestions);
  } catch (error: any) {
    console.error('Error in /suggestions:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
};
