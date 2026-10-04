import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { walletOf } from "@/lib/wallet";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import MobileNav from "@/components/MobileNav";

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

  return (
    <div className="flex min-h-screen bg-transparent text-white">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar email={user.email} balance={balance} />
        <div className="flex-1 p-4 pb-24 md:p-6 md:pb-6">{children}</div>
        <MobileNav />
      </div>
    </div>
  );
}