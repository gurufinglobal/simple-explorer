"use client";

import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import { Chip, Divider, IconButton, ListItemText, Menu, MenuItem, Stack } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { connectWallet } from "@/services/wallet/wallet-connector";
import {
  connectWalletConnectPairing,
  disconnectWalletConnectByTopic,
  getActiveWalletConnectSession,
  getOrCreateSignClient,
  getWalletConnectProjectId,
} from "@/services/wallet/walletconnect-client";
import { normalizeWalletConnectSession } from "@/services/wallet/walletconnect-session";
import { useWalletSessionStore } from "@/stores/wallet-session.store";
import { WalletConnectQrDialog } from "@/components/wallet/walletconnect-qr-dialog";

/**
 * Top-right wallet icon menu: WalletConnect, Keplr, MetaMask, disconnect.
 */
export function HeaderWalletMenu() {
  const {
    status,
    bech32Address,
    evmAddress,
    startConnecting,
    connect,
    applyWalletConnectNormalized,
    disconnect,
    setError,
  } = useWalletSessionStore();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const [wcDialogOpen, setWcDialogOpen] = useState(false);
  const [wcUri, setWcUri] = useState<string | null>(null);
  const [wcError, setWcError] = useState<string | null>(null);
  const wcAbortRef = useRef<AbortController | null>(null);

  const shortAddress = bech32Address ?? evmAddress;
  const displayHint =
    shortAddress && shortAddress.length > 12
      ? `${shortAddress.slice(0, 6)}…${shortAddress.slice(-4)}`
      : shortAddress ?? null;

  const chipLabel =
    status === "connected" && displayHint
      ? displayHint
      : status === "connecting"
        ? "Connecting"
        : status === "error"
          ? "Error"
          : "Disconnected";

  const chipColor =
    status === "connected" ? "success" : status === "connecting" ? "warning" : status === "error" ? "error" : "default";

  useEffect(() => {
    let cancelled = false;
    let detach: (() => void) | undefined;

    void (async () => {
      if (typeof window === "undefined" || !getWalletConnectProjectId()) return;
      try {
        const client = await getOrCreateSignClient();
        if (cancelled) return;

        const onSessionDelete = (args: { topic: string }) => {
          const topic = useWalletSessionStore.getState().sessionTopic;
          if (topic && topic === args.topic) {
            useWalletSessionStore.getState().disconnect();
          }
        };

        const onSessionUpdate = async (args: { topic: string }) => {
          const state = useWalletSessionStore.getState();
          if (!state.sessionTopic || state.sessionTopic !== args.topic) return;
          const session = await getActiveWalletConnectSession(args.topic);
          if (session) {
            state.applyWalletConnectNormalized(normalizeWalletConnectSession(session));
          }
        };

        client.on("session_delete", onSessionDelete);
        client.on("session_update", onSessionUpdate);
        detach = () => {
          client.off("session_delete", onSessionDelete);
          client.off("session_update", onSessionUpdate);
        };
      } catch {
        // Missing project id or browser-only constraints.
      }
    })();

    return () => {
      cancelled = true;
      detach?.();
    };
  }, []);

  const handleCloseMenu = () => {
    setAnchorEl(null);
  };

  const handleDisconnect = useCallback(async () => {
    handleCloseMenu();
    const topic = useWalletSessionStore.getState().sessionTopic;
    const wt = useWalletSessionStore.getState().walletType;
    if (wt === "walletconnect" && topic) {
      try {
        await disconnectWalletConnectByTopic(topic);
      } catch {
        // Still clear local session if relay disconnect fails.
      }
    }
    disconnect();
  }, [disconnect]);

  const runWalletConnect = useCallback(async () => {
    handleCloseMenu();
    const projectId = getWalletConnectProjectId();
    if (!projectId) {
      setError("WalletConnect Project ID가 설정되지 않았습니다. NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID를 확인하세요.");
      return;
    }

    wcAbortRef.current?.abort();
    const controller = new AbortController();
    wcAbortRef.current = controller;

    setWcError(null);
    setWcUri(null);
    setWcDialogOpen(true);
    startConnecting();

    try {
      const { uri, approval } = await connectWalletConnectPairing();
      if (controller.signal.aborted) return;
      setWcUri(uri ?? null);

      const session = await approval();
      if (controller.signal.aborted) return;

      const normalized = normalizeWalletConnectSession(session);
      applyWalletConnectNormalized(normalized);
      setWcDialogOpen(false);
      setWcUri(null);
    } catch (e) {
      if (controller.signal.aborted) return;
      const message = e instanceof Error ? e.message : "WalletConnect 연결에 실패했습니다.";
      setWcError(message);
      setError(message);
    }
  }, [applyWalletConnectNormalized, setError, startConnecting]);

  const onPickKeplr = async () => {
    handleCloseMenu();
    startConnecting();
    try {
      const result = await connectWallet("keplr");
      connect(result.walletType, result.bech32Address, result.evmAddress, {
        sessionTopic: result.sessionTopic,
        connectedChains: result.connectedChains,
      });
    } catch {
      setError("Keplr 연결에 실패했습니다.");
    }
  };

  const onPickMetamask = async () => {
    handleCloseMenu();
    startConnecting();
    try {
      const result = await connectWallet("metamask");
      connect(result.walletType, result.bech32Address, result.evmAddress, {
        sessionTopic: result.sessionTopic,
        connectedChains: result.connectedChains,
      });
    } catch {
      setError("MetaMask 연결에 실패했습니다.");
    }
  };

  return (
    <>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Chip size="small" label={chipLabel} color={chipColor} variant={status === "connected" ? "filled" : "outlined"} />
        <IconButton
          color="inherit"
          aria-label="wallet menu"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          edge="end"
        >
          <AccountBalanceWalletOutlinedIcon />
        </IconButton>
      </Stack>
      <Menu anchorEl={anchorEl} open={open} onClose={handleCloseMenu} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        <MenuItem
          onClick={() => {
            void runWalletConnect();
          }}
        >
          <ListItemText primary="WalletConnect" secondary="QR / mobile wallet" />
        </MenuItem>
        <MenuItem onClick={() => void onPickKeplr()}>
          <ListItemText primary="Keplr" />
        </MenuItem>
        <MenuItem onClick={() => void onPickMetamask()}>
          <ListItemText primary="MetaMask" />
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => void handleDisconnect()} disabled={status === "disconnected"}>
          <ListItemText primary="Disconnect" />
        </MenuItem>
      </Menu>

      <WalletConnectQrDialog
        open={wcDialogOpen}
        uri={wcUri}
        error={wcError}
        onClose={() => {
          wcAbortRef.current?.abort();
          setWcDialogOpen(false);
          setWcUri(null);
          setWcError(null);
          if (useWalletSessionStore.getState().status === "connecting") {
            useWalletSessionStore.getState().disconnect();
          }
        }}
      />
    </>
  );
}
