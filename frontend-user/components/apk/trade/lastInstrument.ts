// Port of apk charts/store/lastInstrument.store.ts — the last instrument the
// user charted or opened an order ticket on, so the param-less "Trade" tab
// (/terminal) restores it. In-memory like the app: a reload starts fresh.
let lastToken: string | null = null;

export const getLastInstrument = () => lastToken;
export const setLastInstrument = (token: string) => {
  lastToken = token;
};
