// Katsu Sunrise 2 Script

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

// Validate if a transaction is a valid buy
function isValidBuy(transaction, wallet, mint) {
  // console.log(chalk.yellow("Debugging Transaction Structure:"), JSON.stringify(transaction, null, 2)); // Debug transaction structure

  // Extract SOL and token transfers, ensure they are arrays
  const solTransfers = Array.isArray(transaction.solTransfers) ? transaction.solTransfers : [];
  const tokenTransfers = Array.isArray(transaction.tokenTransfers) ? transaction.tokenTransfers : [];

  // console.log(chalk.blue("SOL Transfers:"), solTransfers); // Log SOL transfers
  // console.log(chalk.blue("Token Transfers:"), tokenTransfers); // Log Token transfers

  // Check if SOL is sent from the wallet
  const solSent = solTransfers.some(
    (solTx) => solTx.from === wallet && solTx.to && solTx.amount > 0
  );
  // console.log(chalk.green(`SOL Sent: ${solSent}`)); // Log SOL sent status

  // Check if the token is received by the wallet
  const tokenReceived = tokenTransfers.some(
    (tokenTx) => tokenTx.to === wallet && tokenTx.mint === mint && tokenTx.amount > 0
  );
  // console.log(chalk.green(`Token Received: ${tokenReceived}`)); // Log token received status

  return solSent && tokenReceived;
}

// Find trades before the focus transaction
async function findSurroundingTrades(focusTxTimestamp, focusTxSignature, wallet, mint) {
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

    console.log(chalk.blue(`Processing ${transactions.length} transactions...`)); // Log number of transactions

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

      // Check if the transaction is a valid buy
      const validBuy = isValidBuy(tx, wallet, mint);

      surroundingTrades.push({
        signature: tx.signature,
        timestamp: txTimestampMs, // Explicitly include the timestamp
        details: { ...tx }, // Include full transaction details
        validBuy, // Indicate if this is a valid buy
      });

      console.log(chalk.green(`Transaction ${tx.signature} is a valid buy: ${validBuy}`)); // Log validity
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
    const wallet = buy.tokenTransfers[0]?.to; // Extract wallet from token transfers
    const mint = buy.mint;

    console.log(
      chalk.blueBright(`Focus TxID: ${buy.signature} | Focus Tx: ${new Date(focusTxTimestamp).toISOString()}`)
    );

    const surroundingTrades = await findSurroundingTrades(focusTxTimestamp, buy.signature, wallet, mint);

    console.log(chalk.yellow(`Surrounding trades for ${buy.signature}:`), JSON.stringify(surroundingTrades, null, 2)); // Log surrounding trades

    buy.surroundingTrades = surroundingTrades;

    console.log(chalk.green(`Found ${surroundingTrades.length} trades for focus TxID: ${buy.signature}\n`));
  }

  fs.writeFileSync(outputFile, JSON.stringify(tokenBuys, null, 2));
  console.log(chalk.blueBright(`💾 Results saved to ${outputFile}`));
}

processSurroundingTrades();
