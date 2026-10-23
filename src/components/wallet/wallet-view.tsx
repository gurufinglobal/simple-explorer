"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogContent, DialogTitle, Grid, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import { QRCodeSVG } from "qrcode.react";
import { formatUnits } from "viem";
import Link from "@/components/layout/chain-link";
import { CopyValue } from "@/components/explorer/copy-value";
import { AddressTransactions } from "@/components/explorer/address-transactions";
import { CoinAmount } from "@/components/amount/coin-amount";
import { UnbondingDetails } from "@/components/amount/unbonding-details";
import { QueryInfo } from "@/components/query/query-info";
import { ServiceErrorText } from "@/components/query/service-error-text";
import { SendForm } from "@/components/transactions/send-form";
import { EvmContractForm, EvmHashLookup } from "@/components/transactions/evm-contract-tools";
import { EvmTransactionResults } from "@/components/transactions/evm-transfer-form";
import { SavedTransactions } from "@/components/transactions/transaction-result";
import { WalletConnectPanel } from "./wallet-connect-panel";
import { useQuery } from "@/hooks/use-query";
import { useServiceText } from "@/i18n/use-service-text";
import { getActiveChainConfig } from "@/lib/chain-selection";
import { getEffectiveCosmosAddress } from "@/lib/resolve-cosmos-address";
import { initialResult } from "@/lib/query-result";
import { writeBlockReason } from "@/services/wallet/chain-eligibility";
import { evmNetwork } from "@/services/evm/network";
import { readEvmAccount, useEvmResults, verifyEvmWriteCapability, type EvmAsset } from "@/services/evm/transfer";
import { useWalletSessionStore } from "@/stores/wallet-session.store";
import { useWalletPortfolioStore } from "@/stores/wallet-portfolio.store";

export function WalletView() {
  const t = useTranslations("walletPage");
  const wallet = useWalletSessionStore();
  const chain = getActiveChainConfig();
  return <Stack spacing={2} sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
    <Typography variant="h4" component="h1">{t("title")}</Typography>
    <Typography>{chain.name} · {chain.chainId ?? "—"} · EVM {chain.evmChainId ?? "—"}</Typography>
    <WalletConnectPanel compact />
    {wallet.status !== "connected" ? <>
      <Alert severity="info">{t("reconnect")}</Alert>
      <Button component={Link} href="/dashboard">{t("publicExplorer")}</Button>
    </> : <ConnectedWallet key={`${chain.key}:${wallet.generation}`} />}
  </Stack>;
}

function AssetAmount({ asset }: { asset: EvmAsset }) {
  const t = useTranslations("walletPage");
  return <Stack spacing={0.5}>
    <Typography>{formatUnits(asset.balance, asset.decimals)} {asset.symbol}</Typography>
    {asset.address && <Typography variant="caption">{asset.address}</Typography>}
    <details><summary>{t("raw")}</summary>{asset.balance.toString()} · {t("decimals", { count: asset.decimals })}</details>
  </Stack>;
}

function ConnectedWallet() {
  const t = useTranslations("walletPage");
  const st = useServiceText();
  const wallet = useWalletSessionStore();
  const chain = getActiveChainConfig();
  const sameChain = wallet.chainKey === chain.key;
  const cosmos = sameChain ? getEffectiveCosmosAddress(wallet, chain) : null;
  const evmAddress = sameChain ? wallet.evmAddress : null;
  const portfolio = useWalletPortfolioStore();
  const matches = cosmos && portfolio.result.context.chain === chain.key && portfolio.result.context.target === `portfolio:${cosmos}`;
  const cosmosResult = matches ? portfolio.result : initialResult({ chain: chain.key, target: `portfolio:${cosmos}` });
  const details = matches ? portfolio.details : undefined;
  let evmError: unknown;
  try { evmNetwork(chain); } catch (error) { evmError = error; }
  const evmEnabled = !!evmAddress && !evmError;
  const nativeTarget = `wallet:evm:${evmAddress}:native`;
  const native = useQuery(nativeTarget, client => readEvmAccount(client.chain, evmAddress!), undefined, evmEnabled);
  const capability = useQuery(`wallet:evm:${evmAddress}:capability:${wallet.generation}`, () => verifyEvmWriteCapability(), undefined,
    evmEnabled && (wallet.walletType === "metamask" || wallet.wcMode === "evm"));
  const evmReady = capability.result.status === "success" && capability.result.data === true;
  const cosmosReason = writeBlockReason(chain, wallet);
  const cosmosReady = !cosmosReason && wallet.writeStatus === "ready";
  const sendReady = wallet.walletType === "metamask" || wallet.wcMode === "evm" ? evmReady : cosmosReady && !!chain.sendFeePolicy;
  const [tab, setTab] = useState("assets");
  const [qr, setQr] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [token, setToken] = useState("");
  const tokenTarget = `wallet:evm:${evmAddress}:erc20:${token.toLowerCase()}`;
  const tokenQuery = useQuery(tokenTarget, client => readEvmAccount(client.chain, evmAddress!, token), undefined, evmEnabled && !!token);
  const results = useEvmResults(s => s.results);
  const successes = results.filter(r => r.snapshot.chain.key === chain.key && r.snapshot.from.toLowerCase() === evmAddress?.toLowerCase() && r.status === "success").map(r => r.id).sort().join(",");
  const previousSuccesses = useRef(successes);
  useEffect(() => {
    if (previousSuccesses.current !== successes) {
      previousSuccesses.current = successes;
      // Invalidation queues a fresh read even when a pre-inclusion read is in flight.
      window.dispatchEvent(new CustomEvent("explorer:queries-invalidated", {
        detail: { chain: chain.key, targets: [nativeTarget, tokenTarget] },
      }));
      if (cosmos) void useWalletPortfolioStore.getState().refresh(cosmos);
    }
  }, [successes, cosmos, chain.key, nativeTarget, tokenTarget]);
  const refreshCosmos = () => { if (cosmos) void portfolio.refresh(cosmos); };
  const addresses = [["Cosmos", cosmos], ["EVM", evmAddress]] as const;
  return <>
    <Card variant="outlined"><CardContent><Stack spacing={2}>
      <Typography variant="h6">{t("account")}: {wallet.walletType}{wallet.wcMode ? ` / ${wallet.wcMode}` : ""}</Typography>
      {!sameChain && <Alert severity="warning">{t("mismatch", { selected: chain.key, connected: wallet.chainKey ?? "—" })}</Alert>}
      {addresses.map(([namespace, address]) => address && <Stack key={namespace} spacing={0.5}>
        <Typography>{namespace}: {address}</Typography>
        <Stack direction="row" gap={1} flexWrap="wrap">
          <CopyValue label={t("copy", { namespace })} value={address} />
          <Button onClick={() => setQr(address)}>{t("qr", { namespace })}</Button>
          {namespace === "Cosmos" && <Button component={Link} href={`/address/${address}`}>{t("publicAddress")}</Button>}
        </Stack>
      </Stack>)}
      <Alert severity="info">{t("mapping")}</Alert>
      <Stack direction="row" gap={1} flexWrap="wrap">
        <Chip label={`Cosmos · ${t(cosmosReady ? "ready" : "readOnly")}`} color={cosmosReady ? "success" : "default"} />
        <Chip label={`EVM · ${t(evmReady ? "ready" : capability.busy ? "checking" : "readOnly")}`} color={evmReady ? "success" : "default"} />
      </Stack>
      {cosmos && cosmosReason && <Typography variant="body2">{st(cosmosReason)}</Typography>}
      {evmError != null && <Alert severity="info"><ServiceErrorText error={evmError} /></Alert>}
      {evmEnabled && <QueryInfo queries={[{ ...capability, label: t("capability") }]} notices={capability.result.error ? [t("recovery")] : []} />}
      <Stack direction="row" gap={1} flexWrap="wrap">
        <Button component={Link} href="/staking">{t("stakingLink")}</Button>
        <Button component={Link} href="/governance">{t("governanceLink")}</Button>
      </Stack>
    </Stack></CardContent></Card>
    {(cosmos || evmEnabled) && <QueryInfo queries={[
      ...(cosmos ? [{ result: cosmosResult, busy: portfolio.loading, refresh: refreshCosmos, label: t("cosmosAssets") }] : []),
      ...(evmEnabled ? [{ ...native, label: t("native") }] : []),
    ]} />}
    <Grid container spacing={2}>
      {(["balance", "staking", "reward", "unbonding"] as const).map(kind => <Grid key={kind} size={{ xs: 12, sm: 6, lg: 3 }}>
        <Card variant="outlined" sx={{ height: "100%" }}><CardContent>
          <Typography variant="subtitle2">{t(kind)}</Typography>
          <Typography>{matches ? st(portfolio[kind]) : kind === "balance" && native.result.data ? `EVM: ${formatUnits(native.result.data.native.balance, native.result.data.native.decimals)} ${native.result.data.native.symbol}` : "—"}</Typography>
          {kind === "balance" && cosmos && native.result.data && <Typography>EVM: {formatUnits(native.result.data.native.balance, native.result.data.native.decimals)} {native.result.data.native.symbol}</Typography>}
          {kind === "balance" && evmEnabled && <Typography variant="caption" display="block">EVM · {t("observed")}: {native.result.observedAt ?? "—"}</Typography>}
          <Typography variant="caption">{cosmos ? `Cosmos · ${t("observed")}: ${cosmosResult.observedAt ?? "—"}` : t("cosmosUnavailable")}</Typography>
        </CardContent></Card>
      </Grid>)}
    </Grid>
    <Tabs value={tab} onChange={(_, next: string) => setTab(next)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile aria-label={t("tabs")}>
      {(["assets", "activity", "send", "contract"] as const).map(value => <Tab key={value} id={`wallet-tab-${value}`} aria-controls={`wallet-panel-${value}`} value={value} label={t(value)} />)}
    </Tabs>
    <Box role="tabpanel" id={`wallet-panel-${tab}`} aria-labelledby={`wallet-tab-${tab}`} tabIndex={0} sx={{ minWidth: 0 }}>
      {tab === "assets" && <Stack spacing={2}>
        {cosmos ? <>
          <Typography variant="h6">{t("cosmosAssets")}</Typography>
          {details && (["balance", "staking", "reward"] as const).map(kind => <Stack key={kind} spacing={1}>
            <Typography variant="subtitle2">{t(kind)}</Typography>
            {details[kind]?.map((coin, index) => <CoinAmount key={`${coin.denom}:${index}`} coin={coin} metadata={details.metadata} />)}
          </Stack>)}
          {details?.unbonding && <UnbondingDetails snapshot={details.unbonding} metadata={details.metadata} duration={details.unbondingTime} />}
        </> : <Alert severity="info">{t("cosmosUnavailable")}</Alert>}
        {evmEnabled && <>
          <Typography variant="h6">{t("evmAssets")}</Typography>
          {token && <QueryInfo queries={[{ ...tokenQuery, label: "ERC20" }]} />}
          {native.result.data && <AssetAmount asset={native.result.data.native} />}
          <Typography variant="body2">{t("tokenNotice")}</Typography>
          <TextField label={t("tokenAddress")} value={tokenInput} onChange={e => setTokenInput(e.target.value.trim())} />
          <Button disabled={!tokenInput || tokenQuery.busy} onClick={() => { if (token === tokenInput) void tokenQuery.refresh(); else setToken(tokenInput); }}>{t("loadToken")}</Button>
          {tokenQuery.result.data?.token && <AssetAmount asset={tokenQuery.result.data.token} />}
        </>}
      </Stack>}
      {tab === "activity" && <Stack spacing={2}>
        {cosmos ? <AddressTransactions address={cosmos} /> : <Alert severity="info">{t("cosmosUnavailable")}</Alert>}
        <Typography>{t("activityScope")}</Typography>
        <EvmHashLookup />
      </Stack>}
      {tab === "send" && (sendReady ? <SendForm /> : <Alert severity="warning">{t("blocked")}</Alert>)}
      {tab === "contract" && <EvmContractForm writeEnabled={evmReady} />}
    </Box>
    <Box component="section" aria-label={t("results")}>
      <Typography variant="h6">{t("results")}</Typography>
      <Typography variant="body2">{t("resultScope")}</Typography>
      <EvmTransactionResults chainKey={chain.key} account={evmAddress ?? ""} />
      {cosmos && <SavedTransactions chainKey={chain.key} account={cosmos} />}
    </Box>
    <Dialog open={!!qr} onClose={() => setQr(null)} fullWidth maxWidth="xs">
      <DialogTitle>{t("addressQr")}</DialogTitle><DialogContent><Stack alignItems="center" spacing={2}>
        {qr && <QRCodeSVG value={qr} size={200} title={t("addressQr")} />}
        <Typography sx={{ overflowWrap: "anywhere", width: "100%" }}>{qr}</Typography>
        <Button onClick={() => setQr(null)}>{t("close")}</Button>
      </Stack></DialogContent>
    </Dialog>
  </>;
}
