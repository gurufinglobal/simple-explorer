"use client";
import { useTranslations } from "next-intl";


import { usePagedQuery } from "@/hooks/use-paged-query";
import { PageControls } from "@/components/query/page-controls";
import { QueryStatus } from "@/components/query/query-status";

import { Card, CardContent, Stack, Typography } from "@mui/material";
import { IbcChannelsPanel } from "@/components/operations/ibc-channels-panel";
import { getIbcChannelsPage } from "@/services/guru/ibc-channels.service";

export default function OperationsPage() {
  const t = useTranslations("modules");
  const query = usePagedQuery("ibc-channels", (client, cursor) => getIbcChannelsPage(client, cursor), row => `${row.portId}:${row.channelId}`);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={700}>
         {t("ibc_channels")} </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 720 }}>
         {t("view_ibc_inter_blockchain_communication_channels_on_the_selected")} </Typography>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
             {t("ibc_channels_2")} </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
             {t("each_row_shows_the_local_port_and_channel_handshake")} </Typography>
          <QueryStatus {...query} />
          <PageControls {...query} />
          {query.result.data && <IbcChannelsPanel channels={query.result.data} />}
        </CardContent>
      </Card>


    </Stack>
  );
}
