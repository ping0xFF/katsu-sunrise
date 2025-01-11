const { Connection, PublicKey } = require("@solana/web3.js");
require("dotenv").config();

const RPC_ENDPOINT = process.env.ALCHEMY_API_URL;
const connection = new Connection(RPC_ENDPOINT, "confirmed");

// Token mint address (replace with the actual token mint address)
const tokenMintAddress = "9DHe3pycTuymFk4H4bbPoAJ4hQrr2kaLDF6J6aAKpump";

async function getTokenCreationDate(mintAddress) {
  try {
    console.log(`Fetching transactions for token mint: ${mintAddress}`);

    // Get all signatures for the token mint address
    const signatures = await connection.getSignaturesForAddress(
      new PublicKey(mintAddress),
      { limit: 1, before: null } // Fetch the most recent transactions, adjust pagination if needed
    );

    console.log("Fetched signatures:", JSON.stringify(signatures, null, 2));

    if (signatures.length === 0) {
      console.log("No transactions found for this token mint.");
      return null;
    }

    // Get the earliest transaction
    const earliestSignature = signatures[signatures.length - 1];
    console.log(`Found earliest signature: ${earliestSignature.signature}`);

    // Fetch full transaction details
    console.log(`Fetching details for signature: ${earliestSignature.signature}`);
    const transactionDetails = await connection.getTransaction(
      earliestSignature.signature
    );

    if (!transactionDetails) {
      console.log("Failed to fetch transaction details. This may indicate the RPC endpoint has limited historical data or the transaction has been pruned.");
      return null;
    }

    console.log("Transaction Details:", JSON.stringify(transactionDetails, null, 2));

    // Extract block time
    const blockTime = transactionDetails.blockTime;
    if (!blockTime) {
      console.log("No block time found in the transaction details.");
      return null;
    }

    const creationDate = new Date(blockTime * 1000);
    console.log(`Token creation date: ${creationDate.toISOString()}`);
    return creationDate;
  } catch (error) {
    console.error("Error fetching token creation date:", error);
    return null;
  }
}

// Execute
getTokenCreationDate(tokenMintAddress);