
import { useTranslations } from "next-intl";
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
  const t = useTranslations("modules");
  if (channels.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
         {t("no_registered_channels_in_the_queried_range")} <code>/ibc/core/channel/v1/channels</code>)
      </Typography>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined" role="region" aria-label={t("scroll_ibc_channels_horizontally")} tabIndex={0}>
      <Table size="small" sx={{ minWidth: 720 }}>
        <TableHead>
          <TableRow>
            <TableCell>{t("local_port")}</TableCell>
            <TableCell>{t("local_channel_id")}</TableCell>
            <TableCell>{t("status_2")}</TableCell>
            <TableCell>{t("ordering")}</TableCell>
            <TableCell>{t("version")}</TableCell>
            <TableCell>{t("connection_hops")}</TableCell>
            <TableCell>{t("counterparty_port")}</TableCell>
            <TableCell>{t("counterparty_channel_id")}</TableCell>
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
