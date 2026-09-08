import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import type { Metadata } from "next";
import Link from "next/link";
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

export const metadata: Metadata = { title: "GTM inbox" };

export default function InboxPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>GTM inbox</PageShellTitle>
					<PageShellDescription>
						Review replies, account context, next actions, and draft approvals.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<Suspense fallback={<PageShellLoading />}>
				<InboxList params={params} />
			</Suspense>
		</PageShell>
	);
}

async function InboxList({ params }: { params: Promise<{ slug: string }> }) {
	await requireSession();
	const [{ slug }, threads] = await Promise.all([
		params,
		getServerTrpcClient().gtm.inbox.query(),
	]);

	return (
		<PageShellContent>
			<div className="overflow-hidden rounded-xl border bg-card">
				<div className="grid grid-cols-[minmax(0,1fr)_auto] border-b bg-muted/30 px-4 py-3 text-muted-foreground text-xs">
					<span>{threads.length} active conversations</span>
					<span>Newest activity first</span>
				</div>
				{threads.length === 0 ? (
					<p className="p-8 text-center text-muted-foreground text-sm">
						No conversations are ready for review.
					</p>
				) : (
					<ul className="divide-y">
						{threads.map((thread) => (
							<li key={thread.id}>
								<article className="grid gap-4 p-4 md:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.7fr)_auto] md:p-5">
									<div className="min-w-0">
										<div className="flex flex-wrap items-center gap-2">
											<h2 className="truncate font-medium">
												{thread.contact.firstName} {thread.contact.lastName}
											</h2>
											{thread.company?.strategicAccount ? (
												<Badge variant="destructive">Strategic</Badge>
											) : null}
										</div>
										<p className="mt-1 truncate text-muted-foreground text-xs">
											{thread.company?.name ?? "No company"} ·{" "}
											{thread.contact.gtmStatus
												.replaceAll("_", " ")
												.toLowerCase()}
										</p>
									</div>
									<div className="min-w-0 border-l pl-4">
										<p className="truncate font-medium text-sm">
											{thread.subject ?? "Untitled conversation"}
										</p>
										<p className="mt-1 line-clamp-2 text-muted-foreground text-sm">
											{thread.summary ?? "No manual conversation summary yet."}
										</p>
										<div className="mt-2 flex flex-wrap gap-2 text-xs">
											{thread.replyClass ? (
												<Badge variant="outline">
													{thread.replyClass.replaceAll("_", " ")}
												</Badge>
											) : null}
											{thread.latestDraft ? (
												<Badge variant="secondary">
													Draft{" "}
													{thread.latestDraft.approvalStatus?.toLowerCase()}
												</Badge>
											) : null}
											{thread.nextAction ? (
												<span className="text-muted-foreground">
													Next: {thread.nextAction}
												</span>
											) : null}
										</div>
									</div>
									<Button asChild size="sm" variant="outline">
										<Link href={`/${slug}/contacts/${thread.contact.id}`}>
											Review
										</Link>
									</Button>
								</article>
							</li>
						))}
					</ul>
				)}
			</div>
		</PageShellContent>
	);
}
