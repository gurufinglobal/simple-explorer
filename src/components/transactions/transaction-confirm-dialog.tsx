"use client";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import type { TransactionSnapshot } from "@/services/transactions/transaction";

export function TransactionConfirmDialog({ snapshot, onCancel, onConfirm }: {
  snapshot: TransactionSnapshot | null; onCancel: () => void; onConfirm: () => void;
}) {
  return <Dialog open={snapshot !== null} onClose={onCancel} fullWidth maxWidth="sm"
    aria-labelledby="transaction-confirm-title" aria-describedby="transaction-confirm-description">
    <DialogTitle id="transaction-confirm-title">거래 실행 전 확인</DialogTitle>
    {snapshot && <DialogContent sx={{ overflowWrap: "anywhere" }}>
      <Stack spacing={1.5} id="transaction-confirm-description">
        <Typography>행위: {snapshot.action}</Typography>
        <Typography>체인: {snapshot.chainKey} / {snapshot.chainId}</Typography>
        <Typography>서명 계정: {snapshot.sender}</Typography>
        <Typography>전체 수신 주소: {snapshot.recipient}</Typography>
        <Typography>표시 수량: {snapshot.displayAmount} {snapshot.unit}</Typography>
        <Typography>전송 원본: {snapshot.amount} {snapshot.denom}</Typography>
        <Typography>예상 수수료 (최소 단위): {snapshot.fee.amount.map(c => `${c.amount} ${c.denom}`).join(", ")}</Typography>
        <Typography>Gas 한도: {snapshot.fee.gas}</Typography>
        <Typography variant="body2">추정 근거: {snapshot.feeBasis}</Typography>
        <Alert severity="info">아직 지갑 서명을 요청하지 않았습니다. 지갑이 수수료를 변경할 수 있으며 실제 체인 수수료는 결과에서 다시 조회합니다.</Alert>
      </Stack>
    </DialogContent>}
    <DialogActions>
      <Button autoFocus onClick={onCancel}>취소</Button>
      <Button variant="contained" onClick={onConfirm}>확인하고 지갑 서명</Button>
    </DialogActions>
  </Dialog>;
}
