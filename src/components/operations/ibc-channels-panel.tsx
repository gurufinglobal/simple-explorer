import {
  Box,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { IbcChannel } from "@/services/guru/ibc-channels.service";

function stateChipColor(
  state: string,
): "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning" {
  switch (state) {
    case "OPEN":
      return "success";
    case "TRYOPEN":
      return "warning";
    case "CLOSED":
      return "error";
    case "INIT":
      return "info";
    default:
      return "default";
  }
}

type Props = {
  channels: IbcChannel[];
};

export function IbcChannelsPanel({ channels }: Props) {
  if (channels.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        LCD에서 IBC 채널을 가져오지 못했거나, 등록된 채널이 없습니다. (
        <code>/ibc/core/channel/v1/channels</code>)
      </Typography>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" sx={{ minWidth: 720 }}>
        <TableHead>
          <TableRow>
            <TableCell>로컬 포트</TableCell>
            <TableCell>로컬 채널 ID</TableCell>
            <TableCell>상태</TableCell>
            <TableCell>순서</TableCell>
            <TableCell>버전</TableCell>
            <TableCell>연결 홉</TableCell>
            <TableCell>상대 포트</TableCell>
            <TableCell>상대 채널 ID</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {channels.map((ch) => (
            <TableRow key={`${ch.portId}-${ch.channelId}`}>
              <TableCell sx={{ fontFamily: "monospace" }}>{ch.portId}</TableCell>
              <TableCell sx={{ fontFamily: "monospace" }}>{ch.channelId}</TableCell>
              <TableCell>
                <Chip size="small" label={ch.state} color={stateChipColor(ch.state)} />
                {ch.stateRaw && ch.stateRaw !== ch.state ? (
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                    {ch.stateRaw}
                  </Typography>
                ) : null}
              </TableCell>
              <TableCell>{ch.ordering}</TableCell>
              <TableCell sx={{ fontFamily: "monospace", maxWidth: 140 }}>{ch.version}</TableCell>
              <TableCell sx={{ maxWidth: 200 }}>
                {ch.connectionHops.length > 0 ? (
                  <Box component="span" sx={{ fontFamily: "monospace", fontSize: "0.8rem", wordBreak: "break-all" }}>
                    {ch.connectionHops.join(" → ")}
                  </Box>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell sx={{ fontFamily: "monospace" }}>{ch.counterpartyPortId}</TableCell>
              <TableCell sx={{ fontFamily: "monospace" }}>{ch.counterpartyChannelId}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
