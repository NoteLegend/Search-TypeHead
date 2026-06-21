import app from './app';
import { connectMongoDB, connectRedisNodes } from './config/db';
import { startBackgroundWorker } from './services/worker';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 5000;

async function startServer() {
  // 1. Establish Database Connections
  await connectMongoDB();
  connectRedisNodes();

  // 2. Start Embedded Background Worker
  startBackgroundWorker();

  // 3. Start Express server listener
  app.listen(PORT, () => {
    console.log(`Search Typeahead server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode.`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
