import "dotenv/config";
import axios from "axios";
import chalk from "chalk";
import fs from "fs";

// Configuration
const HELIUS_API_URL = process.env.HELIUS_API_URL;
const API_KEY = process.env.HELIUS_API_KEY; // Your Helius API key
const walletAddress = "HUpPyLU8KWisCAr3mzWy2FKT6uuxQ2qGgJQxyTpDoes5"; // Replace with your wallet address
const targetMintAddress = "9DHe3pycTuymFk4H4bbPoAJ4hQrr2kaLDF6J6aAKpump"; // Replace with your token mint address

// Human-readable token creation date
const tokenCreationDate = "2025-01-02T12:00:00Z"; // Replace with your token creation date
const tokenCreationTimestamp = new Date(tokenCreationDate).getTime(); // Convert to milliseconds

if (!API_KEY) {
  console.error(chalk.red("Error: Helius API key is not defined in the .env file."));
  process.exit(1);
}

// Fetch wallet transaction history
async function getWalletTransactions(wallet, before = null) {
  try {
    let url = `${HELIUS_API_URL}/v0/addresses/${wallet}/transactions?api-key=${API_KEY}`;
    if (before) {
      url += `&before=${before}`;
    }
    const response = await axios.get(url);
    console.log(chalk.green(`Fetched ${response.data.length} transactions.`));
    return response.data;
  } catch (error) {
    console.error(chalk.red("Error fetching transactions:"), error.response?.data || error.message);
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

// Extract relevant details for token buys
function extractBuyDetails(transaction) {
  const { signature, timestamp, tokenTransfers, nativeTransfers } = transaction;
  const txDetails = {
    signature,
    date: new Date(timestamp * 1000).toISOString(),
    mint: targetMintAddress, // Include the token address
    tokenTransfers: [],
    solTransfers: [],
  };

  // Extract token transfer details
  tokenTransfers.forEach((transfer) => {
    txDetails.tokenTransfers.push({
      from: transfer.fromUserAccount,
      to: transfer.toUserAccount,
      amount: transfer.tokenAmount,
      mint: transfer.mint,
    });
  });

  // Extract SOL transfer details
  nativeTransfers.forEach((transfer) => {
    txDetails.solTransfers.push({
      from: transfer.fromUserAccount,
      to: transfer.toUserAccount,
      amount: transfer.amount / 1e9, // Convert lamports to SOL
    });
  });

  return txDetails;
}

// Main function with pagination
async function findTokenBuys() {
  console.log(chalk.blue("Fetching wallet transactions..."));
  console.log(
    chalk.cyanBright(`Token creation timestamp: ${tokenCreationTimestamp} (${tokenCreationDate})`)
  );
  let before = null;
  let hasMore = true;
  let allTokenBuys = [];

  while (hasMore) {
    const transactions = await getWalletTransactions(walletAddress, before);

    if (transactions.length === 0) {
      hasMore = false;
      break;
    }

    console.log(chalk.yellow("Filtering for token buys..."));
    for (const tx of transactions) {
      const txTimestampMs = tx.timestamp * 1000; // Convert to milliseconds
      const comparison = txTimestampMs >= tokenCreationTimestamp ? chalk.green("✔") : chalk.red("✘");
      console.log(
        `${chalk.magenta("TxID:")} ${tx.signature} | ${chalk.blue("TxTS:")} ${new Date(
          txTimestampMs
        ).toISOString()} | ${chalk.green("CreationTS:")} ${new Date(
          tokenCreationTimestamp
        ).toISOString()} ${comparison}`
      );

      if (txTimestampMs < tokenCreationTimestamp) {
        console.log(chalk.red("Transaction is before the token creation timestamp. Stopping."));
        hasMore = false;
        break;
      }

      const tokenBuys = filterTokenBuys([tx], walletAddress, targetMintAddress);
      if (tokenBuys.length > 0) {
        tokenBuys.forEach((buyTx) => {
          const details = extractBuyDetails(buyTx);
          console.log(chalk.green(`🔍 Found token buy: ${JSON.stringify(details, null, 2)}`));
          allTokenBuys.push(details);
        });
      }
    }

    console.log(chalk.greenBright(`Total token buys found so far: ${allTokenBuys.length}`));

    // Update the `before` parameter for pagination
    if (hasMore) {
      before = transactions[transactions.length - 1]?.signature;
      console.log(chalk.blue(`Updated 'before' parameter for pagination: ${before}`));
    }
  }

  console.log(chalk.greenBright(`✅ Found ${allTokenBuys.length} total token buys.`));

  // Save to JSON file
  const outputFile = "token_buys.json";
  fs.writeFileSync(outputFile, JSON.stringify(allTokenBuys, null, 2));
  console.log(chalk.blueBright(`💾 Token buys saved to ${outputFile}`));
}

// Execute
findTokenBuys();