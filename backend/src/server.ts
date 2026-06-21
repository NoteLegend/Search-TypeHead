import app from './app';
import { connectMongoDB, connectRedisNodes, getRedisClient } from './config/db';
import { QueryModel } from './models/query.model';
import { trie } from './services/trie-instance';
import dotenv from 'dotenv';
import Redis from 'ioredis';

dotenv.config();

const PORT = process.env.PORT || 5000;

// Load Trie data structure from MongoDB
async function bootstrapTrie() {
  console.log('Loading queries from MongoDB into in-memory Trie...');
  const startTime = performance.now();
  
  try {
    const cursor = QueryModel.find({}).cursor();
    let count = 0;

    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
      trie.insert(
        doc.query,
        doc.frequency,
        doc.trending_score,
        doc.user_location,
        doc.timestamp
      );
      count++;
      
      if (count % 20000 === 0) {
        console.log(`Loaded ${count} terms...`);
      }
    }

    const endTime = performance.now();
    console.log(`Trie initialization complete. Loaded ${count} unique query terms in ${((endTime - startTime) / 1000).toFixed(2)}s.`);
  } catch (error) {
    console.error('Error bootstrapping Trie:', error);
    process.exit(1);
  }
}

// Subscribe to real-time Trie updates from background worker
function startSubscriber() {
  const primaryNode = 'localhost:6379';
  console.log(`Initializing Redis Subscriber on ${primaryNode} for real-time Trie updates...`);
  
  const subscriber = new Redis({
    host: 'localhost',
    port: 6379
  });

  subscriber.subscribe('trie_updates', (err) => {
    if (err) {
      console.error('Failed to subscribe to trie_updates:', err.message);
    } else {
      console.log('Successfully subscribed to trie_updates channel.');
    }
  });

  subscriber.on('message', (channel, message) => {
    if (channel === 'trie_updates') {
      try {
        const updates = JSON.parse(message);
        console.log(`[PubSub] Received ${updates.length} Trie updates from worker. Injecting...`);
        
        for (const update of updates) {
          trie.insert(
            update.query,
            update.frequency,
            update.trending_score,
            update.user_location,
            new Date(update.timestamp)
          );
        }
      } catch (error: any) {
        console.error('Error parsing Trie update PubSub message:', error.message);
      }
    }
  });
}

async function startServer() {
  // 1. Establish Database Connections
  await connectMongoDB();
  connectRedisNodes();

  // 2. Load Trie index in memory
  await bootstrapTrie();

  // 3. Start Redis Subscriber
  startSubscriber();

  // 4. Start listening
  app.listen(PORT, () => {
    console.log(`Search Typeahead server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode.`);
  });
}


startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
