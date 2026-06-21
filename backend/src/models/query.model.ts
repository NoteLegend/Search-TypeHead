import { Schema, model, Document } from 'mongoose';

export interface IQuery extends Document {
  query: string;
  frequency: number;
  trending_score: number;
  timestamp: Date;
}

const QuerySchema = new Schema<IQuery>({
  query: { type: String, required: true, unique: true, index: true },
  frequency: { type: Number, required: true, default: 1, index: true },
  trending_score: { type: Number, required: true, default: 0.0, index: true },
  timestamp: { type: Date, required: true, default: Date.now }
});

// Optimized compound index for stateless prefix matching (regex /^val/) sorted by scores
QuerySchema.index({ query: 1, trending_score: -1, frequency: -1 });

export const QueryModel = model<IQuery>('Query', QuerySchema);
