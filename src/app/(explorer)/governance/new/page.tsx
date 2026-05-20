"use client";

import { useEffect, useState } from "react";
import { GovernanceNewProposalForm } from "@/components/governance/governance-new-proposal-form";
import { getGovParams } from "@/services/guru/governance-query.service";

export default function GovernanceNewProposalPage() {
  const [denom, setDenom] = useState("agxn");

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const p = await getGovParams();
      if (!mounted) return;
      setDenom(p.deposit?.minDeposit[0]?.denom ?? "agxn");
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return <GovernanceNewProposalForm defaultDenom={denom} />;
}
