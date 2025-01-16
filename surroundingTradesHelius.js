import "dotenv/config";
import axios from "axios";
import fs from "fs";
import chalk from "chalk";

// Configuration
const HELIUS_API_URL = process.env.HELIUS_API_URL;
const API_KEY = process.env.HELIUS_API_KEY;
const surroundingTimeRangeMs = 5 * 60 * 1000; // 5 minutes in milliseconds
const pairAddress = "J2p6tgZDkvtHQ3VfbGRjzHJNLrqFgGfvjJsp2K7HX5cH"; // Token pair address
const inputFile = "token_buys.json";
const outputFile = "token_buys_with_surrounding.json";

if (!API_KEY) {
  console.error(chalk.red("Error: Helius API key is not defined in the .env file."));
  process.exit(1);
}

// Fetch transaction history
async function getTransactions(address, before = null) {
  try {
    let url = `${HELIUS_API_URL}/v0/addresses/${address}/transactions?api-key=${API_KEY}`;
    if (before) url += `&before=${before}`;
    const response = await axios.get(url);
    console.log(chalk.green(`Fetched ${response.data.length} transactions.`));
    return response.data;
  } catch (error) {
    console.error(chalk.red("Error fetching transactions:"), error.response?.data || error.message);
    return [];
  }
}

// Find trades before the focus transaction
async function findSurroundingTrades(focusTxTimestamp, focusTxSignature) {
  const startTimestamp = focusTxTimestamp - surroundingTimeRangeMs;
  let before = focusTxSignature;
  let surroundingTrades = [];
  let seenTransactions = new Set(); // To track unique transactions
  let hasMore = true;

  while (hasMore) {
    console.log(chalk.cyan(`Fetching transactions before: ${before}`));
    const transactions = await getTransactions(pairAddress, before);

    if (!transactions || transactions.length === 0) {
      console.log(chalk.red("No more transactions. Stopping pagination."));
      hasMore = false;
      break;
    }

    for (const tx of transactions) {
      if (seenTransactions.has(tx.signature)) {
        console.log(chalk.yellow(`Duplicate TxID skipped: ${tx.signature}`));
        continue;
      }

      seenTransactions.add(tx.signature);

      const txTimestampMs = tx.timestamp * 1000;
      const isWithinWindow = txTimestampMs >= startTimestamp;

      console.log(
        `${isWithinWindow ? chalk.green("✅") : chalk.red("❌")} TxID: ${chalk.yellow(tx.signature)} | TS: ${new Date(txTimestampMs).toISOString()}`
      );

      if (!isWithinWindow) {
        console.log(chalk.red("Transaction is outside the time window. Stopping pagination."));
        hasMore = false;
        break;
      }

      surroundingTrades.push({
        signature: tx.signature,
        timestamp: txTimestampMs, // Explicitly include the timestamp
        details: { ...tx }, // Include full transaction details
      });
    }

    // Update pagination
    const previousBefore = before;
    before = transactions[transactions.length - 1]?.signature;

    // Prevent infinite loops by ensuring the `before` value changes
    if (!before || before === previousBefore) {
      console.log(chalk.red("No valid 'before' parameter or duplicate batch detected. Ending pagination."));
      hasMore = false;
    }
  }

  return surroundingTrades;
}

// Process surrounding trades for each focus transaction
async function processSurroundingTrades() {
  const tokenBuys = JSON.parse(fs.readFileSync(inputFile, "utf8"));
  console.log(chalk.blue(`Processing ${tokenBuys.length} focus transactions...\n`));

  for (let i = 0; i < tokenBuys.length; i++) {
    const buy = tokenBuys[i];
    const focusTxTimestamp = new Date(buy.date).getTime();

    console.log(
      chalk.blueBright(`Focus TxID: ${buy.signature} | Focus Tx: ${new Date(focusTxTimestamp).toISOString()}`)
    );

    const surroundingTrades = await findSurroundingTrades(focusTxTimestamp, buy.signature);

    buy.surroundingTrades = surroundingTrades;

    console.log(chalk.green(`Found ${surroundingTrades.length} trades for focus TxID: ${buy.signature}\n`));
  }

  fs.writeFileSync(outputFile, JSON.stringify(tokenBuys, null, 2));
  console.log(chalk.blueBright(`💾 Results saved to ${outputFile}`));
}

processSurroundingTrades();