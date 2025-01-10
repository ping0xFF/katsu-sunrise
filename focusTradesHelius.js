require("dotenv").config();
const axios = require("axios");

// Configuration
const HELIUS_API_URL = process.env.HELIUS_API_URL;
const API_KEY = process.env.HELIUS_API_KEY; // Your Helius API key
const walletAddress = "HUpPyLU8KWisCAr3mzWy2FKT6uuxQ2qGgJQxyTpDoes5"; // Replace with your wallet address
const targetMintAddress = "9DHe3pycTuymFk4H4bbPoAJ4hQrr2kaLDF6J6aAKpump"; // Replace with your token mint address

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
    const tokenBuys = filterTokenBuys(transactions, walletAddress, targetMintAddress);
    allTokenBuys = allTokenBuys.concat(tokenBuys);

    // Update the `before` parameter for pagination
    before = transactions[transactions.length - 1]?.signature;

    console.log(`Total token buys found so far: ${allTokenBuys.length}`);
  }

  console.log(`Found ${allTokenBuys.length} total token buys:`);
  console.log(JSON.stringify(allTokenBuys, null, 2)); // Pretty-print the buys
}

// Execute
findTokenBuys();