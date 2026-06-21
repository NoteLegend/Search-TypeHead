import { Request, Response } from 'express';
import { hashRing, getRedisClient } from '../config/db';
import { hashFNV1a } from '../config/hash-ring';

export const debugCacheRoute = async (req: Request, res: Response): Promise<void> => {
  try {
    const prefixParam = req.query.prefix as string;
    const location = (req.query.location as string) || 'US';

    if (!prefixParam) {
      res.status(400).json({ error: 'Bad Request', message: 'Prefix parameter is required.' });
      return;
    }

    const prefix = prefixParam.trim().toLowerCase();
    const targetNode = hashRing.getNode(prefix);
    const prefixHash = hashFNV1a(prefix);

    const redis = getRedisClient(targetNode);
    const key = `prefix:${prefix}:${location.trim().toUpperCase()}`;
    const value = await redis.get(key);

    res.json({
      prefix,
      location,
      prefixHash,
      assignedNode: targetNode,
      cacheKey: key,
      existsInCache: value !== null,
      cachedData: value ? JSON.parse(value) : null
    });
  } catch (error: any) {
    console.error('Error in /cache/debug:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
};
