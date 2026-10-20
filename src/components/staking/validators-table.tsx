"use client";

import { CoinAmount } from "@/components/amount/coin-amount";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { ValidatorSummary } from "@/services/guru/staking.service";

type ValidatorsTableProps = {
  validators: ValidatorSummary[];
};

function parseUnsignedBigInt(value: string): bigint | null {
  if (!/^[0-9]+$/.test(value)) {
    return null;
  }

  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function formatCommissionPercent(rate: string): string {
  const parsed = Number(rate);
  if (Number.isNaN(parsed)) {
    return "-";
  }

  return `${(parsed * 100).toFixed(2)}%`;
}

function formatVotingPowerShare(votingPower: string, totalVotingPower: bigint): string {
  const power = parseUnsignedBigInt(votingPower);
  const zero = BigInt(0);
  const two = BigInt(2);
  const tenThousand = BigInt(10000);
  if (!power || totalVotingPower <= zero) {
    return "0.00%";
  }

  const basisPoints = (power * tenThousand + totalVotingPower / two) / totalVotingPower;
  return `${(Number(basisPoints) / 100).toFixed(2)}%`;
}

export function ValidatorsTable({ validators }: ValidatorsTableProps) {
  const router = useRouter();

  if (validators.length === 0) {
    return <Typography variant="body2">검증자 데이터를 불러오지 못했습니다.</Typography>;
  }

  const totalVotingPower = validators.reduce((sum, validator) => {
    const value = parseUnsignedBigInt(validator.votingPower);
    if (!value) {
      return sum;
    }
    return sum + value;
  }, BigInt(0));

  return (
    <Card variant="outlined">
      <CardContent>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Moniker</TableCell>
              <TableCell>Operator</TableCell>
              <TableCell align="right">Voting Power</TableCell>
              <TableCell align="right">Commission</TableCell>
              <TableCell align="center">Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {validators.map((validator) => (
              <TableRow
                key={validator.operatorAddress}
                hover
                sx={{ cursor: "pointer" }}
                onClick={() => {
                  router.push(`/staking/${encodeURIComponent(validator.operatorAddress)}`);
                }}
              >
                <TableCell>
                  <Typography variant="body2" color="primary" sx={{ "&:hover": { textDecoration: "underline" } }}>
                    {validator.moniker}
                  </Typography>
                </TableCell>
                <TableCell>{validator.operatorAddress}</TableCell>
                <TableCell align="right">
                  <CoinAmount coin={{ amount: validator.votingPower, denom: validator.bondDenom ?? "bond denom 미확인" }} metadata={validator.metadata} /> (
                  {formatVotingPowerShare(validator.votingPower, totalVotingPower)})
                </TableCell>
                <TableCell align="right">{formatCommissionPercent(validator.commission)}</TableCell>
                <TableCell align="center">
                  <Chip
                    size="small"
                    label={validator.jailed ? "Jailed" : "Active"}
                    color={validator.jailed ? "warning" : "success"}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
