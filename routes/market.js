import express from 'express';
import marketDataService from '../services/marketData.js';

const router = express.Router();

// Get current Bitcoin price
router.get('/bitcoin-price', async (req, res) => {
  try {
    const priceData = await marketDataService.getBitcoinPrice();
    res.json(priceData);
  } catch (error) {
    console.error('Error getting Bitcoin price:', error);
    res.status(500).json({ message: 'Failed to fetch Bitcoin price' });
  }
});

// Get historical price data
router.get('/bitcoin-history', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const historicalData = await marketDataService.getHistoricalPrices(days);
    res.json(historicalData);
  } catch (error) {
    console.error('Error getting historical prices:', error);
    res.status(500).json({ message: 'Failed to fetch historical prices' });
  }
});

export default router;