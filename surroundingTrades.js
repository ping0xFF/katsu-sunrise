const { Connection, PublicKey } = require('@solana/web3.js');
const fs = require('fs');
require('dotenv').config();

// Constants
const ALCHEMY_API_URL = process.env.ALCHEMY_API_URL;
const TIME_WINDOW = 15; // 15 seconds for testing
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
 * Fetch Transactions Within a Time Window (No Pagination)
 */
async function fetchSurroundingTrades(trade) {
  try {
    const { timestamp, signature } = trade;
    console.log(`🔍 Fetching transactions within ${TIME_WINDOW} seconds before focus transaction`);
    console.log(`🎯 Focus Transaction: ${signature}, Timestamp: ${timestamp}`);

    const startTime = timestamp - TIME_WINDOW; // 15 seconds before focus
    const endTime = timestamp; // Focus transaction timestamp

    console.log(`⏳ Fetching transactions BEFORE signature: ${signature}`);

    const transactions = await connection.getSignaturesForAddress(
      new PublicKey(FOCUS_TOKEN_PAIR),
      { before: signature, limit: 10 }
    );

    console.log(`✅ Fetched ${transactions.length} signatures.`);

    // Print each signature before fetching details
    transactions.forEach(({ signature }, index) => {
      console.log(`🆔 Fetched Signature #${index + 1}: ${signature}`);
    });

    if (!transactions.length) {
      console.log(`⚠️ No signatures found. Exiting.`);
      return [];
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

    // Filter transactions by time window
    const filteredBatch = detailedTransactions
      .filter((tx) => {
        if (!tx) {
          console.warn('⚠️ Skipping null transaction.');
          return false;
        }
        if (!tx.transaction || !tx.blockTime) {
          console.warn('⚠️ Skipping transaction with missing data.');
          return false;
        }
        if (!tx.transaction.message || !tx.transaction.message.accountKeys) {
          console.warn('⚠️ Skipping transaction with missing accountKeys.');
          return false;
        }
        return tx.blockTime >= startTime && tx.blockTime <= endTime;
      })
      .map((tx) => ({
        signature: tx.transaction.signatures[0],
        timestamp: tx.blockTime,
        accounts: tx.transaction.message.accountKeys.map((key) => key.toBase58()),
      }));

    console.log(`🔍 Found ${filteredBatch.length} transactions within time window.`);
    console.log(`✅ Total surrounding trades found: ${filteredBatch.length}`);

    return filteredBatch;
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