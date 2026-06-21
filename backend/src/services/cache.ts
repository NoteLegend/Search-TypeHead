import { hashRing, getRedisClient, redisClients } from '../config/db';

export interface CacheSuggestion {
  query: string;
  frequency: number;
  trending_score: number;
  timestamp: Date;
}

export class CacheService {
  private static TTL = 300; // Cache TTL of 5 minutes

  // Get cached suggestions for a prefix
  static async getSuggestions(prefix: string): Promise<CacheSuggestion[] | null> {
    try {
      const normalizedPrefix = prefix.trim().toLowerCase();
      
      // Determine which Redis instance owns this prefix
      const targetNode = hashRing.getNode(normalizedPrefix);
      const redis = getRedisClient(targetNode);
      
      const key = `prefix:${normalizedPrefix}`;
      const cached = await redis.get(key);
      
      if (cached) {
        return JSON.parse(cached) as CacheSuggestion[];
      }
    } catch (error: any) {
      console.error(`Cache Read Error on prefix [${prefix}]:`, error.message);
    }
    return null; // Return null on cache miss or error
  }

  // Cache suggestions for a prefix
  static async setSuggestions(
    prefix: string,
    suggestions: CacheSuggestion[]
  ): Promise<void> {
    try {
      const normalizedPrefix = prefix.trim().toLowerCase();
      
      const targetNode = hashRing.getNode(normalizedPrefix);
      const redis = getRedisClient(targetNode);
      
      const key = `prefix:${normalizedPrefix}`;
      await redis.set(key, JSON.stringify(suggestions), 'EX', this.TTL);
    } catch (error: any) {
      console.error(`Cache Write Error on prefix [${prefix}]:`, error.message);
    }
  }

  // Invalidate a specific prefix cache
  static async invalidate(prefix: string): Promise<void> {
    try {
      const normalizedPrefix = prefix.trim().toLowerCase();
      
      const targetNode = hashRing.getNode(normalizedPrefix);
      const redis = getRedisClient(targetNode);
      
      const key = `prefix:${normalizedPrefix}`;
      await redis.del(key);
    } catch (error: any) {
      console.error(`Cache Invalidation Error on prefix [${prefix}]:`, error.message);
    }
  }

  // Clear all keys from all Redis nodes (useful for rebuilds)
  static async clearAllCaches(): Promise<void> {
    try {
      const flushPromises: Promise<string>[] = [];
      
      for (const node of redisClients.keys()) {
        const client = getRedisClient(node);
        flushPromises.push(client.flushdb());
      }
      
      await Promise.all(flushPromises);
      console.log('Successfully flushed all Redis cache nodes.');
    } catch (error: any) {
      console.error('Error flushing caches:', error.message);
    }
  }
}
