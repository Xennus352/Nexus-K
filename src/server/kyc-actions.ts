// Identity verification, player side.
//
// This used to live in ticket-actions.ts alongside the support queue, and was
// carried along by it: the support system is gone, and a KYC submission is not a
// support ticket — it is a document an operator approves or rejects, and it stays
// even though there is no longer anywhere to ask a question.

"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/** Submits (or resubmits) an identity-verification document for review. */
export async function submitKyc(formData: FormData) {
  const session = await getSession();
  if (!session) return;
  const user = await prisma.user.findUnique({ where: { email: session.email } });
  if (!user) return;

  const data: Record<string, string> = {};
  for (const key of ["fullName", "dob", "country", "document"]) {
    const value = String(formData.get(key) ?? "").trim().slice(0, 120);
    if (value) data[key] = value;
  }
  if (Object.keys(data).length === 0) return;

  // An approved submission is never reset to pending — otherwise the player
  // could withdraw from review by resubmitting.
  const existing = await prisma.kycSubmission.findUnique({ where: { userId: user.id } });
  if (existing?.status === "approved") return;

  await prisma.kycSubmission.upsert({
    where: { userId: user.id },
    update: {
      data: JSON.stringify(data),
      status: "pending",
      reason: "",
      reviewedAt: null,
      submittedAt: new Date(),
    },
    create: { userId: user.id, data: JSON.stringify(data), status: "pending" },
  });
  revalidatePath("/wallet");
  revalidatePath("/account");
}