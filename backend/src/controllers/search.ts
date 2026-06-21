import { Request, Response } from 'express';
import { QueueService } from '../services/queue';

export const recordSearch = async (req: Request, res: Response): Promise<void> => {
  try {
    const { query, location } = req.body;

    if (!query || typeof query !== 'string' || query.trim() === '') {
      res.status(400).json({ error: 'Bad Request', message: 'Query string is required.' });
      return;
    }

    const userLocation = location || 'US';

    // Push search query details to the background queue
    await QueueService.push(query, userLocation);

    res.status(202).json({
      success: true,
      message: 'Search registered in write queue successfully.'
    });
  } catch (error: any) {
    console.error('Error in POST /search:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
};
