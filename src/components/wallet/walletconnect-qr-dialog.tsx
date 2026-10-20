"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { QRCodeSVG } from "qrcode.react";

type WalletConnectQrDialogProps = {
  open: boolean;
  uri: string | null;
  title?: string;
  error?: string | null;
  onClose: () => void;
};

/**
 * Displays WalletConnect pairing URI as a QR code and copy/deep-link helpers.
 */
export function WalletConnectQrDialog({
  open,
  uri,
  title = "WalletConnect",
  error,
  onClose,
}: WalletConnectQrDialogProps) {
  const universalLink = uri
    ? `https://walletconnect.com/wc?uri=${encodeURIComponent(uri)}`
    : null;

  async function copyUri() {
    if (!uri) return;
    try {
      await navigator.clipboard.writeText(uri);
    } catch {
      // Clipboard may be unavailable; ignore.
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} alignItems="center">
          <Typography variant="body2" color="text.secondary" textAlign="center">
            Scan with a WalletConnect-compatible wallet, or open the link on mobile.
          </Typography>
          {uri ? (
            <QRCodeSVG value={uri} size={220} level="M" includeMargin />
          ) : (
            <Typography variant="body2">Preparing pairing…</Typography>
          )}
          {error ? (
            <Typography variant="body2" color="error" textAlign="center">
              {error}
            </Typography>
          ) : null}
          <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center">
            <Button onClick={onClose}>Cancel connection</Button>
            <Button variant="outlined" onClick={() => void copyUri()} disabled={!uri}>
              Copy URI
            </Button>
            {universalLink ? (
              <Button component="a" href={universalLink} target="_blank" rel="noreferrer" variant="contained">
                Open wallet
              </Button>
            ) : null}
          </Stack>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
