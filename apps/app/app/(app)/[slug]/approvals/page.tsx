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
					<article
						className="rounded-xl border bg-card p-4 md:p-5"
						key={approval.id}
					>
						<div className="flex items-center justify-between gap-3">
							<div>
								<h2 className="font-medium">
									{approval.contact.firstName} {approval.contact.lastName}
								</h2>
								<p className="text-muted-foreground text-xs">
									{approval.company?.name ?? "No company"} · Revision{" "}
									{approval.draftRevision.revision}
								</p>
							</div>
							<div className="flex flex-wrap gap-2 text-xs">
								{approval.company?.strategicAccount ? (
									<span className="rounded-full bg-destructive/10 px-2 py-1 font-medium text-destructive">
										Strategic
									</span>
								) : null}
								<span className="rounded-full bg-muted px-2 py-1">
									{approval.draftRevision.riskCategory.replaceAll("_", " ")}
								</span>
								<span className="rounded-full bg-muted px-2 py-1">
									{age(approval.createdAt)}
								</span>
							</div>
						</div>
						<p className="mt-2 text-muted-foreground text-sm">
							{approval.riskReason}
						</p>
						<div className="mt-4 rounded-lg border bg-muted/20 p-4">
							<p className="font-medium text-sm">
								{approval.draftRevision.subject}
							</p>
							<p className="mt-3 whitespace-pre-wrap text-sm">
								{approval.draftRevision.content}
							</p>
						</div>
						{approval.draftRevision.evidenceReferences.length > 0 ? (
							<div className="mt-3">
								<p className="font-medium text-xs">
									Evidence and claim references
								</p>
								<ul className="mt-1 list-disc pl-5 text-muted-foreground text-xs">
									{approval.draftRevision.evidenceReferences.map(
										(reference) => (
											<li key={`${reference.label}-${reference.url ?? ""}`}>
												{reference.label}
											</li>
										),
									)}
								</ul>
							</div>
						) : null}
						<ApprovalActions
							id={approval.id}
							subject={approval.draftRevision.subject}
							content={approval.draftRevision.content}
						/>
					</article>
				))
			)}
		</PageShellContent>
	);
}

function age(createdAt: string): string {
	const minutes = Math.max(
		1,
		Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000),
	);
	if (minutes < 60) return `${minutes}m old`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h old`;
	return `${Math.floor(hours / 24)}d old`;
}
