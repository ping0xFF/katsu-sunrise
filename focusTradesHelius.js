const { Connection, PublicKey } = require('@solana/web3.js');
const fs = require('fs');
require('dotenv').config();

// Constants
const HELIUS_API_URL = `${process.env.HELIUS_API_URL}${process.env.HELIUS_API_KEY}`;
const FOCUS_WALLET = 'HUpPyLU8KWisCAr3mzWy2FKT6uuxQ2qGgJQxyTpDoes5'; // Wallet to focus on
const FOCUS_TOKEN = '9DHe3pycTuymFk4H4bbPoAJ4hQrr2kaLDF6J6aAKpump'; // Token to monitor
const connection = new Connection(HELIUS_API_URL, 'confirmed');

/**
 * Check if a transaction represents a FOCUS_TOKEN buy
 */
function isFocusTokenBuy(tx, walletAddress, tokenMintAddress) {
  const { meta, transaction } = tx;

  if (!meta || !meta.logMessages) return false;

  console.log('🔄 Analyzing transaction for token buy...');

  const preTokenBalance = meta.preTokenBalances?.find(
    (balance) =>
      (balance.owner === walletAddress || transaction.message.accountKeys.some(key => key.toBase58() === walletAddress)) &&
      balance.mint === tokenMintAddress
  )?.uiTokenAmount.amount || 0;

  const postTokenBalance = meta.postTokenBalances?.find(
    (balance) =>
      (balance.owner === walletAddress || transaction.message.accountKeys.some(key => key.toBase58() === walletAddress)) &&
      balance.mint === tokenMintAddress
  )?.uiTokenAmount.amount || 0;

  console.log(`💰 Token Balance - Pre: ${preTokenBalance}, Post: ${postTokenBalance}`);

  const solSpent = (meta.preBalances?.[0] || 0) - (meta.postBalances?.[0] || 0);
  const tokenBalanceIncreased = postTokenBalance > preTokenBalance;
  const solBalanceDecreased = solSpent > 0;

  return tokenBalanceIncreased && solBalanceDecreased;
}

/**
 * Fetch transactions and filter for FOCUS_TOKEN buys
 */
async function fetchFocusTrades() {
  try {
    console.log(`🔍 Fetching transactions for wallet: ${FOCUS_WALLET}`);
    console.log(`🎯 Monitoring token: ${FOCUS_TOKEN}`);

    const walletAddress = new PublicKey(FOCUS_WALLET);
    const tokenMintAddress = new PublicKey(FOCUS_TOKEN);

    const signatures = await connection.getSignaturesForAddress(walletAddress, { limit: 100 });
    console.log(`✅ Found ${signatures.length} transactions. Analyzing...`);

    const transactions = await Promise.all(
      signatures.map(({ signature }) =>
        connection.getTransaction(signature, { commitment: 'confirmed' }).catch(() => null)
      )
    );

    const focusTrades = transactions
      .filter((tx) => tx && isFocusTokenBuy(tx, walletAddress.toBase58(), tokenMintAddress.toBase58()))
      .map((tx) => ({
        signature: tx.transaction.signatures[0],
        wallet: walletAddress.toBase58(),
        tokenMint: tokenMintAddress.toBase58(),
        timestamp: tx.blockTime,
        solSpent: (tx.meta.preBalances[0] - tx.meta.postBalances[0]) / 1e9, // Convert lamports to SOL
      }));

    console.log('🚀 Focus Trades:', focusTrades);

    fs.writeFileSync('focus_trades.json', JSON.stringify(focusTrades, null, 2));
    console.log('💾 Focus trades saved to focus_trades.json');
  } catch (error) {
    console.error('❌ Error fetching focus trades:', error.message);
  }
}

// Run the script
fetchFocusTrades();