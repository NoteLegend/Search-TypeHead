import mongoose from 'mongoose';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import { ConsistentHashRing } from './hash-ring';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/typeahead';
const REDIS_NODES_ENV = process.env.REDIS_NODES || 'localhost:6379,localhost:6380,localhost:6381';

export const connectMongoDB = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('MongoDB connection successful.');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1);
  }
};

const physicalNodes = REDIS_NODES_ENV.split(',');

// Map node identifier (e.g. "localhost:6379") -> Redis client instance
export const redisClients = new Map<string, Redis>();
export const hashRing = new ConsistentHashRing(physicalNodes, 150);

export const connectRedisNodes = () => {
  for (const node of physicalNodes) {
    const [host, portStr] = node.split(':');
    const port = parseInt(portStr) || 6379;

    console.log(`Connecting to Redis node at ${host}:${port}...`);
    
    const client = new Redis({
      host,
      port,
      retryStrategy(times) {
        // Retry connection up to 3 times before failing
        if (times > 3) return null;
        return Math.min(times * 100, 1000);
      }
    });

    client.on('connect', () => {
      console.log(`Connected to Redis node: ${node}`);
    });

    client.on('error', (err) => {
      console.error(`Redis node [${node}] error:`, err.message);
    });

    redisClients.set(node, client);
  }
};

export const getRedisClient = (nodeIdentifier: string): Redis => {
  const client = redisClients.get(nodeIdentifier);
  if (!client) {
    throw new Error(`No Redis client found for node: ${nodeIdentifier}`);
  }
  return client;
};
