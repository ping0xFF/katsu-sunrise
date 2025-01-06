const { Connection, PublicKey } = require('@solana/web3.js');
require('dotenv').config();

// Alchemy RPC URL from .env
const ALCHEMY_API_URL = process.env.ALCHEMY_API_URL;

// Constants
const FOCUS_WALLET = 'HUpPyLU8KWisCAr3mzWy2FKT6uuxQ2qGgJQxyTpDoes5';
const BUZZ_TOKEN = '4TxguLvR4vXwpS4CJXEemZ9DUhVYjhmsaTkqJkYrpump'; // amethyst test
// const BUZZ_TOKEN = '9DHe3pycTuymFk4H4bbPoAJ4hQrr2kaLDF6J6aAKpump'; // BUZZ
const SOL_TOKEN = 'So11111111111111111111111111111111111111112';

// Initialize Solana Connection
const connection = new Connection(ALCHEMY_API_URL, 'finalized');

/**
 * Fetch Focus Trades for a Wallet
 */
async function fetchFocusTrades() {
  try {
    const walletAddress = new PublicKey(FOCUS_WALLET);
    console.log(`Fetching trades for wallet: ${FOCUS_WALLET}`);

    const signatures = await connection.getSignaturesForAddress(walletAddress, { limit: 25 });
    console.log(`Found ${signatures.length} recent signatures.`);

    const focusTrades = [];

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

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      const signature = signatures[i]?.signature;

      if (!tx) {
        console.warn(`Transaction not found or failed for signature: ${signature}`);
        continue;
      }

      const message = tx.transaction?.message;
      if (!message) {
        console.warn(`Malformed transaction data for signature: ${signature}`);
        continue;
      }

      // Handle accountKeys and addressTableLookups
      let accounts = [];
      if (message.accountKeys) {
        accounts = message.accountKeys.map((key) => key.toBase58());
      } else if (message.addressTableLookups) {
        const accountLookups = message.addressTableLookups.flatMap((lookup) =>
          lookup.readonlyIndexes.concat(lookup.writableIndexes)
        );
        accounts = accountLookups.map((index) => message.staticAccountKeys[index].toBase58());
      } else {
        console.warn(`No accountKeys or addressTableLookups for signature: ${signature}`);
        continue;
      }

      const instructions = message.instructions || [];

      // Log full accounts and instructions for inspection
      console.log(`\n--- Transaction Details for Signature: ${signature} ---`);
      console.log('Accounts:', accounts);
      console.log('Instructions:', instructions);

      // Check in accountKeys (previous logic)
      const isBUZZTrade = accounts.includes(BUZZ_TOKEN) && accounts.includes(SOL_TOKEN);
      console.log(`isBUZZTrade: ${isBUZZTrade}`);

      // Check in instructions
      const isBUZZInInstructions = instructions.some((ix) => {
        const ixAccounts = ix.accounts || [];
        return ixAccounts.some((index) => accounts[index] === BUZZ_TOKEN);
      });
      console.log(`isBUZZInInstructions: ${isBUZZInInstructions}`);

      if (isBUZZTrade || isBUZZInInstructions) {
        focusTrades.push({
          signature,
          wallet: FOCUS_WALLET,
          timestamp: tx.blockTime,
          tokenPair: 'BUZZ/SOL',
        });
      }
    }

    console.log('\nFocus Trades:', focusTrades);
    return focusTrades;
  } catch (error) {
    console.error('Error fetching focus trades:', error.message);
  }
}

// Run the script
fetchFocusTrades();