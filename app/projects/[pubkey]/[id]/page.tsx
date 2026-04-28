import StandaloneProjectPage from "./StandaloneProjectPage";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ pubkey: string; id: string }>;
}) {
  const { pubkey, id: projectId } = await params;
  return <StandaloneProjectPage pubkey={pubkey} projectId={projectId} />;
}
