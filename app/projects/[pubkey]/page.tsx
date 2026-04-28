import UserProjectsPage from "./UserProjectsPage";

export default async function Page({
  params,
}: {
  params: Promise<{ pubkey: string }>;
}) {
  const { pubkey } = await params;
  return <UserProjectsPage pubkey={pubkey} />;
}
