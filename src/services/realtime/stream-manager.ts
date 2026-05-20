export type StreamHealthSnapshot = {
  wsConnected: boolean;
  fallbackPolling: boolean;
  reconnectAttempts: number;
  lastEventAt: string;
};

let snapshot: StreamHealthSnapshot = {
  wsConnected: true,
  fallbackPolling: false,
  reconnectAttempts: 0,
  lastEventAt: new Date().toISOString(),
};

export function markWsDisconnected(): StreamHealthSnapshot {
  snapshot = {
    ...snapshot,
    wsConnected: false,
    fallbackPolling: true,
    reconnectAttempts: snapshot.reconnectAttempts + 1,
    lastEventAt: new Date().toISOString(),
  };
  return snapshot;
}

export function markWsConnected(): StreamHealthSnapshot {
  snapshot = {
    ...snapshot,
    wsConnected: true,
    fallbackPolling: false,
    lastEventAt: new Date().toISOString(),
  };
  return snapshot;
}

export function getStreamSnapshot(): StreamHealthSnapshot {
  return snapshot;
}
