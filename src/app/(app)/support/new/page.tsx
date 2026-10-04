import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { settingBool } from "@/lib/settings";
import { Button, Field, PageTitle, Panel, inputClass, selectClass } from "@/components/ui";
import { createTicket } from "@/server/ticket-actions";

export const dynamic = "force-dynamic";

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "payment", label: "Deposit / payment" },
  { value: "withdrawal", label: "Withdrawal" },
  { value: "bonus", label: "Bonus" },
  { value: "account", label: "Account" },
  { value: "game", label: "A game" },
];

export default async function NewTicketPage() {
  const session = await getSession();
  if (!session) redirect("/?error=Login+required");
  const user = await prisma.user.findUnique({ where: { email: session.email } });
  if (!user) redirect("/?error=Account+not+found");

  if (!(await settingBool("tickets.enabled", true))) {
    redirect("/support");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageTitle title="New ticket" subtitle="Give us the details and we will reply here." />

      <Panel>
        <form action={createTicket} className="space-y-4">
          <Field label="SUBJECT">
            <input name="subject" required maxLength={140} className={inputClass} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="CATEGORY">
              <select name="category" className={selectClass} defaultValue="general">
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="PRIORITY">
              <select name="priority" className={selectClass} defaultValue="normal">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </Field>
          </div>
          <Field
            label="MESSAGE"
            hint="Include any reference number (e.g. DEP-XXXXXXXX) — it makes the answer much faster."
          >
            <textarea name="body" required rows={8} maxLength={4000} className={inputClass} />
          </Field>
          <Button type="submit">Open ticket</Button>
        </form>
      </Panel>
    </div>
  );
}