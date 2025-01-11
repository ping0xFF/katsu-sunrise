require("dotenv").config();
const axios = require("axios");

// Configuration
const HELIUS_API_URL = process.env.HELIUS_API_URL;
const API_KEY = process.env.HELIUS_API_KEY; // Your Helius API key
const walletAddress = "HUpPyLU8KWisCAr3mzWy2FKT6uuxQ2qGgJQxyTpDoes5"; // Replace with your wallet address
const targetMintAddress = "9DHe3pycTuymFk4H4bbPoAJ4hQrr2kaLDF6J6aAKpump"; // Replace with your token mint address

// Human-readable token creation date
const tokenCreationDate = "2025-01-02T12:00:00Z"; // Replace with your token creation date
const tokenCreationTimestamp = new Date(tokenCreationDate).getTime(); // Convert to milliseconds

if (!API_KEY) {
  console.error("Error: Helius API key is not defined in the .env file.");
  process.exit(1);
}

// Fetch wallet transaction history
async function getWalletTransactions(wallet, before = null) {
  try {
    let url = `${HELIUS_API_URL}/v0/addresses/${wallet}/transactions?api-key=${API_KEY}`;
    if (before) {
      url += `&before=${before}`;
    }
    const response = await axios.get(url);
    console.log(`Fetched ${response.data.length} transactions.`);
    return response.data;
  } catch (error) {
    console.error("Error fetching transactions:", error.response?.data || error.message);
    return [];
  }
}

// Filter for buys of the specific token
function filterTokenBuys(transactions, wallet, mintAddress) {
  return transactions.filter((tx) => {
    return tx.tokenTransfers.some((transfer) => {
      return (
        transfer.mint === mintAddress &&
        transfer.toUserAccount === wallet &&
        transfer.tokenAmount > 0
      );
    });
  });
}

// Main function with pagination
async function findTokenBuys() {
  console.log("Fetching wallet transactions...");
  console.log(`Token creation timestamp: ${tokenCreationTimestamp} (${tokenCreationDate})`);
  let before = null;
  let hasMore = true;
  let allTokenBuys = [];

  while (hasMore) {
    const transactions = await getWalletTransactions(walletAddress, before);

    if (transactions.length === 0) {
      hasMore = false;
      break;
    }

    console.log("Filtering for token buys...");
    for (const tx of transactions) {
      const txTimestampMs = tx.timestamp * 1000; // Convert to milliseconds
      console.log(
        `Current transaction timestamp: ${txTimestampMs} (${new Date(txTimestampMs).toISOString()})`
      );
      console.log(
        `Comparison: Token creation timestamp (${tokenCreationTimestamp}) ${
          txTimestampMs >= tokenCreationTimestamp ? "<=" : ">"
        } Current transaction timestamp (${txTimestampMs})`
      );

      if (txTimestampMs < tokenCreationTimestamp) {
        console.log("Transaction is before the token creation timestamp. Stopping.");
        hasMore = false;
        break;
      }

      const tokenBuys = filterTokenBuys([tx], walletAddress, targetMintAddress);
      allTokenBuys = allTokenBuys.concat(tokenBuys);

      if (tokenBuys.length > 0) {
        console.log(`🔍 Found ${tokenBuys.length} token buys in this transaction.`);
      }
    }

    console.log(`Total token buys found so far: ${allTokenBuys.length}`);

    // Update the `before` parameter for pagination
    if (hasMore) {
      before = transactions[transactions.length - 1]?.signature;
      console.log(`Updated 'before' parameter for pagination: ${before}`);
    }
  }

  console.log(`✅ Found ${allTokenBuys.length} total token buys:`);
  console.log(JSON.stringify(allTokenBuys, null, 2)); // Pretty-print the buys
}

// Execute
findTokenBuys();