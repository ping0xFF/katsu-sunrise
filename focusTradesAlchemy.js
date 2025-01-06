const { Connection, PublicKey } = require('@solana/web3.js');
const fs = require('fs');
require('dotenv').config();

// Constants
const ALCHEMY_API_URL = process.env.ALCHEMY_API_URL;
const FOCUS_WALLET = 'HUpPyLU8KWisCAr3mzWy2FKT6uuxQ2qGgJQxyTpDoes5'; // Wallet to focus on
const FOCUS_TOKEN = '4TxguLvR4vXwpS4CJXEemZ9DUhVYjhmsaTkqJkYrpump'; // Token to monitor (e.g., Amethyst)
// const FOCUS_TOKEN = '9DHe3pycTuymFk4H4bbPoAJ4hQrr2kaLDF6J6aAKpump'; // Example for other tokens
const SOL_TOKEN = 'So11111111111111111111111111111111111111112'; // Native Solana Token
const KEYWORDS = ['ray_log', 'swap', 'trade', 'buy']; // Keywords for identifying swaps

// Initialize Solana Connection
const connection = new Connection(ALCHEMY_API_URL, 'finalized');

/**
 * Check if a transaction represents a FOCUS_TOKEN buy
 */
function isFocusTokenBuy(tx) {
  const { meta } = tx;

  if (!meta || !meta.logMessages) return false;

  console.log('🔄 Analyzing transaction for token buy...');

  // ✅ Check Raydium Swap Keywords in Logs
  const logsContainKeywords = meta.logMessages.some((log) =>
    KEYWORDS.some((keyword) => log.toLowerCase().includes(keyword))
  );

  console.log(`🔍 Logs contain keywords: ${logsContainKeywords}`);

  if (!logsContainKeywords) return false;

  // ✅ Check FOCUS_TOKEN Balance Changes
  const preTokenBalance = meta.preTokenBalances?.find(
    (balance) => balance.owner === FOCUS_WALLET && balance.mint === FOCUS_TOKEN
  )?.uiTokenAmount.amount || 0;

  const postTokenBalance = meta.postTokenBalances?.find(
    (balance) => balance.owner === FOCUS_WALLET && balance.mint === FOCUS_TOKEN
  )?.uiTokenAmount.amount || 0;

  console.log(`💰 Token Balance - Pre: ${preTokenBalance}, Post: ${postTokenBalance}`);

  const preSOLBalance = meta.preBalances?.[0] || 0; // Assuming wallet is first in accountKeys
  const postSOLBalance = meta.postBalances?.[0] || 0;

  console.log(`💵 SOL Balance - Pre: ${preSOLBalance}, Post: ${postSOLBalance}`);

  const isTokenIncrease = postTokenBalance > preTokenBalance;
  const isSOLDecrease = postSOLBalance < preSOLBalance;

  console.log(`✅ Token Balance Increased: ${isTokenIncrease}`);
  console.log(`🔻 SOL Balance Decreased: ${isSOLDecrease}`);

  const isBuy = isTokenIncrease && isSOLDecrease;

  if (isBuy) {
    const solSpent = (preSOLBalance - postSOLBalance) / 1e9; // Convert lamports to SOL
    console.log(`💸 SOL Spent: ${solSpent} SOL\n`);
    tx.solSpent = solSpent; // Attach solSpent to the transaction object
  }

  console.log(`🎯 Final Evaluation: Is Buy Transaction: ${isBuy}\n`);

  return isBuy;
}

/**
 * Fetch and filter FOCUS_TOKEN buy trades for a wallet
 */
async function fetchFocusTrades() {
  try {
    console.log(`🔍 Fetching trades for wallet: ${FOCUS_WALLET}`);
    console.log(`🎯 Monitoring token: ${FOCUS_TOKEN}`);

    const walletAddress = new PublicKey(FOCUS_WALLET);

    // Fetch recent signatures
    const signatures = await connection.getSignaturesForAddress(walletAddress, { limit: 25 });
    console.log(`✅ Found ${signatures.length} recent transactions.`);

    const transactions = await Promise.all(
      signatures.map(({ signature }) =>
        connection.getTransaction(signature, {
          commitment: 'finalized',
          maxSupportedTransactionVersion: 0,
        }).catch((err) => {
          console.warn(`⚠️ Failed to fetch transaction for signature: ${signature}`, err.message);
          return null;
        })
      )
    );

    // Filter transactions matching FOCUS_TOKEN buy criteria
    const focusTrades = transactions
      .map((tx, index) => ({
        tx,
        signature: signatures[index]?.signature,
      }))
      .filter(({ tx }) => tx && isFocusTokenBuy(tx))
      .map(({ tx, signature }) => ({
        signature,
        wallet: FOCUS_WALLET,
        timestamp: tx.blockTime,
        tokenPair: `${FOCUS_TOKEN}/SOL`,
        solSpent: tx.solSpent || 0,
      }));

    console.log('\n🚀 Focus Trades:', focusTrades);

    // Save focus trades to a JSON file
    fs.writeFileSync('focus_trades.json', JSON.stringify(focusTrades, null, 2));
    console.log('💾 Focus trades saved to focus_trades.json');

    return focusTrades;
  } catch (error) {
    console.error('❌ Error fetching focus trades:', error.message);
  }
}

// Run the script
fetchFocusTrades();