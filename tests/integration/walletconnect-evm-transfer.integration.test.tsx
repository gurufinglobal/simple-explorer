// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SessionTypes } from "@walletconnect/types";
import { cleanup, fireEvent, render, screen, waitFor, within } from "../helpers/render";
import { evmChain, from, hash, receipt, setupEvm, to, token } from "../helpers/evm";
import { connectQr } from "@/services/wallet/wallet-lifecycle";
import { resetWalletConnectClientForTests } from "@/services/wallet/walletconnect-client";
import { prepareEvmTransfer, submitEvmTransfer, useEvmResults } from "@/services/evm/transfer";
import { useWalletSessionStore as wallet } from "@/stores/wallet-session.store";
import { SendForm } from "@/components/transactions/send-form";
const sdk = vi.hoisted(() => ({ connect: vi.fn(), request: vi.fn(), disconnect: vi.fn(), get: vi.fn() }));
vi.mock("@walletconnect/sign-client", () => ({ default: { init: async () => ({ ...sdk, session: { get: sdk.get } }) } }));
let env: ReturnType<typeof setupEvm>;
let session: SessionTypes.Struct;
beforeEach(async () => {
  vi.clearAllMocks(); env = setupEvm(); resetWalletConnectClientForTests(); wallet.getState().disconnect();
  vi.stubEnv("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID", "synthetic-project");
  session = { topic: "evm-test-topic", expiry: Math.floor(Date.now() / 1000) + 600, namespaces: {
    eip155: { accounts: [`eip155:631:${from}`], methods: ["eth_sendTransaction"], events: ["accountsChanged", "chainChanged"] },
  } } as unknown as SessionTypes.Struct;
  sdk.get.mockImplementation(() => session); sdk.connect.mockResolvedValue({ approval: async () => session }); sdk.request.mockResolvedValue(hash);
  await connectQr(() => {}, "evm");
});
afterEach(() => { cleanup(); wallet.getState().disconnect(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it.each([undefined, token])("sends %s through the approved WC topic and keeps the original hash after a session change", async contract => {
  env.state.receipt = { ...receipt(), to: contract ?? to };
  const snapshot = await prepareEvmTransfer({ recipient: to, amount: "1", token: contract });
  sdk.request.mockImplementation(async () => { wallet.getState().disconnect(); return hash; });
  await submitEvmTransfer(snapshot);
  await waitFor(() => expect(useEvmResults.getState().results[0]?.status).toBe("success"));
  expect(sdk.request).toHaveBeenCalledTimes(1);
  expect(sdk.request).toHaveBeenCalledWith({ topic: "evm-test-topic", chainId: "eip155:631", request: { method: "eth_sendTransaction", params: [snapshot.transaction] } });
  expect(useEvmResults.getState().results[0].snapshot.chain).toEqual(evmChain);
});
it("rejects revoked methods after confirmation preparation without dispatching", async () => {
  const snapshot = await prepareEvmTransfer({ recipient: to, amount: "1" });
  session.namespaces.eip155.methods = [];
  await expect(submitEvmTransfer(snapshot)).rejects.toThrow(); expect(sdk.request).not.toHaveBeenCalled();
});
it("renders the ERC20 user-address flow and sends its reviewed token transaction", async () => {
  render(<SendForm />, { locale: "en" });
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "Asset" }));
  fireEvent.click(await screen.findByRole("option", { name: "ERC20 (user supplied address)" }));
  fireEvent.change(screen.getByLabelText("ERC20 contract address"), { target: { value: token } });
  fireEvent.change(screen.getByLabelText("Recipient EVM address"), { target: { value: to } });
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "1.000001" } });
  fireEvent.click(screen.getByRole("button", { name: "Review transfer" }));
  const dialog = await screen.findByRole("dialog"); expect(within(dialog).getByText(new RegExp(token))).toBeTruthy();
  expect(within(dialog).getByText(/1.000001 TOK/)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirm and request wallet" }));
  await waitFor(() => expect(sdk.request).toHaveBeenCalledTimes(1));
  expect(sdk.request.mock.calls[0][0].request.params[0]).toMatchObject({ to: token, value: "0x0" });
  await waitFor(() => expect(useEvmResults.getState().busy).toBe(false));
});
