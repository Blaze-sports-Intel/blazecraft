/**
 * @typedef {object} AgentBridge
 * @property {() => Promise<void>} connect
 * @property {() => void} disconnect
 * @property {(workerIds: string[], region: import('./map.js').MapRegion) => void} manualAssign
 */
export {};
