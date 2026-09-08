"use client";

import { Button } from "@crm/ui/components/button";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

const lifecycleStates = [
	"NEW",
	"RESEARCHED",
	"DRAFT_READY",
	"OUTREACH_PENDING_APPROVAL",
	"CONTACTED",
	"REPLIED",
	"INTERESTED",
	"OBJECTION",
	"NOT_NOW",
	"MEETING_PROPOSED",
	"MEETING_BOOKED",
	"CLOSED",
] as const;
const draftTypes = [
	"INITIAL_OUTREACH",
	"FOLLOW_UP",
	"REPLY",
	"MEETING_PROPOSAL",
] as const;
const riskCategories = [
	"STANDARD",
	"PRICING_COMMERCIAL",
	"NUMERIC_ROI",
	"LEGAL_SECURITY",
	"EXTERNAL_SEND",
] as const;
const replyClasses = [
	"INTERESTED",
	"QUESTION",
	"OBJECTION",
	"PRICING",
	"SECURITY_LEGAL",
	"REFERRAL",
	"NOT_NOW",
	"UNSUBSCRIBE",
	"BOOK_MEETING",
	"RESCHEDULE",
	"NEGATIVE",
	"OUT_OF_OFFICE",
	"UNKNOWN",
] as const;

type DraftType = (typeof draftTypes)[number];
type RiskCategory = (typeof riskCategories)[number];
type ReplyClass = (typeof replyClasses)[number];

export function ProspectActions({
	contactId,
	status,
	archived,
	suppressed,
}: {
	contactId: string;
	status: (typeof lifecycleStates)[number] | "SUPPRESSED" | "ARCHIVED";
	archived: boolean;
	suppressed: boolean;
}) {
	const router = useRouter();
	const trpc = useTRPC();
	const [nextStatus, setNextStatus] = useState<string>(status);
	const refresh = () => router.refresh();
	const lifecycle = useMutation(
		trpc.gtm.updateContactLifecycle.mutationOptions({
			onSuccess: refresh,
			onError: (error) => toast.error(error.message),
		}),
	);
	const suppress = useMutation(
		trpc.gtm.suppressContact.mutationOptions({
			onSuccess: refresh,
			onError: (error) => toast.error(error.message),
		}),
	);
	const archive = useMutation(
		trpc.gtm.archiveContact.mutationOptions({
			onSuccess: refresh,
			onError: (error) => toast.error(error.message),
		}),
	);
	const restore = useMutation(
		trpc.gtm.restoreContact.mutationOptions({
			onSuccess: refresh,
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<div className="flex flex-wrap items-center gap-2">
			{archived ? (
				<Button
					size="sm"
					onClick={() => restore.mutate({ contactId })}
					disabled={restore.isPending}
				>
					Restore prospect
				</Button>
			) : (
				<>
					<Select value={nextStatus} onValueChange={setNextStatus}>
						<SelectTrigger aria-label="Lifecycle state">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{lifecycleStates.map((value) => (
								<SelectItem key={value} value={value}>
									{value.replaceAll("_", " ").toLowerCase()}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						size="sm"
						variant="outline"
						disabled={lifecycle.isPending || nextStatus === status}
						onClick={() =>
							lifecycle.mutate({
								contactId,
								status: nextStatus as (typeof lifecycleStates)[number],
							})
						}
					>
						Update state
					</Button>
					<Button
						size="sm"
						variant="outline"
						disabled={archive.isPending || suppressed}
						onClick={() =>
							archive.mutate({ contactId, reason: "Archived by operator." })
						}
					>
						Archive
					</Button>
					<Button
						size="sm"
						variant="destructive"
						disabled={suppress.isPending || suppressed}
						onClick={() =>
							suppress.mutate({
								contactId,
								reason: "Manual do-not-contact decision.",
							})
						}
					>
						Do not contact
					</Button>
				</>
			)}
		</div>
	);
}

export function DraftComposer({ contactId }: { contactId: string }) {
	const router = useRouter();
	const trpc = useTRPC();
	const [draftType, setDraftType] = useState<DraftType>("INITIAL_OUTREACH");
	const [riskCategory, setRiskCategory] = useState<RiskCategory>("STANDARD");
	const draft = useMutation(
		trpc.gtm.createDraft.mutationOptions({
			onSuccess: () => {
				toast.success("Draft sent to approval.");
				router.refresh();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<form
			className="grid gap-3"
			onSubmit={(event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				draft.mutate({
					contactId,
					draftType,
					riskCategory,
					subject: String(data.get("subject")),
					content: String(data.get("content")),
					senderIdentity: String(data.get("senderIdentity")),
					evidenceReferences: [],
				});
			}}
		>
			<div className="grid gap-3 md:grid-cols-2">
				<div className="grid gap-1 text-xs">
					<span>Draft type</span>
					<Select
						value={draftType}
						onValueChange={(value) => setDraftType(value as DraftType)}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{draftTypes.map((value) => (
								<SelectItem key={value} value={value}>
									{value.replaceAll("_", " ")}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="grid gap-1 text-xs">
					<span>Risk category</span>
					<Select
						value={riskCategory}
						onValueChange={(value) => setRiskCategory(value as RiskCategory)}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{riskCategories.map((value) => (
								<SelectItem key={value} value={value}>
									{value.replaceAll("_", " ")}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
			<div className="grid gap-1">
				<Label htmlFor="senderIdentity">Sender identity</Label>
				<Input id="senderIdentity" name="senderIdentity" required />
			</div>
			<div className="grid gap-1">
				<Label htmlFor="draftSubject">Subject</Label>
				<Input id="draftSubject" name="subject" required />
			</div>
			<div className="grid gap-1">
				<Label htmlFor="draftContent">Exact proposed message</Label>
				<Textarea
					id="draftContent"
					name="content"
					required
					className="min-h-36"
				/>
			</div>
			<Button type="submit" disabled={draft.isPending}>
				Create draft and request approval
			</Button>
		</form>
	);
}

export function ResearchBriefComposer({ contactId }: { contactId: string }) {
	const router = useRouter();
	const trpc = useTRPC();
	const brief = useMutation(
		trpc.gtm.createResearchBrief.mutationOptions({
			onSuccess: () => {
				toast.success("Research brief version created.");
				router.refresh();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const lines = (value: FormDataEntryValue | null) =>
		String(value ?? "")
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean);

	return (
		<form
			className="grid gap-3"
			onSubmit={(event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				brief.mutate({
					contactId,
					companySummary: String(data.get("companySummary")),
					observedFacts: lines(data.get("observedFacts")),
					inferredPainPoints: lines(data.get("inferredPainPoints")),
					likelyUseCase: String(data.get("likelyUseCase")),
					personalizationPoints: lines(data.get("personalizationPoints")),
					outreachAngle: String(data.get("outreachAngle")),
					evidenceReferences: [],
					confidence: Number(data.get("confidence")),
				});
			}}
		>
			<Label htmlFor="companySummary">Company summary</Label>
			<Textarea id="companySummary" name="companySummary" required />
			<div className="grid gap-3 md:grid-cols-2">
				<div className="grid gap-1">
					<Label htmlFor="observedFacts">Observed facts, one per line</Label>
					<Textarea id="observedFacts" name="observedFacts" required />
				</div>
				<div className="grid gap-1">
					<Label htmlFor="inferredPainPoints">
						Inferred pain points, one per line
					</Label>
					<Textarea
						id="inferredPainPoints"
						name="inferredPainPoints"
						required
					/>
				</div>
			</div>
			<Label htmlFor="likelyUseCase">Likely Verbytic use case</Label>
			<Input id="likelyUseCase" name="likelyUseCase" required />
			<Label htmlFor="personalizationPoints">
				Personalization points, one per line
			</Label>
			<Textarea
				id="personalizationPoints"
				name="personalizationPoints"
				required
			/>
			<Label htmlFor="outreachAngle">Outreach angle</Label>
			<Textarea id="outreachAngle" name="outreachAngle" required />
			<Label htmlFor="confidence">Confidence, from 0 to 1</Label>
			<Input
				id="confidence"
				name="confidence"
				type="number"
				min="0"
				max="1"
				step="0.01"
				defaultValue="0.5"
				required
			/>
			<Button type="submit" disabled={brief.isPending}>
				Create research version
			</Button>
		</form>
	);
}

export function ConversationEditor({
	thread,
}: {
	thread: {
		id: string;
		replyClass: ReplyClass | null;
		needs: string[];
		objections: string[];
		commitments: string[];
		nextAction: string | null;
		nextActionDueAt: string | null;
		summary: string | null;
	};
}) {
	const router = useRouter();
	const trpc = useTRPC();
	const [classification, setClassification] = useState<ReplyClass>(
		thread.replyClass ?? "UNKNOWN",
	);
	const update = useMutation(
		trpc.gtm.updateConversationState.mutationOptions({
			onSuccess: () => {
				toast.success("Conversation state updated.");
				router.refresh();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const lines = (value: FormDataEntryValue | null) =>
		String(value ?? "")
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean);

	return (
		<details className="rounded-lg border p-3">
			<summary className="cursor-pointer font-medium text-sm">
				Update conversation state
			</summary>
			<form
				className="mt-3 grid gap-3"
				onSubmit={(event) => {
					event.preventDefault();
					const data = new FormData(event.currentTarget);
					const dueAt = String(data.get("nextActionDueAt") ?? "");
					update.mutate({
						threadId: thread.id,
						replyClass: classification,
						needs: lines(data.get("needs")),
						objections: lines(data.get("objections")),
						commitments: lines(data.get("commitments")),
						nextAction: String(data.get("nextAction") ?? "") || null,
						nextActionDueAt: dueAt ? new Date(dueAt) : null,
						currentOwnerId: null,
						summary: String(data.get("summary") ?? "") || null,
					});
				}}
			>
				<Select
					value={classification}
					onValueChange={(value) => setClassification(value as ReplyClass)}
				>
					<SelectTrigger aria-label="Reply classification">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{replyClasses.map((value) => (
							<SelectItem key={value} value={value}>
								{value.replaceAll("_", " ")}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Label htmlFor={`summary-${thread.id}`}>Manual summary</Label>
				<Textarea
					id={`summary-${thread.id}`}
					name="summary"
					defaultValue={thread.summary ?? ""}
				/>
				<div className="grid gap-3 md:grid-cols-3">
					<TextList
						id={`needs-${thread.id}`}
						name="needs"
						label="Needs"
						values={thread.needs}
					/>
					<TextList
						id={`objections-${thread.id}`}
						name="objections"
						label="Objections"
						values={thread.objections}
					/>
					<TextList
						id={`commitments-${thread.id}`}
						name="commitments"
						label="Commitments"
						values={thread.commitments}
					/>
				</div>
				<div className="grid gap-3 md:grid-cols-2">
					<div className="grid gap-1">
						<Label htmlFor={`next-${thread.id}`}>Next action</Label>
						<Input
							id={`next-${thread.id}`}
							name="nextAction"
							defaultValue={thread.nextAction ?? ""}
						/>
					</div>
					<div className="grid gap-1">
						<Label htmlFor={`due-${thread.id}`}>Next action due</Label>
						<Input
							id={`due-${thread.id}`}
							name="nextActionDueAt"
							type="datetime-local"
							defaultValue={
								thread.nextActionDueAt
									? new Date(thread.nextActionDueAt).toISOString().slice(0, 16)
									: ""
							}
						/>
					</div>
				</div>
				<Button type="submit" disabled={update.isPending}>
					Save conversation state
				</Button>
			</form>
		</details>
	);
}

export function AccountStrategyEditor({
	company,
}: {
	company: {
		id: string;
		strategicAccount: boolean;
		icpTier: string | null;
		primaryUseCase: string | null;
		accountStrategyNotes: string | null;
	};
}) {
	const router = useRouter();
	const trpc = useTRPC();
	const [strategic, setStrategic] = useState(
		company.strategicAccount ? "true" : "false",
	);
	const update = useMutation(
		trpc.gtm.updateAccountStrategy.mutationOptions({
			onSuccess: () => {
				toast.success("Account strategy updated.");
				router.refresh();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<details className="rounded-lg border p-3">
			<summary className="cursor-pointer font-medium text-sm">
				Edit account strategy
			</summary>
			<form
				className="mt-3 grid gap-3"
				onSubmit={(event) => {
					event.preventDefault();
					const data = new FormData(event.currentTarget);
					update.mutate({
						companyId: company.id,
						strategicAccount: strategic === "true",
						icpTier: String(data.get("icpTier") ?? "") || null,
						primaryUseCase: String(data.get("primaryUseCase") ?? "") || null,
						accountStrategyNotes:
							String(data.get("accountStrategyNotes") ?? "") || null,
					});
				}}
			>
				<div className="grid gap-3 md:grid-cols-3">
					<div className="grid gap-1 text-xs">
						<span>Strategic account</span>
						<Select value={strategic} onValueChange={setStrategic}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="false">Standard</SelectItem>
								<SelectItem value="true">Strategic</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="grid gap-1">
						<Label htmlFor={`icp-${company.id}`}>ICP tier</Label>
						<Input
							id={`icp-${company.id}`}
							name="icpTier"
							defaultValue={company.icpTier ?? ""}
						/>
					</div>
					<div className="grid gap-1">
						<Label htmlFor={`use-case-${company.id}`}>Primary use case</Label>
						<Input
							id={`use-case-${company.id}`}
							name="primaryUseCase"
							defaultValue={company.primaryUseCase ?? ""}
						/>
					</div>
				</div>
				<div className="grid gap-1">
					<Label htmlFor={`strategy-${company.id}`}>
						Account strategy notes
					</Label>
					<Textarea
						id={`strategy-${company.id}`}
						name="accountStrategyNotes"
						defaultValue={company.accountStrategyNotes ?? ""}
					/>
				</div>
				<Button type="submit" disabled={update.isPending}>
					Save account strategy
				</Button>
			</form>
		</details>
	);
}

function TextList({
	id,
	name,
	label,
	values,
}: {
	id: string;
	name: string;
	label: string;
	values: string[];
}) {
	return (
		<div className="grid gap-1">
			<Label htmlFor={id}>{label}, one per line</Label>
			<Textarea id={id} name={name} defaultValue={values.join("\n")} />
		</div>
	);
}
