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

// Function to fetch transaction history
async function getTransactions(address, before = null) {
  try {
    // Construct the API URL with the address and optional 'before' parameter
    let url = `${HELIUS_API_URL}/v0/addresses/${address}/transactions?api-key=${API_KEY}`;
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

async function findSurroundingTrades(pairAddress, mainTxTimestamp, mainTxSignature) {
  const startTimestamp = mainTxTimestamp - surroundingTimeRangeMs;
  const endTimestamp = mainTxTimestamp + surroundingTimeRangeMs;

  let before = mainTxSignature; // Start with the main transaction signature
  let surroundingTrades = [];
  let hasMore = true;

  while (hasMore) {
    console.log(
      chalk.yellow(`Fetching transactions for pair: ${pairAddress}`) +
        chalk.blue(` | Time Window: Start - ${new Date(startTimestamp).toISOString()}`) +
        chalk.green(` | End - ${new Date(endTimestamp).toISOString()}`) +
        chalk.magenta(` | Current 'before': ${before || "null"}`)
    );

    // Fetch transactions, passing the `before` parameter
    const transactions = await getTransactions(pairAddress, before);

    if (!transactions || transactions.length === 0) {
      console.log(chalk.red("No transactions found. Ending pagination."));
      hasMore = false;
      break;
    }

    console.log(chalk.green(`Fetched ${transactions.length} transactions.`));

    for (const tx of transactions) {
      const txTimestampMs = tx.timestamp * 1000;

      console.log(
        chalk.cyan(`Processing TxID: ${tx.signature}`) +
          chalk.blue(` | Timestamp: ${new Date(txTimestampMs).toISOString()}`)
      );

      // Stop if the transaction timestamp is before the time window
      if (txTimestampMs < startTimestamp) {
        console.log(chalk.red("Transaction is outside the time range. Stopping pagination."));
        hasMore = false;
        break;
      }

      // If the transaction is within the time window, add it to the results
      if (txTimestampMs <= endTimestamp && tx.signature !== mainTxSignature) {
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

    // Update `before` to the signature of the last transaction
    const previousBefore = before;
    before = transactions[transactions.length - 1]?.signature;

    if (!before || previousBefore === before) {
      console.log(chalk.red("No valid or new 'before' parameter available. Ending pagination."));
      hasMore = false;
    } else {
      console.log(chalk.magenta(`Next 'before' parameter set: ${before}`));
    }
  }

  return surroundingTrades;
}

async function processSurroundingTrades() {
  const tokenBuys = JSON.parse(fs.readFileSync(inputFile, "utf8"));
  console.log(chalk.blue(`Processing ${tokenBuys.length} token buys from ${inputFile}...`));

  for (let i = 0; i < tokenBuys.length; i++) {
    const buy = tokenBuys[i];
    const mainTxTimestamp = new Date(buy.date).getTime();

    console.log(
      chalk.yellow(`Finding surrounding trades for TxID: ${buy.signature}...`) +
        chalk.blue(` | Time Window: Start - ${new Date(mainTxTimestamp - surroundingTimeRangeMs).toISOString()}`) +
        chalk.green(` | End - ${new Date(mainTxTimestamp + surroundingTimeRangeMs).toISOString()}`)
    );

    delete buy.surroundingTrades;

    const pairAddress = "J2p6tgZDkvtHQ3VfbGRjzHJNLrqFgGfvjJsp2K7HX5cH";

    const surroundingTrades = await findSurroundingTrades(pairAddress, mainTxTimestamp, buy.signature);

    buy.surroundingTrades = surroundingTrades;

    console.log(
      chalk.green(`Found ${surroundingTrades.length} surrounding trades for TxID: ${buy.signature}`)
    );
  }

  fs.writeFileSync(outputFile, JSON.stringify(tokenBuys, null, 2));
  console.log(chalk.blueBright(`💾 Updated token buys saved to ${outputFile}`));
}

processSurroundingTrades();