import { getRedisClient } from '../config/db';

export class QueueService {
  private static QUEUE_KEY = 'search_log_queue';
  private static QUEUE_NODE = 'localhost:6379'; // Designated queue node

  // Push search hit event onto the Redis queue
  static async push(query: string, userLocation: string): Promise<void> {
    try {
      const normalizedQuery = query.trim().toLowerCase();
      if (!normalizedQuery) return;

      const redis = getRedisClient(this.QUEUE_NODE);
      const payload = JSON.stringify({
        query: normalizedQuery,
        timestamp: new Date(),
        user_location: userLocation.trim().toUpperCase() || 'US'
      });

      await redis.rpush(this.QUEUE_KEY, payload);
    } catch (error: any) {
      console.error('Failed to push search query to Redis queue:', error.message);
      // Fallback: we log it to console. In prod, we could write to local file/fallback DB.
    }
  }

  // Retrieve batch size from the queue
  static async popBatch(batchSize: number = 5000): Promise<any[]> {
    try {
      const redis = getRedisClient(this.QUEUE_NODE);
      
      // Atomic multi-pop or lrange + ltrim
      const items = await redis.lrange(this.QUEUE_KEY, 0, batchSize - 1);
      if (items.length > 0) {
        await redis.ltrim(this.QUEUE_KEY, items.length, -1);
      }
      
      return items.map(item => JSON.parse(item));
    } catch (error: any) {
      console.error('Failed to pop batch from Redis queue:', error.message);
      return [];
    }
  }

  // Get current size of the queue
  static async getSize(): Promise<number> {
    try {
      const redis = getRedisClient(this.QUEUE_NODE);
      return await redis.llen(this.QUEUE_KEY);
    } catch (error: any) {
      console.error('Failed to get queue size:', error.message);
      return 0;
    }
  }
}
