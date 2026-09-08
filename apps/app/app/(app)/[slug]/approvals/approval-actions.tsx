"use client";

import { Button } from "@crm/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

export function ApprovalActions({ id }: { id: string }) {
	const router = useRouter();
	const trpc = useTRPC();
	const decision = useMutation(
		trpc.gtm.decideApproval.mutationOptions({
			onSuccess: () => router.refresh(),
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<div className="mt-4 flex gap-2">
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
		</div>
	);
}
