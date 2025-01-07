const { Connection, PublicKey } = require('@solana/web3.js');
const fs = require('fs');
require('dotenv').config();

// Constants
const ALCHEMY_API_URL = process.env.ALCHEMY_API_URL;
const TIME_WINDOW = 15; // Reduced to 15 seconds for testing
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
    console.log(`🔍 Fetching transactions within ${TIME_WINDOW} seconds before focus transaction`);
    console.log(`🎯 Focus Transaction: ${signature}, Timestamp: ${timestamp}`);

    const startTime = timestamp - TIME_WINDOW; // Window start
    const endTime = timestamp; // Focus transaction timestamp

    console.log(`⏳ Fetching transactions BEFORE signature: ${signature}`);

    const transactions = await connection.getSignaturesForAddress(
      new PublicKey(FOCUS_TOKEN_PAIR),
      { before: signature, limit: 2 } // Fetch 10 transactions
    );

    console.log(`✅ Fetched ${transactions.length} signatures.`);

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
    .filter((tx, index) => {
      console.log(`📝 Debugging Transaction #${index + 1}:`);
      console.log(`🔑 Signature: ${tx?.transaction?.signatures?.[0] || 'N/A'}`);
      console.log(`📅 BlockTime: ${tx?.blockTime || 'N/A'}`);
      console.log(`📦 Transaction Object:`, tx?.transaction || 'N/A');
      console.log(`🗝️ Message Object:`, tx?.transaction?.message || 'N/A');
      console.log(`🔗 AccountKeys:`, tx?.transaction?.message?.accountKeys || 'N/A');
      
      if (!tx) {
        console.warn('⚠️ Skipping null transaction.');
        return false;
      }
      if (!tx.transaction || !tx.blockTime) {
        console.warn(`⚠️ Skipping transaction with missing data. Tx ID: ${tx?.transaction?.signatures?.[0] || 'N/A'}`);
        return false;
      }
      if (!tx.transaction.message) {
        console.warn(`⚠️ Skipping transaction with missing message object. Tx ID: ${tx?.transaction?.signatures?.[0] || 'N/A'}`);
        return false;
      }
      if (!Array.isArray(tx.transaction.message.accountKeys)) {
        console.warn(`⚠️ Transaction has invalid or missing accountKeys. Tx ID: ${tx.transaction.signatures[0]}`);
      }
  
      return tx.blockTime >= startTime && tx.blockTime <= endTime;
    })
    .map((tx, index) => {
      const timeDiff = timestamp - tx.blockTime;
      console.log(`🆔 Fetched Signature #${index + 1}: ${tx.transaction.signatures[0]} | Timestamp: ${tx.blockTime} | Δ: ${timeDiff}s`);
      return {
        signature: tx.transaction.signatures[0],
        timestamp: tx.blockTime,
        accounts: Array.isArray(tx.transaction.message.accountKeys)
          ? tx.transaction.message.accountKeys.map((key) => key.toBase58())
          : [],
      };
    });

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