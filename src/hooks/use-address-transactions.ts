"use client";
import { useRef } from "react";
import { usePagedQuery } from './use-paged-query';
import { getAddressTransactionsPage, mergeAddressTransactions } from '@/services/guru/transactions.service';

export function useAddressTransactions(address: string) {
  // Both streams share the receipt invalidation target, but own their cursors and retry independently.
  const target = `address-transactions:${address}`;
  const sender = usePagedQuery(target, (client, cursor) => getAddressTransactionsPage(address, 'sender', client, cursor), row => row.hash.toUpperCase());
  const recipient = usePagedQuery(target, (client, cursor) => getAddressTransactionsPage(address, 'recipient', client, cursor), row => row.hash.toUpperCase());
  const streams = [sender, recipient];
  const rows = mergeAddressTransactions(sender.result.data ?? [], recipient.result.data ?? []);
  const partial = streams.some(stream => stream.result.error || stream.stopReason);
  const loading = streams.some(stream => stream.busy && !stream.result.data);
  // A stream's last block can continue on its next page. Keep this block and all
  // lower rows buffered until both streams have passed it, including same-height hashes.
  const frontiers = streams.flatMap(stream => {
    const last = stream.result.data?.at(-1);
    return stream.hasMore && last ? [BigInt(last.height)] : [];
  });
  const frontier = frontiers.reduce<bigint | null>((max, height) => max === null || height > max ? height : max, null);
  // Once a failed sibling exposes partial rows, keep those rows visible during
  // recovery. Continue labelling the range partial until both cursors are drained.
  const contextKey = `${sender.result.context.chain}:${address}`;
  const exposedPartial = useRef({ key: contextKey, value: false });
  if (exposedPartial.current.key !== contextKey) exposedPartial.current = { key: contextKey, value: false };
  if (partial) exposedPartial.current.value = true;
  const partialRange = partial || (exposedPartial.current.value && streams.some(stream => stream.hasMore));
  const missingCandidate = streams.some(stream => stream.hasMore && !stream.result.data?.length);
  const visible = loading ? [] : partialRange ? rows : missingCandidate ? [] : frontier === null ? rows : rows.filter(row => BigInt(row.height) > frontier);
  return { sender, recipient, rows: visible, buffered: rows.length - visible.length, partial: partialRange, loading };
}
