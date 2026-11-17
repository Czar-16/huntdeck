// Firefox's browser namespace provides Promise-based extension APIs.
export const extension = globalThis.browser ?? globalThis.chrome;
export const isFirefox = extension.runtime.getURL("").startsWith("moz-extension:");
