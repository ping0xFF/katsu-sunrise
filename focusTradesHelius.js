const axios = require('axios');
require('dotenv').config();

// Constants
const API_URL = "https://mainnet.helius-rpc.com/?api-key=7d5a30f3-f488-4a10-927f-c1def5037363";
const FOCUS_WALLET = "HUpPyLU8KWisCAr3mzWy2FKT6uuxQ2qGgJQxyTpDoes5"; // Focus wallet

async function fetchTokenAccounts() {
    try {
        console.log(`🔍 Fetching token accounts for wallet: ${FOCUS_WALLET}`);
        console.log(`Helius API URL: ${API_URL}`);

        const payload = {
            jsonrpc: "2.0",
            id: 1,
            method: "getTokenAccountsByOwner",
            params: [
                FOCUS_WALLET,
                {
                    programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" // SPL Token Program ID
                }
            ]
        };

        const response = await axios.post(API_URL, payload);
        const result = response.data;

        if (result.error) {
            console.error(`❌ API Error: ${result.error.message}`);
            return;
        }

        console.log("✅ Token Accounts Retrieved:", result.result);

        // Iterate over token accounts and fetch transactions for each
        const tokenAccounts = result.result.value;
        for (const account of tokenAccounts) {
            await fetchTokenTransactions(account.pubkey);
        }
    } catch (error) {
        console.error("❌ Error fetching token accounts:", error.message);
    }
}
fetchTokenAccounts();