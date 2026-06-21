import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import mongoose from 'mongoose';
import { QueryModel } from './models/query.model';

const MONGO_URI = 'mongodb://localhost:27017/typeahead';
const CSV_PATH = path.join(__dirname, '../../amazon_products.csv');
const TARGET_COUNT = 105000; // Seed slightly over 100k queries
const BATCH_SIZE = 5000;

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function cleanQuery(title: string): string {
  if (!title) return '';
  // Split by common delimiters to get the main product phrase
  let mainPart = title.split(/[,\-\(|\|]/)[0];
  
  // Strip special characters except alphanumeric and spaces
  mainPart = mainPart.replace(/[^a-zA-Z0-9 ]/g, ' ');
  
  // Collapse multiple spaces and trim
  mainPart = mainPart.replace(/\s+/g, ' ').trim();
  
  return mainPart.toLowerCase();
}

async function seed() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.');

  console.log('Clearing existing queries...');
  await QueryModel.deleteMany({});
  console.log('Cleared.');

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV file not found at: ${CSV_PATH}`);
    process.exit(1);
  }

  const fileStream = fs.createReadStream(CSV_PATH);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const uniqueQueries = new Map<string, { frequency: number; bought: number }>();
  let lineCount = 0;
  let headers: string[] = [];

  console.log('Starting CSV streaming and normalization...');

  for await (const line of rl) {
    lineCount++;
    if (lineCount === 1) {
      headers = parseCSVLine(line);
      continue;
    }

    const parts = parseCSVLine(line);
    if (parts.length < 2) continue;

    const rawTitle = parts[1];
    const cleaned = cleanQuery(rawTitle);

    if (cleaned.length < 3 || cleaned.length > 45 || /^\d+$/.test(cleaned)) {
      continue; // Skip very short/long or purely numeric search queries
    }

    // Parse reviews and boughtInLastMonth
    const reviewsIndex = headers.indexOf('reviews');
    const boughtIndex = headers.indexOf('boughtInLastMonth');

    let reviews = 0;
    let bought = 0;

    if (reviewsIndex !== -1 && parts[reviewsIndex]) {
      reviews = parseInt(parts[reviewsIndex].trim()) || 0;
    }
    if (boughtIndex !== -1 && parts[boughtIndex]) {
      bought = parseInt(parts[boughtIndex].trim()) || 0;
    }

    // Determine popularity frequency based on bought count or reviews
    const baseFreq = bought > 0 ? bought : (reviews > 0 ? Math.floor(reviews / 10) : 10);
    const existing = uniqueQueries.get(cleaned);

    if (existing) {
      existing.frequency += baseFreq;
      existing.bought += bought;
    } else {
      uniqueQueries.set(cleaned, { frequency: baseFreq, bought });
    }

    if (uniqueQueries.size >= TARGET_COUNT) {
      break;
    }
  }

  console.log(`Extracted ${uniqueQueries.size} unique queries. Building batch records...`);

  let batch: any[] = [];
  let insertedCount = 0;

  // Let's make some queries have high trending scores to simulate trending events
  const queryArray = Array.from(uniqueQueries.entries());
  
  // Sort queries to make seeding deterministic and neat
  queryArray.sort((a, b) => b[1].frequency - a[1].frequency);

  for (let i = 0; i < queryArray.length; i++) {
    const [query, data] = queryArray[i];
    
    // Base frequency is historical frequency
    let frequency = data.frequency + Math.floor(Math.random() * 20) + 1;
    
    // Assign a trending score
    // Boost top queries or select a random 2% of queries to be highly trending
    let trending_score = 0;
    if (i < 200) {
      // Top 200 popular queries are naturally trending
      trending_score = Math.random() * 50 + 50; // 50 to 100
    } else if (Math.random() < 0.015) {
      // 1.5% random spike
      trending_score = Math.random() * 80 + 20; // 20 to 100
    } else {
      trending_score = Math.random() * 5; // 0 to 5
    }

    // Randomize timestamp within the last 7 days
    const timestamp = new Date();
    timestamp.setDate(timestamp.getDate() - Math.random() * 7);

    batch.push({
      query,
      frequency,
      trending_score,
      timestamp
    });

    if (batch.length >= BATCH_SIZE) {
      await QueryModel.insertMany(batch);
      insertedCount += batch.length;
      console.log(`Inserted ${insertedCount} queries...`);
      batch = [];
    }
  }

  if (batch.length > 0) {
    await QueryModel.insertMany(batch);
    insertedCount += batch.length;
    console.log(`Inserted ${insertedCount} queries...`);
  }

  console.log(`Seeding complete. Successfully seeded ${insertedCount} queries into MongoDB.`);
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('Error during seeding:', err);
  process.exit(1);
});
