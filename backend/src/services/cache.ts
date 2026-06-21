import { hashRing, getRedisClient } from '../config/db';
import { TrieNodeData } from './trie';

export class CacheService {
  private static TTL = 300; // Cache TTL of 5 minutes

  // Get cached suggestions for a prefix and location
  static async getSuggestions(prefix: string, userLoc: string): Promise<TrieNodeData[] | null> {
    try {
      const normalizedPrefix = prefix.trim().toLowerCase();
      const normalizedLoc = userLoc.trim().toUpperCase();
      
      // Determine which Redis instance owns this prefix
      const targetNode = hashRing.getNode(normalizedPrefix);
      const redis = getRedisClient(targetNode);
      
      const key = `prefix:${normalizedPrefix}:${normalizedLoc}`;
      const cached = await redis.get(key);
      
      if (cached) {
        return JSON.parse(cached) as TrieNodeData[];
      }
    } catch (error: any) {
      console.error(`Cache Read Error on prefix [${prefix}]:`, error.message);
    }
    return null; // Return null on cache miss or error
  }

  // Cache suggestions for a prefix and location
  static async setSuggestions(
    prefix: string,
    userLoc: string,
    suggestions: TrieNodeData[]
  ): Promise<void> {
    try {
      const normalizedPrefix = prefix.trim().toLowerCase();
      const normalizedLoc = userLoc.trim().toUpperCase();
      
      const targetNode = hashRing.getNode(normalizedPrefix);
      const redis = getRedisClient(targetNode);
      
      const key = `prefix:${normalizedPrefix}:${normalizedLoc}`;
      await redis.set(key, JSON.stringify(suggestions), 'EX', this.TTL);
    } catch (error: any) {
      console.error(`Cache Write Error on prefix [${prefix}]:`, error.message);
    }
  }

  // Invalidate a specific prefix cache
  static async invalidate(prefix: string, userLoc: string): Promise<void> {
    try {
      const normalizedPrefix = prefix.trim().toLowerCase();
      const normalizedLoc = userLoc.trim().toUpperCase();
      
      const targetNode = hashRing.getNode(normalizedPrefix);
      const redis = getRedisClient(targetNode);
      
      const key = `prefix:${normalizedPrefix}:${normalizedLoc}`;
      await redis.del(key);
    } catch (error: any) {
      console.error(`Cache Invalidation Error on prefix [${prefix}]:`, error.message);
    }
  }

  // Clear all keys from all Redis nodes (useful for rebuilds)
  static async clearAllCaches(): Promise<void> {
    try {
      // Connect to all physical nodes and flush their db
      // We can run flushdb on all Redis clients in parallel
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
import { redisClients } from '../config/db';
