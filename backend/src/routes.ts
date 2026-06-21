import { Router } from 'express';
import { getSuggestions } from './controllers/suggestion';
import { recordSearch } from './controllers/search';
import { getTrendingSearches } from './controllers/trending';
import { debugCacheRoute } from './controllers/cache-debug';

const router = Router();

// Standard Autocomplete Endpoints
router.get('/suggestions', getSuggestions);
router.post('/search', recordSearch);
router.get('/trending', getTrendingSearches);

// Debugging Cache Consistent Hashing Routing
router.get('/cache/debug', debugCacheRoute);

export default router;
