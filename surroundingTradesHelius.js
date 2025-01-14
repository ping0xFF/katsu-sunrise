import "dotenv/config";
import axios from "axios";
import fs from "fs";
import chalk from "chalk";

// Configuration
const HELIUS_API_URL = process.env.HELIUS_API_URL;
const API_KEY = process.env.HELIUS_API_KEY;
const surroundingTimeRangeMs = 5 * 60 * 1000; // 5 minutes in milliseconds
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
    return response.data;
  } catch (error) {
    console.error(chalk.red("Error fetching transactions:"), error.response?.data || error.message);
    return [];
  }
}

// Find trades before the focus transaction
async function findSurroundingTrades(pairAddress, focusTxTimestamp, focusTxSignature) {
  const startTimestamp = focusTxTimestamp - surroundingTimeRangeMs;
  let before = focusTxSignature;
  let surroundingTrades = [];
  let hasMore = true;

  while (hasMore) {
    console.log(chalk.yellow(`Fetching transactions before: ${before}`));
    const transactions = await getTransactions(pairAddress, before);

    if (!transactions || transactions.length === 0) {
      console.log(chalk.red("No more transactions. Stopping pagination."));
      hasMore = false;
      break;
    }

    console.log(chalk.green(`Fetched ${transactions.length} transactions.`));

    for (const tx of transactions) {
      const txTimestampMs = tx.timestamp * 1000;
      const isWithinWindow = txTimestampMs >= startTimestamp;

      const symbol = isWithinWindow ? chalk.green("✅") : chalk.red("❌");
      console.log(
        `${symbol} TxID: ${tx.signature}` +
          ` | Tx Time: ${new Date(txTimestampMs).toISOString().slice(11, 19)}` +
          ` | Start Window: ${new Date(startTimestamp).toISOString().slice(11, 19)}`
      );

      // If it's outside the window, stop pagination
      if (!isWithinWindow) {
        console.log(chalk.red("Transaction is outside the time window. Stopping pagination."));
        hasMore = false;
        break;
      }

      // Add to results if not the focus transaction
      if (tx.signature !== focusTxSignature) {
        tx.tokenTransfers.forEach((transfer) => {
          if (transfer.mint === pairAddress) {
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

    // Update pagination
    const previousBefore = before;
    before = transactions[transactions.length - 1]?.signature;

    if (!before || before === previousBefore) {
      console.log(chalk.red("No valid 'before' parameter. Ending pagination."));
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
      chalk.yellow(`Focus TxID: ${buy.signature} | Focus Time: ${new Date(focusTxTimestamp).toISOString()}`)
    );

    delete buy.surroundingTrades;

    const pairAddress = "J2p6tgZDkvtHQ3VfbGRjzHJNLrqFgGfvjJsp2K7HX5cH";

    const surroundingTrades = await findSurroundingTrades(pairAddress, focusTxTimestamp, buy.signature);

    buy.surroundingTrades = surroundingTrades;

    console.log(chalk.green(`Found ${surroundingTrades.length} trades for focus TxID: ${buy.signature}\n`));
  }

  fs.writeFileSync(outputFile, JSON.stringify(tokenBuys, null, 2));
  console.log(chalk.blueBright(`💾 Results saved to ${outputFile}`));
}

processSurroundingTrades();