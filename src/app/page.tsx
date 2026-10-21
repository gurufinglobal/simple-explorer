import Link from "@/components/layout/chain-link";
import { Alert, Button, Container, Stack, Typography } from "@mui/material";

export default function Home() {
  return (
    <Container sx={{ py: 10 }}>
      <Stack spacing={6}>
        <Alert severity="warning" variant="filled" sx={{ fontWeight: 700 }}>
          This Repository is currently under active development. Some features and wording may change.
        </Alert>

        <Stack spacing={2}>
          <Typography variant="h3" fontWeight={800}>
            Gurufin Explorer
          </Typography>
          <Typography variant="h6" color="text.secondary">
            A Gurufin chain explorer for quickly checking blocks, transactions, governance, and staking data.
          </Typography>
        </Stack>

        <Stack spacing={2}>
          <Typography variant="h5" fontWeight={700}>
            Core Features
          </Typography>
          <Typography variant="body1">
            - View network status and key metrics at a glance from the dashboard
            <br />- Browse block/transaction/address data and detail pages
            <br />- Track on-chain governance flows including proposals, votes, and deposits
            <br />- Inspect validator and delegation data for staking
          </Typography>
        </Stack>

        <Stack spacing={2}>
          <Typography variant="h5" fontWeight={700}>
            Quick Start
          </Typography>
          <Typography
            component="pre"
            variant="body2"
            sx={{
              p: 2,
              borderRadius: 2,
              bgcolor: "grey.100",
              color: "grey.900",
              overflowX: "auto",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            }}
          >
            {`# 1) Review the core explorer flow
/dashboard -> /blocks -> /transactions -> /tx/[hash]

# 2) Extend data logic in the services layer
import { getLatestBlocks } from "@/services/guru/blocks.service";
import { getRecentTransactions } from "@/services/guru/transactions.service";

const blocks = await getLatestBlocks(10);
const txs = await getRecentTransactions(30);

# 3) Add new screens with app routes + explorer components
src/app/<new-page>/page.tsx
-> src/components/explorer/<new-component>.tsx`}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This project separates explorer UI from chain query logic, so you can rapidly extend features by adding
            service functions and wiring them into pages/components.
          </Typography>
        </Stack>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <Button component={Link} href="/dashboard" variant="contained" size="large">
            Open Dashboard
          </Button>
          <Button component={Link} href="/blocks" variant="outlined" size="large">
            Start Block Exploration
          </Button>
        </Stack>
      </Stack>
    </Container>
  );
}
