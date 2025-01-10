require("dotenv").config(); 
const axios = require("axios");

// Configuration
const HELIUS_API_URL = process.env.HELIUS_API_URL;
const API_KEY = process.env.HELIUS_API_KEY; 
const walletAddress = "HUpPyLU8KWisCAr3mzWy2FKT6uuxQ2qGgJQxyTpDoes5"; 
const targetMintAddress = "9DHe3pycTuymFk4H4bbPoAJ4hQrr2kaLDF6J6aAKpump"; 

if (!API_KEY) {
  console.error("Error: Helius API key is not defined in the .env file.");
  process.exit(1);
}

// Fetch wallet transaction history
async function getWalletTransactions(wallet) {
  try {
    const url = `${HELIUS_API_URL}/${wallet}/transactions?api-key=${API_KEY}`;
    const response = await axios.get(url);
    console.log(`Total transactions fetched: ${response.data.length}`);
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

// Main function
async function findTokenBuys() {
  console.log("Fetching wallet transactions...");
  const transactions = await getWalletTransactions(walletAddress);

  console.log("Filtering for token buys...");
  const tokenBuys = filterTokenBuys(transactions, walletAddress, targetMintAddress);

  console.log(`Found ${tokenBuys.length} token buys:`);
  console.log(JSON.stringify(tokenBuys, null, 2)); // Pretty-print the buys
}

// Execute
findTokenBuys();