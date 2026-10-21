"use client";

import { usePagedQuery } from "@/hooks/use-paged-query";
import { PageControls } from "@/components/query/page-controls";
import { QueryStatus } from "@/components/query/query-status";

import { Card, CardContent, Stack, Typography } from "@mui/material";
import { ActionConfirmModal } from "@/components/staking/action-confirm-modal";
import { IbcChannelsPanel } from "@/components/operations/ibc-channels-panel";
import { getIbcChannelsPage } from "@/services/guru/ibc-channels.service";

export default function OperationsPage() {
  const query = usePagedQuery("ibc-channels", (client, cursor) => getIbcChannelsPage(client, cursor), row => `${row.portId}:${row.channelId}`);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={700}>
        IBC Channels / CCMs
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 720 }}>
        이 메뉴는 <strong>체인 운영·연동(Operations)</strong>과 관련된 정보를 모아 둔 영역입니다. 지금은{" "}
        <strong>IBC(Inter-Blockchain Communication) 채널</strong> 목록을 LCD에서 불러와 표시합니다. 거버넌스·스테이킹
        실행은 각각 <strong>Governance</strong>, <strong>Staking</strong> 메뉴에서 다룹니다.
      </Typography>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
            IBC 채널
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
            각 행은 로컬 체인 쪽 포트·채널, 핸드셰이크 상태, 순서(ordered/unordered), 채널 버전(예: ics20-1), 이 채널이
            사용하는 connection ID 목록(connection_hops), 상대 체인 쪽 포트·채널 ID를 나타냅니다. 상대 &quot;체인
            ID&quot; 자체는 채널 API에 직접 포함되지 않고, connection·client 조회로 이어지는 식별자입니다.
          </Typography>
          <QueryStatus {...query} />
          <PageControls {...query} />
          {query.result.data && <IbcChannelsPanel channels={query.result.data} />}
        </CardContent>
      </Card>

      <ActionConfirmModal
        summary="체인 서명이 필요한 작업 전에는 지갑에서 내용을 다시 확인하세요."
        warning="서명 후 되돌릴 수 없습니다."
      />
    </Stack>
  );
}
