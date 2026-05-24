import React from "react";

export function JsonLd() {
  // Discord profile is included in `sameAs` only when configured —
  // omitting an empty/invalid URL is cleaner SEO than emitting one.
  const discordUserId = process.env.NEXT_PUBLIC_DISCORD_USER_ID;
  const sameAs = [
    "https://github.com/t7sen",
    "https://x.com/T7ME_",
    ...(discordUserId ? [`https://discord.com/users/${discordUserId}`] : []),
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "t7sen",
    url: "https://t7sen.com",
    jobTitle: "Software Architect",
    image: "https://t7sen.com/Avatar.png",
    sameAs,
    description:
      "Software Architect and Developer specializing in high-performance web applications and cyber security.",
    knowsAbout: [
      "Next.js",
      "React",
      "Cyber Security",
      "TypeScript",
      "Tailwind CSS",
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
