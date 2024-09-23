import * as fs from 'fs'

export function readContractInfo(network: string) {
    return JSON.parse(fs.readFileSync(`./scripts/contracts/${network}.json`).toString())
}

export function writeContractInfo(network: string, contractInfo: any) {
    return fs.writeFileSync(`./scripts/contracts/${network}.json`, JSON.stringify(contractInfo))
}