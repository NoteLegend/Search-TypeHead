import { Request, Response } from 'express';
import { CacheService } from '../services/cache';
import { QueryModel } from '../models/query.model';

function escapeRegex(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

export const getSuggestions = async (req: Request, res: Response): Promise<void> => {
  const startTime = performance.now();
  try {
    const queryParam = req.query.q as string;

    if (!queryParam || queryParam.trim() === '') {
      res.json([]);
      return;
    }

    const prefix = queryParam.trim().toLowerCase();

    // 1. Try fetching from the Consistent Hash Ring Redis Cache
    const cached = await CacheService.getSuggestions(prefix);
    
    if (cached) {
      const endTime = performance.now();
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Response-Time', `${(endTime - startTime).toFixed(2)}ms`);
      res.json(cached);
      return;
    }

    // 2. Cache Miss: Query MongoDB directly with prefix matching
    const escapedPrefix = escapeRegex(prefix);
    const databaseSuggestions = await QueryModel.find({
      query: { $regex: `^${escapedPrefix}`, $options: 'i' }
    })
      .sort({ trending_score: -1, frequency: -1 })
      .limit(10)
      .select('query frequency trending_score timestamp -_id');

    // 3. Write back to Redis asynchronously
    const cachePayload = databaseSuggestions.map(doc => ({
      query: doc.query,
      frequency: doc.frequency,
      trending_score: doc.trending_score,
      timestamp: doc.timestamp
    }));

    await CacheService.setSuggestions(prefix, cachePayload);

    const endTime = performance.now();
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('X-Response-Time', `${(endTime - startTime).toFixed(2)}ms`);
    res.json(cachePayload);
  } catch (error: any) {
    console.error('Error in /suggestions:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
};
