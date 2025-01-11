require("dotenv").config();
const axios = require("axios");

// Configuration
const HELIUS_API_URL = process.env.HELIUS_API_URL;
const API_KEY = process.env.HELIUS_API_KEY; // Your Helius API key
const walletAddress = "HUpPyLU8KWisCAr3mzWy2FKT6uuxQ2qGgJQxyTpDoes5"; // Replace with your wallet address
const targetMintAddress = "9DHe3pycTuymFk4H4bbPoAJ4hQrr2kaLDF6J6aAKpump"; // Replace with your token mint address
const date = new Date('2025-01-03T00:02:00Z');  // rough date of token creation
console.log(`Token creation timestamp: ${date.getTime()}`);
const tokenCreationTimestamp = date.getTime();

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
    console.log(`Fetching transactions with URL: ${url}`);
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
    const matches = tx.tokenTransfers.some((transfer) => {
      return (
        transfer.mint === mintAddress &&
        transfer.toUserAccount === wallet &&
        transfer.tokenAmount > 0
      );
    });
    if (matches) {
      console.log(`Transaction matches: ${tx.signature}`);
    }
    return matches;
  });
}

// Main function with pagination
async function findTokenBuys() {
  console.log("Fetching wallet transactions...");
  let before = null;
  let hasMore = true;
  let allTokenBuys = [];
  let attempts = 0; // To prevent infinite loop

  while (hasMore) {
    const transactions = await getWalletTransactions(walletAddress, before);

    if (transactions.length === 0) {
      console.log("No more transactions fetched. Stopping pagination.");
      hasMore = false;
      break;
    }

    console.log("Filtering for token buys...");
    const tokenBuys = filterTokenBuys(transactions, walletAddress, targetMintAddress);
    allTokenBuys = allTokenBuys.concat(tokenBuys);

    // Check the last transaction for blockTime
    const lastTransaction = transactions[transactions.length - 1];
    if (lastTransaction?.blockTime) {
      const oldestTransactionDate = new Date(lastTransaction.blockTime * 1000);
      console.log(`Oldest transaction block time: ${oldestTransactionDate.toISOString()}`);
      if (oldestTransactionDate.getTime() < tokenCreationTimestamp) {
        console.log("Reached transactions older than token creation date. Stopping.");
        break;
      }
    } else {
      console.warn("Last transaction is missing a valid blockTime. Skipping to next page.");
    }

    // Update the `before` parameter for pagination
    before = lastTransaction?.signature || before;
    console.log(`Updated 'before' parameter for pagination: ${before}`);

    // Increment attempts and check for infinite loop
    attempts++;
    if (attempts > 10) { // Adjust as needed
      console.error("Too many pagination attempts without valid data. Exiting to prevent infinite loop.");
      break;
    }

    console.log(`Total token buys found so far: ${allTokenBuys.length}`);
  }

  console.log(`Found ${allTokenBuys.length} total token buys:`);
  console.log(JSON.stringify(allTokenBuys, null, 2)); // Pretty-print the buys
}

// Execute
findTokenBuys();