import mongoose from 'mongoose';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';

// Load env variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/typeahead';
const REDIS_NODES_ENV = process.env.REDIS_NODES || 'localhost:6379,localhost:6380,localhost:6381';

// Import schemas directly since we are a separate compilation unit
const QuerySchema = new mongoose.Schema({
  query: { type: String, required: true, unique: true, index: true },
  frequency: { type: Number, required: true, default: 1, index: true },
  trending_score: { type: Number, required: true, default: 0.0, index: true },
  user_location: { type: String, required: true, default: 'US' },
  timestamp: { type: Date, required: true, default: Date.now }
});
const QueryModel = mongoose.model('Query', QuerySchema);

const SearchLogSchema = new mongoose.Schema({
  query: { type: String, required: true, index: true },
  timestamp: { type: Date, required: true, default: Date.now, index: true },
  user_location: { type: String, required: true, default: 'US' }
});
const SearchLogModel = mongoose.model('SearchLog', SearchLogSchema);

// Setup Redis Connections
const physicalNodes = REDIS_NODES_ENV.split(',');
const redisClients: Redis[] = [];

function connectRedis() {
  for (const node of physicalNodes) {
    const [host, portStr] = node.split(':');
    const port = parseInt(portStr) || 6379;
    const client = new Redis({ host, port });
    redisClients.push(client);
  }
}

// Designate primary redis client (6379) for queue and pub/sub
const getQueueRedis = () => redisClients[0];

// Invalidate cache prefixes for updated terms
async function invalidateCacheForQuery(query: string, location: string) {
  try {
    // For query "apple", we invalidate prefixes: "a", "ap", "app", "appl", "apple"
    const prefixInvalidations: Promise<number>[] = [];
    
    for (let i = 1; i <= query.length; i++) {
      const prefix = query.slice(0, i);
      
      // Determine which Redis node owns this prefix (using FNV-1a locally in worker)
      const targetNode = getTargetNode(prefix);
      const [host, portStr] = targetNode.split(':');
      const port = parseInt(portStr) || 6379;
      
      // Find client matching port
      const client = redisClients.find(rc => rc.options.port === port);
      if (client) {
        const key = `prefix:${prefix}:${location.toUpperCase()}`;
        prefixInvalidations.push(client.del(key));
      }
    }
    
    await Promise.all(prefixInvalidations);
  } catch (error: any) {
    console.error(`Failed to invalidate cache for query [${query}]:`, error.message);
  }
}

// Consistent hashing implementation matching backend
function hashFNV1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash;
}

function getTargetNode(key: string): string {
  const vNodeCount = 150;
  const ring: Array<{ hash: number; physicalNode: string }> = [];
  
  for (const node of physicalNodes) {
    for (let i = 0; i < vNodeCount; i++) {
      const vNodeName = `${node}#vnode-${i}`;
      const hash = hashFNV1a(vNodeName);
      ring.push({ hash, physicalNode: node });
    }
  }
  ring.sort((a, b) => a.hash - b.hash);

  const keyHash = hashFNV1a(key);
  let low = 0;
  let high = ring.length - 1;
  let idx = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (ring[mid].hash >= keyHash) {
      idx = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  if (low >= ring.length) {
    idx = 0;
  }
  return ring[idx].physicalNode;
}

// Main Batch Processing Logic
async function processBatch() {
  const queueRedis = getQueueRedis();
  const QUEUE_KEY = 'search_log_queue';
  const BATCH_SIZE = 5000;
  const DECAY_FACTOR = 0.95; // Decay trending scores by 5% every iteration

  try {
    // 1. Pop search logs from the Redis queue
    const listLen = await queueRedis.llen(QUEUE_KEY);
    if (listLen === 0) {
      // No search events. Let's just decay existing trending scores
      await QueryModel.updateMany(
        { trending_score: { $gt: 0.01 } },
        [ { $set: { trending_score: { $multiply: [ '$trending_score', DECAY_FACTOR ] } } } ]
      );
      return;
    }

    const items = await queueRedis.lrange(QUEUE_KEY, 0, BATCH_SIZE - 1);
    if (items.length === 0) return;

    // Remove items from the queue
    await queueRedis.ltrim(QUEUE_KEY, items.length, -1);
    console.log(`Processing batch of ${items.length} search events...`);

    const parsedLogs = items.map(item => JSON.parse(item));

    // 2. Insert raw search logs in bulk for history/audits
    const rawLogDocs = parsedLogs.map(log => ({
      query: log.query,
      timestamp: new Date(log.timestamp),
      user_location: log.user_location
    }));
    await SearchLogModel.insertMany(rawLogDocs);

    // 3. Group and aggregate counts by query and location
    const aggregations = new Map<string, { query: string; location: string; count: number }>();
    
    for (const log of parsedLogs) {
      const key = `${log.query}#${log.user_location}`;
      const existing = aggregations.get(key);
      if (existing) {
        existing.count++;
      } else {
        aggregations.set(key, { query: log.query, location: log.user_location, count: 1 });
      }
    }

    // 4. Update the queries collection in MongoDB (increment frequency and trending score)
    const bulkOps: any[] = [];
    const updatedQueriesList: any[] = [];

    for (const [_, data] of aggregations.entries()) {
      const spikeWeight = 5.0; // Trending score impulse weight
      const trendBoost = data.count * spikeWeight;

      bulkOps.push({
        updateOne: {
          filter: { query: data.query },
          update: {
            $inc: { frequency: data.count, trending_score: trendBoost },
            $set: { timestamp: new Date(), user_location: data.location }
          },
          upsert: true
        }
      });
    }

    if (bulkOps.length > 0) {
      await QueryModel.bulkWrite(bulkOps);
    }

    // 5. Apply Exponential Decay to ALL other trending scores in MongoDB
    // (We also decay the recently updated ones so their scores decay normally over time)
    await QueryModel.updateMany(
      { trending_score: { $gt: 0.01 } },
      [ { $set: { trending_score: { $multiply: [ '$trending_score', DECAY_FACTOR ] } } } ]
    );

    // 6. Fetch the updated information for Pub/Sub notification to backend
    const updatedQueryNames = Array.from(aggregations.values()).map(a => a.query);
    const refreshedDocs = await QueryModel.find({ query: { $in: updatedQueryNames } });

    const pubSubPayload = refreshedDocs.map(doc => ({
      query: doc.query,
      frequency: doc.frequency,
      trending_score: doc.trending_score,
      user_location: doc.user_location,
      timestamp: doc.timestamp
    }));

    // 7. Publish Trie update event on Redis Pub/Sub
    await queueRedis.publish('trie_updates', JSON.stringify(pubSubPayload));
    console.log(`Published ${pubSubPayload.length} Trie updates to Express backend.`);

    // 8. Invalidate relevant caches for each query
    for (const agg of aggregations.values()) {
      await invalidateCacheForQuery(agg.query, agg.location);
    }
    console.log(`Invalidated cache prefixes for ${aggregations.size} queries.`);

  } catch (error: any) {
    console.error('Error during batch processing in worker:', error);
  }
}

async function run() {
  console.log('Worker connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Worker connected to MongoDB.');

  connectRedis();

  console.log('Worker started. Polling queue and calculating decay scoring every 15s...');
  
  // Run loop
  setInterval(async () => {
    await processBatch();
  }, 15000);
}

run().catch(err => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
