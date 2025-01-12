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

// Function to fetch wallet transaction history
async function getWalletTransactions(wallet, before = null) {
  try {
    let url = `${HELIUS_API_URL}/v0/addresses/${wallet}/transactions?api-key=${API_KEY}`;
    if (before) {
      url += `&before=${before}`;
    }
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error(chalk.red("Error fetching transactions:"), error.response?.data || error.message);
    return [];
  }
}

// Find surrounding trades for a given transaction
async function findSurroundingTrades(mintAddress, mainTxTimestamp, mainTxSignature) {
  const startTimestamp = mainTxTimestamp - surroundingTimeRangeMs;
  const endTimestamp = mainTxTimestamp;

  let before = null;
  let surroundingTrades = [];
  let hasMore = true;

  while (hasMore) {
    console.log(chalk.yellow(`Fetching transactions for mint: ${mintAddress}...`));

    const transactions = await getWalletTransactions(mintAddress, before); // Use mintAddress here

    if (!transactions || transactions.length === 0) {
      console.log(chalk.red("No transactions found. Ending pagination."));
      hasMore = false;
      break;
    }

    console.log(chalk.green(`Fetched ${transactions.length} transactions.`));

    for (const tx of transactions) {
      const txTimestampMs = tx.timestamp * 1000;

      if (txTimestampMs < startTimestamp) {
        console.log(chalk.red("Transaction is outside the time range. Stopping pagination."));
        hasMore = false;
        break;
      }

      if (txTimestampMs <= endTimestamp && tx.signature !== mainTxSignature) {
        tx.tokenTransfers.forEach((transfer) => {
          if (transfer.mint === mintAddress) {
            surroundingTrades.push({
              wallet: transfer.toUserAccount,
              signature: tx.signature,
              amount: transfer.tokenAmount,
              date: new Date(txTimestampMs).toISOString(),
            });
          }
        });
      }
    }

    before = transactions[transactions.length - 1]?.signature;
    if (!before) {
      console.log(chalk.red("No 'before' parameter available. Ending pagination."));
      hasMore = false;
    }
  }

  return surroundingTrades;
}

// Main function
async function processSurroundingTrades() {
  // Load token buys from JSON
  let tokenBuys = JSON.parse(fs.readFileSync(inputFile, "utf8"));
  console.log(chalk.blue(`Processing ${tokenBuys.length} token buys from ${inputFile}...`));

  for (let i = 0; i < tokenBuys.length; i++) {
    const buy = tokenBuys[i];

    console.log(chalk.yellow(`Finding surrounding trades for TxID: ${buy.signature}...`));

    // Remove existing surroundingTrades if present
    delete buy.surroundingTrades;

    const mainTxTimestamp = new Date(buy.date).getTime();
    const surroundingTrades = await findSurroundingTrades(
      buy.tokenTransfers[0]?.to, // Assuming the main wallet is the recipient of the token transfer
      mainTxTimestamp,
      buy.signature
    );

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

// Execute
processSurroundingTrades();