import type { Metadata } from "next";
import { Suspense } from "react";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { getServerTrpcClient } from "@/lib/trpc/server";
import { ApprovalActions } from "./approval-actions";

export const metadata: Metadata = { title: "Approvals" };

export default function ApprovalsPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Approval queue</PageShellTitle>
					<PageShellDescription>
						Strategic accounts appear first. Older requests appear next.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<Suspense fallback={<PageShellLoading />}>
				<ApprovalQueue />
			</Suspense>
		</PageShell>
	);
}

async function ApprovalQueue() {
	await requireSession();
	const approvals = await getServerTrpcClient().gtm.listApprovals.query({
		status: "PENDING",
	});

	return (
		<PageShellContent className="space-y-3 p-4 md:p-6">
			{approvals.length === 0 ? (
				<p className="text-muted-foreground text-sm">No work needs approval.</p>
			) : (
				approvals.map((approval) => (
					<article className="rounded-lg border bg-card p-4" key={approval.id}>
						<div className="flex items-center justify-between gap-3">
							<h2 className="font-medium">
								{approval.contact.firstName} {approval.contact.lastName}
							</h2>
							{approval.company?.strategicAccount ? (
								<span className="rounded-full bg-amber-100 px-2 py-1 font-medium text-amber-900 text-xs">
									Strategic account
								</span>
							) : null}
						</div>
						<p className="mt-2 text-muted-foreground text-sm">
							{approval.riskReason}
						</p>
						<p className="mt-3 whitespace-pre-wrap text-sm">
							{approval.originalContent}
						</p>
						<ApprovalActions id={approval.id} />
					</article>
				))
			)}
		</PageShellContent>
	);
}
