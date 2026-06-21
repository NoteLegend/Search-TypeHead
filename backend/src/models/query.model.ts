import { Schema, model, Document } from 'mongoose';

export interface IQuery extends Document {
  query: string;
  frequency: number;
  trending_score: number;
  user_location: string;
  timestamp: Date;
}

const QuerySchema = new Schema<IQuery>({
  query: { type: String, required: true, unique: true, index: true },
  frequency: { type: Number, required: true, default: 1, index: true },
  trending_score: { type: Number, required: true, default: 0.0, index: true },
  user_location: { type: String, required: true, default: 'US' },
  timestamp: { type: Date, required: true, default: Date.now }
});

// Compound index for geolocation-based suggestions
QuerySchema.index({ query: 1, user_location: 1 });

export const QueryModel = model<IQuery>('Query', QuerySchema);
