
import { LedgerSigner } from "@anders-t/ethers-ledger";
import Safe from "@gnosis.pm/safe-core-sdk";
import { SafeTransaction, SafeTransactionDataPartial } from "@gnosis.pm/safe-core-sdk-types";
import { readContractInfo, writeContractInfo } from "./contractsInfo";
import EthersAdapter from '@gnosis.pm/safe-ethers-lib'
const axios = require('axios').default;

export class GnosisMultisig {


    static async sendTransactionWithLedger(hre: any, tx: any): Promise<void> {

        let contractsInfo = readContractInfo(hre.network.name)
        const chainId = hre.network.config.chainId
        const safeAddress = contractsInfo['NeyenTreasury']

        if(!contractsInfo['NeyenTreasury']) {
            console.log("Treasury address not found")
            return
        }

        const safeOwner = new LedgerSigner(hre.ethers.provider);
        const ethAdapter = new EthersAdapter({
            ethers: hre.ethers,
            signer: safeOwner
        })

        const safeSdk: Safe = await Safe.create({ ethAdapter, safeAddress })

        console.log("Building transaction")
        if(!tx.value) {
            tx.value = 0
        }
        const transaction: SafeTransactionDataPartial = {
            to: <string>tx.to,
            value: tx.value.toString(),
            data: <string>tx.data,
        }
        const safeTransaction = await safeSdk.createTransaction(transaction)

        console.log("Send transaction to Ledger for transaction signing")
        await safeSdk.signTransaction(safeTransaction)

        const safeTxHash = await safeSdk.getTransactionHash(safeTransaction)
        const sender = await safeOwner.getAddress()
        const payload = {
            ...safeTransaction.data,
            baseGas: safeTransaction.data.baseGas.toString(),
            gasPrice: safeTransaction.data.gasPrice.toString(),
            nonce: safeTransaction.data.nonce.toString(),
            safeTxGas: safeTransaction.data.safeTxGas.toString(),
            signature: safeTransaction.encodedSignatures(),
            sender,
            safeTxHash
        }

        payload.baseGas = payload.baseGas.toString()
        
        console.log("Send transaction to Gnosis Safe API")
        await axios.post(`https://safe-client.gnosis.io/v1/chains/${chainId}/transactions/${safeAddress}/propose`, payload)
    }
}
