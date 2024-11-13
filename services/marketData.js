import axios from 'axios';

const BINANCE_API = 'https://api.binance.com/api/v3';
const COINBASE_API = 'https://api.coinbase.com/v2';

class MarketDataService {
  async getBitcoinPrice() {
    try {
      // Get prices from multiple sources for reliability
      const [binanceRes, coinbaseRes] = await Promise.all([
        axios.get(`${BINANCE_API}/ticker/price?symbol=BTCUSDT`),
        axios.get(`${COINBASE_API}/prices/BTC-USD/spot`)
      ]);

      const binancePrice = parseFloat(binanceRes.data.price);
      const coinbasePrice = parseFloat(coinbaseRes.data.data.amount);

      // Average the prices
      const averagePrice = (binancePrice + coinbasePrice) / 2;
      
      return {
        price: averagePrice,
        timestamp: Date.now(),
        sources: {
          binance: binancePrice,
          coinbase: coinbasePrice
        }
      };
    } catch (error) {
      console.error('Error fetching Bitcoin price:', error);
      throw new Error('Failed to fetch Bitcoin price');
    }
  }

  async getHistoricalPrices(days = 7) {
    try {
      const response = await axios.get(
        `${BINANCE_API}/klines`,
        {
          params: {
            symbol: 'BTCUSDT',
            interval: '1d',
            limit: days
          }
        }
      );

      return response.data.map(candle => ({
        timestamp: candle[0],
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5])
      }));
    } catch (error) {
      console.error('Error fetching historical prices:', error);
      throw new Error('Failed to fetch historical prices');
    }
  }
}

export default new MarketDataService();