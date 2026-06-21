import { Schema, model, Document } from 'mongoose';

export interface ISearchLog extends Document {
  query: string;
  timestamp: Date;
  user_location: string;
}

const SearchLogSchema = new Schema<ISearchLog>({
  query: { type: String, required: true, index: true },
  timestamp: { type: Date, required: true, default: Date.now, index: true },
  user_location: { type: String, required: true, default: 'US' }
});

export const SearchLogModel = model<ISearchLog>('SearchLog', SearchLogSchema);
