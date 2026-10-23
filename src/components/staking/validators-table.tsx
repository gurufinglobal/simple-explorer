"use client";
import { useTranslations } from "next-intl";

import Link from "@/components/layout/chain-link";

import { CoinAmount } from "@/components/amount/coin-amount";
import {
  Card,
  CardContent,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableContainer,
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
  const t = useTranslations("staking");
  if (validators.length === 0) {
    return <Typography variant="body2">{t("no_validators_in_the_queried_range")}</Typography>;
  }

  const comparable = validators.every(v => parseUnsignedBigInt(v.votingPower) !== null && v.bondDenom && v.bondDenom === validators[0].bondDenom);
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
        <Typography variant="body2">{t("ratios_are_shares_within_the_current_list_not_the")}</Typography>
        <TableContainer role="region" aria-label={t("scroll_validators_horizontally")} tabIndex={0}>
          <Table size="small" sx={{ minWidth: 720 }}>
            <TableHead>
              <TableRow>
                <TableCell>{t("moniker_2")}</TableCell>
                <TableCell>{t("operator")}</TableCell>
                <TableCell align="right">{t("voting_power_2")}</TableCell>
                <TableCell align="right">{t("commission")}</TableCell>
                <TableCell align="center">{t("status_2")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {validators.map((validator) => (
                <TableRow key={validator.operatorAddress} hover>
                  <TableCell>
                    <Typography component={Link} href={`/staking/${encodeURIComponent(validator.operatorAddress)}`} variant="body2" color="primary" sx={{ "&:hover": { textDecoration: "underline" } }}>
                      {validator.moniker || validator.operatorAddress}
                    </Typography>
                  </TableCell>
                  <TableCell>{validator.operatorAddress}</TableCell>
                  <TableCell align="right">
                    <CoinAmount coin={{ amount: validator.votingPower, denom: validator.bondDenom ?? t("bond_denom_unknown") }} metadata={validator.metadata} /> (
                    {comparable && totalVotingPower > BigInt(0) ? formatVotingPowerShare(validator.votingPower, totalVotingPower) : t("share_unknown")})
                  </TableCell>
                  <TableCell align="right">{formatCommissionPercent(validator.commission)}</TableCell>
                  <TableCell align="center">
                    <Chip
                      size="small"
                      label={validator.jailed ? t("jailed") : t("active")}
                      color={validator.jailed ? "warning" : "success"}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
}
