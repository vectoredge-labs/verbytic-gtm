import { Badge } from "@crm/ui/components/badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Separator } from "@crm/ui/components/separator";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@crm/ui/components/tabs";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellTitle,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { getServerTrpcClient } from "@/lib/trpc/server";
import {
	AccountStrategyEditor,
	ConversationEditor,
	DraftComposer,
	ProspectActions,
	ResearchBriefComposer,
} from "./prospect-actions";

export const metadata: Metadata = { title: "Prospect" };
export const instant = false;

export default async function ProspectPage({
	params,
}: {
	params: Promise<{ slug: string; contactId: string }>;
}) {
	await requireSession();
	const { contactId } = await params;
	const prospect = await getServerTrpcClient()
		.gtm.prospect.query({ contactId })
		.catch(() => null);
	if (!prospect) notFound();
	const latestBrief = prospect.researchBriefs[0];

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>
						{prospect.firstName} {prospect.lastName}
					</PageShellTitle>
					<PageShellDescription>
						{prospect.title ?? "Prospect"} ·{" "}
						{prospect.company?.name ?? "No company"}
					</PageShellDescription>
					<PageShellActions>
						{prospect.company?.strategicAccount ? (
							<Badge variant="destructive">Strategic account</Badge>
						) : null}
						<Badge variant="outline">
							{prospect.gtmStatus.replaceAll("_", " ").toLowerCase()}
						</Badge>
					</PageShellActions>
				</PageShellHeading>
				<ProspectActions
					contactId={prospect.id}
					status={prospect.gtmStatus}
					archived={Boolean(prospect.archivedAt)}
					suppressed={prospect.doNotContact}
				/>
			</PageShellHeader>

			<PageShellContent>
				<div className="grid gap-4 md:grid-cols-5">
					<Metric label="Email" value={prospect.email ?? "Not available"} />
					<Metric
						label="Prospect owner"
						value={prospect.owner?.name ?? "Unassigned"}
					/>
					<Metric
						label="Account owner"
						value={prospect.company?.owner?.name ?? "Unassigned"}
					/>
					<Metric
						label="ICP tier"
						value={prospect.company?.icpTier ?? "Unscored"}
					/>
					<Metric
						label="Primary use case"
						value={prospect.company?.primaryUseCase ?? "Not selected"}
					/>
				</div>
				{prospect.company ? (
					<AccountStrategyEditor company={prospect.company} />
				) : null}

				<Tabs defaultValue="research">
					<TabsList variant="line" className="flex-wrap">
						<TabsTrigger value="research">Research</TabsTrigger>
						<TabsTrigger value="conversation">Conversation</TabsTrigger>
						<TabsTrigger value="drafts">Drafts and approvals</TabsTrigger>
						<TabsTrigger value="activity">Activity and tasks</TabsTrigger>
					</TabsList>

					<TabsContent value="research" className="grid gap-4 lg:grid-cols-2">
						<Card>
							<CardHeader>
								<CardTitle>Latest research brief</CardTitle>
							</CardHeader>
							<CardContent className="space-y-5 text-sm">
								{latestBrief ? (
									<>
										<div className="flex items-center gap-2">
											<Badge variant="mono">
												Version {latestBrief.version}
											</Badge>
											<span className="text-muted-foreground text-xs">
												Confidence{" "}
												{latestBrief.confidence === null
													? "unrated"
													: `${Math.round(latestBrief.confidence * 100)}%`}
											</span>
										</div>
										<BriefSection
											title="Company summary"
											items={[latestBrief.accountSummary ?? "No summary"]}
										/>
										<BriefSection
											title="Observed facts"
											items={latestBrief.companySignals}
										/>
										<BriefSection
											title="Inferred pain points"
											items={latestBrief.likelyPainPoints}
										/>
										<BriefSection
											title="Likely use case"
											items={latestBrief.relevantUseCases}
										/>
										<BriefSection
											title="Outreach angle"
											items={[latestBrief.bestOutreachAngle ?? "Not defined"]}
										/>
										<BriefSection
											title="Personalization"
											items={latestBrief.personalizationPoints}
										/>
										<div>
											<h3 className="font-medium text-sm">Evidence</h3>
											<ul className="mt-2 space-y-2">
												{latestBrief.sources.map((source) => (
													<li key={source.label}>
														{source.url ? (
															<a
																href={source.url}
																target="_blank"
																rel="noreferrer"
																className="text-primary underline"
															>
																{source.label}
															</a>
														) : (
															source.label
														)}
														{source.note ? (
															<p className="text-muted-foreground">
																{source.note}
															</p>
														) : null}
													</li>
												))}
											</ul>
										</div>
									</>
								) : (
									<p className="text-muted-foreground">
										No research brief exists for this prospect.
									</p>
								)}
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle>Create a research version</CardTitle>
							</CardHeader>
							<CardContent>
								<ResearchBriefComposer contactId={prospect.id} />
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="conversation" className="space-y-4">
						{prospect.emailThreads.length === 0 ? (
							<Empty text="No conversation is linked to this prospect." />
						) : (
							prospect.emailThreads.map((thread) => (
								<Card key={thread.id}>
									<CardHeader>
										<div className="flex flex-wrap items-center justify-between gap-2">
											<CardTitle>{thread.subject ?? "Conversation"}</CardTitle>
											{thread.replyClass ? (
												<Badge variant="outline">
													{thread.replyClass.replaceAll("_", " ")}
												</Badge>
											) : null}
										</div>
										<p className="text-muted-foreground text-sm">
											{thread.summary ?? "No manual summary yet."}
										</p>
										<p className="text-muted-foreground text-xs">
											Last inbound:{" "}
											{thread.lastInboundAt?.toLocaleString() ?? "none"} · Last
											outbound:{" "}
											{thread.lastOutboundAt?.toLocaleString() ?? "none"} ·
											Owner: {thread.currentOwner?.name ?? "unassigned"} ·
											Summary version {thread.summaryVersion}
										</p>
									</CardHeader>
									<CardContent className="space-y-3">
										{thread.messages.map((message) => (
											<div
												key={message.id}
												className="rounded-lg border bg-muted/20 p-3"
											>
												<div className="flex justify-between gap-3 text-xs">
													<strong>{message.direction.toLowerCase()}</strong>
													<time>{message.sentAt.toLocaleString()}</time>
												</div>
												<p className="mt-2 whitespace-pre-wrap text-sm">
													{message.body ?? "No message body"}
												</p>
											</div>
										))}
										{thread.nextAction ? (
											<p className="text-sm">
												<strong>Next action:</strong> {thread.nextAction}
											</p>
										) : null}
										<ConversationEditor thread={thread} />
									</CardContent>
								</Card>
							))
						)}
					</TabsContent>

					<TabsContent value="drafts" className="grid gap-4 lg:grid-cols-2">
						<Card>
							<CardHeader>
								<CardTitle>Create outbound draft</CardTitle>
							</CardHeader>
							<CardContent>
								{prospect.doNotContact || prospect.archivedAt ? (
									<p className="text-destructive text-sm">
										This prospect is not eligible for outbound drafts.
									</p>
								) : (
									<DraftComposer contactId={prospect.id} />
								)}
							</CardContent>
						</Card>
						<div className="space-y-3">
							{prospect.outboundDrafts.length === 0 ? (
								<Empty text="No draft revisions exist." />
							) : (
								prospect.outboundDrafts.map((draft) => (
									<Card key={draft.id}>
										<CardHeader>
											<div className="flex items-center justify-between">
												<CardTitle>
													{draft.draftType.replaceAll("_", " ")}
												</CardTitle>
												<Badge
													variant={
														draft.status === "ACTIVE" ? "secondary" : "outline"
													}
												>
													{draft.status.toLowerCase()}
												</Badge>
											</div>
										</CardHeader>
										<CardContent className="space-y-4">
											{draft.revisions.map((revision) => (
												<div
													key={revision.id}
													className="space-y-2 border-l-2 pl-3"
												>
													<div className="flex flex-wrap gap-2">
														<Badge variant="mono">
															Revision {revision.revision}
														</Badge>
														<Badge variant="outline">
															{revision.riskCategory.replaceAll("_", " ")}
														</Badge>
														{revision.approval ? (
															<Badge variant="secondary">
																{revision.approval.invalidatedAt
																	? "invalidated"
																	: revision.approval.status.toLowerCase()}
															</Badge>
														) : null}
													</div>
													<p className="font-medium text-sm">
														{revision.subject}
													</p>
													<p className="whitespace-pre-wrap text-muted-foreground text-sm">
														{revision.content}
													</p>
												</div>
											))}
										</CardContent>
									</Card>
								))
							)}
						</div>
					</TabsContent>

					<TabsContent value="activity" className="grid gap-4 lg:grid-cols-2">
						<Card>
							<CardHeader>
								<CardTitle>Activity timeline</CardTitle>
							</CardHeader>
							<CardContent className="space-y-3">
								{prospect.activities.map((activity) => (
									<div key={activity.id} className="border-l-2 pl-3">
										<p className="font-medium text-sm">
											{activity.subject ?? activity.type}
										</p>
										<p className="text-muted-foreground text-xs">
											{activity.createdAt.toLocaleString()}
										</p>
										{activity.body ? (
											<p className="mt-1 text-sm">{activity.body}</p>
										) : null}
									</div>
								))}
								{prospect.auditEvents.map((event) => (
									<div
										key={event.id}
										className="border-l-2 border-primary pl-3"
									>
										<p className="font-medium text-sm">
											{event.action.replaceAll("_", " ").toLowerCase()}
										</p>
										<p className="text-muted-foreground text-xs">
											{event.actorType.toLowerCase()} ·{" "}
											{event.createdAt.toLocaleString()}
										</p>
									</div>
								))}
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle>Tasks</CardTitle>
							</CardHeader>
							<CardContent className="space-y-3">
								{prospect.tasks.length === 0 ? (
									<p className="text-muted-foreground text-sm">No tasks.</p>
								) : (
									prospect.tasks.map((task) => (
										<div key={task.id} className="rounded-lg border p-3">
											<div className="flex items-center justify-between gap-2">
												<strong className="text-sm">{task.kind}</strong>
												<Badge
													variant={task.finishedAt ? "outline" : "secondary"}
												>
													{task.finishedAt ? "finished" : "queued"}
												</Badge>
											</div>
											<p className="mt-1 text-muted-foreground text-xs">
												{task.reason}
											</p>
											{task.outcome ? (
												<p className="mt-1 text-xs">{task.outcome}</p>
											) : null}
										</div>
									))
								)}
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>
			</PageShellContent>
		</PageShell>
	);
}

function Metric({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-lg border bg-card p-4">
			<p className="text-muted-foreground text-xs">{label}</p>
			<p className="mt-1 truncate font-medium text-sm">{value}</p>
		</div>
	);
}

function BriefSection({ title, items }: { title: string; items: string[] }) {
	return (
		<section>
			<h3 className="font-medium text-xs uppercase tracking-wide">{title}</h3>
			<Separator className="my-2" />
			<ul className="space-y-1 text-muted-foreground">
				{items.map((item) => (
					<li key={`${title}-${String(item)}`}>{String(item)}</li>
				))}
			</ul>
		</section>
	);
}

function Empty({ text }: { text: string }) {
	return (
		<p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
			{text}
		</p>
	);
}
