const axios = require('axios');
require('dotenv').config(); // For storing API key in .env

// Bitquery API Configuration
const BITQUERY_API_URL = 'https://graphql.bitquery.io';
const BITQUERY_API_KEY = process.env.BITQUERY_API_KEY;

// GraphQL Query for BUZZ/SOL Focus Trades
const buzzFocusTradesQuery = `
{
  solana {
    dexTrades(
      options: {limit: 1000, asc: "block.timestamp.time"}
      txSender: {is: "HUpPyLU8KWisCAr3mzWy2FKT6uuxQ2qGgJQxyTpDoes5"}
      any: [
        {baseCurrency: {is: "9DHe3pycTuymFk4H4bbPoAJ4hQrr2kaLDF6J6aAKpump"}}
        {quoteCurrency: {is: "9DHe3pycTuymFk4H4bbPoAJ4hQrr2kaLDF6J6aAKpump"}}
      ]
    ) {
      transaction {
        signature
      }
      txSender {
        address
      }
      tokenPair {
        base {
          symbol
        }
        quote {
          symbol
        }
      }
      block {
        timestamp {
          time
        }
        height
      }
      trade {
        amount
        amountInUSD
        side
      }
    }
  }
}
`;

// Function to Fetch Data from Bitquery
async function fetchFocusTrades() {
  try {
    const response = await axios.post(
      BITQUERY_API_URL,
      { query: buzzFocusTradesQuery },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': BITQUERY_API_KEY
        }
      }
    );

    if (response.data.errors) {
      console.error('GraphQL Query Errors:', response.data.errors);
      return;
    }

    const trades = response.data.data.solana.dexTrades;

    console.log('BUZZ/SOL Focus Trades:');
    trades.forEach(trade => {
      console.log({
        txHash: trade.transaction.signature,
        wallet: trade.txSender.address,
        tokenPair: `${trade.tokenPair.base.symbol}/${trade.tokenPair.quote.symbol}`,
        timestamp: trade.block.timestamp.time,
        amount: trade.trade.amount,
        valueInUSD: trade.trade.amountInUSD,
        side: trade.trade.side
      });
    });

    return trades;
  } catch (error) {
    console.error('Error fetching trades:', error.message);
  }
}

// Execute the Function
fetchFocusTrades();
