import "dotenv/config"; // Load environment variables from a .env file
import axios from "axios"; // HTTP client for API requests
import fs from "fs"; // File system module for reading/writing files
import chalk from "chalk"; // For color-coded console output

// Configuration
const HELIUS_API_URL = process.env.HELIUS_API_URL; // Base URL for the Helius API
const API_KEY = process.env.HELIUS_API_KEY; // API key for authentication
const surroundingTimeRangeMs = 5 * 60 * 1000; // Time range for surrounding trades (5 minutes in milliseconds)
const inputFile = "token_buys.json"; // Input file containing token buy transactions
const outputFile = "token_buys_with_surrounding.json"; // Output file for enriched data

// Ensure the API key is set
if (!API_KEY) {
  console.error(chalk.red("Error: Helius API key is not defined in the .env file."));
  process.exit(1);
}

// Function to fetch transaction history for a given address or mint
async function getWalletTransactions(wallet, before = null) {
  try {
    // Build the URL with optional pagination
    let url = `${HELIUS_API_URL}/v0/addresses/${wallet}/transactions?api-key=${API_KEY}`;
    if (before) {
      url += `&before=${before}`; // Add pagination parameter if provided
    }

    // Fetch transactions from the API
    const response = await axios.get(url);
    return response.data; // Return the list of transactions
  } catch (error) {
    console.error(chalk.red("Error fetching transactions:"), error.response?.data || error.message);
    return []; // Return an empty array on error
  }
}

// Function to find trades surrounding a specific transaction
async function findSurroundingTrades(mintAddress, mainTxTimestamp, mainTxSignature) {
  // Define the start and end of the surrounding time range
  const startTimestamp = mainTxTimestamp - surroundingTimeRangeMs;
  const endTimestamp = mainTxTimestamp;

  let before = null; // For pagination
  let surroundingTrades = []; // Array to store surrounding trades
  let hasMore = true; // Flag to continue or stop pagination

  while (hasMore) {
    console.log(chalk.yellow(`Fetching transactions for mint: ${mintAddress}...`));

    // Fetch transactions for the given mint address
    const transactions = await getWalletTransactions(mintAddress, before);

    if (!transactions || transactions.length === 0) {
      console.log(chalk.red("No transactions found. Ending pagination."));
      hasMore = false; // Stop if no transactions are returned
      break;
    }

    console.log(chalk.green(`Fetched ${transactions.length} transactions.`));

    for (const tx of transactions) {
      const txTimestampMs = tx.timestamp * 1000; // Convert timestamp to milliseconds

      // If the transaction is outside the time range, stop pagination
      if (txTimestampMs < startTimestamp) {
        console.log(chalk.red("Transaction is outside the time range. Stopping pagination."));
        hasMore = false;
        break;
      }

      // If within the time range and not the main transaction, process it
      if (txTimestampMs <= endTimestamp && tx.signature !== mainTxSignature) {
        tx.tokenTransfers.forEach((transfer) => {
          // Only consider transfers for the specified mint address
          if (transfer.mint === mintAddress) {
            surroundingTrades.push({
              wallet: transfer.toUserAccount, // Wallet involved in the transfer
              signature: tx.signature, // Transaction signature
              amount: transfer.tokenAmount, // Amount transferred
              date: new Date(txTimestampMs).toISOString(), // Timestamp in ISO format
            });
          }
        });
      }
    }

    // Update the `before` parameter for pagination
    before = transactions[transactions.length - 1]?.signature;
    if (!before) {
      hasMore = false; // Stop if there are no more transactions to paginate
      console.log(chalk.red("No 'before' parameter available. Ending pagination."));
    }
  }

  return surroundingTrades; // Return the collected surrounding trades
}

// Main function to process surrounding trades for token buys
async function processSurroundingTrades() {
  // Load the input JSON file
  let tokenBuys = JSON.parse(fs.readFileSync(inputFile, "utf8"));
  console.log(chalk.blue(`Processing ${tokenBuys.length} token buys from ${inputFile}...`));

  // Loop through each token buy in the file
  for (let i = 0; i < tokenBuys.length; i++) {
    const buy = tokenBuys[i]; // Current token buy

    console.log(chalk.yellow(`Finding surrounding trades for TxID: ${buy.signature}...`));

    // Remove any existing surroundingTrades from the JSON
    delete buy.surroundingTrades;

    const mainTxTimestamp = new Date(buy.date).getTime(); // Timestamp of the main transaction
    const surroundingTrades = await findSurroundingTrades(
      buy.tokenTransfers[0]?.to, // Use the recipient's wallet address
      mainTxTimestamp, // Timestamp of the main transaction
      buy.signature // Signature of the main transaction
    );

    buy.surroundingTrades = surroundingTrades; // Add surrounding trades to the token buy

    console.log(
      chalk.green(`Found ${surroundingTrades.length} surrounding trades for TxID: ${buy.signature}`)
    );
  }

  // Save the updated JSON to the output file
  fs.writeFileSync(outputFile, JSON.stringify(tokenBuys, null, 2));
  console.log(chalk.blueBright(`💾 Updated token buys saved to ${outputFile}`));
}

// Execute the main function
processSurroundingTrades();