import { Schema, model, Document } from 'mongoose';

export interface ISearchLog extends Document {
  query: string;
  timestamp: Date;
}

const SearchLogSchema = new Schema<ISearchLog>({
  query: { type: String, required: true, index: true },
  timestamp: { type: Date, required: true, default: Date.now, index: true }
});

export const SearchLogModel = model<ISearchLog>('SearchLog', SearchLogSchema);
