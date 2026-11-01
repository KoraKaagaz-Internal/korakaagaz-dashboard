"use client";

import { sendTestEmail } from "@/app/actions/settings";
import { Button, Card } from "@/components/ui";
import { useAction } from "@/components/ui/Toaster";

export function TestEmail({ ready }: { ready: boolean }) {
  const [run, pending] = useAction(sendTestEmail, { success: (r) => (r && "message" in r ? r.message : "Sent"), refresh: false });
  return (
    <Card title="Email">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className={ready ? "text-ok" : "text-warn"}>{ready ? "● Sending from team@korakaagaz.co is set up." : "● Not set up: emails are logged as skipped."}</span>
        <Button size="sm" disabled={pending} onClick={() => run()}>
          {pending ? "Sending…" : "Send test email"}
        </Button>
      </div>
    </Card>
  );
}
