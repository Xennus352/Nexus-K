import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { walletOf } from "@/lib/wallet";
import { noticesFor } from "@/server/notices";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import MobileNav from "@/components/MobileNav";
import CopyButton from "@/components/CopyButton";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const s = await getSession();
  if (!s) return <div className="min-h-screen bg-transparent text-white">{children}</div>;

  const user = await prisma.user.findUnique({ where: { email: s.email } });
  // A missing row means the account was removed mid-session; render the children
  // (the login form) rather than a nav pointing at a wallet that does not exist.
  if (!user) return <div className="min-h-screen bg-transparent text-white">{children}</div>;

  // The engine is a separate process and may be down — never block the shell on it.
  const balance = user.engineUid === null ? null : await walletOf(user.engineUid).catch(() => null);
  // A row with no engine uid cannot play, so there is nothing to be live about.
  const uid = user.engineUid ?? -1;

  // Rendered into the bell rather than fetched by it, so the unread badge is
  // correct on the first paint instead of appearing a beat after the page.
  const notices = await noticesFor(user.id);

  return (
    <div className="flex min-h-screen bg-transparent text-white">
      {/* Mounted once here so the sidebar's referral-code Copy button works
          without the sidebar itself owning clipboard state. */}
      <CopyButton />
      <Sidebar
        email={user.email}
        refCode={user.refCode}
        balance={balance}
        status={user.status}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          email={user.email}
          username={user.username}
          uid={uid}
          balance={balance}
          notices={notices}
        />
        <div className="flex-1 p-4 pb-24 md:p-6 md:pb-6">{children}</div>
        <MobileNav />
      </div>
    </div>
  );
}