import { Request, Response } from 'express';
import { QueryModel } from '../models/query.model';
import { getRedisClient } from '../config/db';

export const getTrendingSearches = async (req: Request, res: Response): Promise<void> => {
  const CACHE_KEY = 'global:trending';
  const CACHE_NODE = 'localhost:6379'; // Designated node for global caches

  try {
    const redis = getRedisClient(CACHE_NODE);
    
    // Try to get from Redis cache
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json(JSON.parse(cached));
      return;
    }

    // Fetch top 10 trending items from MongoDB (no location parameter)
    const trending = await QueryModel.find({})
      .sort({ trending_score: -1 })
      .limit(10)
      .select('query frequency trending_score -_id');

    // Cache the result for 60 seconds
    await redis.set(CACHE_KEY, JSON.stringify(trending), 'EX', 60);

    res.setHeader('X-Cache', 'MISS');
    res.json(trending);
  } catch (error: any) {
    console.error('Error in /trending:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
};
