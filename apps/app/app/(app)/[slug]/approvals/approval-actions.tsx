"use client";

import { Button } from "@crm/ui/components/button";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

export function ApprovalActions({
	id,
	subject,
	content,
}: {
	id: string;
	subject: string;
	content: string;
}) {
	const router = useRouter();
	const trpc = useTRPC();
	const decision = useMutation(
		trpc.gtm.decideApproval.mutationOptions({
			onSuccess: () => router.refresh(),
			onError: (error) => toast.error(error.message),
		}),
	);
	const [editedSubject, setEditedSubject] = useState(subject);
	const [editedContent, setEditedContent] = useState(content);

	return (
		<div className="mt-4 flex flex-wrap gap-2">
			<Button
				size="sm"
				disabled={decision.isPending}
				onClick={() => decision.mutate({ id, decision: "APPROVED_UNCHANGED" })}
			>
				Approve
			</Button>
			<Button
				size="sm"
				variant="outline"
				disabled={decision.isPending}
				onClick={() => decision.mutate({ id, decision: "REJECTED" })}
			>
				Reject
			</Button>
			<Button
				size="sm"
				variant="outline"
				disabled={decision.isPending}
				onClick={() => decision.mutate({ id, decision: "ESCALATED" })}
			>
				Escalate
			</Button>
			<details className="w-full rounded-lg border p-3">
				<summary className="cursor-pointer font-medium text-sm">
					Edit then approve
				</summary>
				<div className="mt-3 grid gap-3">
					<div className="grid gap-1">
						<Label htmlFor={`subject-${id}`}>Subject</Label>
						<Input
							id={`subject-${id}`}
							value={editedSubject}
							onChange={(event) => setEditedSubject(event.target.value)}
						/>
					</div>
					<div className="grid gap-1">
						<Label htmlFor={`content-${id}`}>Exact message</Label>
						<Textarea
							id={`content-${id}`}
							value={editedContent}
							onChange={(event) => setEditedContent(event.target.value)}
							className="min-h-32"
						/>
					</div>
					<Button
						size="sm"
						disabled={decision.isPending}
						onClick={() =>
							decision.mutate({
								id,
								decision: "EDITED_LIGHTLY",
								editedSubject,
								editedContent,
							})
						}
					>
						Approve edited revision
					</Button>
				</div>
			</details>
		</div>
	);
}
