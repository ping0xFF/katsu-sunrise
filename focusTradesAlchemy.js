const { Connection, PublicKey } = require('@solana/web3.js');
require('dotenv').config();

// Alchemy RPC URL from .env
const ALCHEMY_API_URL = process.env.ALCHEMY_API_URL;

// Constants
const FOCUS_WALLET = 'HUpPyLU8KWisCAr3mzWy2FKT6uuxQ2qGgJQxyTpDoes5'; // 0xsun's Wallet
const BUZZ_TOKEN = '9DHe3pycTuymFk4H4bbPoAJ4hQrr2kaLDF6J6aAKpump'; // BUZZ Token
const SOL_TOKEN = 'So11111111111111111111111111111111111111112'; // SOL Token Mint Address

// Initialize Solana Connection
const connection = new Connection(ALCHEMY_API_URL, 'confirmed');

/**
 * Fetch Focus Trades for a Wallet
 */
async function fetchFocusTrades() {
  try {
    const walletAddress = new PublicKey(FOCUS_WALLET);
    console.log(`Fetching trades for wallet: ${FOCUS_WALLET}`);

    // Step 1: Fetch recent transactions for the wallet
    const signatures = await connection.getSignaturesForAddress(walletAddress, { limit: 50 });
    console.log(`Found ${signatures.length} recent signatures.`);

    const focusTrades = [];

    for (const { signature } of signatures) {
      const tx = await connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) continue;

      const accounts = tx.transaction.message.accountKeys.map((key) => key.toBase58());
      const instructions = tx.transaction.message.instructions;

      const isBUZZTrade = accounts.includes(BUZZ_TOKEN) && accounts.includes(SOL_TOKEN);

      if (isBUZZTrade) {
        focusTrades.push({
          signature,
          wallet: FOCUS_WALLET,
          timestamp: tx.blockTime,
          tokenPair: 'BUZZ/SOL',
        });
      }
    }

    console.log('Focus Trades:', focusTrades);
    return focusTrades;
  } catch (error) {
    console.error('Error fetching focus trades:', error.message);
  }
}

// Run the script
fetchFocusTrades();