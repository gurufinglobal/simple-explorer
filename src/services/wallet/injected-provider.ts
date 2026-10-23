"use client";
import { ServiceError, serviceText } from "@/i18n/service-message";
import { useWalletSessionStore as store } from "@/stores/wallet-session.store";

export type InjectedProvider = NonNullable<Window["ethereum"]>;
export type ProviderChoice = { id: string; name: string; provider: InjectedProvider };
/** Announced metadata is self-reported, not an identity attestation. Never render its icon. */
export function discoverMetaMask(onChange: (choices: ProviderChoice[]) => void): () => void {
  const choices = new Map<string, ProviderChoice>();
  const publish = () => {
    const announced = [...choices.values()];
    if (announced.length) { onChange(announced); return; }
    const injected = window.ethereum;
    const candidates = injected?.providers ?? (injected ? [injected] : []);
    onChange(candidates.filter(p => p.isMetaMask === true && !p.isBraveWallet && !p.isCoinbaseWallet && typeof p.request === "function")
      .map((provider, i) => ({ id: `legacy-${i}`, name: "MetaMask (legacy)", provider })));
  };
  const announce = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (detail?.info?.rdns !== "io.metamask" || typeof detail.info.uuid !== "string" ||
      typeof detail.info.name !== "string" || typeof detail.provider?.request !== "function") return;
    if (!choices.has(detail.info.uuid)) choices.set(detail.info.uuid, { id: detail.info.uuid, name: detail.info.name, provider: detail.provider });
    publish();
  };
  window.addEventListener("eip6963:announceProvider", announce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  publish();
  return () => window.removeEventListener("eip6963:announceProvider", announce);
}
let selected: InjectedProvider | undefined;
let detach: (() => void) | undefined;
store.subscribe(state => {
  if (selected && (state.status !== "connected" || state.walletType !== "metamask")) {
    detach?.(); detach = undefined; selected = undefined;
  }
});
export function bindInjectedProvider(provider: InjectedProvider) {
  detach?.(); selected = provider;
  const invalidate = () => {
    if (store.getState().walletType === "metamask") store.getState().setError(serviceText("chain_account_or_session_changed_reconnect_your_wallet"));
  };
  for (const event of ["accountsChanged", "chainChanged", "disconnect"]) provider.on?.(event, invalidate);
  detach = () => { for (const event of ["accountsChanged", "chainChanged", "disconnect"]) provider.removeListener?.(event, invalidate); };
}
export function getSelectedInjectedProvider(): InjectedProvider {
  if (!selected) throw new ServiceError("evm_select_provider");
  return selected;
}
