import { Router } from 'express';
import { REGIONS } from '../regions.js';
import { listAllBuckets } from '../bucketService.js';

const router = Router();

// GET /api/buckets - aggregate ListBuckets across every known IONOS region.
router.get('/', async (req, res) => {
  const { buckets, regionErrors } = await listAllBuckets();
  res.json({ buckets, regions: REGIONS, regionErrors });
});

export default router;
