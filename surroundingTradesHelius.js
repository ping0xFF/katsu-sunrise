import "dotenv/config";
import axios from "axios";
import fs from "fs";
import chalk from "chalk";

// Configuration
const HELIUS_API_URL = process.env.HELIUS_API_URL;
const API_KEY = process.env.HELIUS_API_KEY; // Your Helius API key
const surroundingTimeRangeMs = 5 * 60 * 1000; // 5 minutes in milliseconds
const inputFile = "token_buys.json";
const outputFile = "token_buys_with_surrounding.json";

if (!API_KEY) {
  console.error(chalk.red("Error: Helius API key is not defined in the .env file."));
  process.exit(1);
}

// Function to fetch transaction history for a mint
async function getMintTransactions(mintAddress, before = null) {
  try {
    let url = `${HELIUS_API_URL}/v0/tokens/${mintAddress}/transactions?api-key=${API_KEY}`;
    if (before) {
      url += `&before=${before}`;
    }

    // Fetch transactions from the API
    const response = await axios.get(url);
    return response.data; // Return the list of transactions
  } catch (error) {
    console.error(chalk.red("Error fetching transactions:"), error.response?.data || error.message);
    return [];
  }
}

// Find surrounding trades for a given focus trade
async function findSurroundingTrades(mintAddress, mainTxTimestamp, mainTxSignature) {
  // Define the start and end of the surrounding time range
  const startTimestamp = mainTxTimestamp - surroundingTimeRangeMs;
  const endTimestamp = mainTxTimestamp;

  let before = null; // For pagination
  let surroundingTrades = []; // Array to store surrounding trades
  let hasMore = true; // Flag to continue or stop pagination

  while (hasMore) {
    console.log(chalk.yellow(`Fetching transactions for mint: ${mintAddress}...`));

    // Fetch transactions for the mint address
    const transactions = await getMintTransactions(mintAddress, before);

    if (!transactions || transactions.length === 0) {
      console.log(chalk.red("No transactions found. Ending pagination."));
      hasMore = false; // Stop if no transactions are returned
      break;
    }

    console.log(chalk.green(`Fetched ${transactions.length} transactions.`));

    for (const tx of transactions) {
      const txTimestampMs = tx.timestamp * 1000; // Convert timestamp to milliseconds

      // Stop if the transaction is outside the time window
      if (txTimestampMs < startTimestamp) {
        console.log(chalk.red("Transaction is outside the time range. Stopping pagination."));
        hasMore = false;
        break;
      }

      // Add to surrounding trades if within the window and not the focus trade
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

    // Set `before` for the next page
    before = transactions[transactions.length - 1]?.signature;
    if (!before) {
      hasMore = false; // Stop if there are no more transactions to paginate
      console.log(chalk.red("No 'before' parameter available. Ending pagination."));
    }
  }

  return surroundingTrades;
}

async function processSurroundingTrades() {
  // Load token buys from JSON
  let tokenBuys = JSON.parse(fs.readFileSync(inputFile, "utf8"));
  console.log(chalk.blue(`Processing ${tokenBuys.length} token buys from ${inputFile}...`));

  // Loop through each token buy in the file
  for (let i = 0; i < tokenBuys.length; i++) {
    const buy = tokenBuys[i]; // Current token buy

    console.log(chalk.yellow(`Finding surrounding trades for TxID: ${buy.signature}...`));

    // Remove existing surroundingTrades if present
    delete buy.surroundingTrades;

    const mainTxTimestamp = new Date(buy.date).getTime();

    // Ensure the correct mint address is used
    const targetMintAddress = "9DHe3pycTuymFk4H4bbPoAJ4hQrr2kaLDF6J6aAKpump";

    const relevantTransfer = buy.tokenTransfers.find(
      (transfer) => transfer.mint === targetMintAddress
    );

    const mintAddress = relevantTransfer?.mint;
    const walletAddress = relevantTransfer?.to;

    // Ensure mintAddress and walletAddress exist
    if (!mintAddress || !walletAddress) {
      console.error(chalk.red(`No valid mint or wallet address found for TxID: ${buy.signature}. Skipping.`));
      continue;
    }

    // Fetch surrounding trades
    const surroundingTrades = await findSurroundingTrades(mintAddress, mainTxTimestamp, buy.signature);

    // Add surrounding trades to the focus trade
    buy.surroundingTrades = surroundingTrades;

    console.log(
      chalk.green(
        `Found ${surroundingTrades.length} surrounding trades for TxID: ${buy.signature}`
      )
    );
  }

  // Save updated JSON with surrounding trades
  fs.writeFileSync(outputFile, JSON.stringify(tokenBuys, null, 2));
  console.log(chalk.blueBright(`💾 Updated token buys saved to ${outputFile}`));
}

// Execute the script
processSurroundingTrades();