import Image from "next/image";

export function SiteAttribution() {
  return (
    <section className="site-attribution" aria-label="Site attribution">
      <a
        aria-label="Loskutech: website built, designed, and managed in California. Connect with people already looking for you."
        className="site-attribution-link"
        href="https://loskutech.com"
        rel="noopener noreferrer"
        target="_blank"
      >
        <span>Built, designed &amp; managed by Loskutech</span>
        <Image
          alt="Loskutech"
          className="site-attribution-logo"
          height={1254}
          quality={75}
          sizes="(min-width: 640px) 44px, 36px"
          src="/images/branding/loskutech-logo-v2.webp"
          width={1254}
        />
        <span>Connect with people looking for you</span>
      </a>
    </section>
  );
}
