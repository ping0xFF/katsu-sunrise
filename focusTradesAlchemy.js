const { Connection, PublicKey } = require('@solana/web3.js');
require('dotenv').config();

// Constants
const ALCHEMY_API_URL = process.env.ALCHEMY_API_URL;
const FOCUS_WALLET = 'HUpPyLU8KWisCAr3mzWy2FKT6uuxQ2qGgJQxyTpDoes5';
const BUZZ_TOKEN = '4TxguLvR4vXwpS4CJXEemZ9DUhVYjhmsaTkqJkYrpump'; // Amethyst Token
// const BUZZ_TOKEN = '9DHe3pycTuymFk4H4bbPoAJ4hQrr2kaLDF6J6aAKpump'; // BUZZ
const KEYWORDS = ['ray_log', 'swap', 'trade', 'buy']; // Keywords for identifying swaps

// Initialize Solana Connection
const connection = new Connection(ALCHEMY_API_URL, 'finalized');

/**
 * Check if a transaction matches BUZZ_TOKEN trade criteria
 */
function isBuzzTokenBuy(tx) {
  const { meta } = tx;

  if (!meta) return false;

  // ✅ Check if BUZZ_TOKEN appears in preTokenBalances or postTokenBalances
  const tokenInBalances =
    (meta.preTokenBalances?.some(balance => balance.mint === BUZZ_TOKEN) ||
     meta.postTokenBalances?.some(balance => balance.mint === BUZZ_TOKEN));

  // ✅ Check if logs contain relevant swap keywords
  const logsContainKeywords = meta.logMessages?.some(log =>
    KEYWORDS.some(keyword => log.toLowerCase().includes(keyword))
  );

  return tokenInBalances && logsContainKeywords;
}

/**
 * Fetch and filter BUZZ_TOKEN trades for a wallet
 */
async function fetchFocusTrades() {
  try {
    console.log(`🔍 Fetching trades for wallet: ${FOCUS_WALLET}`);
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
          console.warn(`Failed to fetch transaction for signature: ${signature}`, err.message);
          return null;
        })
      )
    );

    // Filter transactions matching BUZZ_TOKEN buy criteria
    const focusTrades = transactions
      .map((tx, index) => ({
        tx,
        signature: signatures[index]?.signature,
      }))
      .filter(({ tx }) => tx && isBuzzTokenBuy(tx))
      .map(({ tx, signature }) => ({
        signature,
        wallet: FOCUS_WALLET,
        timestamp: tx.blockTime,
        tokenPair: 'BUZZ/SOL',
      }));

    console.log('\n🚀 Focus Trades:', focusTrades);
    return focusTrades;
  } catch (error) {
    console.error('❌ Error fetching focus trades:', error.message);
  }
}

// Run the script
fetchFocusTrades();