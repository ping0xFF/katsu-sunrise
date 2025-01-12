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

// Function to fetch transaction history for a mint (address-based endpoint)
async function getMintTransactions(mintAddress, before = null) {
  try {
    // Construct URL matching the working `curl` command
    let url = `${HELIUS_API_URL}/v0/addresses/${mintAddress}/transactions?api-key=${API_KEY}`;
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

async function findSurroundingTrades(mintAddress, mainTxTimestamp, mainTxSignature) {
  // Define the start and end of the surrounding time range
  const startTimestamp = mainTxTimestamp - surroundingTimeRangeMs; // Start time for the range
  const endTimestamp = mainTxTimestamp; // End time for the range

  let before = null; // Pagination parameter for API calls
  let surroundingTrades = []; // To collect all valid surrounding trades
  let hasMore = true; // To control pagination loop

  while (hasMore) {
    // Log mint being fetched with additional timestamp details
    console.log(
      chalk.yellow(`Fetching transactions for mint: ${mintAddress}`) +
        chalk.blue(` | Start Time: ${new Date(startTimestamp).toISOString()}`) +
        chalk.green(` | End Time: ${new Date(endTimestamp).toISOString()}`) +
        chalk.magenta(` | Current 'before': ${before || "null"}`)
    );

    // Fetch transactions using the mint address
    const transactions = await getMintTransactions(mintAddress, before);

    if (!transactions || transactions.length === 0) {
      console.log(chalk.red("No transactions found. Ending pagination."));
      hasMore = false;
      break;
    }

    console.log(chalk.green(`Fetched ${transactions.length} transactions.`));

    // Iterate through each transaction
    for (const tx of transactions) {
      const txTimestampMs = tx.timestamp * 1000; // Convert timestamp to milliseconds

      // Log the timestamp of each transaction in the current batch
      console.log(
        chalk.cyan(`Processing TxID: ${tx.signature}`) +
          chalk.blue(` | Timestamp: ${new Date(txTimestampMs).toISOString()}`)
      );

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
              wallet: transfer.toUserAccount, // The wallet receiving the token
              signature: tx.signature, // Transaction signature
              amount: transfer.tokenAmount, // Amount of tokens transferred
              date: new Date(txTimestampMs).toISOString(), // Date in ISO format
            });
          }
        });
      }
    }

    // Update `before` for the next page and log it
    const previousBefore = before; // Store the current `before` value
    before = transactions[transactions.length - 1]?.signature;

    if (previousBefore === before || !before) {
      console.log(chalk.red("No valid or new 'before' parameter available. Ending pagination."));
      hasMore = false;
    } else {
      console.log(chalk.magenta(`Next 'before' parameter: ${before}`));
    }
  }

  return surroundingTrades; // Return all surrounding trades found
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

    if (!mintAddress) {
      console.error(chalk.red(`No valid mint address found for TxID: ${buy.signature}. Skipping.`));
      continue;
    }

    const surroundingTrades = await findSurroundingTrades(mintAddress, mainTxTimestamp, buy.signature);

    buy.surroundingTrades = surroundingTrades;

    console.log(
      chalk.green(`Found ${surroundingTrades.length} surrounding trades for TxID: ${buy.signature}`)
    );
  }

  fs.writeFileSync(outputFile, JSON.stringify(tokenBuys, null, 2));
  console.log(chalk.blueBright(`💾 Updated token buys saved to ${outputFile}`));
}

// Execute the script
processSurroundingTrades();