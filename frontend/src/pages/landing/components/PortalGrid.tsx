import { useEffect, useState } from "react";
import { fetchBranches, Branch } from "../../../features/branch/branchApi";
import { BranchEntryButton } from "../../../app/BranchEntryButton";

const FALLBACK_BRANCHES: Branch[] = [
  { id: "atakum", name: "Atakum", code: "atakum" },
  { id: "vezirkopru", name: "Vezirköprü", code: "vezirkopru" },
];

export function PortalGrid() {
  const [branches, setBranches] = useState<Branch[]>(FALLBACK_BRANCHES);

  useEffect(() => {
    fetchBranches()
      .then((b) => b.length && setBranches(b))
      .catch(() => {});
  }, []);

  return (
    <div id="portallar" className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {branches.map((b) => (
        <BranchEntryButton key={b.code} code={b.code} name={b.name} variant="card" />
      ))}
    </div>
  );
}
