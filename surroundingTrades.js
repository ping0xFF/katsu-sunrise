const { Connection, PublicKey } = require('@solana/web3.js');
const fs = require('fs');
require('dotenv').config();

// Constants
const ALCHEMY_API_URL = process.env.ALCHEMY_API_URL;
const TIME_WINDOW = 5 * 60; // 5 minutes in seconds (adjust to 1 * 60 if needed)
const FOCUS_TOKEN_PAIR = '4TxguLvR4vXwpS4CJXEemZ9DUhVYjhmsaTkqJkYrpump'; // Hardcoded for now

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
 * Fetch Transactions Within a Time Window
 */
async function fetchSurroundingTrades(trade) {
  try {
    const { timestamp, signature } = trade;
    console.log(`🔍 Fetching transactions within ${TIME_WINDOW / 60} minutes before focus transaction`);
    console.log(`🎯 Focus Transaction: ${signature}, Timestamp: ${timestamp}`);

    const startTime = timestamp - TIME_WINDOW; // Window start (e.g., 5 minutes before focus)
    const endTime = timestamp; // Focus transaction timestamp

    let lastSignature = signature;
    let surroundingTrades = [];
    let continueFetching = true;

    while (continueFetching) {
      console.log(`⏳ Fetching transactions BEFORE signature: ${lastSignature || 'N/A'}`);

      const transactions = await connection.getSignaturesForAddress(
        new PublicKey(FOCUS_TOKEN_PAIR),
        { before: lastSignature, limit: 10 } // Fetch in batches of 10 for efficiency
      );

      console.log(`✅ Fetched ${transactions.length} signatures.`);

      if (!transactions.length) {
        console.log(`⚠️ No more signatures found. Stopping pagination.`);
        break;
      }

      const detailedTransactions = await Promise.all(
        transactions.map(({ signature }) =>
          connection.getTransaction(signature, {
            commitment: 'finalized',
            maxSupportedTransactionVersion: 0,
          }).catch((err) => {
            console.warn(`❌ Failed to fetch transaction: ${signature}`, err.message);
            return null;
          })
        )
      );

      console.log(`📊 Processed ${detailedTransactions.length} detailed transactions.`);

      const filteredBatch = detailedTransactions
        .filter((tx) => tx && tx.transaction && tx.blockTime) // Filter out invalid transactions
        .filter((tx) => tx.blockTime >= startTime && tx.blockTime <= endTime) // Filter by time window
        .map((tx) => ({
          signature: tx.transaction.signatures[0],
          timestamp: tx.blockTime,
          accounts: tx.transaction.message.accountKeys.map((key) => key.toBase58()),
        }));

      console.log(`🔍 Found ${filteredBatch.length} transactions within time window.`);

      // Append to surrounding trades
      surroundingTrades.push(...filteredBatch);

      // Handle pagination safely
      const oldestTxTime = detailedTransactions[detailedTransactions.length - 1]?.blockTime || 0;
      lastSignature = transactions.length > 0 ? transactions[transactions.length - 1]?.signature : null;

      console.log(`📉 Oldest Tx Time: ${oldestTxTime}`);

      if (oldestTxTime < startTime || transactions.length < 10) {
        console.log(`🛑 Stopping pagination. Reached time window or end of transactions.`);
        continueFetching = false;
      }
    }

    console.log(`✅ Total surrounding trades found: ${surroundingTrades.length}`);
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