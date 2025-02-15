// Katsu Sunrise 2 Script

import "dotenv/config";
import axios from "axios";
import fs from "fs";
import chalk from "chalk";

// Configuration
const HELIUS_API_URL = process.env.HELIUS_API_URL;
const API_KEY = process.env.HELIUS_API_KEY;
const surroundingTimeRangeMs = 1000;
const pairAddress = "9DHe3pycTuymFk4H4bbPoAJ4hQrr2kaLDF6J6aAKpump"; // Token pair address
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
  const solTransfers = Array.isArray(transaction.solTransfers) ? transaction.solTransfers : [];
  const tokenTransfers = Array.isArray(transaction.tokenTransfers) ? transaction.tokenTransfers : [];

  const solSent = solTransfers.some(
    (solTx) => solTx.from === wallet && solTx.to && solTx.amount > 0
  );

  const tokenReceived = tokenTransfers.some(
    (tokenTx) => tokenTx.to === wallet && tokenTx.mint === mint && tokenTx.amount > 0
  );

  return { valid: solSent && tokenReceived, reason: solSent ? "Missing token transfer" : "Missing SOL transfer" };
}

// Find trades before the focus transaction
async function findSurroundingTrades(focusTxTimestamp, focusTxSignature, wallet, mint) {
  const startTimestamp = focusTxTimestamp - surroundingTimeRangeMs;
  let before = focusTxSignature;
  let surroundingTrades = [];
  let seenTransactions = new Set();
  let hasMore = true;

  while (hasMore) {
    console.log(chalk.cyan(`Fetching transactions before: ${before}`));
    const transactions = await getTransactions(pairAddress, before);

    if (!transactions || transactions.length === 0) {
      console.log(chalk.red("No more transactions. Stopping pagination."));
      hasMore = false;
      break;
    }

    console.log(chalk.blue(`Processing ${transactions.length} transactions...`));

    for (const tx of transactions) {
      if (seenTransactions.has(tx.signature)) {
        console.log(chalk.yellow(`Duplicate TxID skipped: ${tx.signature}`));
        continue;
      }

      seenTransactions.add(tx.signature);

      const txTimestampMs = tx.timestamp * 1000;
      const isWithinWindow = txTimestampMs >= startTimestamp;

      const { valid, reason } = isValidBuy(tx, wallet, mint);

      console.log(
        `${isWithinWindow ? chalk.cyan("⏳") : chalk.red("⏰")} TxID: ${chalk.yellow(tx.signature)} | TS: ${chalk.blue(new Date(txTimestampMs).toISOString())} | Buy: ${valid ? chalk.green("✅") : chalk.red("🚫")} ${valid ? "" : `| Reason: ${chalk.red(reason)}`}`
      );

      if (!isWithinWindow) {
        console.log(chalk.red("Transaction is outside the time window. Stopping pagination."));
        hasMore = false;
        break;
      }

      surroundingTrades.push({
        signature: tx.signature,
        timestamp: txTimestampMs,
        details: { ...tx },
        validBuy: valid,
      });
    }

    const previousBefore = before;
    before = transactions[transactions.length - 1]?.signature;

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
    const wallet = buy.tokenTransfers[0]?.to;
    const mint = buy.mint;

    console.log(chalk.blueBright(`Processing Focus TxID: ${buy.signature}`));
    console.log(chalk.greenBright(`Focus Timestamp: ${new Date(focusTxTimestamp).toISOString()}`));
    console.log(chalk.cyan(`Fetching surrounding trades...\n`));

    const surroundingTrades = await findSurroundingTrades(focusTxTimestamp, buy.signature, wallet, mint);

    surroundingTrades.forEach((tx) => {
      const txTimestampMs = tx.timestamp;
      const isWithinWindow = txTimestampMs >= focusTxTimestamp - surroundingTimeRangeMs;

      const solSentDetails = tx.details.solTransfers?.find(solTx => solTx.from === wallet);
      const tokenReceivedDetails = tx.details.tokenTransfers?.find(tokenTx => tokenTx.to === wallet && tokenTx.mint === mint);

      const txDetails = `${isWithinWindow ? chalk.cyan('⏳') : chalk.red('⏰')} TxID: ${chalk.yellow(tx.signature)} | TS: ${chalk.blue(new Date(txTimestampMs).toISOString())}`;

      if (isWithinWindow) {
        if (tx.validBuy) {
          console.log(chalk.green(`${txDetails} | ${chalk.green('Buy: ✅')} | ${chalk.magenta('SOL Sent:')} ${chalk.greenBright(solSentDetails?.amount || 'N/A')} | ${chalk.magenta('Tokens Received:')} ${chalk.greenBright(tokenReceivedDetails?.amount || 'N/A')} [${chalk.yellow('MINT:')} ${chalk.yellow(tokenReceivedDetails?.mint || 'N/A')}]`));
        } else {
          console.log(chalk.red(`${txDetails} | ${chalk.yellow('Buy: 🚫')} | ${chalk.redBright('Reason: Missing')} ${chalk.magenta(solSentDetails ? 'token transfer' : 'SOL transfer')}.`));
        }
      } else {
        console.log(chalk.red(`${txDetails} | ${chalk.redBright('Outside time window. Stopping pagination.')}`));
      }
    });

    console.log(chalk.blueBright(`Summary for Focus TxID: ${buy.signature}:`));
    console.log(chalk.greenBright(`- Total surrounding trades found: ${surroundingTrades.length}`));
    console.log(chalk.green(`- Valid buys: ${surroundingTrades.filter(tx => tx.validBuy).length} ✅`));
    console.log(chalk.yellow(`- Invalid buys: ${surroundingTrades.filter(tx => !tx.validBuy).length} 🚫`));
    console.log(chalk.blueBright(`\n`));

    buy.surroundingTrades = surroundingTrades;
  }

  fs.writeFileSync(outputFile, JSON.stringify(tokenBuys, null, 2));
  console.log(chalk.blueBright(`💾 Results saved to ${outputFile}`));
}

processSurroundingTrades();
