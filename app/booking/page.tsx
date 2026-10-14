import SelectionSteps from "../../src/app/(public)/booking/SelectionSteps";
import { isPiiProcessingAllowed } from "../../src/server/security/pii-processing-gate";
import { PublicLayout } from "../components/PublicLayout";

export default async function BookingPage({ searchParams }: { searchParams: Promise<{ packageId?: string | string[] }> }) {
  const query = await searchParams;
  const initialPackageId = typeof query.packageId === "string" ? query.packageId : undefined;
  const piiAllowed = isPiiProcessingAllowed(process.env);
  return <PublicLayout><main className="page-main"><SelectionSteps piiAllowed={piiAllowed} initialPackageId={initialPackageId} /></main></PublicLayout>;
}
