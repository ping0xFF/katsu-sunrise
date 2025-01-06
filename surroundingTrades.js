const { Connection, PublicKey } = require('@solana/web3.js');
const fs = require('fs');
require('dotenv').config();

// Constants
const ALCHEMY_API_URL = process.env.ALCHEMY_API_URL;
const SURROUNDING_WINDOW = 10 * 60; // 10 minutes in seconds
const FOCUS_WALLET = 'HUpPyLU8KWisCAr3mzWy2FKT6uuxQ2qGgJQxyTpDoes5';

// Initialize Solana Connection
const connection = new Connection(ALCHEMY_API_URL, 'finalized');

/**
 * Load Focus Trades from JSON
 */
function loadFocusTrades() {
  try {
    const data = fs.readFileSync('focus_trades.json', 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('❌ Failed to load focus_trades.json:', error.message);
    return [];
  }
}

/**
 * Fetch Surrounding Trades for a Specific Trade
 */
/**
 * Fetch Surrounding Trades for a Specific Trade
 */
async function fetchSurroundingTrades(trade) {
  try {
    const { timestamp, tokenPair, signature } = trade;
    console.log(`🔍 Fetching surrounding trades for timestamp: ${timestamp}, tokenPair: ${tokenPair}`);

    const startTime = timestamp - SURROUNDING_WINDOW;
    const endTime = timestamp + SURROUNDING_WINDOW;

    let lastSignature = signature;
    let surroundingTrades = [];
    let continueFetching = true;

    while (continueFetching) {
      const transactions = await connection.getSignaturesForAddress(
        new PublicKey(FOCUS_WALLET),
        { before: lastSignature, limit: 50 }
      );

      if (!transactions.length) break;

      const detailedTransactions = await Promise.all(
        transactions.map(({ signature }) =>
          connection.getTransaction(signature, {
            commitment: 'finalized',
            maxSupportedTransactionVersion: 0,
          }).catch((err) => {
            console.warn(`Failed to fetch transaction: ${signature}`, err.message);
            return null;
          })
        )
      );

      const filteredBatch = detailedTransactions
        .filter((tx) => tx && tx.blockTime >= startTime && tx.blockTime <= endTime)
        .map((tx) => ({
          signature: tx.transaction.signatures[0],
          timestamp: tx.blockTime,
          tokenPair,
          accounts: tx.transaction.message.accountKeys.map((key) => key.toBase58()),
        }));

      surroundingTrades.push(...filteredBatch);

      // Stop if:
      // 1. All transactions are older than `startTime`
      // 2. Fewer than 50 transactions were returned (indicating the end of available history)
      const oldestTxTime = detailedTransactions[detailedTransactions.length - 1]?.blockTime || 0;
      lastSignature = transactions[transactions.length - 1]?.signature;

      if (oldestTxTime < startTime || transactions.length < 50) {
        continueFetching = false;
      }
    }

    console.log(`✅ Found ${surroundingTrades.length} surrounding trades.`);
    return surroundingTrades;
  } catch (error) {
    console.error('❌ Error fetching surrounding trades:', error.message);
    return [];
  }
}

/**
 * Main Function to Process Surrounding Trades
 */
async function processSurroundingTrades() {
  const focusTrades = loadFocusTrades();
  if (!focusTrades.length) {
    console.warn('⚠️ No focus trades found. Exiting.');
    return;
  }

  const allSurroundingTrades = [];

  for (const trade of focusTrades) {
    const surroundingTrades = await fetchSurroundingTrades(trade);
    allSurroundingTrades.push({
      focusTrade: trade,
      surroundingTrades,
    });
  }

  // Save surrounding trades to JSON
  fs.writeFileSync('surrounding_trades.json', JSON.stringify(allSurroundingTrades, null, 2));
  console.log('📁 Surrounding trades saved to surrounding_trades.json');
}

// Run the script
processSurroundingTrades();