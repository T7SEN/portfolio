import type { Metadata } from "next";
import { notFound } from "next/navigation";

// By their own paths, not the study barrel: the full study holds a client
// island, the list of parts (REQ-PERF-04).
import { FullStudy } from "@/components/study/full-study";
import { ShortStudy } from "@/components/study/short-study";
import { getStudy, studySlugs } from "@/content";

// Every study is built at build time; any other slug is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return studySlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/work/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const study = getStudy(slug);
  if (!study) notFound();

  return { title: study.title };
}

export default async function StudyPage({ params }: PageProps<"/work/[slug]">) {
  const { slug } = await params;
  const study = getStudy(slug);
  if (!study) notFound();

  return study.kind === "full" ? (
    <FullStudy study={study} />
  ) : (
    <ShortStudy study={study} />
  );
}
