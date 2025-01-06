const { Connection } = require('@solana/web3.js');
require('dotenv').config();

// Initialize Connection
const ALCHEMY_API_URL = process.env.ALCHEMY_API_URL;
const connection = new Connection(ALCHEMY_API_URL, 'finalized');

async function fetchSingleTransaction() {
  const signature = '4Dr5S2y98t6zkE8UXVvqZWw5dkWTe6jBA9gZipWEAYgZErDRSdZhoHynaG1Tr6fWakXYZzPdgL8jgv7zK6Uzghae';

  try {
    const tx = await connection.getTransaction(signature, {
      commitment: 'finalized',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      console.error('Transaction not found or RPC returned null');
      return;
    }

    console.log(JSON.stringify(tx, null, 2));
  } catch (error) {
    console.error('Error fetching transaction:', error.message);
  }
}

fetchSingleTransaction();