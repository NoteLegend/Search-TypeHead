import { QueryModel } from '../models/query.model';
import { SearchLogModel } from '../models/search-log.model';
import { QueueService } from './queue';
import { CacheService } from './cache';
import { getRedisClient } from '../config/db';

let intervalId: NodeJS.Timeout | null = null;
const BATCH_SIZE = 5000;
const DECAY_FACTOR = 0.95; // Decay trending scores by 5% every iteration (15 seconds)

async function processWorkerBatch() {
  try {
    const queueSize = await QueueService.getSize();

    // 1. If we have items in the queue, process them
    if (queueSize > 0) {
      const items = await QueueService.popBatch(BATCH_SIZE);
      if (items.length > 0) {
        console.log(`[Worker] Processing batch of ${items.length} search events...`);

        // Log raw searches to database
        const rawLogs = items.map(item => ({
          query: item.query,
          timestamp: new Date(item.timestamp)
        }));
        await SearchLogModel.insertMany(rawLogs);

        // Group and aggregate count by query string
        const aggregations = new Map<string, number>();
        for (const log of items) {
          const count = aggregations.get(log.query) || 0;
          aggregations.set(log.query, count + 1);
        }

        // Perform bulk write in MongoDB to update query frequencies and trending scores
        const bulkOps = [];
        for (const [queryStr, count] of aggregations.entries()) {
          const spikeWeight = 5.0;
          const trendingBoost = count * spikeWeight;

          bulkOps.push({
            updateOne: {
              filter: { query: queryStr },
              update: {
                $inc: { frequency: count, trending_score: trendingBoost },
                $set: { timestamp: new Date() }
              },
              upsert: true
            }
          });
        }

        if (bulkOps.length > 0) {
          await QueryModel.bulkWrite(bulkOps);
        }

        // Invalidate Redis cache keys for all prefixes of the updated queries
        for (const queryStr of aggregations.keys()) {
          // For query "apple", we delete "a", "ap", "app", "appl", "apple"
          const invalidatePromises = [];
          for (let i = 1; i <= queryStr.length; i++) {
            const prefix = queryStr.slice(0, i);
            invalidatePromises.push(CacheService.invalidate(prefix));
          }
          await Promise.all(invalidatePromises);
        }
        console.log(`[Worker] Invalidated Redis cache keys for ${aggregations.size} queries.`);
      }
    }

    // 2. Exponential Decay: Cool down historical trending scores
    const decayResult = await QueryModel.updateMany(
      { trending_score: { $gt: 0.01 } },
      [ { $set: { trending_score: { $multiply: [ '$trending_score', DECAY_FACTOR ] } } } ]
    );

    if (decayResult.modifiedCount > 0) {
      console.log(`[Worker] Decayed trending scores for ${decayResult.modifiedCount} queries.`);
      
      // Invalidate the cached global trending list since scores changed
      const redis = getRedisClient('localhost:6379');
      await redis.del('global:trending');
    }

  } catch (error: any) {
    console.error('[Worker Error] Exception in background processing:', error.message);
  }
}

export function startBackgroundWorker() {
  if (intervalId) return;

  console.log('[Worker] Starting embedded background worker. Processing queue every 15 seconds...');
  
  // Run immediately on start, then repeat every 15s
  processWorkerBatch();
  intervalId = setInterval(processWorkerBatch, 15000);
}

export function stopBackgroundWorker() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[Worker] Stopped background worker.');
  }
}
